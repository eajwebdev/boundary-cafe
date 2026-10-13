<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\SystemSetting;

/**
 * What one unit of a product costs the cafe at a branch: a variant's capital, the cost of a
 * made-to-order item's recipe (each ingredient's capital × the amount used), or the product's capital.
 * Used to stamp each sale line's cost when it is sold and to estimate cost for older sales.
 */
class ProductCostService
{
    public function unitCost(Product $product, int $branchId, ?int $variantId = null): float
    {
        if ($variantId) {
            $variant = ProductVariant::with(['stocks' => fn ($q) => $q->where('branch_id', $branchId)])->find($variantId);
            $variantCapital = $variant?->stocks->firstWhere('branch_id', $branchId)?->capital;
            if ($variantCapital !== null && (float) $variantCapital > 0) {
                return round((float) $variantCapital, 2);
            }
        }

        if ($product->product_type === 'made_to_order' && SystemSetting::ingredientTracking($branchId)) {
            $product->loadMissing(['recipeIngredients.ingredient.stocks' => fn ($q) => $q->where('branch_id', $branchId)]);
            if ($product->recipeIngredients->isNotEmpty()) {
                return round((float) $product->recipeIngredients->sum(
                    fn ($recipe) => (float) ($recipe->ingredient?->stocks->firstWhere('branch_id', $branchId)?->capital ?? 0) * $recipe->quantityNeededFor(1)
                ), 2);
            }
        }

        $product->loadMissing(['stocks' => fn ($q) => $q->where('branch_id', $branchId)]);

        return round((float) ($product->stocks->firstWhere('branch_id', $branchId)?->capital ?? 0), 2);
    }
}
