<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductBundleItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_bundle_id',
        'component_product_id',
        'component_variant_id',
        'quantity',
        'override_price',
        'is_required',
        'notes',
        'sort_order',
    ];

    protected $casts = [
        'quantity'       => 'integer',
        'override_price' => 'decimal:2',
        'is_required'    => 'boolean',
        'sort_order'     => 'integer',
    ];

    protected $attributes = [
        'quantity'    => 1,
        'is_required' => true,
        'sort_order'  => 0,
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(ProductBundle::class, 'product_bundle_id');
    }

    public function componentProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_product_id');
    }

    public function componentVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'component_variant_id');
    }

    // ── Helpers ────────────────────────────────────────────────────

    /**
     * Effective price for this component in a given branch.
     * Uses override_price if set; falls back to live stock price.
     */
    public function effectivePriceForBranch(int $branchId): float
    {
        if (!is_null($this->override_price)) {
            return (float) $this->override_price;
        }

        if ($this->componentVariant) {
            return $this->componentVariant->priceForBranch($branchId);
        }

        return $this->componentProduct->priceForBranch($branchId);
    }

    public function lineTotalForBranch(int $branchId): float
    {
        return round($this->effectivePriceForBranch($branchId) * $this->quantity, 2);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getDisplayNameAttribute(): string
    {
        $name = $this->componentProduct->name;
        if ($this->componentVariant) {
            $name .= ' (' . $this->componentVariant->name . ')';
        }
        return $name;
    }

    public function getFormattedOverridePriceAttribute(): string
    {
        return $this->override_price !== null
            ? '₱' . number_format($this->override_price, 2)
            : 'Live price';
    }
}
