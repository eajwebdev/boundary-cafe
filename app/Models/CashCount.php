<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashCount extends Model
{
    use HasFactory;

    protected $fillable = [
        'cash_session_id',
        'counted_by',
        'verified_by',
        'count_type',
        'system_total',
        'pure_cash_sales',
        'installment_dp',
        'petty_cash_paid',
        'opening_cash',
        'expected_cash',
        'counted_total',
        'over_short',
        'gcash_system',
        'gcash_counted',
        'gcash_over_short',
        'card_system',
        'card_counted',
        'card_over_short',
        'status',
        'notes',
        'counted_at',
    ];

    protected $casts = [
        'system_total'    => 'decimal:2',
        'pure_cash_sales' => 'decimal:2',
        'installment_dp'  => 'decimal:2',
        'petty_cash_paid' => 'decimal:2',
        'opening_cash'    => 'decimal:2',
        'expected_cash'   => 'decimal:2',
        'counted_total'   => 'decimal:2',
        'over_short'      => 'decimal:2',
        'gcash_system'    => 'decimal:2',
        'gcash_counted'   => 'decimal:2',
        'gcash_over_short'=> 'decimal:2',
        'card_system'     => 'decimal:2',
        'card_counted'    => 'decimal:2',
        'card_over_short' => 'decimal:2',
        'counted_at'      => 'datetime',
    ];

    protected $attributes = [
        'count_type' => 'closing',
        'status'     => 'pending',
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function cashSession(): BelongsTo  { return $this->belongsTo(CashSession::class); }
    public function countedBy(): BelongsTo    { return $this->belongsTo(User::class, 'counted_by'); }
    public function verifiedBy(): BelongsTo   { return $this->belongsTo(User::class, 'verified_by'); }
    public function denominations(): HasMany  { return $this->hasMany(CashCountDenomination::class); }

    // ── Helpers ────────────────────────────────────────────────────

    /**
     * Recalculate counted_total and over_short from denomination rows.
     * Called automatically by CashCountDenomination::booted() on every save/delete.
     */
    public function recalculate(): void
    {
        $counted = (float) $this->denominations()->sum('subtotal');
        $this->update([
            'counted_total' => $counted,
            'over_short'    => round($counted - (float) $this->expected_cash, 2),
        ]);
    }

    /** Lock count after manager sign-off */
    public function verify(int $userId): void
    {
        $this->update(['verified_by' => $userId, 'status' => 'verified']);
    }

    public function isBalanced(): bool { return (float) $this->over_short === 0.0; }
    public function isOver(): bool     { return (float) $this->over_short > 0; }
    public function isShort(): bool    { return (float) $this->over_short < 0; }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedExpectedCashAttribute(): string { return '₱' . number_format($this->expected_cash, 2); }
    public function getFormattedCountedTotalAttribute(): string { return '₱' . number_format($this->counted_total, 2); }
    public function getFormattedSystemTotalAttribute(): string  { return '₱' . number_format($this->system_total, 2); }

    public function getFormattedOverShortAttribute(): string
    {
        $val    = (float) $this->over_short;
        $prefix = $val >= 0 ? '+₱' : '-₱';
        return $prefix . number_format(abs($val), 2);
    }

    public function getOverShortLabelAttribute(): string
    {
        $val = (float) $this->over_short;
        if ($val == 0) return 'Balanced';
        return $val > 0 ? 'Over' : 'Short';
    }

    public function getOverShortVariantAttribute(): string
    {
        $val = (float) $this->over_short;
        if ($val == 0) return 'success';
        return $val > 0 ? 'info' : 'destructive';
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeClosing($query)  { return $query->where('count_type', 'closing'); }
    public function scopeMidshift($query) { return $query->where('count_type', 'midshift'); }
    public function scopePending($query)  { return $query->where('status', 'pending'); }
    public function scopeVerified($query) { return $query->where('status', 'verified'); }
}
