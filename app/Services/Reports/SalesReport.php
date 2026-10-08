<?php

namespace App\Services\Reports;

use App\Models\CustomerPayment;
use App\Models\Sale;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Sales for a period. Every figure covers the whole period (never just one
 * page of the register), and voided sales are excluded from sales totals and
 * reported on their own line.
 */
class SalesReport
{
    /**
     * Money actually received at the counter: credit, mixed and installment
     * sales only count the amount paid up front; the rest is outstanding.
     */
    public const COLLECTED_SQL = "CASE WHEN payment_method IN ('credit', 'mixed', 'installment') THEN amount_paid ELSE total END";

    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $from, string $to): array
    {
        $totals = $this->valid($branchId, $from, $to)
            ->selectRaw('COUNT(*) as transactions')
            ->selectRaw('COALESCE(SUM(total), 0) as net_sales')
            ->selectRaw('COALESCE(SUM(discount_amount), 0) as discounts')
            ->selectRaw('COALESCE(SUM(loyalty_discount), 0) as loyalty_discounts')
            ->selectRaw('COALESCE(SUM('.self::COLLECTED_SQL.'), 0) as collected')
            ->selectRaw('COALESCE(SUM(balance_due), 0) as outstanding')
            ->toBase()
            ->first();

        $voids = $this->inPeriod($branchId, $from, $to)
            ->where('status', 'voided')
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(total), 0) as amount')
            ->toBase()
            ->first();

        $collections = CustomerPayment::query()
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->whereDate('payment_date', '>=', $from)
            ->whereDate('payment_date', '<=', $to)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->toBase()
            ->first();

        $netSales = (float) $totals->net_sales;
        $discounts = (float) $totals->discounts + (float) $totals->loyalty_discounts;
        $transactions = (int) $totals->transactions;

        return [
            'summary' => [
                'transactions' => $transactions,
                'gross_sales' => round($netSales + $discounts, 2),
                'discounts' => round($discounts, 2),
                'net_sales' => round($netSales, 2),
                'average_sale' => $transactions > 0 ? round($netSales / $transactions, 2) : 0.0,
                'collected' => round((float) $totals->collected, 2),
                'outstanding' => round((float) $totals->outstanding, 2),
                'collections_count' => (int) $collections->count,
                'collections' => round((float) $collections->amount, 2),
                'cash_in' => round((float) $totals->collected + (float) $collections->amount, 2),
                'void_count' => (int) $voids->count,
                'void_amount' => round((float) $voids->amount, 2),
            ],
            'by_method' => $this->grouped($branchId, $from, $to, 'payment_method'),
            'by_channel' => $this->grouped($branchId, $from, $to, 'channel'),
            'by_day' => $this->byDay($branchId, $from, $to),
            'by_cashier' => $this->byCashier($branchId, $from, $to),
            'top_items' => $this->topItems($branchId, $from, $to, 15),
        ];
    }

    /**
     * Non-voided sales in the period, newest first, for the transaction register.
     *
     * @return Builder<Sale>
     */
    public function register(?int $branchId, string $from, string $to, ?string $paymentMethod = null): Builder
    {
        return $this->valid($branchId, $from, $to)
            ->with(['user:id,fname,lname', 'customer:id,name'])
            ->when($paymentMethod, fn ($query) => $query->where('payment_method', $paymentMethod))
            ->latest('created_at')
            ->latest('id');
    }

    /**
     * Best-selling items by quantity. Amounts are line totals before
     * order-level discounts.
     *
     * @return list<array{name: string, quantity: float, amount: float}>
     */
    public function topItems(?int $branchId, string $from, string $to, int $limit): array
    {
        return DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->leftJoin('product_variants', 'product_variants.id', '=', 'sale_items.product_variant_id')
            ->where('sales.status', '!=', 'voided')
            ->where('sale_items.is_bundle_component', false)
            ->when($branchId, fn ($query) => $query->where('sales.branch_id', $branchId))
            ->where('sales.created_at', '>=', Carbon::parse($from)->startOfDay())
            ->where('sales.created_at', '<', Carbon::parse($to)->addDay()->startOfDay())
            ->groupBy('sale_items.product_id', 'sale_items.product_variant_id', 'products.name', 'product_variants.name')
            ->selectRaw('products.name as product_name, product_variants.name as variant_name')
            ->selectRaw('SUM(sale_items.quantity) as quantity, SUM(sale_items.total) as amount')
            ->orderByDesc('quantity')
            ->orderByDesc('amount')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'name' => $row->variant_name ? "{$row->product_name} ({$row->variant_name})" : $row->product_name,
                'quantity' => round((float) $row->quantity, 3),
                'amount' => round((float) $row->amount, 2),
            ])
            ->all();
    }

    /**
     * @return Builder<Sale>
     */
    private function inPeriod(?int $branchId, string $from, string $to): Builder
    {
        return Sale::query()
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->where('created_at', '>=', Carbon::parse($from)->startOfDay())
            ->where('created_at', '<', Carbon::parse($to)->addDay()->startOfDay());
    }

    /**
     * @return Builder<Sale>
     */
    private function valid(?int $branchId, string $from, string $to): Builder
    {
        return $this->inPeriod($branchId, $from, $to)->where('status', '!=', 'voided');
    }

    /**
     * @return list<array{key: string, count: int, amount: float, collected: float}>
     */
    private function grouped(?int $branchId, string $from, string $to, string $column): array
    {
        return $this->valid($branchId, $from, $to)
            ->groupBy($column)
            ->selectRaw("{$column} as `key`, COUNT(*) as count, COALESCE(SUM(total), 0) as amount")
            ->selectRaw('COALESCE(SUM('.self::COLLECTED_SQL.'), 0) as collected')
            ->orderByDesc('amount')
            ->toBase()
            ->get()
            ->map(fn ($row) => [
                'key' => (string) ($row->key ?: 'counter'),
                'count' => (int) $row->count,
                'amount' => round((float) $row->amount, 2),
                'collected' => round((float) $row->collected, 2),
            ])
            ->all();
    }

    /**
     * @return list<array{date: string, count: int, discounts: float, amount: float}>
     */
    private function byDay(?int $branchId, string $from, string $to): array
    {
        return $this->valid($branchId, $from, $to)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
            ->selectRaw('COALESCE(SUM(discount_amount + COALESCE(loyalty_discount, 0)), 0) as discounts')
            ->selectRaw('COALESCE(SUM(total), 0) as amount')
            ->groupBy('day')
            ->orderBy('day')
            ->toBase()
            ->get()
            ->map(fn ($row) => [
                'date' => Carbon::parse($row->day)->toDateString(),
                'count' => (int) $row->count,
                'discounts' => round((float) $row->discounts, 2),
                'amount' => round((float) $row->amount, 2),
            ])
            ->all();
    }

    /**
     * @return list<array{name: string, count: int, amount: float}>
     */
    private function byCashier(?int $branchId, string $from, string $to): array
    {
        $rows = $this->valid($branchId, $from, $to)
            ->groupBy('user_id')
            ->selectRaw('user_id, COUNT(*) as count, COALESCE(SUM(total), 0) as amount')
            ->orderByDesc('amount')
            ->toBase()
            ->get();

        $names = User::whereIn('id', $rows->pluck('user_id')->filter())->get(['id', 'fname', 'lname'])->keyBy('id');

        return $rows->map(fn ($row) => [
            'name' => $names->get($row->user_id)?->full_name ?? 'Unassigned',
            'count' => (int) $row->count,
            'amount' => round((float) $row->amount, 2),
        ])->all();
    }
}
