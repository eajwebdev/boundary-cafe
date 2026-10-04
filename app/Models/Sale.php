<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_number',
        'user_id',
        'branch_id',
        'cash_session_id',
        'table_order_id',   // null for walk-up / takeout, set for dine-in
        'customer_id',
        'total',
        'payment_method',
        'payment_amount',
        'amount_paid',
        'balance_due',
        'payment_status',
        'due_date',
        'change_amount',
        'discount_amount',
        'loyalty_points_earned',
        'loyalty_points_redeemed',
        'loyalty_discount',
        'customer_name',
        'status',
        'credit_notes',
        'notes',
    ];

    // payment_method allowed values: cash | gcash | card | others | installment | credit | mixed

    protected $casts = [
        'total' => 'decimal:2',
        'payment_amount' => 'decimal:2',
        'amount_paid' => 'decimal:2',
        'balance_due' => 'decimal:2',
        'change_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'loyalty_points_earned' => 'integer',
        'loyalty_points_redeemed' => 'integer',
        'loyalty_discount' => 'decimal:2',
        'due_date' => 'date',
    ];

    protected $attributes = [
        'status' => 'completed',
        'discount_amount' => 0.00,
        'amount_paid' => 0.00,
        'balance_due' => 0.00,
        'payment_status' => 'paid',
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function cashSession(): BelongsTo
    {
        return $this->belongsTo(CashSession::class);
    }

    public function tableOrder(): BelongsTo
    {
        return $this->belongsTo(TableOrder::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function installmentPlan(): HasOne
    {
        return $this->hasOne(InstallmentPlan::class);
    }

    public function customerPayments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class);
    }

    public function loyaltyTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public function isVoided(): bool
    {
        return $this->status === 'voided';
    }

    public function isDineIn(): bool
    {
        return $this->table_order_id !== null;
    }

    public function isTakeout(): bool
    {
        return $this->table_order_id === null;
    }

    public function hasCreditBalance(): bool
    {
        return (float) $this->balance_due > 0;
    }

    public function refreshPaymentStatus(): void
    {
        $paid = min((float) $this->amount_paid, (float) $this->total);
        $balance = max(0, round((float) $this->total - $paid, 2));

        $this->forceFill([
            'amount_paid' => $paid,
            'balance_due' => $balance,
            'payment_status' => $balance <= 0 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
        ])->save();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedTotalAttribute(): string
    {
        return '₱'.number_format($this->total, 2);
    }

    public function getFormattedChangeAttribute(): string
    {
        return '₱'.number_format($this->change_amount, 2);
    }

    public function getOrderTypeAttribute(): string
    {
        return $this->isDineIn() ? 'Dine-in' : 'Takeout';
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }

    public function scopeVoided($query)
    {
        return $query->where('status', 'voided');
    }

    public function scopeForBranch($query, int $id)
    {
        return $query->where('branch_id', $id);
    }

    public function scopeForSession($query, int $id)
    {
        return $query->where('cash_session_id', $id);
    }

    public function scopeDineIn($query)
    {
        return $query->whereNotNull('table_order_id');
    }

    public function scopeTakeout($query)
    {
        return $query->whereNull('table_order_id');
    }

    public function scopeForDate($query, $date)
    {
        return $query->whereDate('created_at', $date);
    }

    public function scopeForDateRange($query, $from, $to)
    {
        return $query->whereBetween('created_at', [$from, $to]);
    }
}
