<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\TableOrder;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * The single place where sales are created.
 *
 * Counter sales, dine-in table orders charged at the cashier and completed
 * online orders all flow through here so stock/recipe deduction, VAT, promo
 * usage, cash-session attachment and loyalty points stay consistent.
 */
class SaleService
{
    public const PAYMENT_METHODS = ['cash', 'gcash', 'card', 'others'];

    public function __construct(private LoyaltyService $loyalty) {}

    /**
     * Charge a cart at the POS (optionally settling a pending table order).
     *
     * $data keys: items[{id, qty, variant_id}], payment_method, payment_amount,
     * customer_id, customer_name, discount_percent, promo_id, loyalty_points,
     * table_order_id.
     *
     * @return array{sale: Sale, result: array}
     */
    public function checkout(User $user, int $branchId, ?CashSession $session, array $data): array
    {
        return DB::transaction(function () use ($user, $branchId, $session, $data) {
            $tableOrder = $this->lockPendingTableOrder($data['table_order_id'] ?? null, $branchId);
            $allowNeg = SystemSetting::allowNegativeStock($branchId);

            [$saleItems, $subtotal, $taxableSubtotal] = $this->buildLines($data['items'], $branchId, $allowNeg);

            // Manual percentage discount (POS only), capped by settings
            $maxDisc = (float) SystemSetting::get('pos.max_discount_percent', $branchId, 100);
            $discPct = min((float) ($data['discount_percent'] ?? 0), $maxDisc);
            $discAmt = round($subtotal * ($discPct / 100), 2);

            $customerId = $data['customer_id'] ?? $tableOrder?->customer_id;
            $customer = $customerId
                ? Customer::where('id', $customerId)->where('is_active', true)->lockForUpdate()->firstOrFail()
                : null;

            // Promo discount — must be valid and usable at the counter
            $promo = null;
            $promoAmt = 0.0;
            $promoLabel = null;
            if (! empty($data['promo_id'])) {
                $promo = Promo::with(['products:id', 'categories:id'])->lockForUpdate()->find($data['promo_id']);
                if ($promo && $promo->isValid() && $promo->availableOn('pos')) {
                    $this->guardPerCustomerLimit($promo, $customer);
                    $promoAmt = $promo->computeDiscount($subtotal - $discAmt);
                    $promoLabel = $promo->name.($promo->code ? " [{$promo->code}]" : '');
                    if ($promoAmt > 0) {
                        $promo->increment('uses_count');
                    }
                }
            }

            $afterDisc = round($subtotal - $discAmt - $promoAmt, 2);
            [$vatAmt, $vatRate] = $this->vatFor($afterDisc, $subtotal, $taxableSubtotal, $branchId);
            $serviceChargeAmt = $this->serviceChargeFor($afterDisc, $branchId);

            $loyalty = $customer
                ? $this->loyalty->quote($customer, $afterDisc + $vatAmt + $serviceChargeAmt, (int) ($data['loyalty_points'] ?? 0), $branchId)
                : ['points_to_redeem' => 0, 'discount' => 0.0, 'points_to_earn' => 0];

            $totalDue = max(0, round($afterDisc + $vatAmt + $serviceChargeAmt - $loyalty['discount'], 2));
            $method = $data['payment_method'];
            if (! in_array($method, self::PAYMENT_METHODS, true)) {
                throw new RuntimeException('Unsupported payment method.');
            }
            $tendered = (float) ($data['payment_amount'] ?? $totalDue);
            if ($method === 'cash' && $tendered < $totalDue) {
                throw new RuntimeException('Cash tendered is less than the total due.');
            }
            $change = max(0, round($tendered - $totalDue, 2));

            $notes = implode(' | ', array_filter([
                $tableOrder ? 'Table '.$tableOrder->table?->table_number : null,
                $discPct > 0 ? "Discount {$discPct}% (−₱".number_format($discAmt, 2).')' : null,
                $promoAmt > 0 ? "Promo {$promoLabel}: −₱".number_format($promoAmt, 2) : null,
                $vatAmt > 0 ? "VAT {$vatRate}%: ₱".number_format($vatAmt, 2) : null,
                $serviceChargeAmt > 0 ? 'Service charge: ₱'.number_format($serviceChargeAmt, 2) : null,
            ]));

            $sale = Sale::create([
                'receipt_number' => $this->generateReceiptNumber($branchId),
                'user_id' => $user->id,
                'branch_id' => $branchId,
                'channel' => $tableOrder ? 'dine_in' : 'counter',
                'cash_session_id' => $session?->id,
                'table_order_id' => $tableOrder?->id,
                'customer_id' => $customer?->id,
                'promo_id' => $promoAmt > 0 ? $promo?->id : null,
                'payment_method' => $method,
                'payment_amount' => $tendered,
                'amount_paid' => $totalDue,
                'balance_due' => 0,
                'payment_status' => 'paid',
                'change_amount' => $change,
                'discount_amount' => $discAmt + $promoAmt,
                'vat_amount' => $vatAmt,
                'loyalty_points_earned' => $loyalty['points_to_earn'],
                'loyalty_points_redeemed' => $loyalty['points_to_redeem'],
                'loyalty_discount' => $loyalty['discount'],
                'customer_name' => $customer?->name ?? ($data['customer_name'] ?? $tableOrder?->customer_name),
                'status' => 'completed',
                'total' => $totalDue,
                'notes' => $notes ?: null,
            ]);

            foreach ($saleItems as $line) {
                $sale->items()->create($line);
            }

            if ($customer) {
                $this->loyalty->applyToSale($sale, $customer, $user, $loyalty['points_to_redeem'], $loyalty['points_to_earn']);
                $customer->refresh();
            }

            if ($tableOrder) {
                $tableOrder->items()->whereNotIn('status', ['cancelled'])->update(['status' => 'served']);
                $tableOrder->update([
                    'sale_id' => $sale->id,
                    'customer_id' => $customer?->id ?? $tableOrder->customer_id,
                    'status' => 'closed',
                    'closed_at' => now(),
                ]);
            }

            return [
                'sale' => $sale,
                'result' => [
                    'sale_id' => $sale->id,
                    'receipt_number' => $sale->receipt_number,
                    'total' => $totalDue,
                    'change' => $change,
                    'amount_paid' => $totalDue,
                    'balance_due' => 0,
                    'payment_status' => 'paid',
                    'due_date' => null,
                    'customer_name' => $sale->customer_name,
                    'discount_amount' => $discAmt,
                    'promo_discount' => $promoAmt,
                    'promo_name' => $promoLabel,
                    'vat_amount' => $vatAmt,
                    'service_charge_amount' => $serviceChargeAmt,
                    'loyalty_points_earned' => $loyalty['points_to_earn'],
                    'loyalty_points_redeemed' => $loyalty['points_to_redeem'],
                    'loyalty_discount' => $loyalty['discount'],
                    'loyalty_balance' => $customer?->loyalty_points,
                    'table_label' => $tableOrder?->table?->label,
                ],
            ];
        });
    }

