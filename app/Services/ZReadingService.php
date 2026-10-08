<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\CashSession;
use App\Models\CustomerPayment;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\ZReading;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Builds and locks end-of-day Z-readings.
 *
 * Rules: one reading per branch per day, days are closed in order (no
 * skipping a day that had sales), and every cash session for the day must be
 * closed first so the cash figures are final.
 */
class ZReadingService
{
    /** How far back to look for days that were never closed. */
    private const PENDING_LOOKBACK_DAYS = 31;

    /**
     * Compute the day's figures without saving anything. Used for the live
     * preview and the Daily Summary report; a null branch covers all branches.
     *
     * @return array<string, mixed>
     */
    public function summarize(?int $branchId, string $date): array
    {
        $sales = Sale::query()
            ->with(['items:id,sale_id,product_id,quantity,total', 'items.product:id,is_taxable'])
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->whereDate('created_at', $date)
            ->orderBy('id')
            ->get();

        $valid = $sales->where('status', '!=', 'voided');
        $voided = $sales->where('status', 'voided');

        $netSales = round((float) $valid->sum('total'), 2);
        $discountTotal = round((float) $valid->sum('discount_amount'), 2);
        $loyaltyDiscountTotal = round((float) $valid->sum('loyalty_discount'), 2);

        $collections = CustomerPayment::query()
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->whereDate('payment_date', $date);
        $sessions = $this->sessionsFor($branchId, $date);

        return [
            'first_receipt' => $sales->first()?->receipt_number,
            'last_receipt' => $sales->last()?->receipt_number,
            'transaction_count' => $valid->count(),
            'items_sold' => round((float) $valid->sum(fn (Sale $sale) => $sale->items->sum('quantity')), 2),
            'gross_sales' => round($netSales + $discountTotal + $loyaltyDiscountTotal, 2),
            'discount_total' => $discountTotal,
            'loyalty_discount_total' => $loyaltyDiscountTotal,
            'net_sales' => $netSales,
            'delivery_fees' => round((float) $valid->sum('delivery_fee'), 2),
            'unpaid_total' => round((float) $valid->sum('balance_due'), 2),
            'void_count' => $voided->count(),
            'void_amount' => round((float) $voided->sum('total'), 2),
            ...$this->vatBreakdown($valid, $branchId),
            'collections_total' => round((float) (clone $collections)->sum('amount'), 2),
            'collections_count' => (clone $collections)->count(),
            'opening_cash' => round((float) collect($sessions)->sum('opening_cash'), 2),
            'expected_cash' => round((float) collect($sessions)->sum('expected_cash'), 2),
            'counted_cash' => round((float) collect($sessions)->sum('counted_cash'), 2),
            'over_short' => round((float) collect($sessions)->sum('over_short'), 2),
            'payments' => $this->paymentBreakdown($valid),
            'channels' => $this->channelBreakdown($valid),
            'sessions' => $sessions,
        ];
    }

    /**
     * Cash sessions that must be closed before the day can be Z-read.
     *
     * @return Collection<int, CashSession>
     */
    public function blockingSessions(int $branchId, string $date): Collection
    {
        return CashSession::with('user:id,fname,lname')
            ->where('branch_id', $branchId)
            ->open()
            ->whereDate('opened_at', '<=', $date)
            ->orderBy('opened_at')
            ->get();
    }

    /**
     * Past days with sales since the last Z-reading that were never closed,
     * oldest first. Before the branch's first Z-reading nothing is pending, so
     * switching the feature on doesn't demand closing old history.
     *
     * @return list<string>
     */
    public function pendingDates(int $branchId): array
    {
        $lastClosed = ZReading::where('branch_id', $branchId)->max('business_date');
        if (! $lastClosed) {
            return [];
        }

        $from = Carbon::parse($lastClosed)->addDay()->max(today()->subDays(self::PENDING_LOOKBACK_DAYS));

        return Sale::where('branch_id', $branchId)
            ->where('created_at', '>=', $from->startOfDay())
            ->where('created_at', '<', today())
            ->selectRaw('DATE(created_at) as day')
            ->groupBy('day')
            ->orderBy('day')
            ->pluck('day')
            ->map(fn ($day) => Carbon::parse($day)->toDateString())
            ->all();
    }

    /**
     * Why the day cannot be closed yet, or null when it is ready.
     */
    public function blockerFor(int $branchId, string $date): ?string
    {
        if (Carbon::parse($date)->isAfter(today())) {
            return 'You can’t close a day that hasn’t happened yet.';
        }

        if (ZReading::closesDay($branchId, $date)) {
            return 'This day already has a Z-reading.';
        }

        $later = ZReading::where('branch_id', $branchId)->whereDate('business_date', '>', $date)->orderBy('business_date')->first();
        if ($later) {
            return "Z-{$later->z_number} already closed ".$later->business_date->format('M j, Y').'. Days must be closed in order.';
        }

        $earlierPending = collect($this->pendingDates($branchId))->first(fn (string $day) => $day < $date);
        if ($earlierPending) {
            return 'Close '.Carbon::parse($earlierPending)->format('M j, Y').' first. Days must be closed in order.';
        }

        $open = $this->blockingSessions($branchId, $date);
        if ($open->isNotEmpty()) {
            $names = $open->map(fn (CashSession $session) => $session->user?->full_name ?? 'Unknown')->unique()->join(', ');

            return "Close all cash sessions first ({$open->count()} still open: {$names}).";
        }

        return null;
    }

