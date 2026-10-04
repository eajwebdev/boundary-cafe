<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SaleItem extends Model
{
    use HasFactory;

    protected $table = 'sale_items';

    protected $fillable = [
        'sale_id',
        'product_id',
        'product_variant_id',
        'bundle_sale_item_id',    // parent bundle row (null if not a component)
        'is_bundle_component',    // true = this row is a component, hidden on receipt
        'quantity',
        'price',
        'total',
    ];

    protected $casts = [
        'quantity'            => 'float',
        'price'               => 'decimal:2',
        'total'               => 'decimal:2',
        'is_bundle_component' => 'boolean',
    ];

    protected $attributes = [
        'is_bundle_component' => false,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (SaleItem $item) {
            if (is_null($item->total)) {
                $item->total = round($item->quantity * (float) $item->price, 2);
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function sale(): BelongsTo    { return $this->belongsTo(Sale::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** The parent bundle sale item (if this is a component row) */
    public function bundleParent(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class, 'bundle_sale_item_id');
    }

    /** Component rows that belong to this bundle sale item */
    public function bundleComponents(): HasMany
    {
        return $this->hasMany(SaleItem::class, 'bundle_sale_item_id');
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isBundleHeader(): bool    { return $this->product?->isBundle() && !$this->is_bundle_component; }
    public function isBundleComponent(): bool { return (bool) $this->is_bundle_component; }
    public function isStandaloneItem(): bool  { return !$this->is_bundle_component && !$this->isBundleHeader(); }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedPriceAttribute(): string { return '₱' . number_format($this->price, 2); }
    public function getFormattedTotalAttribute(): string { return '₱' . number_format($this->total, 2); }

    /**
     * Display name for receipts and reports.
     * Components show as "  — CPU: Intel Core i5" (indented).
     * Bundles show as "Gaming PC Build".
     */
    public function getDisplayNameAttribute(): string
    {
        $name = $this->product?->name ?? 'Unknown';

        if ($this->variant) {
            $name .= ' (' . $this->variant->name . ')';
        }

        if ($this->is_bundle_component) {
            $name = '  — ' . $name; // indent component rows on receipt
        }

        return $name;
    }

    // ── Scopes ─────────────────────────────────────────────────────

    /** Only top-level items (bundle headers + standalone) — what shows on receipt */
    public function scopeReceiptItems($query)
    {
        return $query->where('is_bundle_component', false);
    }

    /** Only standalone items (not a bundle at all) */
    public function scopeStandalone($query)
    {
        return $query->where('is_bundle_component', false)
            ->whereDoesntHave('bundleComponents');
    }
}
