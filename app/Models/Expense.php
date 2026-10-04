<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Expense extends Model
{
    use HasFactory;

    protected $fillable = [
        'expense_category_id',
        'branch_id',
        'user_id',
        'cash_session_id',
        'amount',
        'expense_date',
        'payment_method',
        'reference_number',
        'receipt_img',
        'description',
        'status',
    ];

    protected $casts = [
        'amount'       => 'decimal:2',
        'expense_date' => 'date',
    ];

    protected $attributes = [
        'payment_method' => 'cash',
        'status'         => 'approved',
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        // Touch the daily_summary so it knows to recalculate
        static::saved(function (Expense $expense) {
            if ($expense->status === 'approved') {
                DailySummary::where('summary_date', $expense->expense_date)
                    ->where('branch_id', $expense->branch_id)
                    ->where('is_finalized', false)
                    ->update(['updated_at' => now()]);
            }
        });

        static::deleted(function (Expense $expense) {
            DailySummary::where('summary_date', $expense->expense_date)
                ->where('branch_id', $expense->branch_id)
                ->where('is_finalized', false)
                ->update(['updated_at' => now()]);
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'expense_category_id');
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function cashSession(): BelongsTo
    {
        return $this->belongsTo(CashSession::class);
    }

    /**
     * The petty cash voucher that auto-created this expense (if any).
     * Null for manually entered expenses.
     */
    public function pettyCashVoucher(): HasOne
    {
        return $this->hasOne(PettyCashVoucher::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isFromPettyCash(): bool
    {
        return $this->pettyCashVoucher()->exists();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedAmountAttribute(): string
    {
        return '₱' . number_format($this->amount, 2);
    }

    public function getFormattedDateAttribute(): string
    {
        return $this->expense_date->format('M d, Y');
    }

    public function getSourceLabelAttribute(): string
    {
        return $this->isFromPettyCash() ? 'Petty Cash' : 'Manual Entry';
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeFromPettyCash($query)
    {
        return $query->whereHas('pettyCashVoucher');
    }

    public function scopeManual($query)
    {
        return $query->whereDoesntHave('pettyCashVoucher');
    }

    public function scopeForBranch($query, int $id)
    {
        return $query->where('branch_id', $id);
    }

    public function scopeForDate($query, $date)
    {
        return $query->whereDate('expense_date', $date);
    }

    public function scopeForDateRange($query, $from, $to)
    {
        return $query->whereBetween('expense_date', [$from, $to]);
    }
}
