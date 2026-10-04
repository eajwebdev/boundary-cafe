<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TableOrderItem extends Model
{
    use HasFactory;

    protected $table = 'table_order_items';

    protected $fillable = [
        'table_order_id',
        'product_id',
        'product_variant_id',
        'bundle_table_order_item_id', // parent bundle row (null if not a component)
        'is_bundle_component',        // true = hidden on kitchen display
        'quantity',
        'price',
        'total',
        'status',
        'kitchen_note',
    ];

    protected $casts = [
        'quantity'            => 'integer',
        'price'               => 'decimal:2',
        'total'               => 'decimal:2',
        'is_bundle_component' => 'boolean',
    ];

    protected $attributes = [
        'status'              => 'pending',
        'is_bundle_component' => false,
    ];

    const STATUS_PENDING   = 'pending';
    const STATUS_PREPARING = 'preparing';
    const STATUS_SERVED    = 'served';
    const STATUS_CANCELLED = 'cancelled';

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (TableOrderItem $item) {
            $item->total = round($item->quantity * (float) $item->price, 2);
        });

        // Only recalculate on non-component rows to avoid double-counting
        static::saved(function (TableOrderItem $item) {
            if (!$item->is_bundle_component) {
                $item->tableOrder->recalculate();
            }
        });

        static::deleted(function (TableOrderItem $item) {
            if (!$item->is_bundle_component) {
                $item->tableOrder->recalculate();
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function tableOrder(): BelongsTo
    {
        return $this->belongsTo(TableOrder::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** Parent bundle item (if this is a component) */
    public function bundleParent(): BelongsTo
    {
        return $this->belongsTo(TableOrderItem::class, 'bundle_table_order_item_id');
    }

    /** Component items that belong to this bundle row */
    public function bundleComponents(): HasMany
    {
        return $this->hasMany(TableOrderItem::class, 'bundle_table_order_item_id');
    }

    // ── Status Helpers ─────────────────────────────────────────────

    public function isPending(): bool   { return $this->status === self::STATUS_PENDING; }
    public function isPreparing(): bool { return $this->status === self::STATUS_PREPARING; }
    public function isServed(): bool    { return $this->status === self::STATUS_SERVED; }
    public function isCancelled(): bool { return $this->status === self::STATUS_CANCELLED; }

    public function markPreparing(): void { $this->update(['status' => self::STATUS_PREPARING]); }
    public function markServed(): void    { $this->update(['status' => self::STATUS_SERVED]); }
    public function cancel(): void        { $this->update(['status' => self::STATUS_CANCELLED]); }

    // ── Bundle Helpers ─────────────────────────────────────────────

    public function isBundleHeader(): bool    { return $this->product?->isBundle() && !$this->is_bundle_component; }
    public function isBundleComponent(): bool { return (bool) $this->is_bundle_component; }

    // ── Accessors ──────────────────────────────────────────────────

    public function getDisplayNameAttribute(): string
    {
        $name = $this->product?->name ?? 'Unknown';
        if ($this->variant) {
            $name .= ' (' . $this->variant->name . ')';
        }
        if ($this->is_bundle_component) {
            $name = '  — ' . $name;
        }
        return $name;
    }

    public function getFormattedPriceAttribute(): string { return '₱' . number_format($this->price, 2); }
    public function getFormattedTotalAttribute(): string { return '₱' . number_format($this->total, 2); }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'pending'   => 'warning',
            'preparing' => 'info',
            'served'    => 'success',
            'cancelled' => 'destructive',
            default     => 'secondary',
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopePending($query)       { return $query->where('status', 'pending'); }
    public function scopePreparing($query)     { return $query->where('status', 'preparing'); }
    public function scopeServed($query)        { return $query->where('status', 'served'); }
    public function scopeActive($query)        { return $query->whereNotIn('status', ['cancelled']); }
    public function scopeKitchenItems($query)  { return $query->where('is_bundle_component', false); } // kitchen sees headers only
}
