<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PettyCashVoucher extends Model
{
    use HasFactory;

    protected $fillable = [
        'voucher_number',
        'petty_cash_fund_id',
        'requested_by',
        'approved_by',
        'expense_id',
        'expense_category_id',
        'voucher_type',
        'amount',
        'balance_before',
        'balance_after',
        'payee',
        'purpose',
        'status',
        'rejection_reason',
        'approved_at',
    ];

    protected $casts = [
        'amount'         => 'decimal:2',
        'balance_before' => 'decimal:2',
        'balance_after'  => 'decimal:2',
        'approved_at'    => 'datetime',
    ];

    protected $attributes = [
        'voucher_type' => 'withdrawal',
        'status'       => 'pending',
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function (PettyCashVoucher $voucher) {
            if (empty($voucher->voucher_number)) {
                $voucher->voucher_number = static::generateVoucherNumber();
            }

            // Snapshot the fund balance before this transaction
            if ($voucher->petty_cash_fund_id && !$voucher->balance_before) {
                $voucher->balance_before = $voucher->fund->current_balance ?? 0;
            }
        });
    }

    public static function generateVoucherNumber(): string
    {
        $prefix = 'PCV-' . now()->format('Y') . '-';
        for ($i = 0; $i < 10; $i++) {
            $c = $prefix . str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
            if (!static::where('voucher_number', $c)->exists()) return $c;
        }
        return $prefix . now()->format('His') . Str::random(4);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function fund(): BelongsTo
    {
        return $this->belongsTo(PettyCashFund::class, 'petty_cash_fund_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }

    public function expenseCategory(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class);
    }

    // ── Core Actions ───────────────────────────────────────────────

    /**
     * Approve the voucher.
     *
     * For withdrawals:
     *   - Deduct from petty cash fund balance
     *   - Create an Expense record to appear in daily summaries
     *
     * For replenishments:
     *   - Add back to petty cash fund balance
     */
    public function approve(int $approvedByUserId): void
    {
        if ($this->status !== 'pending') {
            throw new \RuntimeException("Voucher {$this->voucher_number} is already {$this->status}.");
        }

        DB::transaction(function () use ($approvedByUserId) {
            $fund          = $this->fund()->lockForUpdate()->first();
            $balanceBefore = (float) $fund->current_balance;

            if ($this->voucher_type === 'withdrawal') {
                if ($fund->current_balance < $this->amount) {
                    throw new \RuntimeException(
                        "Insufficient petty cash balance. Available: ₱" .
                        number_format($fund->current_balance, 2)
                    );
                }

                $fund->deduct($this->amount);
                $balanceAfter = (float) $fund->fresh()->current_balance;

                // Auto-create Expense record so it appears in daily summary
                $expense = Expense::create([
                    'expense_category_id' => $this->expense_category_id,
                    'branch_id'           => $fund->branch_id,
                    'user_id'             => $approvedByUserId,
                    'amount'              => $this->amount,
                    'expense_date'        => today(),
                    'payment_method'      => 'cash',
                    'description'         => "Petty cash: {$this->purpose} ({$this->voucher_number})",
                    'status'              => 'approved',
                ]);

                $this->update([
                    'status'         => 'approved',
                    'approved_by'    => $approvedByUserId,
                    'approved_at'    => now(),
                    'balance_before' => $balanceBefore,
                    'balance_after'  => $balanceAfter,
                    'expense_id'     => $expense->id,
                ]);
            } else {
                // Replenishment
                $fund->replenish($this->amount);
                $balanceAfter = (float) $fund->fresh()->current_balance;

                $this->update([
                    'status'         => 'approved',
                    'approved_by'    => $approvedByUserId,
                    'approved_at'    => now(),
                    'balance_before' => $balanceBefore,
                    'balance_after'  => $balanceAfter,
                ]);
            }
        });
    }

    /**
     * Reject the voucher with an optional reason.
     */
    public function reject(int $rejectedByUserId, string $reason = ''): void
    {
        if ($this->status !== 'pending') {
            throw new \RuntimeException("Voucher {$this->voucher_number} is already {$this->status}.");
        }

        $this->update([
            'status'           => 'rejected',
            'approved_by'      => $rejectedByUserId,
            'rejection_reason' => $reason,
            'approved_at'      => now(),
        ]);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isPending(): bool       { return $this->status === 'pending'; }
    public function isApproved(): bool      { return $this->status === 'approved'; }
    public function isRejected(): bool      { return $this->status === 'rejected'; }
    public function isWithdrawal(): bool    { return $this->voucher_type === 'withdrawal'; }
    public function isReplenishment(): bool { return $this->voucher_type === 'replenishment'; }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedAmountAttribute(): string
    {
        return '₱' . number_format($this->amount, 2);
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'approved' => 'success',
            'rejected' => 'destructive',
            default    => 'warning',
        };
    }

    public function getTypeVariantAttribute(): string
    {
        return $this->voucher_type === 'withdrawal' ? 'destructive' : 'success';
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopePending($query)         { return $query->where('status', 'pending'); }
    public function scopeApproved($query)        { return $query->where('status', 'approved'); }
    public function scopeWithdrawals($query)     { return $query->where('voucher_type', 'withdrawal'); }
    public function scopeReplenishments($query)  { return $query->where('voucher_type', 'replenishment'); }
}
