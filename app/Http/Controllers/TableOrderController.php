<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Customer;
use App\Models\DiningTable;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\TableOrder;
use App\Models\TableOrderItem;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Dine-in table ordering.
 *
 *   Waiter (menu 41): picks a table #, adds items, "Send to cashier".
 *   Cashier (menu 2): sees it under "Pending Orders" in the POS and charges it there.
 *
 * Sending never creates a sale or takes payment — the POS does that through SaleService.
 */
class TableOrderController extends Controller
{
    // ── Waiter screen ─────────────────────────────────────────────────────

    public function index(): Response
    {
        $branchId = $this->workingBranchId();
        $sales = app(SaleService::class);

        $products = Product::query()
            ->with([
                'category:id,name',
                'stocks' => fn ($q) => $q->where('branch_id', $branchId),
                'variants' => fn ($q) => $q->where('is_available', true)->orderBy('sort_order'),
            ])
            ->where('status', 'active')
            ->whereNotIn('product_type', ['ingredient', 'service'])
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('name')
            ->get()
            ->map(fn (Product $p) => [
                'id' => $p->id,
                'name' => $p->name,
                'image' => Product::resolveImageUrl($p->product_img),
                'price' => $sales->unitPrice($p, $branchId),
                'category_id' => $p->category_id,
                'variants' => $p->variants->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'extra_price' => (float) $v->extra_price])->values(),
            ])->values();

        $categoryIds = $products->pluck('category_id')->filter()->unique();

        return Inertia::render('TableOrders/Waiter', [
            'tables' => $this->tablesPayload($branchId),
            'products' => $products,
            'categories' => Category::whereIn('id', $categoryIds)->orderBy('id')->get(['id', 'name']),
        ]);
    }

    /** Polled by the waiter screen so table colours stay current. */
    public function tables(): JsonResponse
    {
        return response()->json(['tables' => $this->tablesPayload($this->workingBranchId())]);
    }

    /**
     * Send items for a table to the cashier. Appends to the table's open ticket
     * (a new "round") or opens a new one. Only the table # is required.
     */
    public function store(Request $request): RedirectResponse
    {
        $branchId = $this->workingBranchId();

        $data = $request->validate([
            'table_id' => ['required', 'integer', 'exists:tables,id'],
            'items' => ['required', 'array', 'min:1', 'max:60'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
            'covers' => ['nullable', 'integer', 'min:1', 'max:50'],
            'customer_name' => ['nullable', 'string', 'max:100'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $order = DB::transaction(function () use ($data, $branchId) {
            $table = DiningTable::whereKey($data['table_id'])->lockForUpdate()->firstOrFail();
            abort_if((int) $table->branch_id !== $branchId || ! $table->is_active, 403, 'That table is not available at this branch.');

            $order = TableOrder::where('table_id', $table->id)
                ->whereIn('status', ['open', 'billed'])
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if (! $order) {
                $order = TableOrder::create([
                    'branch_id' => $branchId,
                    'table_id' => $table->id,
                    'user_id' => Auth::id(),
                    'covers' => $data['covers'] ?? 1,
                    'customer_name' => $data['customer_name'] ?? null,
                    'customer_id' => $data['customer_id'] ?? null,
                    'notes' => $data['notes'] ?? null,
                    'opened_at' => now(),
                ]);
            } else {
                $order->fill(array_filter([
                    'covers' => $data['covers'] ?? null,
                    'customer_name' => $data['customer_name'] ?? null,
                    'customer_id' => $data['customer_id'] ?? null,
                    'notes' => $data['notes'] ?? null,
                ], fn ($v) => $v !== null));
            }

            $sales = app(SaleService::class);
            foreach ($data['items'] as $item) {
                $product = Product::with(['stocks' => fn ($q) => $q->where('branch_id', $branchId), 'variants'])->findOrFail($item['product_id']);
                $variantId = $item['variant_id'] ?? null;
                if (! $variantId && $product->variants->where('is_available', true)->isNotEmpty()) {
                    throw ValidationException::withMessages(['items' => "Please choose an option for {$product->name}."]);
                }

                $order->items()->create([
                    'product_id' => $product->id,
                    'product_variant_id' => $variantId,
                    'quantity' => $item['quantity'],
                    'price' => $sales->unitPrice($product, $branchId, $variantId),
                    'status' => TableOrderItem::STATUS_PENDING,
                    'kitchen_note' => $item['note'] ?? null,
                ]);
            }

            $order->sent_to_cashier_at = now();
            $order->save();
            $order->recalculate();
            $table->markOccupied();

            return $order;
        });

        return back()->with('success', 'Table '.$order->table->table_number.' sent to the cashier.');
    }

    // ── Cashier side (POS "Pending Orders") ──────────────────────────────

    /** Open table tickets + online pickup orders ready for collection. Polled every ~10s. */
    public function pending(): JsonResponse
    {
        $branchId = $this->workingBranchId();
        $sales = app(SaleService::class);

        $tableOrders = TableOrder::with([
            'table:id,table_number,section',
            'user:id,fname,lname',
            'customer:id,name,loyalty_points,customer_number',
            'items' => fn ($q) => $q->where('status', '!=', 'cancelled')->where('is_bundle_component', false),
            'items.product' => fn ($q) => $q->with(['stocks' => fn ($s) => $s->where('branch_id', $branchId), 'variants']),
            'items.variant:id,name',
        ])
            ->where('branch_id', $branchId)
            ->whereIn('status', ['open', 'billed'])
            ->whereHas('items', fn ($q) => $q->where('status', '!=', 'cancelled'))
            ->orderBy('opened_at')
            ->get()
            ->map(fn (TableOrder $o) => [
                'id' => $o->id,
                'order_number' => $o->order_number,
                'table_number' => $o->table?->table_number,
                'table_label' => $o->table?->label,
                'taken_by' => $o->user ? trim($o->user->fname.' '.$o->user->lname) : null,
                'customer' => $o->customer ? ['id' => $o->customer->id, 'name' => $o->customer->name, 'loyalty_points' => (int) $o->customer->loyalty_points] : null,
                'customer_name' => $o->customer_name,
                'covers' => $o->covers,
                'notes' => $o->notes,
                'total' => (float) $o->total,
                'item_count' => (int) $o->items->sum('quantity'),
                'opened_at' => $o->opened_at?->toIso8601String(),
                'sent_at' => ($o->sent_to_cashier_at ?? $o->updated_at)?->toIso8601String(),
                'items' => $o->items->map(fn (TableOrderItem $i) => [
                    'product_id' => $i->product_id,
                    'variant_id' => $i->product_variant_id,
                    'name' => $i->product?->name ?? 'Item',
                    'variant_name' => $i->variant?->name,
                    'quantity' => (int) $i->quantity,
                    // Charged at the current menu price — the POS re-prices on the server anyway.
                    'price' => $i->product ? $sales->unitPrice($i->product, $branchId, $i->product_variant_id) : (float) $i->price,
                    'note' => $i->kitchen_note,
                    'product_img' => Product::resolveImageUrl($i->product?->product_img),
                    'unit' => $i->product?->unit ?? 'serving',
                ])->values(),
            ])->values();

        $pickups = OnlineOrder::with('items')
            ->where('branch_id', $branchId)
            ->where('fulfillment_type', 'pickup')
            ->whereIn('status', [OnlineOrder::STATUS_READY, OnlineOrder::STATUS_PREPARING, OnlineOrder::STATUS_ACCEPTED])
            ->orderBy('created_at')
            ->get()
            ->map(fn (OnlineOrder $o) => [
                'id' => $o->id,
                'order_number' => $o->order_number,
                'status' => $o->status,
                'status_label' => OnlineOrder::statusLabel($o->status),
                'customer_name' => $o->contact_name,
                'contact_number' => $o->contact_number,
                'total' => (float) $o->total,
                'item_count' => (int) $o->items->sum('quantity'),
                'items' => $o->items->map(fn ($i) => "{$i->quantity}× {$i->product_name}".($i->variant_name ? " ({$i->variant_name})" : ''))->values(),
                'created_at' => $o->created_at?->toIso8601String(),
            ])->values();

        return response()->json([
            'table_orders' => $tableOrders,
            'online_pickups' => $pickups,
            'count' => $tableOrders->count() + $pickups->where('status', OnlineOrder::STATUS_READY)->count(),
        ]);
    }

    /** Void an unpaid table ticket (reason required). Frees the table. */
    public function void(Request $request, TableOrder $tableOrder): RedirectResponse|JsonResponse
    {
        abort_if((int) $tableOrder->branch_id !== $this->workingBranchId(), 404);
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:255']]);

        DB::transaction(function () use ($tableOrder, $data) {
            $order = TableOrder::whereKey($tableOrder->id)->lockForUpdate()->firstOrFail();
            if (! in_array($order->status, ['open', 'billed'], true)) {
                throw ValidationException::withMessages(['reason' => 'This ticket has already been charged or voided.']);
            }
            $order->items()->update(['status' => TableOrderItem::STATUS_CANCELLED]);
            $order->update(['status' => 'cancelled', 'closed_at' => now(), 'void_reason' => $data['reason']]);
        });

        if ($request->wantsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Table ticket voided.');
    }

    /** Mark a cleaned table available again (waiter screen). */
    public function markAvailable(DiningTable $diningTable): RedirectResponse
    {
        abort_if((int) $diningTable->branch_id !== $this->workingBranchId(), 404);
        if ($diningTable->activeOrder()->exists()) {
            return back()->withErrors(['error' => 'This table still has an open ticket.']);
        }
        $diningTable->markAvailable();

        return back()->with('success', "Table {$diningTable->table_number} is available.");
    }

    /** Find a loyalty member by mobile number or card number (waiter attaches them to the ticket). */
    public function findCustomer(Request $request): JsonResponse
    {
        $term = trim((string) $request->validate(['q' => ['required', 'string', 'min:4', 'max:60']])['q']);
        $phone = Customer::normalisePhone($term);

        $customer = Customer::where('is_active', true)
            ->where(fn ($q) => $q->where('customer_number', strtoupper($term))
                ->when($phone, fn ($q) => $q->orWhere('contact_number', $phone)))
            ->first();

        return response()->json([
            'customer' => $customer ? [
                'id' => $customer->id,
                'name' => $customer->name,
                'customer_number' => $customer->customer_number,
                'loyalty_points' => (int) $customer->loyalty_points,
            ] : null,
        ]);
    }

    private function tablesPayload(int $branchId): array
    {
        return DiningTable::with(['activeOrder' => fn ($q) => $q->withCount(['items as pending_items_count' => fn ($i) => $i->where('status', 'pending')])])
            ->where('branch_id', $branchId)
            ->where('is_active', true)
            ->get()
            // Natural table-number order; sections then appear in the order of their first table.
            ->sortBy(fn ($t) => str_pad((string) $t->table_number, 6, '0', STR_PAD_LEFT))
            ->map(fn (DiningTable $t) => [
                'id' => $t->id,
                'table_number' => $t->table_number,
                'section' => $t->section,
                'capacity' => $t->capacity,
                'status' => $t->status,
                'open_order' => $t->activeOrder ? [
                    'id' => $t->activeOrder->id,
                    'total' => (float) $t->activeOrder->total,
                    'pending_items' => (int) $t->activeOrder->pending_items_count,
                    'opened_at' => $t->activeOrder->opened_at?->toIso8601String(),
                ] : null,
            ])
            ->values()
            ->all();
    }
}
