<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockCountSession extends Model
{
    protected $table = 'stock_count_sessions';

    protected $fillable = [
        'branch_id',
        'name',
        'type',
        'status',
        'note',
        'counted_by',
        'committed_by',
        'items_total',
        'items_counted',
        'items_adjusted',
        'committed_at',
    ];

    protected $casts = [
        'committed_at'   => 'datetime',
        'items_total'    => 'integer',
        'items_counted'  => 'integer',
        'items_adjusted' => 'integer',
    ];

    // ── Relationships ──────────────────────────────────────────────────────────

    public function branch(): BelongsTo    { return $this->belongsTo(Branch::class); }
    public function countedBy(): BelongsTo { return $this->belongsTo(User::class, 'counted_by'); }
    public function committedBy(): BelongsTo { return $this->belongsTo(User::class, 'committed_by'); }
    public function items(): HasMany       { return $this->hasMany(StockCountItem::class, 'session_id'); }

    // ── Helpers ────────────────────────────────────────────────────────────────

    public function isDraft(): bool     { return $this->status === 'draft'; }
    public function isCommitted(): bool { return $this->status === 'committed'; }
    public function isCancelled(): bool { return $this->status === 'cancelled'; }

    public function progressPercent(): int
    {
        if ($this->items_total === 0) return 0;
        return (int) round(($this->items_counted / $this->items_total) * 100);
    }
}
