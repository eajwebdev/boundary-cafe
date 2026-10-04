<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PettyCashFund extends Model
{
    use HasFactory;

    protected $fillable = [
        'branch_id',
        'managed_by',
        'fund_name',
        'fund_amount',
        'current_balance',
        'status',
        'started_at',
        'closed_at',
        'notes',
    ];

    protected $casts = [
        'fund_amount'     => 'decimal:2',
        'current_balance' => 'decimal:2',
        'started_at'      => 'date',
        'closed_at'       => 'date',
    ];

    protected $attributes = [
        'fund_name'       => 'Petty Cash Fund',
        'status'          => 'active',
        'current_balance' => 0.00,
    ];

    // ── Boot ───────────────────────────────────────────────────────
    protected static function booted(): void
    {
        static::creating(function (PettyCashFund $fund) {
            if (empty($fund->started_at)) {
                $fund->started_at = today();
            }
            if (empty($fund->current_balance)) {
                $fund->current_balance = $fund->fund_amount ?? 0.00;
            }
        });
    }

    // ── Relationships ──────────────────────────────────────────────
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function managedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'managed_by');
    }

    public function vouchers(): HasMany
    {
        return $this->hasMany(PettyCashVoucher::class);
    }

    public function approvedWithdrawals(): HasMany
    {
        return $this->hasMany(PettyCashVoucher::class)
            ->where('voucher_type', 'withdrawal')
            ->where('status', 'approved');
    }

    public function pendingVouchers(): HasMany
    {
        return $this->hasMany(PettyCashVoucher::class)
            ->where('status', 'pending');
    }

    // ── Core Actions ───────────────────────────────────────────────

    /**
     * Deduct amount from the fund balance when a voucher is approved.
     * Called automatically by PettyCashVoucher::approve().
     */
    public function deduct(float $amount): void
    {
        $this->decrement('current_balance', $amount);
    }

    /**
     * Add funds back — used for replenishments or rejected voucher reversal.
     */
    public function replenish(float $amount): void
    {
        $this->increment('current_balance', $amount);
        // Update original fund_amount to reflect new total for reporting
        $this->update(['fund_amount' => $this->fresh()->current_balance]);
    }

    /**
     * Close the fund and record when it was closed.
     */
    public function close(): void
    {
        $this->update([
            'status'    => 'closed',
            'closed_at' => today(),
        ]);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isActive(): bool  { return $this->status === 'active'; }
    public function isClosed(): bool  { return $this->status === 'closed'; }

    public function isLow(float $threshold = 0.20): bool
    {
        if ($this->fund_amount <= 0) return false;
        return ($this->current_balance / $this->fund_amount) <= $threshold;
    }

    public function getTotalWithdrawnAttribute(): float
    {
        return (float) $this->approvedWithdrawals()->sum('amount');
    }

    public function getUtilizationPercentAttribute(): float
    {
        if ($this->fund_amount <= 0) return 0;
        return round((1 - ($this->current_balance / $this->fund_amount)) * 100, 1);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedFundAmountAttribute(): string
    {
        return '₱' . number_format($this->fund_amount, 2);
    }

    public function getFormattedBalanceAttribute(): string
    {
        return '₱' . number_format($this->current_balance, 2);
    }

    public function getBalanceStatusAttribute(): string
    {
        if ($this->current_balance <= 0)      return 'depleted';
        if ($this->isLow(0.10))               return 'critical';
        if ($this->isLow(0.20))               return 'low';
        return 'healthy';
    }

    public function getBalanceVariantAttribute(): string
    {
        return match ($this->balance_status) {
            'depleted' => 'destructive',
            'critical' => 'destructive',
            'low'      => 'warning',
            default    => 'success',
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeForBranch($query, int $id)
    {
        return $query->where('branch_id', $id);
    }

    // ── Static helpers ─────────────────────────────────────────────

    /** Get the active petty cash fund for a branch, or null if none. */
    public static function activeForBranch(int $branchId): ?static
    {
        return static::where('branch_id', $branchId)
            ->where('status', 'active')
            ->latest()
            ->first();
    }
}