    /**
     * Turn a completed online order into a Sale. Prices, promo and points are
     * taken from the order snapshot the customer agreed to at checkout.
     * Idempotent: a second call returns the existing sale.
     */
    public function recordOnlineOrder(OnlineOrder $order, User $user, ?CashSession $session): Sale
    {
        return DB::transaction(function () use ($order, $user, $session) {
            $order = OnlineOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->sale_id) {
                return Sale::findOrFail($order->sale_id);
            }

            $order->load('items');
            $branchId = $order->branch_id;
            $allowNeg = SystemSetting::allowNegativeStock($branchId);

            $saleItems = [];
            foreach ($order->items as $item) {
                if (! $item->product_id) {
                    throw new RuntimeException("\"{$item->product_name}\" is no longer on the menu.");
                }
                $product = $this->lockProduct($item->product_id, $branchId);
                $this->deductProductStock($product, (float) $item->quantity, $branchId, $allowNeg, $item->product_variant_id);
                $saleItems[] = [
                    'product_id' => $item->product_id,
                    'product_variant_id' => $item->product_variant_id,
                    'quantity' => $item->quantity,
                    'price' => $item->price,
                    'total' => $item->total,
                ];
            }

            if ($order->promo_id && (float) $order->promo_discount > 0) {
                Promo::whereKey($order->promo_id)->increment('uses_count');
            }

            $sale = Sale::create([
                'receipt_number' => $this->generateReceiptNumber($branchId),
                'user_id' => $user->id,
                'branch_id' => $branchId,
                'channel' => 'online',
                'cash_session_id' => $session?->id,
                'customer_id' => $order->customer_id,
                'promo_id' => (float) $order->promo_discount > 0 ? $order->promo_id : null,
                'payment_method' => 'cash',
                'payment_amount' => $order->total,
                'amount_paid' => $order->total,
                'balance_due' => 0,
                'payment_status' => 'paid',
                'change_amount' => 0,
                'discount_amount' => $order->promo_discount,
                'delivery_fee' => $order->delivery_fee,
                'vat_amount' => $order->vat_amount,
                'loyalty_points_earned' => $order->loyalty_points_to_earn,
                'loyalty_points_redeemed' => $order->loyalty_points_redeemed,
                'loyalty_discount' => $order->loyalty_discount,
                'customer_name' => $order->contact_name,
                'status' => 'completed',
                'total' => $order->total,
                'notes' => implode(' | ', array_filter([
                    "Online {$order->fulfillment_type} {$order->order_number}",
                    $order->promo_label ? "Promo {$order->promo_label}: −₱".number_format((float) $order->promo_discount, 2) : null,
                    (float) $order->delivery_fee > 0 ? 'Delivery fee: ₱'.number_format((float) $order->delivery_fee, 2) : null,
                ])),
            ]);

            foreach ($saleItems as $line) {
                $sale->items()->create($line);
            }

            // Points held at checkout become this sale's redemption; earned points are awarded now.
            $this->loyalty->attachReservationToSale($order, $sale);
            if ($order->customer) {
                $this->loyalty->earn($sale, $order->customer, $user, (int) $order->loyalty_points_to_earn);
            }

            $order->update(['sale_id' => $sale->id, 'payment_status' => 'paid']);

            return $sale;
        });
    }

    // ── Pricing helpers (shared with online checkout quotes) ──────────────

    /** @return array{0: float, 1: float} [vat amount, rate] — only for VAT-exclusive pricing. */
    public function vatFor(float $afterDiscount, float $subtotal, float $taxableSubtotal, int $branchId): array
    {
        $vatEnabled = SystemSetting::vatEnabled($branchId);
        $vatRate = (float) SystemSetting::get('tax.vat_rate', $branchId, 0);
        $vatInclusive = (bool) SystemSetting::get('tax.vat_inclusive', $branchId, true);
        $taxableFraction = $subtotal > 0 ? ($taxableSubtotal / $subtotal) : 0;
        $taxableAfterDisc = round($afterDiscount * $taxableFraction, 2);

        $vat = ($vatEnabled && $vatRate > 0 && ! $vatInclusive) ? round($taxableAfterDisc * ($vatRate / 100), 2) : 0.0;

        return [$vat, $vatRate];
    }

    public function serviceChargeFor(float $afterDiscount, int $branchId): float
    {
        $enabled = (bool) SystemSetting::get('tax.enable_service_charge', $branchId, false);
        $rate = (float) SystemSetting::get('tax.service_charge_rate', $branchId, 0);

        return $enabled && $rate > 0 ? round($afterDiscount * ($rate / 100), 2) : 0.0;
    }

    /** Current selling price for a product (+ variant add-on) at a branch. */
    public function unitPrice(Product $product, int $branchId, ?int $variantId = null): float
    {
        $stock = $product->stocks->firstWhere('branch_id', $branchId);
        $price = (float) ($stock?->price ?? 0);
        if ($variantId) {
            $variant = $product->variants->firstWhere('id', $variantId);
            if (! $variant || (int) $variant->product_id !== (int) $product->id) {
                throw new RuntimeException("The selected option does not belong to {$product->name}.");
            }
            $price += (float) $variant->extra_price;
        }

        return round($price, 2);
    }

    // ── Stock helpers ─────────────────────────────────────────────────────

    public function lockProduct(int $productId, int $branchId): Product
    {
        return Product::with([
            'variants.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
            'stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
            'bundle.items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
            'recipeIngredients.ingredient.stocks' => fn ($q) => $q->where('branch_id', $branchId)->lockForUpdate(),
        ])->findOrFail($productId);
    }

    /**
     * Lock products, deduct stock and price each line from the server.
     *
     * @return array{0: array, 1: float, 2: float} [sale item rows, subtotal, taxable subtotal]
     */
    public function buildLines(array $items, int $branchId, bool $allowNeg): array
    {
        $subtotal = 0.0;
        $taxable = 0.0;
        $lines = [];

        foreach ($items as $item) {
            $product = $this->lockProduct((int) $item['id'], $branchId);
            if ($product->status !== 'active') {
                throw new RuntimeException("\"{$product->name}\" is not available.");
            }
            $variantId = ! empty($item['variant_id']) ? (int) $item['variant_id'] : null;
            $qty = (float) $item['qty'];
            $unitPrice = $this->unitPrice($product, $branchId, $variantId);

            $this->deductProductStock($product, $qty, $branchId, $allowNeg, $variantId);

            $line = round($unitPrice * $qty, 2);
            $subtotal += $line;
            if ($product->is_taxable) {
                $taxable += $line;
            }
            $lines[] = [
                'product_id' => $product->id,
                'product_variant_id' => $variantId,
                'quantity' => $qty,
                'price' => $unitPrice,
                'total' => $line,
            ];
        }

        return [$lines, round($subtotal, 2), round($taxable, 2)];
    }

    /**
     * Deduct stock for one product (standard, variant, bundle, or made-to-order recipe).
     * Relations must already be eager-loaded with lockForUpdate() (see lockProduct()).
     */
    public function deductProductStock(Product $product, float $qty, int $branchId, bool $allowNeg, ?int $variantId = null): void
    {
        if ($product->product_type === 'service') {
            return;
        }

        if ($variantId) {
            $variant = $product->variants->firstWhere('id', $variantId);
            if (! $variant || (int) $variant->product_id !== (int) $product->id) {
                throw new RuntimeException("The selected variant does not belong to {$product->name}.");
            }

            $variantStock = $variant->stocks->firstWhere('branch_id', $branchId);
            if (! $variantStock) {
                throw new RuntimeException("Variant \"{$variant->name}\" has no stock in this branch.");
            }
            if (! $allowNeg && $variantStock->stock < $qty) {
                throw new RuntimeException("Insufficient stock for \"{$product->name} - {$variant->name}\". Only {$variantStock->stock} left.");
            }
            $variantStock->decrement('stock', $qty);
        } elseif ($product->variants->isNotEmpty()) {
            throw new RuntimeException("Please select a variant for \"{$product->name}\".");
        } elseif ($product->product_type === 'bundle' && $product->bundle) {
            foreach ($product->bundle->items->where('is_required', true) as $bi) {
                $comp = $bi->componentProduct;
                $cs = $comp?->stocks->firstWhere('branch_id', $branchId);
                $needed = $bi->quantity * $qty;
                if (! $cs) {
                    throw new RuntimeException("Bundle component \"{$comp?->name}\" has no stock in this branch.");
                }
                if (! $allowNeg && $cs->stock < $needed) {
                    throw new RuntimeException("Insufficient stock for bundle component \"{$comp?->name}\". Need {$needed}, have {$cs->stock}.");
                }
                $cs->decrement('stock', $needed);
            }
        } elseif ($product->product_type === 'made_to_order' && $product->recipeIngredients->isNotEmpty()) {
            foreach ($product->recipeIngredients as $recipe) {
                $ing = $recipe->ingredient;
                $ingStock = $ing?->stocks->firstWhere('branch_id', $branchId);
                $needed = $recipe->quantityNeededFor($qty);
                if (! $ingStock) {
                    throw new RuntimeException("Ingredient \"{$ing?->name}\" has no stock in this branch.");
                }
                if (! $allowNeg && $ingStock->stock < $needed) {
                    throw new RuntimeException("Insufficient stock for ingredient \"{$ing?->name}\". Need {$needed}, have {$ingStock->stock}.");
                }
                $ingStock->decrement('stock', $needed);
            }
        } else {
            $stock = $product->stocks->firstWhere('branch_id', $branchId);
            if (! $stock) {
                throw new RuntimeException("\"{$product->name}\" is not sold at this branch.");
            }
            if (! $allowNeg && $stock->stock < $qty) {
                throw new RuntimeException("Insufficient stock for \"{$product->name}\". Only {$stock->stock} left.");
            }
            $stock->decrement('stock', $qty);
        }
    }

    /**
     * Restore stock for a set of sale items — mirrors deductProductStock().
     * Items must be loaded with: product.stocks, variant.stocks, product.bundle.items.componentProduct.stocks,
     * product.recipeIngredients.ingredient.stocks
     */
    public function restoreStockForItems(Collection $items, int $branchId): void
    {
        foreach ($items as $item) {
            $product = $item->product;
            if (! $product) {
                continue;
            }

            if ($item->variant) {
                $item->variant->stocks->firstWhere('branch_id', $branchId)?->increment('stock', $item->quantity);
            } elseif ($product->product_type === 'bundle' && $product->bundle) {
                foreach ($product->bundle->items->where('is_required', true) as $bi) {
                    $bi->componentProduct?->stocks->firstWhere('branch_id', $branchId)?->increment('stock', $bi->quantity * $item->quantity);
                }
            } elseif ($product->product_type === 'made_to_order' && $product->recipeIngredients->isNotEmpty()) {
                foreach ($product->recipeIngredients as $recipe) {
                    $recipe->ingredient?->stocks->firstWhere('branch_id', $branchId)?->increment('stock', $recipe->quantityNeededFor($item->quantity));
                }
            } else {
                $product->stocks->firstWhere('branch_id', $branchId)?->increment('stock', $item->quantity);
            }
        }
    }

    public function generateReceiptNumber(int $branchId): string
    {
        $code = Branch::whereKey($branchId)->value('code') ?? 'POS';
        $date = now()->format('ymd');
        $count = Sale::where('branch_id', $branchId)->whereDate('created_at', today())->count() + 1;

        do {
            $number = strtoupper("{$code}-{$date}-".str_pad((string) $count, 4, '0', STR_PAD_LEFT));
            $count++;
        } while (Sale::where('receipt_number', $number)->exists());

        return $number;
    }

    /** Lock an open table order for charging; rejects tickets already closed by another cashier. */
    private function lockPendingTableOrder(mixed $tableOrderId, int $branchId): ?TableOrder
    {
        if (! $tableOrderId) {
            return null;
        }

        $order = TableOrder::with('table')->whereKey($tableOrderId)->lockForUpdate()->first();
        if (! $order || (int) $order->branch_id !== $branchId) {
            throw new RuntimeException('That table order was not found at this branch.');
        }
        if (! in_array($order->status, ['open', 'billed'], true)) {
            throw new RuntimeException("Table {$order->table?->table_number} has already been charged or voided.");
        }

        return $order;
    }

    /** A promo limited per customer needs a known customer who has not used up their share. */
    private function guardPerCustomerLimit(Promo $promo, ?Customer $customer): void
    {
        if (! $promo->isLimitedPerCustomer()) {
            return;
        }
        if (! $customer) {
            throw new RuntimeException("Select the customer first — \"{$promo->name}\" is limited per customer.");
        }
        if ($promo->isUsedUpBy($customer->id)) {
            throw new RuntimeException("{$customer->name} has already used \"{$promo->name}\".");
        }
    }
}
