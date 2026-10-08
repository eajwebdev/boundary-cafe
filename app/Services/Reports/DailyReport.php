<?php

namespace App\Services\Reports;

use App\Models\Sale;
use App\Models\ZReading;
use App\Services\ZReadingService;
use Illuminate\Support\Carbon;

/**
 * One business day: the same sales and cash figures the Z-reading uses, plus
 * the day's expenses, best sellers and sales by hour. Read-only.
 */
class DailyReport
{
    public function __construct(
        private ZReadingService $zReadings,
        private SalesReport $sales,
        private ExpenseReport $expenses,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $date): array
    {
        $figures = $this->zReadings->summarize($branchId, $date);
        $expenses = $this->expenses->build($branchId, $date, $date);
        $zReading = $branchId
            ? ZReading::where('branch_id', $branchId)->whereDate('business_date', $date)->first(['id', 'z_number'])
            : null;

        return [
            'figures' => $figures,
            'open_sessions' => collect($figures['sessions'])->where('status', 'open')->count(),
            'expenses' => [
                'total' => $expenses['summary']['total'],
                'count' => $expenses['summary']['count'],
                'by_category' => $expenses['by_category'],
            ],
            'sales_less_expenses' => round($figures['net_sales'] - $expenses['summary']['total'], 2),
            'top_items' => $this->sales->topItems($branchId, $date, $date, 10),
            'by_hour' => $this->byHour($branchId, $date),
            'z_reading' => $zReading ? ['id' => $zReading->id, 'z_number' => $zReading->z_number] : null,
        ];
    }

    /**
     * @return list<array{hour: int, count: int, amount: float}>
     */
    private function byHour(?int $branchId, string $date): array
    {
        return Sale::query()
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->where('status', '!=', 'voided')
            ->whereDate('created_at', $date)
            ->get(['created_at', 'total'])
            ->groupBy(fn (Sale $sale) => (int) Carbon::parse($sale->created_at)->format('G'))
            ->map(fn ($group, int $hour) => [
                'hour' => $hour,
                'count' => $group->count(),
                'amount' => round((float) $group->sum('total'), 2),
            ])
            ->sortKeys()
            ->values()
            ->all();
    }
}
