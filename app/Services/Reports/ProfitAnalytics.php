<?php

namespace App\Services\Reports;

use App\Models\Branch;
use App\Models\Product;
use App\Services\ProductCostService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Profit analytics: what sells, what earns, and where.
 *
 * Revenue per product is the sale's net amount (total minus delivery fee — the dashboard's "net sales")
 * shared across its lines by line value, so discounts, VAT and service charges land on the products that
 * carried them and every view adds up to net sales. Cost is the unit cost frozen on each line when it was
 * sold; older lines without one are costed at today's capital / recipe cost and reported as an estimate.
 * Free loyalty rewards are not sales: they are left out of product figures and reported as their own cost.
 */
class ProfitAnalytics
{
    /** Menu engineering: an item is "popular" when it sells at least this share of an average item's units. */
    private const POPULARITY_FACTOR = 0.7;

    private const TOP_PER_BRANCH = 5;

    public function __construct(private ProductCostService $costs) {}

    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $from, string $to): array
    {
        $lines = $this->lines($branchId, $from, $to);
        $products = Product::with('category:id,name')->whereIn('id', $lines->pluck('product_id')->unique())->get()->keyBy('id');
        $branches = Branch::whereIn('id', $lines->pluck('branch_id')->unique())->get()->keyBy('id');
        $lines = $this->costed($lines, $products);

        $productRows = $this->byProduct($lines, $products);
        $totals = $this->totals($lines, $branchId, $from, $to);

        return [
            'totals' => $totals,
            'branches' => $this->byBranch($lines, $branches, $products, $totals['profit']),
            'products' => $productRows['rows'],
            'thresholds' => $productRows['thresholds'],
            'categories' => $this->byCategory($lines, $products),
            'best_by_branch' => $this->bestByBranch($lines, $branches, $products),
            'trend' => $this->trend($lines, $from, $to),
        ];
    }

    /**
     * Sold lines grouped by day, product and branch, with net revenue and the cost recorded at sale time.
     *
     * @return Collection<int, object>
     */
    private function lines(?int $branchId, string $from, string $to): Collection
    {
        $itemTotals = DB::table('sale_items')
            ->where('is_bundle_component', false)
            ->selectRaw('sale_id, SUM(total) as items_total')
            ->groupBy('sale_id');

        return DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->joinSub($itemTotals, 'st', 'st.sale_id', '=', 's.id')
            ->where('s.status', 'completed')
            ->where('si.is_bundle_component', false)
            ->where(fn ($q) => $q->where('si.is_reward', false)->orWhereNull('si.is_reward'))
            ->whereNotNull('si.product_id')
            ->whereBetween('s.created_at', [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()])
            ->when($branchId, fn ($q) => $q->where('s.branch_id', $branchId))
            ->groupByRaw('DATE(s.created_at), si.product_id, s.branch_id')
            ->selectRaw('DATE(s.created_at) as day, si.product_id, s.branch_id')
            ->selectRaw('SUM(si.quantity) as units, COUNT(DISTINCT s.id) as orders')
            ->selectRaw('SUM(CASE WHEN st.items_total > 0 THEN si.total * (s.total - COALESCE(s.delivery_fee, 0)) / st.items_total ELSE 0 END) as revenue')
            ->selectRaw('SUM(CASE WHEN si.unit_cost IS NOT NULL THEN si.quantity * si.unit_cost ELSE 0 END) as recorded_cost')
            ->selectRaw('SUM(CASE WHEN si.unit_cost IS NULL THEN si.quantity ELSE 0 END) as uncosted_units')
            ->get();
    }

    /**
     * Add each line's full cost: what was recorded plus today's unit cost for units sold before costs were recorded.
     *
     * @param  Collection<int, object>  $lines
     * @param  Collection<int, Product>  $products
     * @return Collection<int, object>
     */
    private function costed(Collection $lines, Collection $products): Collection
    {
        $unitCosts = [];

        return $lines->map(function (object $line) use ($products, &$unitCosts) {
            $estimated = 0.0;
            if ((float) $line->uncosted_units > 0 && ($product = $products->get($line->product_id))) {
                $key = $line->product_id.'-'.$line->branch_id;
                $unitCosts[$key] ??= $this->costs->unitCost($product, (int) $line->branch_id);
                $estimated = (float) $line->uncosted_units * $unitCosts[$key];
            }

            $line->units = (float) $line->units;
            $line->orders = (int) $line->orders;
            $line->revenue = (float) $line->revenue;
            $line->estimated_cost = $estimated;
            $line->cost = (float) $line->recorded_cost + $estimated;

            return $line;
        });
    }

    /**
     * @param  Collection<int, object>  $lines
     * @return array<string, float|int>
     */
    private function totals(Collection $lines, ?int $branchId, string $from, string $to): array
    {
        $revenue = $lines->sum('revenue');
        $cost = $lines->sum('cost');

        $rewardCost = (float) DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->where('s.status', 'completed')
            ->where('si.is_reward', true)
            ->whereBetween('s.created_at', [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()])
            ->when($branchId, fn ($q) => $q->where('s.branch_id', $branchId))
            ->sum(DB::raw('si.quantity * COALESCE(si.unit_cost, 0)'));

        return [
            'revenue' => round($revenue, 2),
            'cost' => round($cost, 2),
            'profit' => round($revenue - $cost, 2),
            'margin' => $this->margin($revenue, $cost),
            'units' => round($lines->sum('units'), 2),
            'orders' => (int) DB::table('sales')
                ->where('status', 'completed')
                ->whereBetween('created_at', [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->count(),
            'estimated_cost_share' => $cost > 0 ? round($lines->sum('estimated_cost') / $cost * 100, 1) : 0.0,
            'reward_cost' => round($rewardCost, 2),
        ];
    }

    /**
     * Every product with its figures, ranked by gross profit and placed on the menu-engineering matrix.
     *
     * @param  Collection<int, object>  $lines
     * @param  Collection<int, Product>  $products
     * @return array{rows: list<array<string, mixed>>, thresholds: array{popularity: float, profit_per_unit: float}}
     */
    private function byProduct(Collection $lines, Collection $products): array
    {
        $grouped = $lines->groupBy('product_id')->map(fn (Collection $rows, $productId) => $this->figures($rows) + [
            'id' => (int) $productId,
            'name' => $products->get($productId)?->name ?? 'Removed item',
            'category' => $products->get($productId)?->category?->name ?? 'Uncategorised',
        ]);

        $totalUnits = $grouped->sum('units');
        $totalProfit = $grouped->sum('profit');
        $popularity = $grouped->isNotEmpty() ? round(self::POPULARITY_FACTOR * $totalUnits / $grouped->count(), 2) : 0.0;
        $profitPerUnit = $totalUnits > 0 ? round($totalProfit / $totalUnits, 2) : 0.0;

        $rows = $grouped->map(function (array $row) use ($popularity, $profitPerUnit, $totalProfit) {
            $popular = $row['units'] >= $popularity;
            $earns = $row['profit_per_unit'] >= $profitPerUnit;

            return $row + [
                'profit_share' => $totalProfit > 0 ? round($row['profit'] / $totalProfit * 100, 1) : 0.0,
                'class' => match (true) {
                    $popular && $earns => 'star',
                    $popular => 'workhorse',
                    $earns => 'puzzle',
                    default => 'dog',
                },
            ];
        })->sortByDesc('profit')->values()->all();

        return ['rows' => $rows, 'thresholds' => ['popularity' => $popularity, 'profit_per_unit' => $profitPerUnit]];
    }

    /**
     * @param  Collection<int, object>  $lines
     * @param  Collection<int, Branch>  $branches
     * @param  Collection<int, Product>  $products
     * @return list<array<string, mixed>>
     */
    private function byBranch(Collection $lines, Collection $branches, Collection $products, float $totalProfit): array
    {
        return $lines->groupBy('branch_id')->map(function (Collection $rows, $branchId) use ($branches, $products, $totalProfit) {
            $best = $rows->groupBy('product_id')->map(fn (Collection $r) => $r->sum('revenue') - $r->sum('cost'))->sortDesc();
            $bestId = $best->keys()->first();

            return $this->figures($rows) + [
                'id' => (int) $branchId,
                'name' => $branches->get($branchId)?->display_name ?? 'Branch',
                'products_sold' => $rows->pluck('product_id')->unique()->count(),
                'profit_share' => $totalProfit > 0 ? round(($rows->sum('revenue') - $rows->sum('cost')) / $totalProfit * 100, 1) : 0.0,
                'top_product' => $bestId ? ['name' => $products->get($bestId)?->name ?? 'Removed item', 'profit' => round((float) $best->first(), 2)] : null,
            ];
        })->sortByDesc('profit')->values()->all();
    }

    /**
     * @param  Collection<int, object>  $lines
     * @param  Collection<int, Product>  $products
     * @return list<array<string, mixed>>
     */
    private function byCategory(Collection $lines, Collection $products): array
    {
        return $lines->groupBy(fn (object $line) => $products->get($line->product_id)?->category?->name ?? 'Uncategorised')
            ->map(fn (Collection $rows, string $name) => $this->figures($rows) + ['name' => $name])
            ->sortByDesc('profit')
            ->values()
            ->all();
    }

    /**
     * The most profitable products at each branch.
     *
     * @param  Collection<int, object>  $lines
     * @param  Collection<int, Branch>  $branches
     * @param  Collection<int, Product>  $products
     * @return list<array<string, mixed>>
     */
    private function bestByBranch(Collection $lines, Collection $branches, Collection $products): array
    {
        return $lines->groupBy('branch_id')->map(fn (Collection $rows, $branchId) => [
            'id' => (int) $branchId,
            'name' => $branches->get($branchId)?->display_name ?? 'Branch',
            'products' => $rows->groupBy('product_id')
                ->map(fn (Collection $r, $productId) => $this->figures($r) + ['name' => $products->get($productId)?->name ?? 'Removed item'])
                ->sortByDesc('profit')
                ->take(self::TOP_PER_BRANCH)
                ->values()
                ->all(),
        ])->sortBy('name')->values()->all();
    }

    /**
     * Revenue and gross profit for every day in the period, zero-filled.
     *
     * @param  Collection<int, object>  $lines
     * @return list<array{date: string, revenue: float, profit: float}>
     */
    private function trend(Collection $lines, string $from, string $to): array
    {
        $byDay = $lines->groupBy('day');
        $days = [];
        for ($day = Carbon::parse($from); $day->lte(Carbon::parse($to)); $day->addDay()) {
            $rows = $byDay->get($day->toDateString(), collect());
            $days[] = [
                'date' => $day->toDateString(),
                'revenue' => round($rows->sum('revenue'), 2),
                'profit' => round($rows->sum('revenue') - $rows->sum('cost'), 2),
            ];
        }

        return $days;
    }

    /**
     * The shared figures for any group of lines.
     *
     * @param  Collection<int, object>  $rows
     * @return array{units: float, orders: int, revenue: float, cost: float, profit: float, margin: ?float, avg_price: float, profit_per_unit: float}
     */
    private function figures(Collection $rows): array
    {
        $units = (float) $rows->sum('units');
        $revenue = (float) $rows->sum('revenue');
        $cost = (float) $rows->sum('cost');

        return [
            'units' => round($units, 2),
            'orders' => (int) $rows->sum('orders'),
            'revenue' => round($revenue, 2),
            'cost' => round($cost, 2),
            'profit' => round($revenue - $cost, 2),
            'margin' => $this->margin($revenue, $cost),
            'avg_price' => $units > 0 ? round($revenue / $units, 2) : 0.0,
            'profit_per_unit' => $units > 0 ? round(($revenue - $cost) / $units, 2) : 0.0,
        ];
    }

    private function margin(float $revenue, float $cost): ?float
    {
        return $revenue > 0 ? round(($revenue - $cost) / $revenue * 100, 1) : null;
    }
}
