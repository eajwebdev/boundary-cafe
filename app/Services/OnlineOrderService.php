<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\OnlineOrder;
use App\Models\OnlineOrderStatusLog;
use App\Models\Product;
use App\Models\Promo;
use App\Models\SystemSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Customer online ordering: menu catalog, checkout quotes, order placement
 * and the order status machine. All money is computed here on the server.
 */
class OnlineOrderService
{
    public function __construct(
        private LoyaltyService $loyalty,
        private SaleService $sales,
        private DeliveryZoneService $zone,
    ) {}

    // ── Configuration ─────────────────────────────────────────────────────

    /** The branch that fulfils online orders (Mabinay by default). */
    public function branch(): ?Branch
    {
        $code = (string) SystemSetting::get('online.branch_code', null, 'BC-MAB');

        return Branch::where('code', $code)->where('is_active', true)->first()
            ?? Branch::where('is_active', true)->where('name', 'like', '%Mabinay%')->first();
    }

    public function settings(?Branch $branch = null): array
    {
        $branchId = $branch?->id;

        return [
            'enabled' => (bool) SystemSetting::get('online.enabled', $branchId, true),
            'delivery_enabled' => (bool) SystemSetting::get('online.delivery_enabled', $branchId, true),
            'pickup_enabled' => (bool) SystemSetting::get('online.pickup_enabled', $branchId, true),
            'delivery_fee' => round((float) SystemSetting::get('online.delivery_fee', $branchId, 49), 2),
            'free_delivery_min' => round((float) SystemSetting::get('online.free_delivery_min', $branchId, 999), 2),
            'min_order' => round((float) SystemSetting::get('online.min_order', $branchId, 150), 2),
            'prep_minutes' => (int) SystemSetting::get('online.prep_minutes', $branchId, 25),
            'delivery_minutes' => (int) SystemSetting::get('online.delivery_minutes', $branchId, 20),
        ];
    }

    /** Whether the store is currently accepting online orders, based on store hours (Asia/Manila). */
    public function storeStatus(?Branch $branch = null, ?Carbon $at = null): array
    {
        $settings = $this->settings($branch);
        $raw = SystemSetting::get('online.store_hours', $branch?->id, null);
        $hours = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: []);
        $open = $hours['open'] ?? '08:00';
        $close = $hours['close'] ?? '21:00';
        $days = array_map('intval', $hours['days'] ?? [0, 1, 2, 3, 4, 5, 6]);

        $now = ($at ?? now())->copy()->timezone('Asia/Manila');
        $openAt = $now->copy()->setTimeFromTimeString($open);
        $closeAt = $now->copy()->setTimeFromTimeString($close);
        $isOpenDay = in_array($now->dayOfWeek, $days, true);
        $isOpen = $settings['enabled'] && $branch !== null && $isOpenDay && $now->between($openAt, $closeAt);

        $message = match (true) {
            ! $settings['enabled'] || $branch === null => 'Online ordering is paused right now.',
            ! $isOpenDay => 'We are closed today for online orders.',
            $now->lt($openAt) => 'We open for online orders at '.$openAt->format('g:i A').'.',
            $now->gt($closeAt) => 'Online orders are closed for today. We open at '.$openAt->format('g:i A').'.',
            default => null,
        };

