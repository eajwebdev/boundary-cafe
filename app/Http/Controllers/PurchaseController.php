<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\GoodsReceivedNote;
use App\Models\GrnItem;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\Warehouse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class PurchaseController extends Controller
{
    public function index(Request $request): Response
    {
        $purchases = GoodsReceivedNote::with([
                'supplier:id,name,phone,contact_person',
                'items.product:id,name',
            ])
            ->where('source', 'purchase')
            ->when($this->scopedBranchId(), fn($q, $id) => $q->where('branch_id', $id))
            ->latest()
            ->get()
            ->map(fn($grn) => [
                'id'             => $grn->id,
                'grn_number'     => $grn->grn_number,
                'supplier'       => $grn->supplier ? [
                    'id'             => $grn->supplier->id,
                    'name'           => $grn->supplier->name,
                    'phone'          => $grn->supplier->phone,
                    'contact_person' => $grn->supplier->contact_person,
                ] : null,
                'or_number'      => $grn->or_number,
                'payment_method' => $grn->payment_method,
                'check_date'     => $grn->check_date?->format('M d, Y'),
                'check_number'   => $grn->check_number,
                'paid_at'        => $grn->paid_at?->format('M d, Y h:i A'),
                'is_paid'        => !is_null($grn->paid_at) || $grn->payment_method === 'cash',
                'total'          => (float) $grn->items->sum('line_total'),
                'items_count'    => $grn->items->count(),
                'items'          => $grn->items->map(fn($item) => [
                    'product_name' => $item->product?->name ?? '—',
                    'quantity'     => $item->accepted_qty,
                    'unit_cost'    => (float) $item->unit_cost,
                    'line_total'   => (float) $item->line_total,
                ]),
                'received_date'  => $grn->received_date?->format('M d, Y'),
                'created_at'     => $grn->created_at->format('M d, Y h:i A'),
            ]);

        // Payables: unpaid credit/postdated_check per supplier
        $payables = GoodsReceivedNote::with('supplier:id,name')
            ->where('source', 'purchase')
            ->whereIn('payment_method', ['credit', 'postdated_check'])
            ->whereNull('paid_at')
            ->when($this->scopedBranchId(), fn($q, $id) => $q->where('branch_id', $id))
            ->get()
            ->groupBy('supplier_id')
            ->map(function ($group) {
                $supplier = $group->first()->supplier;
                return [
                    'supplier_id'   => $supplier?->id,
                    'supplier_name' => $supplier?->name ?? '—',
                    'total_owed'    => (float) $group->sum(fn($grn) => $grn->items->sum('line_total')),
                    'purchase_count'=> $group->count(),
                ];
            })
            ->values();

        return Inertia::render('PurchaseOrders/Index', [
            'purchases' => $purchases,
            'payables'  => $payables,
        ]);
    }

    public function create(): Response
    {
        $suppliers = Supplier::orderBy('name')
            ->get(['id', 'name', 'phone', 'address', 'contact_person']);

        $products = Product::with('category:id,name')
            ->where('product_type', 'standard')
            ->orderBy('name')
            ->get()
            ->map(fn($p) => [
                'id'       => $p->id,
                'name'     => $p->name,
                'barcode'  => $p->barcode,
                'category' => $p->category?->name,
            ]);

        $user    = auth()->user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        return Inertia::render('PurchaseOrders/Create', [
            'suppliers'  => $suppliers,
            'products'   => $products,
            'branches'   => $isAdmin
                ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code'])
                : Branch::where('id', $user->branch_id)->get(['id', 'name', 'code']),
            'warehouses' => Warehouse::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code']),
            'user_branch_id' => $user->branch_id,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'supplier_id'    => 'required|exists:suppliers,id',
            'or_number'      => 'nullable|string|max:100',
            'payment_method' => 'required|in:cash,credit,postdated_check',
            'check_date'     => 'required_if:payment_method,postdated_check|nullable|date',
            'check_number'   => 'required_if:payment_method,postdated_check|nullable|string|max:100',
            'received_date'  => 'required|date',
            'notes'          => 'nullable|string|max:1000',
            'dest_type'      => 'required|in:branch,warehouse',
            'dest_id'        => 'required|integer',
            'items'          => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,id',
            'items.*.quantity'   => 'required|integer|min:1',
            'items.*.unit_cost'  => 'required|numeric|min:0',
        ], [
            'items.required'             => 'Please add at least one item.',
            'items.min'                  => 'Please add at least one item.',
            'check_date.required_if'     => 'Check date is required for postdated check.',
            'check_number.required_if'   => 'Check number is required for postdated check.',
            'dest_id.required'           => 'Please select where the stock will go.',
        ]);

        $user = auth()->user();

        // Validate dest_id points to a real active location
        if ($validated['dest_type'] === 'branch') {
            if (! Branch::where('id', $validated['dest_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['dest_id' => 'Selected branch not found.']);
            }
        } else {
            if (! Warehouse::where('id', $validated['dest_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['dest_id' => 'Selected warehouse not found.']);
            }
        }

        DB::transaction(function () use ($validated, $user) {
            $grn = GoodsReceivedNote::create([
                'supplier_id'    => $validated['supplier_id'],
                'branch_id'      => $user->branch_id,
                'dest_type'      => $validated['dest_type'],
                'dest_id'        => $validated['dest_id'],
                'received_by'    => $user->id,
                'received_date'  => $validated['received_date'],
                'or_number'      => $validated['or_number'] ?? null,
                'payment_method' => $validated['payment_method'],
                'check_date'     => $validated['check_date'] ?? null,
                'check_number'   => $validated['check_number'] ?? null,
                'notes'          => $validated['notes'] ?? null,
                'source'         => 'purchase',
                'delivery_type'  => 'full',
                'paid_at'        => $validated['payment_method'] === 'cash' ? now() : null,
            ]);

            foreach ($validated['items'] as $item) {
                GrnItem::create([
                    'goods_received_note_id' => $grn->id,
                    'product_id'             => $item['product_id'],
                    'ordered_qty'            => $item['quantity'],
                    'received_qty'           => $item['quantity'],
                    'rejected_qty'           => 0,
                    'unit_cost'              => $item['unit_cost'],
                ]);
            }

            // Confirm immediately — this increments product stocks
            $grn->confirm($user->id);
        });

        return redirect()->route('purchase-orders.index')
            ->with('message', ['type' => 'success', 'text' => 'Purchase recorded and stocks updated.']);
    }

    public function show(GoodsReceivedNote $purchase): Response
    {
        $this->authorizeBranch($purchase->branch_id);
        $purchase->load([
            'supplier:id,name,phone,address,contact_person',
            'items.product:id,name,barcode',
            'receivedBy:id,fname,lname',
            'confirmedBy:id,fname,lname',
        ]);

        return Inertia::render('PurchaseOrders/Show', [
            'purchase' => [
                'id'             => $purchase->id,
                'grn_number'     => $purchase->grn_number,
                'or_number'      => $purchase->or_number,
                'payment_method' => $purchase->payment_method,
                'check_date'     => $purchase->check_date?->format('M d, Y'),
                'check_number'   => $purchase->check_number,
                'paid_at'        => $purchase->paid_at?->format('M d, Y h:i A'),
                'is_paid'        => !is_null($purchase->paid_at) || $purchase->payment_method === 'cash',
                'received_date'  => $purchase->received_date?->format('M d, Y'),
                'notes'          => $purchase->notes,
                'status'         => $purchase->status,
                'created_at'     => $purchase->created_at->format('M d, Y h:i A'),
                'supplier'       => $purchase->supplier ? [
                    'id'             => $purchase->supplier->id,
                    'name'           => $purchase->supplier->name,
                    'phone'          => $purchase->supplier->phone,
                    'address'        => $purchase->supplier->address,
                    'contact_person' => $purchase->supplier->contact_person,
                ] : null,
                'dest_type'      => $purchase->dest_type ?? 'branch',
                'dest_name'      => $purchase->dest_type === 'warehouse'
                    ? (Warehouse::find($purchase->dest_id)?->name ?? '—')
                    : (Branch::find($purchase->dest_id ?? $purchase->branch_id)?->name ?? '—'),
                'received_by'    => $purchase->receivedBy
                    ? $purchase->receivedBy->fname . ' ' . $purchase->receivedBy->lname
                    : '—',
                'total'          => (float) $purchase->items->sum('line_total'),
                'items'          => $purchase->items->map(fn($item) => [
                    'product_name' => $item->product?->name ?? '—',
                    'barcode'      => $item->product?->barcode,
                    'quantity'     => $item->accepted_qty,
                    'unit_cost'    => (float) $item->unit_cost,
                    'line_total'   => (float) $item->line_total,
                ]),
            ],
        ]);
    }

    public function markPaid(GoodsReceivedNote $purchase)
    {
        $this->authorizeBranch($purchase->branch_id);
        if ($purchase->source !== 'purchase') {
            return back()->withErrors(['error' => 'Not a purchase record.']);
        }

        if (!is_null($purchase->paid_at)) {
            return back()->withErrors(['error' => 'This purchase is already marked as paid.']);
        }

        $purchase->update(['paid_at' => now()]);

        return back()->with('message', ['type' => 'success', 'text' => 'Purchase marked as paid.']);
    }
}
