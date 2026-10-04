<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class CashSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_number',
        'user_id',
        'branch_id',
        'opening_cash',
        'expected_cash',
        'counted_cash',
        'over_short',
        'gcash_system',
        'gcash_counted',
        'gcash_over_short',
        'card_system',
        'card_counted',
        'card_over_short',
        'status',
        'notes',
        'opened_at',
        'closed_at',
    ];

    protected $casts = [
        'opening_cash'     => 'decimal:2',
        'expected_cash'    => 'decimal:2',
        'counted_cash'     => 'decimal:2',
        'over_short'       => 'decimal:2',
        'gcash_system'     => 'decimal:2',
        'gcash_counted'    => 'decimal:2',
        'gcash_over_short' => 'decimal:2',
        'card_system'      => 'decimal:2',
        'card_counted'     => 'decimal:2',
        'card_over_short'  => 'decimal:2',
        'opened_at'        => 'datetime',
        'closed_at'        => 'datetime',
    ];

    protected $attributes = [
        'status'       => 'open',
        'opening_cash' => 0.00,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function (CashSession $session) {
            if (empty($session->session_number)) {
                $session->session_number = static::generateSessionNumber();
            }
            if (empty($session->opened_at)) {
                $session->opened_at = now();
            }
        });
    }

    public static function generateSessionNumber(): string
    {
        $prefix = 'SES-' . now()->format('Y') . '-';
        for ($i = 0; $i < 10; $i++) {
            $c = $prefix . str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
            if (!static::where('session_number', $c)->exists()) return $c;
        }
        return $prefix . now()->format('His') . Str::random(4);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
    public function branch(): BelongsTo  { return $this->belongsTo(Branch::class); }
    public function sales(): HasMany     { return $this->hasMany(Sale::class); }
    public function cashCounts(): HasMany{ return $this->hasMany(CashCount::class); }
    public function expenses(): HasMany  { return $this->hasMany(Expense::class); }

    public function closingCount(): HasOne
    {
        return $this->hasOne(CashCount::class)
            ->where('count_type', 'closing')
            ->latestOfMany();
    }

    /**
     * Petty cash withdrawals that occurred during this session.
     * Linked via the Expense records auto-created on voucher approval.
     */
    public function pettyCashExpenses(): HasMany
    {
        return $this->hasMany(Expense::class)->whereHas('pettyCashVoucher');
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isOpen(): bool   { return $this->status === 'open'; }
    public function isClosed(): bool { return $this->status === 'closed'; }

    /**
     * Cash in the physical drawer = cash method sales + partial cash down-payments on credit sales.
     */
    public function getCashSalesTotalAttribute(): float
    {
        $cashSales = (float) $this->sales()
            ->where('payment_method', 'cash')
            ->where('status', '!=', 'voided')
            ->sum('total');

        $creditCash = (float) $this->sales()
            ->whereIn('payment_method', ['credit', 'mixed'])
            ->where('status', '!=', 'voided')
            ->sum('amount_paid');

        return $cashSales + $creditCash;
    }

    /** Total GCash sales in this session (POS only, excludes voided) */
    public function getGcashSalesTotalAttribute(): float
    {
        return (float) $this->sales()
            ->where('payment_method', 'gcash')
            ->where('status', '!=', 'voided')
            ->sum('total');
    }

    /** Total card sales in this session (POS only, excludes voided) */
    public function getCardSalesTotalAttribute(): float
    {
        return (float) $this->sales()
            ->where('payment_method', 'card')
            ->where('status', '!=', 'voided')
            ->sum('total');
    }

    /** Credit down-payments / cash paid at POS for credit transactions */
    public function getCreditDownPaymentTotalAttribute(): float
    {
        return (float) $this->sales()
            ->whereIn('payment_method', ['credit', 'mixed'])
            ->where('status', '!=', 'voided')
            ->sum('amount_paid');
    }

    /** Total petty cash paid out during this session */
    public function getPettyCashPaidAttribute(): float
    {
        return (float) $this->pettyCashExpenses()->sum('amount');
    }

    /** Expected cash in drawer = opening_cash + (cash sales + installment DPs) - petty cash paid out */
    public function computeExpectedCash(): float
    {
        return round(
            (float) $this->opening_cash + $this->cash_sales_total - $this->petty_cash_paid,
            2
        );
    }

    /** Close the session — validates against system settings if required */
    public function close(float $countedCash): void
    {
        $expected = $this->computeExpectedCash();
        $this->update([
            'expected_cash' => $expected,
            'counted_cash'  => $countedCash,
            'over_short'    => round($countedCash - $expected, 2),
            'status'        => 'closed',
            'closed_at'     => now(),
        ]);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedOpeningCashAttribute(): string
    {
        return '₱' . number_format($this->opening_cash, 2);
    }

    public function getFormattedExpectedCashAttribute(): string
    {
        return '₱' . number_format($this->expected_cash, 2);
    }

    public function getFormattedCountedCashAttribute(): string
    {
        return $this->counted_cash !== null
            ? '₱' . number_format($this->counted_cash, 2)
            : '—';
    }

    public function getFormattedOverShortAttribute(): string
    {
        if ($this->over_short === null) return '—';
        $val    = (float) $this->over_short;
        $prefix = $val >= 0 ? '+₱' : '-₱';
        return $prefix . number_format(abs($val), 2);
    }

    public function getOverShortStatusAttribute(): string
    {
        if ($this->over_short === null) return 'pending';
        $val = (float) $this->over_short;
        if ($val == 0) return 'balanced';
        return $val > 0 ? 'over' : 'short';
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeOpen($query)              { return $query->where('status', 'open'); }
    public function scopeClosed($query)            { return $query->where('status', 'closed'); }
    public function scopeForBranch($query, int $id){ return $query->where('branch_id', $id); }
    public function scopeForUser($query, int $id)  { return $query->where('user_id', $id); }
}