        return [
            'is_open' => $isOpen,
            'opens_at' => $openAt->format('g:i A'),
            'closes_at' => $closeAt->format('g:i A'),
            'days' => $days,
            'message' => $message,
        ];
    }

    // ── Catalog ───────────────────────────────────────────────────────────

    /** Products sold online at the branch, with live availability. */
    public function products(Branch $branch): Collection
    {
        $branchId = $branch->id;

        return Product::query()
            ->with([
                'category:id,name',
                'stocks' => fn ($q) => $q->where('branch_id', $branchId),
                'variants' => fn ($q) => $q->where('is_available', true)
                    ->with(['stocks' => fn ($s) => $s->where('branch_id', $branchId)])
                    ->orderBy('sort_order'),
                'bundle.items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId),
                'recipeIngredients.ingredient.stocks' => fn ($q) => $q->where('branch_id', $branchId),
            ])
            ->where('status', 'active')
            ->whereNotIn('product_type', ['ingredient', 'service'])
            ->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('name')
            ->get();
    }

    public function catalog(Branch $branch): array
    {
        $products = $this->products($branch);
        $categoryIds = $products->pluck('category_id')->filter()->unique();

        $categories = Category::whereIn('id', $categoryIds)
            ->where('is_active', true)
            ->orderBy('id')
            ->get(['id', 'name'])
            ->map(fn ($c) => ['id' => $c->id, 'name' => $c->name])
            ->values();

        return [
            'categories' => $categories,
            'products' => $products->map(fn (Product $p) => $this->productPayload($p, $branch->id))->values(),
        ];
    }

    public function productPayload(Product $p, int $branchId): array
    {
        $available = $this->availableQuantity($p, $branchId);

        return [
            'id' => $p->id,
            'name' => $p->name,
            'description' => $p->description && ! str_contains($p->description, 'Seed price') ? $p->description : null,
            'image' => Product::resolveImageUrl($p->product_img),
            'price' => $this->sales->unitPrice($p, $branchId),
            'category_id' => $p->category_id,
            'category' => $p->category?->name,
            'sold_out' => $available <= 0,
            'max_quantity' => (int) max(0, min(50, floor($available))),
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'extra_price' => (float) $v->extra_price,
                'sold_out' => $this->availableQuantity($p, $branchId, $v->id) <= 0,
            ])->values(),
        ];
    }

    /** How many units can be made/sold right now (ingredients, bundle parts, variant or base stock). */
    public function availableQuantity(Product $p, int $branchId, ?int $variantId = null): float
    {
        if ($variantId) {
            $variant = $p->variants->firstWhere('id', $variantId);

            return (float) ($variant?->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0);
        }
        if ($p->variants->isNotEmpty()) {
            return (float) $p->variants->sum(fn ($v) => (float) ($v->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0));
        }
        if ($p->product_type === 'bundle' && $p->bundle) {
            $required = $p->bundle->items->where('is_required', true);
            if ($required->isEmpty()) {
                return 0;
            }

            return (float) $required->map(function ($bi) use ($branchId) {
                $stock = (float) ($bi->componentProduct?->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0);

                return $bi->quantity > 0 ? floor($stock / $bi->quantity) : 0;
            })->min();
        }
        if ($p->product_type === 'made_to_order' && $p->recipeIngredients->isNotEmpty()) {
            return (float) $p->recipeIngredients->map(function ($r) use ($branchId) {
                $stock = (float) ($r->ingredient?->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0);

                return (float) $r->quantity > 0 ? floor($stock / (float) $r->quantity) : 0;
            })->min();
        }

        return (float) ($p->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0);
    }

    /** Active promos to advertise on the storefront (safe for guests). */
    public function storefrontPromos(): Collection
    {
        if (! Promo::tableExists()) {
            return collect();
        }

        return Promo::onStorefront()->latest()->get()->map(fn (Promo $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'description' => $p->description,
            'code' => $p->code,
            'discount_type' => $p->discount_type,
            'discount_value' => (float) $p->discount_value,
            'minimum_purchase' => $p->minimum_purchase ? (float) $p->minimum_purchase : null,
            'applies_to' => $p->applies_to,
            'banner' => $p->banner_url,
            'expires_at' => $p->expires_at?->toIso8601String(),
            'auto_apply' => empty($p->code),
        ])->values();
    }

    // ── Quote & placement ─────────────────────────────────────────────────

    /**
     * Price a cart from scratch on the server. Never trusts client prices.
     *
     * $input: items[{product_id, variant_id?, quantity, note?}], fulfillment_type,
     *         promo_code?, loyalty_points?
     */
    public function quote(Customer $customer, array $input, ?Branch $branch = null): array
    {
        $branch ??= $this->branch();
        $errors = [];
        if (! $branch) {
            return $this->emptyQuote(['Online ordering is not available right now.']);
        }

        $settings = $this->settings($branch);
        $fulfillment = ($input['fulfillment_type'] ?? 'delivery') === 'pickup' ? 'pickup' : 'delivery';
        if ($fulfillment === 'delivery' && ! $settings['delivery_enabled']) {
            $errors[] = 'Delivery is not available right now. Please choose pickup.';
        }
        if ($fulfillment === 'pickup' && ! $settings['pickup_enabled']) {
            $errors[] = 'Pickup is not available right now. Please choose delivery.';
        }

        // ── Lines ──
        $requested = collect($input['items'] ?? [])
            ->filter(fn ($i) => ! empty($i['product_id']) && (int) ($i['quantity'] ?? 0) > 0)
            ->values();
        if ($requested->isEmpty()) {
            return $this->emptyQuote(['Your cart is empty.']);
        }

        $products = $this->products($branch)->keyBy('id');
        $lines = [];
        $usedQty = [];
        foreach ($requested as $item) {
            $product = $products->get((int) $item['product_id']);
            if (! $product) {
                $errors[] = 'An item in your cart is no longer available. Please remove it.';

                continue;
            }

            $variantId = ! empty($item['variant_id']) ? (int) $item['variant_id'] : null;
            if ($variantId && ! $product->variants->firstWhere('id', $variantId)) {
                $errors[] = "The option you chose for {$product->name} is no longer available.";

                continue;
            }
            if (! $variantId && $product->variants->isNotEmpty()) {
                $errors[] = "Please choose an option for {$product->name}.";

                continue;
            }

            $qty = min(50, max(1, (int) $item['quantity']));
            $key = $product->id.'-'.($variantId ?? 'base');
            $usedQty[$key] = ($usedQty[$key] ?? 0) + $qty;
            $available = $this->availableQuantity($product, $branch->id, $variantId);
            if ($usedQty[$key] > $available) {
                $errors[] = $available <= 0
                    ? "{$product->name} is sold out."
                    : "Only {$available} {$product->name} left — please lower the quantity.";
            }

            $price = $this->sales->unitPrice($product, $branch->id, $variantId);
            $variant = $variantId ? $product->variants->firstWhere('id', $variantId) : null;
            $lines[] = [
                'product' => $product,
                'product_id' => $product->id,
                'product_variant_id' => $variantId,
                'name' => $product->name,
                'variant' => $variant?->name,
                'image' => Product::resolveImageUrl($product->product_img),
                'price' => $price,
                'quantity' => $qty,
                'total' => round($price * $qty, 2),
                'is_taxable' => (bool) $product->is_taxable,
                'note' => isset($item['note']) ? mb_substr(trim((string) $item['note']), 0, 255) ?: null : null,
            ];
        }

        $subtotal = round(collect($lines)->sum('total'), 2);
        $taxable = round(collect($lines)->where('is_taxable', true)->sum('total'), 2);

        // ── Promo ──
        [$promo, $promoDiscount, $promoError] = $this->resolvePromo($customer, $input['promo_code'] ?? null, $lines, $subtotal);
        $afterPromo = round($subtotal - $promoDiscount, 2);
        [$vat] = $this->sales->vatFor($afterPromo, $subtotal, $taxable, $branch->id);

        // ── Loyalty ──
        $loyaltyError = null;
        $requestedPoints = max(0, (int) ($input['loyalty_points'] ?? 0));
        try {
            $loyalty = $this->loyalty->quote($customer, $afterPromo + $vat, $requestedPoints, $branch->id);
        } catch (ValidationException $e) {
            $loyaltyError = collect($e->errors())->flatten()->first();
            $loyalty = $this->loyalty->quote($customer, $afterPromo + $vat, 0, $branch->id);
        }

        // ── Delivery fee & minimum ──
        $deliveryFee = 0.0;
        if ($fulfillment === 'delivery') {
            $freeFrom = $settings['free_delivery_min'];
            $deliveryFee = ($freeFrom > 0 && $subtotal >= $freeFrom) ? 0.0 : $settings['delivery_fee'];
        }
        if ($subtotal < $settings['min_order']) {
            $errors[] = 'Minimum order is ₱'.number_format($settings['min_order'], 2).'. Add ₱'.number_format($settings['min_order'] - $subtotal, 2).' more.';
        }

        $total = max(0, round($afterPromo + $vat - $loyalty['discount'] + $deliveryFee, 2));
        $rules = $this->loyalty->rules($branch->id);

        return [
            'fulfillment_type' => $fulfillment,
            'lines' => collect($lines)->map(fn ($l) => collect($l)->except('product')->all())->values()->all(),
            'subtotal' => $subtotal,
            'promo' => $promo ? [
                'id' => $promo->id,
                'label' => $promo->name.($promo->code ? " ({$promo->code})" : ''),
                'code' => $promo->code,
                'discount' => $promoDiscount,
            ] : null,
            'promo_error' => $promoError,
            'vat' => $vat,
            'loyalty' => [
                'enabled' => $rules['enabled'] && $customer->loyalty_enabled,
                'balance' => (int) $customer->loyalty_points,
                'minimum' => $rules['minimum_redeem'],
                'maximum' => $rules['maximum_redeem'],
                'peso_per_point' => $rules['peso_per_point'],
                'points_to_redeem' => $loyalty['points_to_redeem'],
                'discount' => $loyalty['discount'],
                'points_to_earn' => $loyalty['points_to_earn'],
                'error' => $loyaltyError,
            ],
            'delivery_fee' => $deliveryFee,
            'free_delivery_min' => $settings['free_delivery_min'],
            'min_order' => $settings['min_order'],
            'total' => $total,
            'errors' => array_values(array_unique($errors)),
            'can_checkout' => $errors === [],
        ];
    }

    /**
     * Place an order. Everything is re-priced and re-validated inside a transaction.
     *
     * $input: quote input + address_id (delivery), customer_note, contact_number?
     */
    public function place(Customer $customer, array $input): OnlineOrder
    {
        $branch = $this->branch();
        $status = $this->storeStatus($branch);
        if (! $status['is_open']) {
            throw ValidationException::withMessages(['store' => $status['message'] ?? 'We are not accepting online orders right now.']);
        }

        $fulfillment = ($input['fulfillment_type'] ?? 'delivery') === 'pickup' ? 'pickup' : 'delivery';
        $address = null;
        if ($fulfillment === 'delivery') {
            $address = CustomerAddress::where('customer_id', $customer->id)->find($input['address_id'] ?? 0);
            if (! $address) {
                throw ValidationException::withMessages(['address_id' => 'Please choose a delivery address.']);
            }
            $zone = $this->zone->check((float) $address->lat, (float) $address->lng, $address->barangay);
            if (! $zone['ok']) {
                throw ValidationException::withMessages(['address_id' => $zone['message']]);
            }
        }

        return DB::transaction(function () use ($customer, $input, $branch, $fulfillment, $address) {
            $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            if (! $customer->is_active) {
                throw ValidationException::withMessages(['account' => 'Your account is inactive. Please contact the cafe.']);
            }

            $quote = $this->quote($customer, $input, $branch);
            if (! $quote['can_checkout']) {
                throw ValidationException::withMessages(['cart' => $quote['errors']]);
            }
            if (! empty($input['promo_code']) && $quote['promo_error']) {
                throw ValidationException::withMessages(['promo_code' => $quote['promo_error']]);
            }
            if ($quote['loyalty']['error']) {
                throw ValidationException::withMessages(['loyalty_points' => $quote['loyalty']['error']]);
            }

            $settings = $this->settings($branch);
            $order = OnlineOrder::create([
                'customer_id' => $customer->id,
                'branch_id' => $branch->id,
                'fulfillment_type' => $fulfillment,
                'status' => OnlineOrder::STATUS_PENDING,
                'payment_method' => $fulfillment === 'pickup' ? 'pay_at_pickup' : 'cod',
                'payment_status' => 'unpaid',
                'subtotal' => $quote['subtotal'],
                'promo_id' => $quote['promo']['id'] ?? null,
                'promo_label' => $quote['promo']['label'] ?? null,
                'promo_discount' => $quote['promo']['discount'] ?? 0,
                'vat_amount' => $quote['vat'],
                'loyalty_points_redeemed' => $quote['loyalty']['points_to_redeem'],
                'loyalty_discount' => $quote['loyalty']['discount'],
                'loyalty_points_to_earn' => $quote['loyalty']['points_to_earn'],
                'delivery_fee' => $quote['delivery_fee'],
                'total' => $quote['total'],
                'contact_name' => $customer->name,
                'contact_number' => Customer::normalisePhone($input['contact_number'] ?? null) ?? $customer->contact_number ?? '',
                'barangay' => $address?->barangay,
                'street' => $address?->street,
                'landmark' => $address?->landmark,
                'notes_for_rider' => $address?->notes_for_rider,
                'lat' => $address?->lat,
                'lng' => $address?->lng,
                'customer_note' => isset($input['customer_note']) ? mb_substr(trim((string) $input['customer_note']), 0, 500) ?: null : null,
                'estimated_minutes' => $settings['prep_minutes'] + ($fulfillment === 'delivery' ? $settings['delivery_minutes'] : 0),
            ]);

            foreach ($quote['lines'] as $line) {
                $order->items()->create([
                    'product_id' => $line['product_id'],
                    'product_variant_id' => $line['product_variant_id'],
                    'product_name' => $line['name'],
                    'variant_name' => $line['variant'],
                    'price' => $line['price'],
                    'quantity' => $line['quantity'],
                    'total' => $line['total'],
                    'is_taxable' => $line['is_taxable'],
                    'note' => $line['note'],
                ]);
            }

            $this->log($order, null, OnlineOrder::STATUS_PENDING, null, 'customer', 'Order placed online');
            $this->loyalty->reserveForOnlineOrder($customer, $order, (int) $quote['loyalty']['points_to_redeem']);

            return $order->fresh(['items']);
        });
    }

    // ── Status machine ────────────────────────────────────────────────────

    /**
     * Move an order to a new status. Validates the transition, stamps timestamps,
     * logs it, releases held points on cancel/reject and records the sale on completion.
     * Re-applying the current status is a no-op, so double taps are safe.
     */
    public function transition(OnlineOrder $order, string $to, ?User $user, string $actor = 'staff', ?string $note = null): OnlineOrder
    {
        return DB::transaction(function () use ($order, $to, $user, $actor, $note) {
            $order = OnlineOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->status === $to) {
                return $order;
            }
            if (! $order->canTransitionTo($to, $actor)) {
                throw ValidationException::withMessages([
                    'status' => 'This order cannot be moved from "'.OnlineOrder::statusLabel($order->status).'" to "'.OnlineOrder::statusLabel($to).'".',
                ]);
            }
            $note = $note !== null ? trim($note) : null;
            if ($actor === 'staff' && in_array($to, OnlineOrder::NEEDS_REASON, true) && ! $note) {
                throw ValidationException::withMessages(['reason' => 'Please give a reason so the customer knows what happened.']);
            }

            $from = $order->status;
            $updates = ['status' => $to];
            if ($col = OnlineOrder::STATUS_TIMESTAMPS[$to] ?? null) {
                $updates[$col] = now();
            }
            if ($actor === 'staff' && $user) {
                $updates['handled_by'] = $user->id;
            }
            if ($to === OnlineOrder::STATUS_ACCEPTED) {
                $updates['estimated_ready_at'] = now()->addMinutes((int) ($order->estimated_minutes ?: 30));
            }
            if (in_array($to, [OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED], true)) {
                $updates['cancel_reason'] = $note ?: 'Cancelled by customer';
                $updates['cancelled_by'] = $actor;
            }

            if ($to === OnlineOrder::STATUS_COMPLETED) {
                if (! $user) {
                    throw ValidationException::withMessages(['status' => 'Only staff can complete an order.']);
                }
                $session = CashSession::where('branch_id', $order->branch_id)
                    ->where('user_id', $user->id)->open()->latest('opened_at')->first();
                $this->sales->recordOnlineOrder($order, $user, $session);
                $order->refresh();
            }

            $order->update($updates);

            if (in_array($to, [OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED], true)) {
                $this->loyalty->releaseOnlineReservation($order);
            }

            $this->log($order, $from, $to, $user, $actor, $note);

            return $order->fresh();
        });
    }

    // ── Internals ─────────────────────────────────────────────────────────

    /** @return array{0: ?Promo, 1: float, 2: ?string} */
    private function resolvePromo(Customer $customer, ?string $code, array $lines, float $subtotal): array
    {
        if (! Promo::tableExists() || $subtotal <= 0) {
            return [null, 0.0, null];
        }

        $code = $code !== null ? trim($code) : '';
        if ($code !== '') {
            $promo = Promo::with(['products:id', 'categories:id'])->byCode($code)->first();
            if (! $promo || ! $promo->isValid() || ! $promo->availableOn('online')) {
                return [null, 0.0, 'That promo code is invalid or has expired.'];
            }
            if ($promo->isUsedUpBy($customer->id)) {
                return [null, 0.0, $promo->max_uses_per_customer === 1
                    ? 'You have already used this promo code.'
                    : "You have already used this promo code {$promo->max_uses_per_customer} times."];
            }
            $discount = $this->promoDiscount($promo, $lines, $subtotal);
            if ($discount <= 0) {
                $min = $promo->minimum_purchase ? ' Minimum order is ₱'.number_format((float) $promo->minimum_purchase, 2).'.' : '';

                return [null, 0.0, 'This promo does not apply to your cart.'.$min];
            }

            return [$promo, $discount, null];
        }

        // No code: automatically apply the best storefront promo that has no code.
        $best = null;
        $bestDiscount = 0.0;
        foreach (Promo::with(['products:id', 'categories:id'])->onStorefront()->where(fn ($q) => $q->whereNull('code')->orWhere('code', ''))->get() as $promo) {
            if ($promo->isUsedUpBy($customer->id)) {
                continue;
            }
            $discount = $this->promoDiscount($promo, $lines, $subtotal);
            if ($discount > $bestDiscount) {
                [$best, $bestDiscount] = [$promo, $discount];
            }
        }

        return [$best, $bestDiscount, null];
    }

    /** Discount applies to the lines the promo covers; minimum purchase checks the whole cart. */
    private function promoDiscount(Promo $promo, array $lines, float $subtotal): float
    {
        if ($promo->minimum_purchase && $subtotal < (float) $promo->minimum_purchase) {
            return 0.0;
        }

        $eligible = round(collect($lines)
            ->filter(fn ($l) => $promo->appliesToProduct($l['product']))
            ->sum('total'), 2);
        if ($eligible <= 0) {
            return 0.0;
        }

        return $promo->discount_type === 'percent'
            ? round($eligible * ((float) $promo->discount_value / 100), 2)
            : min(round((float) $promo->discount_value, 2), $eligible);
    }

    private function emptyQuote(array $errors): array
    {
        return [
            'fulfillment_type' => 'delivery', 'lines' => [], 'subtotal' => 0, 'promo' => null, 'promo_error' => null,
            'vat' => 0, 'loyalty' => ['enabled' => false, 'balance' => 0, 'minimum' => 0, 'maximum' => 0, 'peso_per_point' => 1,
                'points_to_redeem' => 0, 'discount' => 0, 'points_to_earn' => 0, 'error' => null],
            'delivery_fee' => 0, 'free_delivery_min' => 0, 'min_order' => 0, 'total' => 0,
            'errors' => $errors, 'can_checkout' => false,
        ];
    }

    private function log(OnlineOrder $order, ?string $from, string $to, ?User $user, string $actor, ?string $note): void
    {
        OnlineOrderStatusLog::create([
            'online_order_id' => $order->id,
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $user?->id,
            'actor' => $actor,
            'note' => $note,
            'created_at' => now(),
        ]);
    }
}
