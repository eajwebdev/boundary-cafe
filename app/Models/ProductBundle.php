<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductBundle extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'pricing_mode',       // computed | fixed
        'price_adjustment',   // flat ₱ add/subtract from computed total
        'build_notes',
    ];

    protected $casts = [
        'price_adjustment' => 'decimal:2',
    ];

    protected $attributes = [
        'pricing_mode'     => 'computed',
        'price_adjustment' => 0.00,
    ];

    // ── Relationships ──────────────────────────────────────────────

    /** The product that represents this bundle in the catalog */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ProductBundleItem::class)->orderBy('sort_order');
    }

    public function requiredItems(): HasMany
    {
        return $this->hasMany(ProductBundleItem::class)
            ->where('is_required', true)
            ->orderBy('sort_order');
    }

    public function optionalItems(): HasMany
    {
        return $this->hasMany(ProductBundleItem::class)
            ->where('is_required', false)
            ->orderBy('sort_order');
    }

    // ── Pricing ────────────────────────────────────────────────────

    /**
     * Compute the bundle price for a given branch.
     *
     * computed mode: sum(component price × qty) + price_adjustment
     * fixed mode:    use the product_stocks.price directly
     *
     * Pass $branchId to get branch-specific component prices.
     */
    public function computedPriceForBranch(int $branchId): float
    {
        if ($this->pricing_mode === 'fixed') {
            return $this->product->priceForBranch($branchId);
        }

        $total = $this->items->sum(function (ProductBundleItem $item) use ($branchId) {
            $price = $item->override_price
                ?? $item->componentProduct->priceForBranch($branchId);
            return $price * $item->quantity;
        });

        return round($total + (float) $this->price_adjustment, 2);
    }

    /**
     * Check if ALL required components have sufficient stock in a branch.
     * Returns array: ['can_build' => bool, 'shortages' => [...]]
     */
    public function stockCheckForBranch(int $branchId, int $qty = 1): array
    {
        $shortages = [];

        foreach ($this->requiredItems as $item) {
            $available = $item->componentProduct->stockForBranch($branchId);
            $needed    = $item->quantity * $qty;

            if ($available < $needed) {
                $shortages[] = [
                    'product'   => $item->componentProduct->name,
                    'needed'    => $needed,
                    'available' => $available,
                    'shortage'  => $needed - $available,
                ];
            }
        }

        return [
            'can_build' => empty($shortages),
            'shortages' => $shortages,
        ];
    }

    /**
     * Max number of bundles buildable from current stock in a branch.
     * Limited by the most constrained required component.
     */
    public function maxBuildableForBranch(int $branchId): int
    {
        $required = $this->requiredItems;
        if ($required->isEmpty()) return 0;

        return (int) $required->map(function (ProductBundleItem $item) use ($branchId) {
            $stock = $item->componentProduct->stockForBranch($branchId);
            if ($item->quantity <= 0) return PHP_INT_MAX;
            return (int) floor($stock / $item->quantity);
        })->min();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getPricingModeLabelAttribute(): string
    {
        return match ($this->pricing_mode) {
            'fixed'    => 'Fixed price',
            'computed' => 'Computed from components',
            default    => ucfirst($this->pricing_mode),
        };
    }

    public function getFormattedAdjustmentAttribute(): string
    {
        $val = (float) $this->price_adjustment;
        if ($val === 0.0) return '—';
        $prefix = $val >= 0 ? '+₱' : '-₱';
        return $prefix . number_format(abs($val), 2);
    }
}