    /**
     * Lock the day: save the Z-reading with the next number and running grand total.
     *
     * @throws RuntimeException when the day is not ready to be closed
     */
    public function generate(User $user, int $branchId, string $date, ?string $notes = null): ZReading
    {
        try {
            return DB::transaction(function () use ($user, $branchId, $date, $notes) {
                $previous = ZReading::where('branch_id', $branchId)->orderByDesc('z_number')->lockForUpdate()->first();

                if ($blocker = $this->blockerFor($branchId, $date)) {
                    throw new RuntimeException($blocker);
                }

                $figures = $this->summarize($branchId, $date);
                $previousGrandTotal = (float) ($previous?->grand_total ?? 0);

                $reading = ZReading::create([
                    ...$figures,
                    'branch_id' => $branchId,
                    'z_number' => ($previous?->z_number ?? 0) + 1,
                    'business_date' => $date,
                    'previous_grand_total' => $previousGrandTotal,
                    'grand_total' => round($previousGrandTotal + $figures['net_sales'], 2),
                    'generated_by' => $user->id,
                    'generated_at' => now(),
                    'notes' => $notes,
                ]);

                ActivityLog::create([
                    'user_id' => $user->id,
                    'action' => 'z_reading_generated',
                    'subject_type' => ZReading::class,
                    'subject_id' => $reading->id,
                    'properties' => [
                        'z_number' => $reading->z_number,
                        'business_date' => $date,
                        'net_sales' => $reading->net_sales,
                        'over_short' => $reading->over_short,
                    ],
                ]);

                return $reading;
            });
        } catch (UniqueConstraintViolationException) {
            throw new RuntimeException('This day was just closed by someone else. Refresh to see it.');
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function sessionsFor(?int $branchId, string $date): array
    {
        return CashSession::with('user:id,fname,lname')
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->whereDate('opened_at', $date)
            ->orderBy('opened_at')
            ->get()
            ->map(fn (CashSession $session) => [
                'id' => $session->id,
                'session_number' => $session->session_number,
                'cashier' => $session->user?->full_name ?? 'Unknown',
                'status' => $session->status,
                'opened_at' => $session->opened_at?->toIso8601String(),
                'closed_at' => $session->closed_at?->toIso8601String(),
                'opening_cash' => (float) $session->opening_cash,
                'expected_cash' => (float) ($session->expected_cash ?? $session->computeExpectedCash()),
                'counted_cash' => (float) ($session->counted_cash ?? 0),
                'over_short' => (float) ($session->over_short ?? 0),
            ])
            ->all();
    }

    /**
     * @param  Collection<int, Sale>  $sales
     * @return list<array{method: string, count: int, amount: float}>
     */
    private function paymentBreakdown(Collection $sales): array
    {
        return $sales->groupBy('payment_method')
            ->map(fn (Collection $group, string $method) => [
                'method' => $method,
                'count' => $group->count(),
                'amount' => round((float) $group->sum('total'), 2),
            ])
            ->sortByDesc('amount')
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, Sale>  $sales
     * @return list<array{channel: string, count: int, amount: float}>
     */
    private function channelBreakdown(Collection $sales): array
    {
        return $sales->groupBy(fn (Sale $sale) => $sale->channel ?: 'counter')
            ->map(fn (Collection $group, string $channel) => [
                'channel' => $channel,
                'count' => $group->count(),
                'amount' => round((float) $group->sum('total'), 2),
            ])
            ->sortByDesc('amount')
            ->values()
            ->all();
    }

    /**
     * Split sales into VATable, VAT and VAT-exempt amounts. Sales store VAT
     * only for VAT-exclusive pricing, so inclusive VAT is extracted here using
     * each sale's share of taxable items. Delivery fees are left out of VAT.
     *
     * @param  Collection<int, Sale>  $sales
     * @return array{vat_enabled: bool, vat_rate: float, vatable_sales: float, vat_amount: float, vat_exempt_sales: float}
     */
    private function vatBreakdown(Collection $sales, ?int $branchId): array
    {
        $enabled = SystemSetting::vatEnabled($branchId);
        $rate = $enabled ? SystemSetting::vatRate($branchId) : 0.0;
        $inclusive = SystemSetting::vatInclusive($branchId);

        $vatable = 0.0;
        $vat = 0.0;
        $exempt = 0.0;

        if ($enabled && $rate > 0) {
            foreach ($sales as $sale) {
                $itemsTotal = (float) $sale->items->sum('total');
                $taxableItems = (float) $sale->items->filter(fn ($item) => $item->product?->is_taxable ?? true)->sum('total');
                $taxableShare = $itemsTotal > 0 ? $taxableItems / $itemsTotal : 0;

                $base = (float) $sale->total - (float) $sale->vat_amount - (float) $sale->delivery_fee;
                $taxableBase = $base * $taxableShare;

                if ($inclusive) {
                    $saleVat = $taxableBase * $rate / (100 + $rate);
                    $vat += $saleVat;
                    $vatable += $taxableBase - $saleVat;
                } else {
                    $vat += (float) $sale->vat_amount;
                    $vatable += $taxableBase;
                }
                $exempt += $base - $taxableBase;
            }
        }

        return [
            'vat_enabled' => $enabled,
            'vat_rate' => $rate,
            'vatable_sales' => round($vatable, 2),
            'vat_amount' => round($vat, 2),
            'vat_exempt_sales' => round($exempt, 2),
        ];
    }
}
