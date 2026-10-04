<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecipeIngredient extends Model
{
    use HasFactory;

    protected $table = 'recipe_ingredients';

    protected $fillable = [
        'product_id',    // the finished made-to-order product
        'ingredient_id', // the raw ingredient (also a product)
        'quantity',      // how much per 1 finished unit
        'unit',          // g,kg,ml,l,pcs,tsp,tbsp,cup,oz,lb,pinch
        'notes',
    ];

    protected $casts = [
        'quantity' => 'decimal:4',
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function ingredient(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'ingredient_id');
    }

    // ── Helpers ────────────────────────────────────────────────────

    /**
     * Total ingredient quantity needed for a given sale quantity.
     * e.g. 18g per cup × 3 cups sold = 54g to deduct
     */
    public function quantityNeededFor(int|float $saleQuantity): float
    {
        return round((float) $this->quantity * $saleQuantity, 4);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedQuantityAttribute(): string
    {
        $q = rtrim(rtrim(number_format((float) $this->quantity, 4), '0'), '.');
        return "{$q} {$this->unit}";
    }
}
