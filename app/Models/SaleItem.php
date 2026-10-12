<?php

namespace App\Models;

use App\Services\ProductCostService;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
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
        'is_reward',              // true = given for loyalty points (price 0)
        'reward_points',
        'retail_price',           // menu price at the time — reference value of a reward
        'unit_cost',
        'quantity',
        'price',
        'total',
    ];

    protected $casts = [
        'quantity' => 'float',
        'price' => 'decimal:2',
        'total' => 'decimal:2',
        'is_bundle_component' => 'boolean',
        'is_reward' => 'boolean',
        'reward_points' => 'integer',
        'retail_price' => 'decimal:2',
        'unit_cost' => 'decimal:2',
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

        // Freeze what the item cost when it was sold, so later price changes do not rewrite past margins.
        static::creating(function (SaleItem $item) {
            if ($item->unit_cost !== null || ! $item->product_id) {
                return;
            }
            $branchId = Sale::whereKey($item->sale_id)->value('branch_id');
            $product = Product::find($item->product_id);
            if ($branchId && $product) {
                $item->unit_cost = app(ProductCostService::class)->unitCost($product, (int) $branchId, $item->product_variant_id);
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

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

    public function isBundleHeader(): bool
    {
        return $this->product?->isBundle() && ! $this->is_bundle_component;
    }

    public function isBundleComponent(): bool
    {
        return (bool) $this->is_bundle_component;
    }

    public function isStandaloneItem(): bool
    {
        return ! $this->is_bundle_component && ! $this->isBundleHeader();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedPriceAttribute(): string
    {
        return '₱'.number_format($this->price, 2);
    }

    public function getFormattedTotalAttribute(): string
    {
        return '₱'.number_format($this->total, 2);
    }

    /**
     * Display name for receipts and reports.
     * Components show as "  — CPU: Intel Core i5" (indented).
     * Bundles show as "Gaming PC Build".
     */
    public function getDisplayNameAttribute(): string
    {
        $name = $this->product?->name ?? 'Unknown';

        if ($this->variant) {
            $name .= ' ('.$this->variant->name.')';
        }

        if ($this->is_bundle_component) {
            $name = '  — '.$name; // indent component rows on receipt
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
