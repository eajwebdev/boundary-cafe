<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'name',
        'sku',
        'barcode',
        'attributes',   // JSON: {"size":"L","color":"Blue","flavor":"Matcha"}
        'extra_price',
        'is_available',
        'sort_order',
    ];

    protected $casts = [
        'attributes'  => 'array',
        'extra_price' => 'decimal:2',
        'is_available'=> 'boolean',
        'sort_order'  => 'integer',
    ];

    protected $attributes = [
        'extra_price'  => 0.00,
        'is_available' => true,
        'sort_order'   => 0,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (ProductVariant $variant) {
            // Auto-generate a name from attributes if not provided
            if (empty($variant->name) && !empty($variant->attributes)) {
                $variant->name = implode(' / ', array_values($variant->attributes));
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function stocks(): HasMany
    {
        return $this->hasMany(ProductVariantStock::class);
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function tableOrderItems(): HasMany
    {
        return $this->hasMany(TableOrderItem::class);
    }

    // ── Branch-scoped helpers ──────────────────────────────────────

    public function stockForBranch(int $branchId): int
    {
        return (int) $this->stocks()->where('branch_id', $branchId)->value('stock') ?? 0;
    }

    public function priceForBranch(int $branchId): float
    {
        return (float) $this->stocks()->where('branch_id', $branchId)->value('price') ?? 0.00;
    }

    public function stockRecordForBranch(int $branchId): ?ProductVariantStock
    {
        return $this->stocks()->where('branch_id', $branchId)->first();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedExtraPriceAttribute(): string
    {
        if ($this->extra_price == 0) return '';
        return '+₱' . number_format($this->extra_price, 2);
    }

    public function getTotalStockAttribute(): int
    {
        return (int) $this->stocks()->sum('stock');
    }

    /** Full label including attributes e.g. "T-Shirt — Large / Blue" */
    public function getFullLabelAttribute(): string
    {
        return $this->product->name . ' — ' . $this->name;
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeAvailable($query)
    {
        return $query->where('is_available', true);
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('name');
    }
}
