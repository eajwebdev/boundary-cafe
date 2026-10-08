<?php

namespace App\Services\Reports;

use App\Models\StockAdjustment;

/**
 * Stock written off (damage, loss, expiry, theft, corrections) in a period,
 * valued at the unit cost recorded with each write-off. Quantities are only
 * totalled per item, since different items are counted in different units.
 */
class StockLossReport
{
    public const TYPES = ['damage', 'loss', 'expired', 'theft', 'correction', 'other'];

    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $from, string $to, ?string $type = null): array
    {
        $rows = StockAdjustment::query()
            ->with(['product:id,name,barcode,unit', 'recordedBy:id,fname,lname'])
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->when($type, fn ($query) => $query->where('type', $type))
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to)
            ->latest()
            ->latest('id')
            ->get()
            ->map(fn (StockAdjustment $adjustment) => [
                'id' => $adjustment->id,
                'date' => $adjustment->created_at->toIso8601String(),
                'product' => $adjustment->product?->name ?? 'Deleted product',
                'barcode' => $adjustment->product?->barcode,
                'unit' => $adjustment->product?->unit ?: 'pc',
                'type' => $adjustment->type,
                'type_label' => StockAdjustment::typeLabel($adjustment->type),
                'quantity' => (float) $adjustment->quantity,
                'unit_cost' => round((float) $adjustment->unit_cost, 2),
                'value' => round((float) $adjustment->unit_cost * (float) $adjustment->quantity, 2),
                'note' => $adjustment->note,
                'recorded_by' => $adjustment->recordedBy?->full_name ?? '—',
            ]);

        $total = round((float) $rows->sum('value'), 2);

        $byType = collect(self::TYPES)
            ->map(function (string $key) use ($rows, $total) {
                $group = $rows->where('type', $key);

                return [
                    'key' => $key,
                    'label' => StockAdjustment::typeLabel($key),
                    'count' => $group->count(),
                    'value' => round((float) $group->sum('value'), 2),
                    'share' => $total > 0 ? round((float) $group->sum('value') / $total * 100, 1) : 0.0,
                ];
            })
            ->values();

        $byProduct = $rows->groupBy('product')
            ->map(fn ($group, string $name) => [
                'name' => $name,
                'unit' => $group->first()['unit'],
                'count' => $group->count(),
                'quantity' => round((float) $group->sum('quantity'), 3),
                'value' => round((float) $group->sum('value'), 2),
            ])
            ->sortByDesc('value')
            ->take(10)
            ->values();

        return [
            'summary' => [
                'records' => $rows->count(),
                'items' => $rows->pluck('product')->unique()->count(),
                'value' => $total,
                'top_cause' => $byType->where('value', '>', 0)->sortByDesc('value')->first()['label'] ?? null,
            ],
            'by_type' => $byType->all(),
            'by_product' => $byProduct->all(),
            'rows' => $rows->all(),
        ];
    }
}
