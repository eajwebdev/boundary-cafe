<?php

namespace App\Services\Reports;

use App\Models\ProductStock;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Ingredients consumed by sales in a period, worked out the same way the POS
 * deducts them: made-to-order items sold without a variant use their recipe,
 * voided sales use nothing. Quantities are in each recipe's unit, which is the
 * unit the ingredient's stock is deducted in. Based on current recipes.
 */
class IngredientUsageReport
{
    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $from, string $to): array
    {
        $lines = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->join('recipe_ingredients', 'recipe_ingredients.product_id', '=', 'products.id')
            ->join('products as ingredients', 'ingredients.id', '=', 'recipe_ingredients.ingredient_id')
            ->where('sales.status', '!=', 'voided')
            ->where('products.product_type', 'made_to_order')
            ->whereNull('sale_items.product_variant_id')
            ->when($branchId, fn ($query) => $query->where('sales.branch_id', $branchId))
            ->where('sales.created_at', '>=', Carbon::parse($from)->startOfDay())
            ->where('sales.created_at', '<', Carbon::parse($to)->addDay()->startOfDay())
            ->groupBy('recipe_ingredients.ingredient_id', 'ingredients.name', 'recipe_ingredients.unit', 'products.id', 'products.name', 'recipe_ingredients.quantity')
            ->selectRaw('recipe_ingredients.ingredient_id, ingredients.name as ingredient_name, recipe_ingredients.unit')
            ->selectRaw('products.name as product_name, recipe_ingredients.quantity as per_unit')
            ->selectRaw('SUM(sale_items.quantity) as sold, SUM(sale_items.quantity * recipe_ingredients.quantity) as used')
            ->get();

        $days = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;

        $onHand = ProductStock::query()
            ->whereIn('product_id', $lines->pluck('ingredient_id')->unique())
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(stock) as stock')
            ->pluck('stock', 'product_id');

        $rows = $lines
            ->groupBy(fn ($line) => $line->ingredient_id.'|'.$line->unit)
            ->map(function ($group) use ($days, $onHand) {
                $first = $group->first();
                $used = round((float) $group->sum('used'), 3);
                $stock = $onHand->has($first->ingredient_id) ? round((float) $onHand[$first->ingredient_id], 3) : null;
                $perDay = $used / $days;

                return [
                    'key' => $first->ingredient_id.'-'.$first->unit,
                    'ingredient' => $first->ingredient_name,
                    'unit' => $first->unit,
                    'used' => $used,
                    'per_day' => round($perDay, 3),
                    'on_hand' => $stock,
                    'days_left' => $stock !== null && $perDay > 0 ? round(max(0, $stock) / $perDay, 1) : null,
                    'products' => $group
                        ->sortByDesc('used')
                        ->map(fn ($line) => [
                            'name' => $line->product_name,
                            'per_unit' => round((float) $line->per_unit, 4),
                            'sold' => round((float) $line->sold, 3),
                            'used' => round((float) $line->used, 3),
                        ])
                        ->values()
                        ->all(),
                ];
            })
            // Soonest to run out first; ingredients with no stock figure go last, biggest users first.
            ->sort(fn (array $a, array $b) => [$a['days_left'] ?? INF, $b['used']] <=> [$b['days_left'] ?? INF, $a['used']])
            ->values();

        return [
            'days' => $days,
            'summary' => [
                'ingredients' => $rows->count(),
                'products' => $lines->pluck('product_name')->unique()->count(),
                'running_low' => $rows->filter(fn ($row) => $row['days_left'] !== null && $row['days_left'] < 3)->count(),
            ],
            'rows' => $rows->all(),
        ];
    }
}
