<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    use HasFactory;

    protected $table = 'order_items';

    protected $fillable = [
        'order_id',
        'product_id',
        'product_variant_id', // null if product has no variants
        'quantity',
        'price',
        'total',
        'discount_amount',
        'tax_amount',
    ];

    protected $casts = [
        'quantity'        => 'float',
        'price'           => 'decimal:2',
        'total'           => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount'      => 'decimal:2',
    ];

    protected $attributes = [
        'quantity'        => 1,
        'discount_amount' => 0.00,
        'tax_amount'      => 0.00,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (OrderItem $item) {
            if (is_null($item->total)) {
                $item->total = round($item->quantity * (float) $item->price, 2);
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function order(): BelongsTo   { return $this->belongsTo(Order::class); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getSubtotalAttribute(): float
    {
        return (float) ($this->total ?? ($this->quantity * (float) $this->price));
    }

    public function getFormattedPriceAttribute(): string { return '₱' . number_format($this->price, 2); }
    public function getFormattedTotalAttribute(): string { return '₱' . number_format($this->subtotal, 2); }

    public function getDisplayNameAttribute(): string
    {
        $name = $this->product?->name ?? 'Unknown';
        if ($this->variant) {
            $name .= ' (' . $this->variant->name . ')';
        }
        return $name;
    }

    public function getFormattedDiscountAttribute(): string
    {
        return $this->discount_amount > 0 ? '₱' . number_format($this->discount_amount, 2) : '-';
    }
}
