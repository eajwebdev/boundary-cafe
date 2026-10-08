<?php

namespace App\Services\Reports;

use App\Models\Product;
use App\Models\ProductStock;
use App\Models\ProductVariant;
use App\Models\ProductVariantStock;
use App\Models\SystemSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Stock on hand right now, valued at cost. Only items that actually hold stock
 * are listed: products with variants are listed per variant, while
 * made-to-order, bundle and service items are left out because their stock
 * lives in their ingredients or components.
 */
class InventoryReport
{
    public const STATUS_OUT = 'out';

    public const STATUS_LOW = 'low';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_EXPIRING = 'expiring';

    public const STATUS_OK = 'ok';

    /** Product types whose stock is not kept on the item itself. */
    private const UNSTOCKED_TYPES = ['made_to_order', 'bundle', 'service'];

    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId): array
    {
        $threshold = SystemSetting::lowStockThreshold($branchId);
        $branchScope = fn ($query) => $query->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $products = Product::query()
            ->with([
                'category:id,name',
                'stocks' => $branchScope,
                'variants' => fn ($query) => $query->orderBy('sort_order')->orderBy('name'),
                'variants.stocks' => $branchScope,
            ])
            ->where('status', 'active')
            ->whereNotIn('product_type', self::UNSTOCKED_TYPES)
            ->orderBy('name')
            ->get();

        $rows = $products->flatMap(function (Product $product) use ($threshold) {
            if ($product->variants->isEmpty()) {
                return [$this->row($product, null, $product->stocks, $threshold)];
            }

            return $product->variants->map(fn (ProductVariant $variant) => $this->row($product, $variant, $variant->stocks, $threshold));
        })->values();

        $count = fn (string $status) => $rows->where('status', $status)->count();

        return [
            'low_stock_threshold' => $threshold,
            'excluded_count' => Product::where('status', 'active')->whereIn('product_type', self::UNSTOCKED_TYPES)->count(),
            'summary' => [
                'items' => $rows->count(),
                'value' => round((float) $rows->sum('value'), 2),
                'retail_value' => round((float) $rows->sum('retail_value'), 2),
                'out' => $count(self::STATUS_OUT),
                'low' => $count(self::STATUS_LOW),
                'expired' => $count(self::STATUS_EXPIRED),
                'expiring' => $count(self::STATUS_EXPIRING),
            ],
            'categories' => $rows->pluck('category')->unique()->sort()->values()->all(),
            'rows' => $rows->all(),
        ];
    }

    /**
     * @param  Collection<int, ProductStock|ProductVariantStock>  $stocks
     * @return array<string, mixed>
     */
    private function row(Product $product, ?ProductVariant $variant, Collection $stocks, int $threshold): array
    {
        $onHand = (float) $stocks->sum('stock');
        $value = (float) $stocks->sum(fn ($stock) => max(0, (float) $stock->stock) * (float) $stock->capital);
        $retailValue = (float) $stocks->sum(fn ($stock) => max(0, (float) $stock->stock) * (float) $stock->price);

        $dated = $stocks->filter(fn ($stock) => $stock->expiry_date && (float) $stock->stock > 0)->sortBy('expiry_date');
        $nextExpiry = $dated->first();
        $daysLeft = $nextExpiry ? (int) today()->diffInDays(Carbon::parse($nextExpiry->expiry_date), false) : null;

        $status = match (true) {
            $onHand <= 0 => self::STATUS_OUT,
            $daysLeft !== null && $daysLeft < 0 => self::STATUS_EXPIRED,
            $daysLeft !== null && $daysLeft <= (int) ($nextExpiry->days_before_expiry_warning ?? 7) => self::STATUS_EXPIRING,
            $onHand <= $threshold => self::STATUS_LOW,
            default => self::STATUS_OK,
        };

        return [
            'key' => $variant ? "v{$variant->id}" : "p{$product->id}",
            'name' => $product->name,
            'variant' => $variant?->name,
            'sku' => $variant?->sku ?: ($variant?->barcode ?: $product->barcode),
            'category' => $product->category?->name ?? 'Uncategorized',
            'unit' => $product->unit ?: 'pc',
            'stock' => round($onHand, 3),
            'unit_cost' => $onHand > 0 ? round($value / $onHand, 2) : round((float) ($stocks->first()?->capital ?? 0), 2),
            'price' => round((float) ($stocks->first()?->price ?? 0), 2),
            'value' => round($value, 2),
            'retail_value' => round($retailValue, 2),
            'expiry_date' => $nextExpiry ? Carbon::parse($nextExpiry->expiry_date)->toDateString() : null,
            'days_to_expiry' => $daysLeft,
            'status' => $status,
        ];
    }
}
