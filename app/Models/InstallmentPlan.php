<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InstallmentPlan extends Model
{
    protected $fillable = [
        'sale_id',
        'branch_id',
        'user_id',
        'provider',
        'reference_number',
        'customer_name',
        'customer_phone',
        'total_amount',
        'down_payment',
        'balance',
        'installment_amount',
        'total_paid',
        'installments_count',
        'paid_count',
        'interval',
        'next_due_date',
        'status',
        'notes',
    ];

    public const PROVIDERS = [
        'home_credit' => 'Home Credit',
        'skyro'       => 'Skyro',
        'other'       => 'Other',
    ];

    public function providerLabel(): string
    {
        return self::PROVIDERS[$this->provider] ?? 'Other';
    }

    protected $casts = [
        'total_amount'       => 'decimal:2',
        'down_payment'       => 'decimal:2',
        'balance'            => 'decimal:2',
        'installment_amount' => 'decimal:2',
        'total_paid'         => 'decimal:2',
        'next_due_date'      => 'date',
    ];

    // ── Relationships ───────────────────────────────────────────────

    public function sale(): BelongsTo       { return $this->belongsTo(Sale::class); }
    public function branch(): BelongsTo     { return $this->belongsTo(Branch::class); }
    public function user(): BelongsTo       { return $this->belongsTo(User::class); }
    public function payments(): HasMany     { return $this->hasMany(InstallmentPayment::class)->orderBy('sequence'); }

    // ── Helpers ─────────────────────────────────────────────────────

    public function isActive(): bool     { return $this->status === 'active'; }
    public function isCompleted(): bool  { return $this->status === 'completed'; }
    public function isCancelled(): bool  { return $this->status === 'cancelled'; }
    public function isOverdue(): bool    { return $this->isActive() && $this->next_due_date?->isPast(); }

    public function remainingBalance(): float
    {
        return max(0, (float) $this->balance - (float) $this->total_paid);
    }

    /**
     * Compute the next due date from a given reference date.
     */
    public static function computeNextDue(string $interval, ?\Carbon\Carbon $from = null): \Carbon\Carbon
    {
        $base = $from ?? now();
        return match ($interval) {
            'weekly'    => $base->copy()->addWeek(),
            'biweekly'  => $base->copy()->addWeeks(2),
            default     => $base->copy()->addMonth(),
        };
    }

    // ── Scopes ──────────────────────────────────────────────────────

    public function scopeActive($q)     { return $q->where('status', 'active'); }
    public function scopeCompleted($q)  { return $q->where('status', 'completed'); }
    public function scopeForBranch($q, int $id) { return $q->where('branch_id', $id); }
}
