<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariantStock extends Model
{
    use HasFactory;

    protected $table = 'product_variant_stocks';

    protected $fillable = [
        'product_variant_id',
        'branch_id',
        'stock',
        'capital',
        'markup',
        'price',
        'expiry_date',
        'batch_number',
        'days_before_expiry_warning',
        'updated_by',
    ];

    protected $casts = [
        'stock'                       => 'float',
        'capital'                     => 'decimal:2',
        'markup'                      => 'decimal:2',
        'price'                       => 'decimal:2',
        'expiry_date'                 => 'date',
        'days_before_expiry_warning'  => 'integer',
    ];

    protected $attributes = [
        'stock'                      => 0,
        'capital'                    => 0.00,
        'markup'                     => 0.00,
        'price'                      => 0.00,
        'days_before_expiry_warning' => 30,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (ProductVariantStock $stock) {
            if (!is_null($stock->capital) && !is_null($stock->markup)) {
                // Base price from capital + markup
                $basePrice = round(
                    (float) $stock->capital * (1 + ((float) $stock->markup / 100)),
                    2
                );
                // Add variant extra_price on top
                $extraPrice = (float) ($stock->variant?->extra_price ?? 0.00);
                $stock->price = $basePrice + $extraPrice;
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    // ── Expiry Helpers ─────────────────────────────────────────────

    public function isExpired(): bool
    {
        return $this->expiry_date && $this->expiry_date->isPast();
    }

    public function isNearExpiry(): bool
    {
        if (!$this->expiry_date) return false;
        return $this->expiry_date->diffInDays(now()) <= $this->days_before_expiry_warning
            && !$this->isExpired();
    }

    public function getDaysUntilExpiryAttribute(): ?int
    {
        if (!$this->expiry_date) return null;
        return max(0, (int) now()->diffInDays($this->expiry_date, false));
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedStockAttribute(): string   { return number_format($this->stock); }
    public function getFormattedPriceAttribute(): string   { return '₱' . number_format($this->price, 2); }
    public function getFormattedCapitalAttribute(): string { return '₱' . number_format($this->capital, 2); }

    public function getIsLowStockAttribute(): bool
    {
        return $this->stock > 0 && $this->stock <= 5;
    }

    public function getIsOutOfStockAttribute(): bool
    {
        return $this->stock <= 0;
    }

    public function getStockStatusAttribute(): string
    {
        if ($this->isExpired())      return 'Expired';
        if ($this->stock <= 0)       return 'Out of Stock';
        if ($this->isNearExpiry())   return 'Near Expiry';
        if ($this->is_low_stock)     return 'Low Stock';
        return 'In Stock';
    }

    // ── Mutators ───────────────────────────────────────────────────

    public function setStockAttribute(int|float $value): void
    {
        $this->attributes['stock'] = max(0, (int) $value);
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeForBranch($query, int $branchId) { return $query->where('branch_id', $branchId); }
    public function scopeInStock($query)                  { return $query->where('stock', '>', 0); }
    public function scopeExpired($query)                  { return $query->whereDate('expiry_date', '<', now()); }

    public function scopeNearExpiry($query, int $days = 30)
    {
        return $query->whereDate('expiry_date', '>=', now())
                     ->whereDate('expiry_date', '<=', now()->addDays($days));
    }
}
