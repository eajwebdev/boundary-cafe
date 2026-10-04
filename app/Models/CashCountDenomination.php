<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashCountDenomination extends Model
{
    use HasFactory;

    protected $table = 'cash_count_denominations';

    protected $fillable = [
        'cash_count_id',
        'denomination',
        'type',
        'quantity',
        'subtotal',
    ];

    protected $casts = [
        'denomination' => 'decimal:2',
        'subtotal'     => 'decimal:2',
        'quantity'     => 'integer',
    ];

    protected $attributes = [
        'type'     => 'bill',
        'quantity' => 0,
        'subtotal' => 0.00,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (CashCountDenomination $row) {
            $row->subtotal = round((float) $row->denomination * $row->quantity, 2);
        });

        // Cascade recalculate to parent CashCount on every save/delete
        static::saved(fn($row)   => $row->cashCount->recalculate());
        static::deleted(fn($row) => $row->cashCount->recalculate());
    }

    // ── Relationships ──────────────────────────────────────────────

    public function cashCount(): BelongsTo
    {
        return $this->belongsTo(CashCount::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    /** PH peso bill denominations (descending) */
    public static function billDenominations(): array
    {
        return [1000, 500, 200, 100, 50, 20];
    }

    /** PH peso coin denominations (descending) */
    public static function coinDenominations(): array
    {
        return [20, 10, 5, 1, 0.25, 0.10, 0.05];
    }

    /**
     * Blank denomination sheet pre-filled with all PH peso denominations.
     * Use this to render the cashier counting form.
     */
    public static function blankSheet(): array
    {
        $rows = [];
        foreach (static::billDenominations() as $d) {
            $rows[] = ['denomination' => $d, 'type' => 'bill', 'quantity' => 0, 'subtotal' => 0.00];
        }
        foreach (static::coinDenominations() as $d) {
            $rows[] = ['denomination' => $d, 'type' => 'coin', 'quantity' => 0, 'subtotal' => 0.00];
        }
        return $rows;
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedDenominationAttribute(): string
    {
        return '₱' . number_format($this->denomination, 2);
    }

    public function getFormattedSubtotalAttribute(): string
    {
        return '₱' . number_format($this->subtotal, 2);
    }
}
