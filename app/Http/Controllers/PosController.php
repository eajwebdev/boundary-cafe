<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Services\LoyaltyService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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
                'credit_balance' => $customer->credit_balance,
                'customer_number' => $customer->customer_number,
                'loyalty_points' => $customer->loyalty_points,
            ]);

        $promos = Promo::tableExists()
            ? Promo::with(['products:id', 'categories:id'])->active()->get()
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
            'branch' => $activeBranch ? [
                'id' => $activeBranch->id, 'name' => $activeBranch->name,
                'business_type' => $activeBranch->business_type, 'feature_flags' => $activeBranch->feature_flags,
            ] : null,
            'preferred_layout' => $user->pos_layout ?? 'grid',
        ]);
    }

    // ─── Stock helpers ────────────────────────────────────────────────────────

    /**
     * Deduct stock for one product (standard, bundle, or MTO).
     * All relations must already be eager-loaded with lockForUpdate().
     */
    private function deductProductStock(Product $product, float $qty, int $branchId, bool $allowNeg, ?int $variantId = null): void
    {
        // Services have no physical inventory — nothing to deduct
        if ($product->product_type === 'service') {
            return;
        }

        if ($variantId) {
            $variant = $product->variants->firstWhere('id', $variantId);
            if (! $variant || (int) $variant->product_id !== (int) $product->id) {
                throw new \RuntimeException("The selected variant does not belong to {$product->name}.");
            }

            $variantStock = $variant->stocks->firstWhere('branch_id', $branchId);
            if (! $variantStock) {
                throw new \RuntimeException("Variant \"{$variant->name}\" has no stock in this branch.");
            }
            if (! $allowNeg && $variantStock->stock < $qty) {
                throw new \RuntimeException("Insufficient stock for \"{$product->name} - {$variant->name}\". Only {$variantStock->stock} left.");
            }
            $variantStock->decrement('stock', $qty);
        } elseif ($product->variants->isNotEmpty()) {
            throw new \RuntimeException("Please select a variant for \"{$product->name}\".");
        } elseif ($product->product_type === 'bundle' && $product->bundle) {
            foreach ($product->bundle->items->where('is_required', true) as $bi) {
                $comp = $bi->componentProduct;
                $cs = $comp?->stocks->firstWhere('branch_id', $branchId);
                $needed = $bi->quantity * $qty;
                if (! $cs) {
                    throw new \RuntimeException("Bundle component \"{$comp?->name}\" has no stock in this branch.");
                }
                if (! $allowNeg && $cs->stock < $needed) {
                    throw new \RuntimeException("Insufficient stock for bundle component \"{$comp?->name}\". Need {$needed}, have {$cs->stock}.");
                }
                $cs->decrement('stock', $needed);
            }
        } elseif ($product->product_type === 'made_to_order') {
            $recipes = $product->recipeIngredients;
            if ($recipes->isNotEmpty()) {
                foreach ($recipes as $recipe) {
                    $ing = $recipe->ingredient;
                    $ingStock = $ing?->stocks->firstWhere('branch_id', $branchId);
                    $needed = $recipe->quantityNeededFor($qty);
                    if (! $ingStock) {
                        throw new \RuntimeException("Ingredient \"{$ing?->name}\" has no stock in this branch.");
                    }
                    if (! $allowNeg && $ingStock->stock < $needed) {
                        throw new \RuntimeException("Insufficient stock for ingredient \"{$ing?->name}\". Need {$needed}, have {$ingStock->stock}.");
                    }
                    $ingStock->decrement('stock', $needed);
                }
            } else {
                $stock = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
                if (! $stock) {
                    throw new \RuntimeException("Product \"{$product->name}\" has no stock in this branch.");
                }
                if (! $allowNeg && $stock->stock < $qty) {
                    throw new \RuntimeException("Insufficient stock for \"{$product->name}\". Only {$stock->stock} left.");
                }
                $stock->decrement('stock', $qty);
            }
        } else {
            $stock = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
            if (! $stock) {
                throw new \RuntimeException("Product \"{$product->name}\" has no stock in this branch.");
            }
            if (! $allowNeg && $stock->stock < $qty) {
                throw new \RuntimeException("Insufficient stock for \"{$product->name}\". Only {$stock->stock} left.");
            }
            $stock->decrement('stock', $qty);
        }
    }

    /**
     * Restore stock for a set of sale items — mirrors deductProductStock.
     * Items must be loaded with: product.stocks, product.bundle.items.componentProduct.stocks,
     * product.recipeIngredients.ingredient.stocks
     */
    private function restoreStockForItems(Collection $items, int $branchId): void
    {
        foreach ($items as $item) {
            $product = $item->product;
            if (! $product) {
                continue;
            }

            if ($item->variant) {
                $variantStock = $item->variant->stocks->firstWhere('branch_id', $branchId);
                if ($variantStock) {
                    $variantStock->increment('stock', $item->quantity);
                }
            } elseif ($product->product_type === 'bundle' && $product->bundle) {
                foreach ($product->bundle->items->where('is_required', true) as $bi) {
                    $cs = $bi->componentProduct?->stocks->firstWhere('branch_id', $branchId);
                    if ($cs) {
                        $cs->increment('stock', $bi->quantity * $item->quantity);
                    }
                }
            } elseif ($product->product_type === 'made_to_order') {
                $recipes = $product->recipeIngredients;
                if ($recipes->isNotEmpty()) {
                    foreach ($recipes as $recipe) {
                        $ingStock = $recipe->ingredient?->stocks->firstWhere('branch_id', $branchId);
                        if ($ingStock) {
                            $ingStock->increment('stock', $recipe->quantityNeededFor($item->quantity));
                        }
                    }
                } else {
                    $stock = $product->stocks->firstWhere('branch_id', $branchId);
                    if ($stock) {
                        $stock->increment('stock', $item->quantity);
                    }
                }
            } else {
                $stock = $product->stocks->firstWhere('branch_id', $branchId);
                if ($stock) {
                    $stock->increment('stock', $item->quantity);
                }
            }
        }
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
            'payment_method' => ['required', 'in:cash,gcash,card,others,credit,mixed'],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'due_date' => ['nullable', 'date'],
            'credit_notes' => ['nullable', 'string', 'max:500'],
            'discount_percent' => ['nullable', 'numeric', 'between:0,100'],
            'promo_id' => ['nullable', 'exists:promos,id'],
            'cash_session_id' => ['nullable', 'exists:cash_sessions,id'],
            'loyalty_points' => ['nullable', 'integer', 'min:0'],
        ]);

        if (in_array($validated['payment_method'], ['credit', 'mixed'], true) && empty($validated['customer_id'])) {
            return back()->withErrors(['error' => 'Please select a registered customer for credit transactions.']);
        }

        try {
            $result = DB::transaction(function () use ($validated, $user, $branchId, $openSession) {
                $allowNeg = SystemSetting::allowNegativeStock($branchId);
                $subtotal = 0;
                $taxableSubtotal = 0;
                $saleItems = [];
                $itemMode = SystemSetting::posItemMode($branchId);

                foreach ($validated['items'] as $item) {
                    $product = Product::with([
                        'variants.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'bundle.items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'recipeIngredients.ingredient.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                    ])->findOrFail($item['id']);

                    if ($itemMode === 'services_only' && $product->product_type !== 'service') {
                        throw new \RuntimeException('This POS is set to Services only. Product items are not allowed.');
                    }

                    if ($itemMode === 'products_only' && $product->product_type === 'service') {
                        throw new \RuntimeException('This POS is set to Products only. Service items are not allowed.');
                    }

                    $stock = $product->stocks->first();
                    $unitPrice = (float) ($stock?->price ?? 0);
                    $saleQty = (float) $item['qty'];

                    // ── Resolve variant price add-on ───────────────────────
                    if (! empty($item['variant_id'])) {
                        $v = $product->variants->firstWhere('id', $item['variant_id']);
                        if ($v) {
                            $unitPrice += (float) $v->extra_price;
                        }
                    }

                    // ── Deduct stock based on product type ─────────────────
                    $this->deductProductStock($product, $saleQty, $branchId, $allowNeg, $item['variant_id'] ?? null);

                    $line = round($unitPrice * $saleQty, 2);
                    $subtotal += $line;
                    if ($product->is_taxable) {
                        $taxableSubtotal += $line;
                    }
                    $saleItems[] = [
                        'product_id' => $item['id'],
                        'product_variant_id' => $item['variant_id'] ?? null,
                        'quantity' => $saleQty,
                        'price' => $unitPrice,
                        'total' => $line,
                    ];
                }

                // Percentage discount
                $maxDisc = (float) SystemSetting::get('pos.max_discount_percent', $branchId, 100);
                $discPct = min((float) ($validated['discount_percent'] ?? 0), $maxDisc);
                $discAmt = round($subtotal * ($discPct / 100), 2);

                // Promo discount
                $promoAmt = 0;
                $promoLabel = null;
                if (! empty($validated['promo_id'])) {
                    $promo = Promo::find($validated['promo_id']);
                    if ($promo && $promo->isValid()) {
                        $promoAmt = $promo->computeDiscount($subtotal - $discAmt);
                        $promoLabel = "{$promo->name}".($promo->code ? " [{$promo->code}]" : '');
                        $promo->increment('uses_count');
                    }
                }

                $afterDisc = round($subtotal - $discAmt - $promoAmt, 2);

                // VAT — only applied to taxable items' portion of the total
                $vatEnabled = SystemSetting::vatEnabled($branchId);
                $vatRate = (float) SystemSetting::get('tax.vat_rate', $branchId, 0);
                $vatInclusive = (bool) SystemSetting::get('tax.vat_inclusive', $branchId, true);
                // Compute how much of the post-discount total is taxable (proportional)
                $taxableFraction = $subtotal > 0 ? ($taxableSubtotal / $subtotal) : 0;
                $taxableAfterDisc = round($afterDisc * $taxableFraction, 2);
                $vatAmt = ($vatEnabled && $vatRate > 0 && ! $vatInclusive)
                    ? round($taxableAfterDisc * ($vatRate / 100), 2) : 0;
                $serviceChargeEnabled = (bool) SystemSetting::get('tax.enable_service_charge', $branchId, false);
                $serviceChargeRate = (float) SystemSetting::get('tax.service_charge_rate', $branchId, 0);
                $serviceChargeAmt = $serviceChargeEnabled && $serviceChargeRate > 0
                    ? round($afterDisc * ($serviceChargeRate / 100), 2)
                    : 0;

                $customer = ! empty($validated['customer_id'])
                    ? Customer::where('id', $validated['customer_id'])
                        ->where(fn ($q) => $q->where('branch_id', $branchId)->orWhereNull('branch_id'))
                        ->lockForUpdate()
                        ->firstOrFail()
                    : null;

                $loyalty = $customer
                    ? app(LoyaltyService::class)->quote($customer, $afterDisc + $vatAmt + $serviceChargeAmt, (int) ($validated['loyalty_points'] ?? 0), $branchId)
                    : ['points_to_redeem' => 0, 'discount' => 0.0, 'points_to_earn' => 0];

                $totalDue = max(0, round($afterDisc + $vatAmt + $serviceChargeAmt - $loyalty['discount'], 2));
                $method = $validated['payment_method'];
                $isCredit = in_array($method, ['credit', 'mixed'], true);
                $tendered = (float) ($validated['payment_amount'] ?? $totalDue);

                if ($method === 'cash' && $tendered < $totalDue) {
                    throw new \RuntimeException('Cash tendered is less than the total due.');
                }
                if ($method === 'mixed' && ($tendered <= 0 || $tendered >= $totalDue)) {
                    throw new \RuntimeException('Partial payment must be greater than zero and less than the total due.');
                }

                $amountPaid = $isCredit
                    ? min(max(0, $tendered), $totalDue)
                    : $totalDue;
                $balanceDue = max(0, round($totalDue - $amountPaid, 2));
                $paymentStatus = $balanceDue <= 0 ? 'paid' : ($amountPaid > 0 ? 'partial' : 'unpaid');
                $change = $isCredit ? 0 : max(0, round($tendered - $totalDue, 2));

                $notes = implode(' | ', array_filter([
                    $discPct > 0 ? "Discount {$discPct}% (−₱".number_format($discAmt, 2).')' : null,
                    $promoAmt > 0 ? "Promo {$promoLabel}: −₱".number_format($promoAmt, 2) : null,
                    $vatAmt > 0 ? "VAT {$vatRate}%: ₱".number_format($vatAmt, 2) : null,
                ]));

                $sale = Sale::create([
                    'receipt_number' => $this->generateReceiptNumber($branchId),
                    'user_id' => $user->id,
                    'branch_id' => $branchId,
                    'cash_session_id' => $openSession?->id,
                    'table_order_id' => null,
                    'customer_id' => $customer?->id,
                    'payment_method' => $method,
                    'payment_amount' => $tendered,
                    'amount_paid' => $amountPaid,
                    'balance_due' => $balanceDue,
                    'payment_status' => $paymentStatus,
                    'due_date' => $validated['due_date'] ?? null,
                    'change_amount' => $change,
                    'discount_amount' => $discAmt + $promoAmt,
                    'loyalty_points_earned' => $loyalty['points_to_earn'],
                    'loyalty_points_redeemed' => $loyalty['points_to_redeem'],
                    'loyalty_discount' => $loyalty['discount'],
                    'customer_name' => $customer?->name ?? ($validated['customer_name'] ?? null),
                    'status' => 'completed',
                    'total' => $totalDue,
                    'credit_notes' => $validated['credit_notes'] ?? null,
                    'notes' => $notes ?: null,
                ]);

                foreach ($saleItems as $data) {
                    $sale->items()->create($data);
                }

                if ($customer) {
                    app(LoyaltyService::class)->applyToSale(
                        $sale, $customer, $user, $loyalty['points_to_redeem'], $loyalty['points_to_earn']
                    );
                    $customer->refresh();
                }

                if ($customer && $amountPaid > 0 && $isCredit) {
                    CustomerPayment::create([
                        'customer_id' => $customer->id,
                        'sale_id' => $sale->id,
                        'branch_id' => $branchId,
                        'received_by' => $user->id,
                        'amount' => $amountPaid,
                        'payment_method' => $method === 'mixed' ? 'cash' : ($validated['payment_method'] ?? 'cash'),
                        'payment_date' => today()->toDateString(),
                        'notes' => 'Initial payment at POS',
                    ]);
                }

                // ── Create financing record if payment method is installment ──
                return [
                    'sale_id' => $sale->id,
                    'receipt_number' => $sale->receipt_number,
                    'total' => $totalDue,
                    'change' => $change,
                    'amount_paid' => $amountPaid,
                    'balance_due' => $balanceDue,
                    'payment_status' => $paymentStatus,
                    'due_date' => $sale->due_date?->toDateString(),
                    'customer_name' => $sale->customer?->name ?? $sale->customer_name,
                    'discount_amount' => $discAmt,
                    'promo_discount' => $promoAmt,
                    'promo_name' => $promoLabel,
                    'vat_amount' => $vatAmt,
                    'service_charge_amount' => $serviceChargeAmt,
                    'loyalty_points_earned' => $loyalty['points_to_earn'],
                    'loyalty_points_redeemed' => $loyalty['points_to_redeem'],
                    'loyalty_discount' => $loyalty['discount'],
                    'loyalty_balance' => $customer?->loyalty_points,
                ];
            });

            return back()->with('pos_result', $result);

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
                'total_sales' => (float) (clone $base)
                    ->selectRaw('SUM(CASE WHEN payment_method IN ("credit","mixed") THEN amount_paid ELSE total END) as collected')
                    ->value('collected')
                    + (float) CustomerPayment::where('branch_id', $branchId)->whereBetween('payment_date', [$from, $to])->sum('amount'),
                'total_count' => $base->count(),
                'cash_total' => (float) (clone $base)->where('payment_method', 'cash')->sum('total'),
                'gcash_total' => (float) (clone $base)->where('payment_method', 'gcash')->sum('total'),
                'card_total' => (float) (clone $base)->where('payment_method', 'card')->sum('total'),
                'credit_paid' => (float) CustomerPayment::where('branch_id', $branchId)->whereBetween('payment_date', [$from, $to])->sum('amount'),
                'credit_balance' => (float) (clone $base)->where('balance_due', '>', 0)->sum('balance_due'),
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
                'name' => $branch->name,
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
            'payment_method' => ['required', 'in:cash,gcash,card,others'],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'customer_name' => ['nullable', 'string', 'max:80'],
            'discount_percent' => ['nullable', 'numeric', 'between:0,100'],
        ]);

        try {
            DB::transaction(function () use ($sale, $validated, $branchId) {
                $allowNeg = SystemSetting::allowNegativeStock($branchId);

                // Restore old stock (type-aware for bundles and MTO)
                $sale->load([
                    'items.product.stocks',
                    'items.variant.stocks',
                    'items.product.bundle.items.componentProduct.stocks',
                    'items.product.recipeIngredients.ingredient.stocks',
                ]);
                $this->restoreStockForItems($sale->items, $branchId);
                $sale->items()->delete();

                $subtotal = 0;
                $saleItems = [];

                foreach ($validated['items'] as $item) {
                    $product = Product::with([
                        'variants.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'bundle.items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                        'recipeIngredients.ingredient.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
                    ])->findOrFail($item['id']);

                    $stock = $product->stocks->firstWhere('branch_id', $branchId) ?? $product->stocks->first();
                    $unitPrice = (float) ($stock?->price ?? 0);
                    $saleQty = (float) $item['qty'];

                    if (! empty($item['variant_id'])) {
                        $v = $product->variants->firstWhere('id', $item['variant_id']);
                        if ($v) {
                            $unitPrice += (float) $v->extra_price;
                        }
                    }

                    $this->deductProductStock($product, $saleQty, $branchId, $allowNeg, $item['variant_id'] ?? null);

                    $lt = round($unitPrice * $saleQty, 2);
                    $subtotal += $lt;
                    $saleItems[] = ['product_id' => $item['id'], 'product_variant_id' => $item['variant_id'] ?? null, 'quantity' => $saleQty, 'price' => $unitPrice, 'total' => $lt];
                }

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

            $this->restoreStockForItems($sale->items, $branchId);

            app(LoyaltyService::class)->reverseSale($sale, $user);

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

    private function generateReceiptNumber(int $branchId): string
    {
        $code = Auth::user()->branch?->code ?? 'POS';
        $date = now()->format('ymd');
        $count = Sale::where('branch_id', $branchId)->whereDate('created_at', today())->count() + 1;

        return strtoupper("{$code}-{$date}-".str_pad($count, 4, '0', STR_PAD_LEFT));
    }
}
