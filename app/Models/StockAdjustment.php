<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockAdjustment extends Model
{
    protected $fillable = [
        'branch_id',
        'product_id',
        'recorded_by',
        'type',
        'quantity',
        'unit_cost',
        'note',
    ];

    protected $casts = [
        'quantity'  => 'integer',
        'unit_cost' => 'decimal:2',
    ];

    // ── Relationships ─────────────────────────────────────────────────────────

    public function branch(): BelongsTo     { return $this->belongsTo(Branch::class); }
    public function product(): BelongsTo    { return $this->belongsTo(Product::class); }
    public function recordedBy(): BelongsTo { return $this->belongsTo(User::class, 'recorded_by'); }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public function getTotalCostAttribute(): float
    {
        return round((float) $this->unit_cost * $this->quantity, 2);
    }

    public static function typeLabel(string $type): string
    {
        return match ($type) {
            'damage'     => 'Damage',
            'loss'       => 'Loss',
            'expired'    => 'Expired',
            'theft'      => 'Theft',
            'correction' => 'Correction',
            'other'      => 'Other',
            default      => ucfirst($type),
        };
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeForBranch($query, int $branchId) { return $query->where('branch_id', $branchId); }
    public function scopeOfType($query, string $type)      { return $query->where('type', $type); }
}
