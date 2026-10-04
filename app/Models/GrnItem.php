<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GrnItem extends Model
{
    use HasFactory;

    protected $table = 'grn_items';

    protected $fillable = [
        'goods_received_note_id',
        'product_id',
        'ordered_qty',
        'received_qty',
        'rejected_qty',
        'accepted_qty',
        'unit_cost',
        'line_total',
        'rejection_reason',
        'expiry_date',
        'batch_number',
    ];

    protected $casts = [
        'ordered_qty'  => 'integer',
        'received_qty' => 'integer',
        'rejected_qty' => 'integer',
        'accepted_qty' => 'integer',
        'unit_cost'    => 'decimal:2',
        'line_total'   => 'decimal:2',
        'expiry_date'  => 'date',
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (GrnItem $item) {
            $item->accepted_qty = max(0, $item->received_qty - $item->rejected_qty);
            $item->line_total   = round($item->received_qty * (float) $item->unit_cost, 2);
        });
    }

    // ── Relationships ──────────────────────────────────────────────

    public function goodsReceivedNote(): BelongsTo
    {
        return $this->belongsTo(GoodsReceivedNote::class, 'goods_received_note_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function hasShortage(): bool   { return $this->ordered_qty > 0 && $this->received_qty < $this->ordered_qty; }
    public function hasRejection(): bool  { return $this->rejected_qty > 0; }

    public function getShortageQtyAttribute(): int
    {
        return max(0, $this->ordered_qty - $this->received_qty);
    }

    public function isExpiringSoon(int $days = 30): bool
    {
        if (!$this->expiry_date) return false;
        return $this->expiry_date->diffInDays(now()) <= $days && !$this->expiry_date->isPast();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedUnitCostAttribute(): string  { return '₱' . number_format($this->unit_cost, 2); }
    public function getFormattedLineTotalAttribute(): string { return '₱' . number_format($this->line_total, 2); }

    public function getFormattedExpiryDateAttribute(): string
    {
        return $this->expiry_date ? $this->expiry_date->format('M d, Y') : '—';
    }
}
