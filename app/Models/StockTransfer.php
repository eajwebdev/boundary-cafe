<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockTransfer extends Model
{
    protected $fillable = [
        'transfer_number', 'from_type', 'from_id', 'to_type', 'to_id',
        'product_id', 'quantity', 'status', 'notes',
        'requested_by', 'completed_by', 'completed_at',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'completed_at' => 'datetime',
    ];

    public function product(): BelongsTo     { return $this->belongsTo(Product::class); }
    public function requestedBy(): BelongsTo { return $this->belongsTo(User::class, 'requested_by'); }
    public function completedBy(): BelongsTo { return $this->belongsTo(User::class, 'completed_by'); }

    /** Resolve the human-readable from-location name */
    public function getFromNameAttribute(): string
    {
        return match ($this->from_type) {
            'branch'    => Branch::find($this->from_id)?->name    ?? 'Unknown Branch',
            'warehouse' => Warehouse::find($this->from_id)?->name ?? 'Unknown Warehouse',
            default     => '?',
        };
    }

    /** Resolve the human-readable to-location name */
    public function getToNameAttribute(): string
    {
        return match ($this->to_type) {
            'branch'    => Branch::find($this->to_id)?->name    ?? 'Unknown Branch',
            'warehouse' => Warehouse::find($this->to_id)?->name ?? 'Unknown Warehouse',
            default     => '?',
        };
    }

    public function isPending(): bool   { return $this->status === 'pending'; }
    public function isCompleted(): bool { return $this->status === 'completed'; }
    public function isCancelled(): bool { return $this->status === 'cancelled'; }

    /** Generate next transfer number like TRF-2026-0001 */
    public static function generateNumber(): string
    {
        $year  = now()->year;
        $count = static::whereYear('created_at', $year)->count() + 1;
        return 'TRF-' . $year . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
