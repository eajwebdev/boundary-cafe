<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'barcode',
        'name',
        'unit',
        'description',
        'category_id',
        'product_img',
        'product_type', // standard | made_to_order | bundle | service
        'duration_minutes',
        'status',
        'is_taxable',
    ];

    protected $casts = [
        'unit'         => 'string',
        'product_type' => 'string',
        'duration_minutes' => 'integer',
        'is_taxable'   => 'boolean',
    ];

    protected $attributes = [
        'unit'         => 'pc',
        'product_type' => 'standard',
        'status'       => 'active',
        'is_taxable'   => true,
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** Stock per branch (standard & made_to_order products) */
    public function stocks(): HasMany
    {
        return $this->hasMany(ProductStock::class);
    }

    /** Size / color / flavor variants */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)
            ->orderBy('sort_order')
            ->orderBy('name');
    }

    public function availableVariants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)
            ->where('is_available', true)
            ->orderBy('sort_order')
            ->orderBy('name');
    }

    /** Bundle definition — only present when product_type = 'bundle' */
    public function bundle(): HasOne
    {
        return $this->hasOne(ProductBundle::class);
    }

    /** When this product is a component inside other bundles */
    public function bundleAppearances(): HasMany
    {
        return $this->hasMany(ProductBundleItem::class, 'component_product_id');
    }

    public function orderItems(): HasMany      { return $this->hasMany(OrderItem::class); }
    public function saleItems(): HasMany       { return $this->hasMany(SaleItem::class); }
    public function tableOrderItems(): HasMany { return $this->hasMany(TableOrderItem::class); }

    /** Recipe lines — for made_to_order products */
    public function recipeIngredients(): HasMany
    {
        return $this->hasMany(RecipeIngredient::class, 'product_id');
    }

    /** Products that use THIS as a raw ingredient */
    public function usedInRecipes(): HasMany
    {
        return $this->hasMany(RecipeIngredient::class, 'ingredient_id');
    }

    // ── Type Helpers ───────────────────────────────────────────────

    public function isStandard(): bool    { return $this->product_type === 'standard'; }
    public function isMadeToOrder(): bool { return $this->product_type === 'made_to_order'; }
    public function isBundle(): bool      { return $this->product_type === 'bundle'; }
    public function isService(): bool     { return $this->product_type === 'service'; }

    public function hasVariants(): bool
    {
        return $this->variants()->exists();
    }

    // ── Branch-scoped helpers ──────────────────────────────────────

    public function stockForBranch(int $branchId): int
    {
        if ($this->isBundle()) {
            return $this->bundle?->maxBuildableForBranch($branchId) ?? 0;
        }
        return (int) ($this->stocks()->where('branch_id', $branchId)->value('stock') ?? 0);
    }

    public function priceForBranch(int $branchId): float
    {
        if ($this->isBundle()) {
            return $this->bundle?->computedPriceForBranch($branchId) ?? 0.00;
        }
        return (float) ($this->stocks()->where('branch_id', $branchId)->value('price') ?? 0.00);
    }

    public function capitalForBranch(int $branchId): float
    {
        return (float) ($this->stocks()->where('branch_id', $branchId)->value('capital') ?? 0.00);
    }

    public function stockRecordForBranch(int $branchId): ?ProductStock
    {
        return $this->stocks()->where('branch_id', $branchId)->first();
    }

    // ── Global Stock Accessors ─────────────────────────────────────

    public function getStockAttribute(): int
    {
        if ($this->isMadeToOrder()) return $this->getMakeableQuantity();
        if ($this->isBundle())      return 0; // bundles report per-branch only
        return (int) $this->stocks()->sum('stock');
    }

    public function getTotalStockAttribute(): int
    {
        return (int) $this->stocks()->sum('stock');
    }

    public function getFormattedStockAttribute(): string { return number_format($this->stock); }
    public function getIsInStockAttribute(): bool        { return $this->stock > 0; }

    public function getIsLowStockAttribute(): bool
    {
        $s = $this->stock;
        return $s > 0 && $s <= 5;
    }

    public function getStockStatusAttribute(): string
    {
        if ($this->isBundle())       return 'Bundle';
        if ($this->stock <= 0)       return 'Out of Stock';
        if ($this->is_low_stock)     return 'Low Stock';
        return 'In Stock';
    }

    // ── Global Pricing Accessors ───────────────────────────────────

    public function getPriceAttribute(): float
    {
        if ($this->relationLoaded('stocks') && $this->stocks->isNotEmpty()) {
            return (float) ($this->stocks->first()->price ?? 0.00);
        }
        return (float) ($this->stocks()->oldest()->value('price') ?? 0.00);
    }

    public function getLowestPriceAttribute(): float
    {
        return (float) ($this->stocks()->min('price') ?? 0.00);
    }

    public function getCapitalAttribute(): float
    {
        if ($this->relationLoaded('stocks') && $this->stocks->isNotEmpty()) {
            return (float) ($this->stocks->first()->capital ?? 0.00);
        }
        return (float) ($this->stocks()->oldest()->value('capital') ?? 0.00);
    }

    public function getAverageMarkupAttribute(): float
    {
        return (float) ($this->stocks()->avg('markup') ?? 0.00);
    }

    // ── Made-to-order ──────────────────────────────────────────────

    public function getMakeableQuantity(): int
    {
        $recipe = $this->recipeIngredients()->with('ingredient')->get();
        if ($recipe->isEmpty()) return 0;

        return (int) $recipe->map(function ($line) {
            $ingredientStock = $line->ingredient->stocks()->sum('stock');
            if ((float) $line->quantity <= 0) return PHP_INT_MAX;
            return (int) floor($ingredientStock / (float) $line->quantity);
        })->min();
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeStandard($query)       { return $query->where('product_type', 'standard'); }
    public function scopeMadeToOrder($query)    { return $query->where('product_type', 'made_to_order'); }
    public function scopeBundles($query)        { return $query->where('product_type', 'bundle'); }
    public function scopeWithVariants($query)   { return $query->whereHas('variants'); }
    public function scopeWithoutVariants($query){ return $query->whereDoesntHave('variants'); }

    public function scopeSellable($query)
    {
        // Products that can appear on the POS — all types except raw ingredients
        return $query->whereIn('product_type', ['standard', 'made_to_order', 'bundle', 'service']);
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeInStockForBranch($query, int $branchId)
    {
        return $query->whereHas('stocks', fn($q) =>
            $q->where('branch_id', $branchId)->where('stock', '>', 0)
        );
    }

    public static function resolveImageUrl(?string $path): ?string
    {
        if (! $path) return null;
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }
        if (str_starts_with($path, '/images/') || str_starts_with($path, 'images/')) {
            return asset(ltrim($path, '/'));
        }
        if (str_starts_with($path, '/')) {
            return asset(ltrim($path, '/'));
        }
        return asset('storage/' . $path);
    }
}
