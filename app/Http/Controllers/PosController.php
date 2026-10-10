<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Services\LoyaltyService;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class PosController extends Controller
{
    private function authorizeSale(Sale $sale): void
    {
        $user = Auth::user();
        if ($user->isSuperAdmin() || $user->isAdministrator()) {
            return;
        }
        if ($sale->branch_id !== $user->branch_id) {
            abort(403, 'Unauthorized access to this sale.');
        }
    }

    // ─── POS Screen ───────────────────────────────────────────────────────────

    public function index(): Response
    {
        $user = Auth::user();
        $branchId = $user->branch_id;

        if (! $branchId && $user->isSuperAdmin()) {
            $branchId = Branch::where('is_active', true)->value('id') ?? Branch::value('id');
        }

        if (! $branchId && ! $user->isSuperAdmin()) {
            abort(403, 'No branch assigned.');
        }

        $session = null;
        $staleSession = null;
        if ($branchId) {
            $sessionQuery = CashSession::where('branch_id', $branchId)
                ->where('user_id', $user->id)
                ->open();

            // Cashiers must explicitly open a fresh session for each business day.
            // Managers/admins retain the existing automatic-session behaviour.
            if ($user->isCashier()) {
                $sessionQuery->whereDate('opened_at', today());
            }

            $session = $sessionQuery->latest('opened_at')->first();

            // A cashier's session from an earlier day that was never closed: it must be counted and
            // closed before today's can be opened (one open session per cashier).
            if (! $session && $user->isCashier()) {
                $staleSession = CashSession::where('branch_id', $branchId)
                    ->where('user_id', $user->id)
                    ->open()
                    ->whereDate('opened_at', '<', today())
                    ->latest('opened_at')
                    ->first();
            }

            if (! $session && ! $user->isCashier()) {
                $session = CashSession::create([
                    'user_id' => $user->id,
                    'branch_id' => $branchId,
                    'opening_cash' => 0,
                    'notes' => 'Auto-started from POS',
                    'status' => 'open',
                    'opened_at' => now(),
                ]);
            }
        }

        $itemMode = SystemSetting::posItemMode($branchId);

        // ── Load products for the POS screen ──────────────────────────────────
        //
        // Inclusion rules per product type:
        //   standard      → must have stock > 0 in this branch
        //   bundle        → always include (stock is virtual; components are checked at sale time)
        //   made_to_order → always include (ingredients are deducted at sale time, not the product itself)
        //
        // Variant products: a standard product whose base stock is 0 but whose
        //   variants have stock should still appear so the cashier can pick a variant.
        //   We include it and let the variant picker handle availability.

        $products = Product::query()
            ->with([
                'category:id,name',
                // Load stock without the >0 filter so we always get the price/capital row
                'stocks' => fn ($q) => $q->where('branch_id', $branchId),
                'variants' => fn ($q) => $q->where('is_available', true)
                    ->with(['stocks' => fn ($s) => $s->where('branch_id', $branchId)])
                    ->orderBy('sort_order'),
                'bundle.items.componentProduct:id,name',
                'bundle.items.componentVariant:id,name',
                'recipeIngredients.ingredient:id,name',
            ])
            ->where(fn ($q) => $q
                // Standard products: has stock record in this branch (load all so retail barcode/QR scanning works)
                ->where(fn ($inner) => $inner
                    ->where('product_type', 'standard')
                    ->whereHas('stocks', fn ($s) => $s
                        ->where('branch_id', $branchId)
                    )
                )
                // Variant products: base stock may be 0 — include if any available variant exists
                // (variant stock is tracked at sale; we show the product so the cashier can pick)
                ->orWhere(fn ($inner) => $inner
                    ->where('product_type', 'standard')
                    ->whereHas('variants', fn ($v) => $v->where('is_available', true))
                    // Still require a stock record so we have a price
                    ->whereHas('stocks', fn ($s) => $s->where('branch_id', $branchId))
                )
                // Bundle products: always show — stock deducted from components at sale time
                ->orWhere('product_type', 'bundle')
                // Made-to-order: always show — ingredients deducted from recipe at sale time
                ->orWhere('product_type', 'made_to_order')
                // Services: always show — no physical stock, price row required
                ->orWhere(fn ($inner) => $inner
                    ->where('product_type', 'service')
                    ->whereHas('stocks', fn ($s) => $s->where('branch_id', $branchId))
                )
            )
            ->when($itemMode === 'services_only', fn ($q) => $q->where('product_type', 'service'))
            ->when($itemMode === 'products_only', fn ($q) => $q->where('product_type', '!=', 'service'))
            ->where('product_type', '!=', 'ingredient')
            ->where('status', 'active')
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))  // must have a price row
            ->latest()->get()
            ->map(fn (Product $p) => $this->mapProduct($p, $branchId))
            ->values();

        $categories = Category::select('id', 'name')
            ->where('is_active', true)->orderBy('name')->get();

        $customers = Customer::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('branch_id', $branchId)->orWhereNull('branch_id'))
            ->orderBy('name')
            ->get(['id', 'name', 'contact_number', 'email', 'customer_number', 'loyalty_points'])
            ->map(fn (Customer $customer) => [
                'id' => $customer->id,
                'name' => $customer->name,
                'contact_number' => $customer->contact_number,
                'email' => $customer->email,
                'customer_number' => $customer->customer_number,
                'loyalty_points' => $customer->loyalty_points,
            ]);

        $promos = Promo::tableExists()
            ? Promo::with(['products:id', 'categories:id'])->active()->forChannel('pos')->get()
                ->map(fn (Promo $p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'code' => $p->code,
                    'discount_type' => $p->discount_type,
                    'discount_value' => (float) $p->discount_value,
                    'applies_to' => $p->applies_to,
                    'minimum_purchase' => $p->minimum_purchase ? (float) $p->minimum_purchase : null,
                    'product_ids' => $p->products->pluck('id')->values(),
                    'category_ids' => $p->categories->pluck('id')->values(),
                    'expires_at' => $p->expires_at?->toIso8601String(),
                ])->values()
            : collect();

        $activeBranch = $user->branch ?? ($branchId ? Branch::find($branchId) : null);

        return Inertia::render('Pos/Index', [
            'products' => $products,
            'categories' => $categories,
            'customers' => $customers,
            'promos' => $promos,
            'session' => $session ? [
                'id' => $session->id, 'opening_cash' => (float) $session->opening_cash,
                'opened_at' => $session->opened_at?->toIso8601String(), 'status' => $session->status,
            ] : null,
            'stale_session' => $staleSession ? [
                'id' => $staleSession->id,
                'session_number' => $staleSession->session_number,
                'opened_at' => $staleSession->opened_at?->toIso8601String(),
                'opening_cash' => (float) $staleSession->opening_cash,
                'expected_cash' => $staleSession->computeExpectedCash(),
                'sale_count' => $staleSession->sales()->where('status', '!=', 'voided')->count(),
                'require_count' => (bool) SystemSetting::get('cash.require_count_on_close', $staleSession->branch_id, true),
            ] : null,
            'branch' => $activeBranch ? [
                'id' => $activeBranch->id, 'name' => $activeBranch->display_name,
                'business_type' => $activeBranch->business_type, 'feature_flags' => $activeBranch->feature_flags,
            ] : null,
            'preferred_layout' => $user->pos_layout ?? 'grid',
        ]);
    }

    // ─── Store (checkout) ─────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();
        $branchId = $user->branch_id ?? ($user->isSuperAdmin() ? (Branch::where('is_active', true)->value('id') ?? Branch::value('id')) : null);

        if (! $branchId) {
            return back()->withErrors(['error' => 'No branch assigned.']);
        }

        $sessionQuery = CashSession::where('branch_id', $branchId)
            ->where('user_id', $user->id)
            ->open();

        if ($user->isCashier()) {
            $sessionQuery->whereDate('opened_at', today());
        }

        $openSession = $sessionQuery->latest('opened_at')->first();

        // This is an authorization/business-rule check, not just a UI check. A cashier
        // cannot bypass the POS lock by posting the checkout request directly.
        if (! $openSession && $user->isCashier()) {
            return back()->withErrors([
                'cash_session' => 'Open today\'s cash session before processing a sale.',
            ]);
        }

        if (! $openSession) {
            $openSession = CashSession::create([
                'user_id' => $user->id,
                'branch_id' => $branchId,
                'opening_cash' => 0,
                'notes' => 'Auto-started from POS checkout',
                'status' => 'open',
                'opened_at' => now(),
            ]);
        }

        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'exists:products,id'],
            'items.*.qty' => ['required', 'numeric', 'min:0.001'],
            'items.*.variant_id' => ['nullable', 'exists:product_variants,id'],
            'payment_method' => ['required', 'in:'.implode(',', SaleService::PAYMENT_METHODS)],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'discount_percent' => ['nullable', 'numeric', 'between:0,100'],
            'discount_type' => ['nullable', 'in:senior_pwd,manual'],
            'promo_id' => ['nullable', 'exists:promos,id'],
            'cash_session_id' => ['nullable', 'exists:cash_sessions,id'],
            'loyalty_points' => ['nullable', 'integer', 'min:0'],
            'table_order_id' => ['nullable', 'integer', 'exists:table_orders,id'],
        ]);

        try {
            $result = app(SaleService::class)->checkout($user, $branchId, $openSession, $validated)['result'];

            return back()->with('pos_result', $result);
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            return back()->withErrors(['error' => $e->getMessage() ?: 'Checkout failed.']);
        }
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(Sale $sale): Response
    {
        $this->authorizeSale($sale);
        $sale->load(['items.product', 'items.variant', 'user', 'branch', 'cashSession', 'tableOrder.table', 'customer']);

        return Inertia::render('Pos/Show', ['sale' => $this->mapSale($sale)]);
    }

    // ─── History ──────────────────────────────────────────────────────────────

    public function history(Request $request): Response
    {
        $user = Auth::user();
        $branchId = $user->branch_id;
        $isAdmin = $user->isAdmin();
        $today = today()->toDateString();

        // Cashiers are always locked to today; admins default to today on first visit
        $from = $isAdmin ? ($request->input('from') ?? $today) : $today;
        $to = $isAdmin ? ($request->input('to') ?? $today) : $today;

        $search = $request->input('search');
        $status = $request->input('status');
        $method = $request->input('payment_method');

        $query = Sale::with(['items.product', 'items.variant', 'user', 'tableOrder.table', 'customer'])
            ->where('branch_id', $branchId)
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->orderByDesc('created_at');

        if ($search) {
            $query->where(fn ($q) => $q->where('receipt_number', 'like', "%{$search}%")->orWhere('customer_name', 'like', "%{$search}%"));
        }
        if ($status) {
            $query->where('status', $status);
        }
        if ($method) {
            $query->where('payment_method', $method);
        }

        $sales = $query->paginate(25)->withQueryString();

        $base = Sale::where('branch_id', $branchId)->completed()
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to);

        $branch = Auth::user()->branch;

        return Inertia::render('Pos/History', [
            'sales' => $sales->through(fn ($s) => $this->mapSale($s, brief: true)),
            'summary' => [
                'total_sales' => (float) (clone $base)->sum('total'),
                'total_count' => $base->count(),
                'cash_total' => (float) (clone $base)->where('payment_method', 'cash')->sum('total'),
                'gcash_total' => (float) (clone $base)->where('payment_method', 'gcash')->sum('total'),
                'card_total' => (float) (clone $base)->where('payment_method', 'card')->sum('total'),
                'online_total' => (float) (clone $base)->where('channel', 'online')->sum('total'),
                'dine_in_total' => (float) (clone $base)->where('channel', 'dine_in')->sum('total'),
                'discount_total' => (float) (clone $base)->sum('discount_amount'),
            ],
            'filters' => [
                'search' => $search,
                'status' => $status,
                'payment_method' => $method,
                'from' => $from,
                'to' => $to,
            ],
            'branch' => $branch ? [
                'id' => $branch->id,
                'name' => $branch->display_name,
                'business_type' => $branch->business_type,
            ] : null,
            'is_admin' => $isAdmin,
        ]);
    }

    // ─── Edit ─────────────────────────────────────────────────────────────────

    public function edit(Sale $sale): Response
    {
        $this->authorizeSale($sale);
        $user = Auth::user();
        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) {
            abort(403, 'You can only edit sales made today.');
        }

        $sale->load(['items.product', 'items.variant']);
        $branchId = $user->branch_id;

        $products = Product::query()
            ->with(['category:id,name', 'stocks' => fn ($q) => $q->where('branch_id', $branchId), 'variants' => fn ($q) => $q->where('is_available', true)->with(['stocks' => fn ($s) => $s->where('branch_id', $branchId)])->orderBy('sort_order')])
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))
            ->get()->map(fn ($p) => $this->mapProduct($p, $branchId))->values();

        return Inertia::render('Pos/Edit', ['sale' => $this->mapSale($sale), 'products' => $products]);
    }

    // ─── Update ───────────────────────────────────────────────────────────────

    public function update(Request $request, Sale $sale): RedirectResponse
    {
        $this->authorizeSale($sale);
        $user = Auth::user();
        $branchId = $user->branch_id;

        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) {
            return back()->withErrors(['error' => "Only today's sales can be edited."]);
        }

        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'exists:products,id'],
            'items.*.qty' => ['required', 'numeric', 'min:0.001'],
            'items.*.variant_id' => ['nullable', 'exists:product_variants,id'],
            'payment_method' => ['required', 'in:'.implode(',', SaleService::PAYMENT_METHODS)],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'discount_percent' => ['nullable', 'numeric', 'between:0,100'],
        ]);

        try {
            DB::transaction(function () use ($sale, $validated, $branchId) {
                $sales = app(SaleService::class);
                $allowNeg = SystemSetting::allowNegativeStock($branchId);

                // Restore old stock (type-aware for bundles and MTO)
                $sale->load([
                    'items.product.stocks',
                    'items.variant.stocks',
                    'items.product.bundle.items.componentProduct.stocks',
                    'items.product.recipeIngredients.ingredient.stocks',
                ]);
                $sales->restoreStockForItems($sale->items, $branchId);
                $sale->items()->delete();

                [$saleItems, $subtotal] = $sales->buildLines($validated['items'], $branchId, $allowNeg);

                $discPct = (float) ($validated['discount_percent'] ?? 0);
                $discAmt = round($subtotal * ($discPct / 100), 2);
                $total = round($subtotal - $discAmt, 2);
                $paid = (float) ($validated['payment_amount'] ?? $total);

                $sale->update([
                    'payment_method' => $validated['payment_method'], 'payment_amount' => $paid,
                    'change_amount' => max(0, round($paid - $total, 2)), 'discount_amount' => $discAmt,
                    'customer_name' => $validated['customer_name'] ?? null, 'total' => $total,
                    'notes' => $discPct > 0 ? "Discount {$discPct}% (−₱".number_format($discAmt, 2).')' : null,
                ]);

                foreach ($saleItems as $data) {
                    $sale->items()->create($data);
                }
            });

            return redirect()->route('pos.show', $sale->id)->with('success', 'Sale updated.');

        } catch (\Throwable $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    // ─── Void ─────────────────────────────────────────────────────────────────

    public function void(Request $request, Sale $sale): RedirectResponse
    {
        $this->authorizeSale($sale);
        if ($sale->isVoided()) {
            return back()->withErrors(['error' => 'Already voided.']);
        }

        $user = Auth::user();
        if ($sale->created_at->isBefore(today()) && ! $user->isAdmin()) {
            return back()->withErrors(['error' => "Only today's sales can be voided."]);
        }

        DB::transaction(function () use ($sale, $user, $request) {
            $branchId = $sale->branch_id;

            // Load items with all relations needed for type-aware stock restore
            $sale->load([
                'items.product.stocks',
                'items.variant.stocks',
                'items.product.bundle.items.componentProduct.stocks',
                'items.product.recipeIngredients.ingredient.stocks',
            ]);

            app(SaleService::class)->restoreStockForItems($sale->items, $branchId);

            app(LoyaltyService::class)->reverseSale($sale, $user);

            // A voided online order's sale is unlinked so the order history stays truthful.
            $sale->onlineOrder?->update(['payment_status' => 'refunded']);

            $sale->update(['status' => 'voided', 'notes' => trim(($sale->notes ?? '').' | Voided: '.($request->input('reason', 'No reason provided')))]);
        });

        return back()->with('success', 'Sale voided and stock restored.');
    }

    // ─── Barcode lookup ───────────────────────────────────────────────────────

    public function lookupBarcode(Request $request): JsonResponse
    {
        $barcode = $request->string('barcode');
        $branchId = Auth::user()->branch_id;

        $product = Product::with([
            'stocks' => fn ($q) => $q->where('branch_id', $branchId),
            'variants' => fn ($q) => $q->where('is_available', true)
                ->with(['stocks' => fn ($s) => $s->where('branch_id', $branchId)]),
            'category:id,name',
            'bundle.items.componentProduct:id,name',
            'recipeIngredients.ingredient:id,name',
        ])->where('barcode', $barcode)->first();

        if (! $product) {
            return response()->json(['found' => false, 'message' => 'Product not found.'], 404);
        }

        return response()->json(['found' => true, 'product' => $this->mapProduct($product, $branchId)]);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private function mapProduct(Product $p, int $branchId): array
    {
        $stock = $p->stocks->firstWhere('branch_id', $branchId) ?? $p->stocks->first();

        // ── Determine the effective "stock" number shown on the POS card ──────
        //
        // standard   → own stock count in this branch
        // bundle     → 999 (virtual; components checked at checkout)
        // made_to_order → 999 (ingredients checked at checkout; no own stock row)
        // variant product → sum of available variant stocks (approximate; real
        //                   variant stock lives in product_variant_stocks but we
        //                   use the base stock row as a price anchor)
        $variantStock = (float) $p->variants->sum(fn ($v) => (float) ($v->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0));
        $displayStock = match ($p->product_type) {
            'bundle', 'made_to_order', 'service' => 999,
            default => $p->variants->isNotEmpty() ? $variantStock : (float) ($stock?->stock ?? 0),
        };

        $image = $p->product_img;
        if ($image && ! str_starts_with($image, '/') && ! str_starts_with($image, 'http://') && ! str_starts_with($image, 'https://')) {
            $image = asset('storage/'.$image);
        }

        return [
            'id' => $p->id,
            'name' => $p->name,
            'unit' => $p->unit ?? 'pc',
            'barcode' => $p->barcode,
            'product_img' => $image,
            'product_type' => $p->product_type,
            'is_taxable' => (bool) $p->is_taxable,
            'price' => (float) ($stock?->price ?? 0),
            'stock' => $displayStock,
            'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'extra_price' => (float) $v->extra_price,
                'attributes' => $v->attributes ?? [],
                'is_available' => $v->is_available,
                'stock' => (float) ($v->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0),
            ])->values(),
            'has_variants' => $p->variants->count() > 0,
            // Bundle components — info shown on POS card
            'bundle_items' => $p->bundle
                ? $p->bundle->items->map(fn ($i) => [
                    'name' => $i->componentProduct?->name ?? '?',
                    'qty' => $i->quantity,
                    'required' => $i->is_required,
                ])->values()
                : null,
            // Recipe ingredients — info shown for MTO products
            'recipe_items' => $p->recipeIngredients?->count() > 0
                ? $p->recipeIngredients->map(fn ($r) => [
                    'name' => $r->ingredient?->name ?? '?',
                    'quantity' => $r->quantity,
                    'unit' => $r->unit,
                ])->values()
                : null,
        ];
    }

    private function mapSale(Sale $sale, bool $brief = false): array
    {
        $base = [
            'id' => $sale->id,
            'receipt_number' => $sale->receipt_number,
            'status' => $sale->status,
            'payment_method' => $sale->payment_method,
            'payment_amount' => (float) $sale->payment_amount,
            'amount_paid' => (float) $sale->amount_paid,
            'balance_due' => (float) $sale->balance_due,
            'payment_status' => $sale->payment_status,
            'due_date' => $sale->due_date?->toDateString(),
            'change_amount' => (float) $sale->change_amount,
            'discount_amount' => (float) $sale->discount_amount,
            'total' => (float) $sale->total,
            'customer_id' => $sale->customer_id,
            'customer_name' => $sale->customer_name,
            'customer' => $sale->customer ? ['id' => $sale->customer->id, 'name' => $sale->customer->name] : null,
            'notes' => $sale->notes,
            'credit_notes' => $sale->credit_notes,
            'created_at' => $sale->created_at?->toIso8601String(),
            'cashier' => $sale->user ? trim("{$sale->user->fname} {$sale->user->lname}") : 'Unknown',
            'channel' => $sale->channel ?? 'counter',
            'table_order_id' => $sale->table_order_id,
            'table_label' => $sale->tableOrder?->table?->label,
        ];

        $base['items'] = $brief
            ? $sale->items->map(fn ($i) => ['product_name' => $i->product?->name ?? '(deleted)', 'variant_name' => $i->variant?->name, 'unit' => $i->product?->unit ?? 'pc', 'quantity' => (float) $i->quantity, 'price' => (float) $i->price, 'item_type' => $i->product?->product_type === 'service' ? 'service' : 'product'])->values()
            : $sale->items->map(fn ($i) => ['id' => $i->id, 'product_id' => $i->product_id, 'product_name' => $i->product?->name ?? '(deleted)', 'variant_name' => $i->variant?->name, 'unit' => $i->product?->unit ?? 'pc', 'quantity' => (float) $i->quantity, 'price' => (float) $i->price, 'total' => (float) $i->total, 'item_type' => $i->product?->product_type === 'service' ? 'service' : 'product'])->values();

        if ($brief) {
            $base['item_count'] = $sale->items->count();
        }

        return $base;
    }
}
