<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InstallmentPayment extends Model
{
    protected $fillable = [
        'installment_plan_id',
        'received_by_user_id',
        'sequence',
        'amount',
        'payment_date',
        'payment_method',
        'notes',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'payment_date' => 'date',
    ];

    // ── Relationships ───────────────────────────────────────────────

    public function plan(): BelongsTo     { return $this->belongsTo(InstallmentPlan::class, 'installment_plan_id'); }
    public function receiver(): BelongsTo { return $this->belongsTo(User::class, 'received_by_user_id'); }

    // ── Helpers ─────────────────────────────────────────────────────

    /**
     * Sum of remittances received on a specific date, grouped by payment method.
     * Returns ['gcash' => float, 'card' => float, 'bank' => float, 'total' => float]
     */
    public static function totalsForDate(string $date, ?int $branchId): array
    {
        $rows = static::query()
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn ($q) => $q->where('installment_plans.branch_id', $branchId))
            ->whereDate('installment_payments.payment_date', $date)
            ->selectRaw('installment_payments.payment_method, SUM(installment_payments.amount) as total')
            ->groupBy('installment_payments.payment_method')
            ->pluck('total', 'payment_method');

        return [
            'gcash' => (float) ($rows['gcash'] ?? 0),
            'card'  => (float) ($rows['card']  ?? 0),
            'bank'  => (float) ($rows['bank']  ?? 0),
            'total' => (float) $rows->sum(),
        ];
    }

    /**
     * Sum of remittances received within a date range, grouped by payment method.
     */
    public static function totalsForRange(string $from, string $to, ?int $branchId): array
    {
        $rows = static::query()
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn ($q) => $q->where('installment_plans.branch_id', $branchId))
            ->whereBetween('installment_payments.payment_date', [$from, $to])
            ->selectRaw('installment_payments.payment_method, SUM(installment_payments.amount) as total')
            ->groupBy('installment_payments.payment_method')
            ->pluck('total', 'payment_method');

        return [
            'gcash' => (float) ($rows['gcash'] ?? 0),
            'card'  => (float) ($rows['card']  ?? 0),
            'bank'  => (float) ($rows['bank']  ?? 0),
            'total' => (float) $rows->sum(),
        ];
    }
}
