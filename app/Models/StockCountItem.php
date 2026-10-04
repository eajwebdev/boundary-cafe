<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockCountItem extends Model
{
    protected $table = 'stock_count_items';

    protected $fillable = [
        'session_id',
        'product_id',
        'product_name',
        'category_name',
        'item_type',
        'snapshot_qty',
        'unit_cost',
        'counted_qty',
    ];

    protected $casts = [
        'snapshot_qty' => 'integer',
        'counted_qty'  => 'integer',
        'unit_cost'    => 'decimal:2',
    ];

    // ── Relationships ──────────────────────────────────────────────────────────

    public function session(): BelongsTo { return $this->belongsTo(StockCountSession::class, 'session_id'); }
    public function product(): BelongsTo { return $this->belongsTo(Product::class); }

    // ── Accessors ──────────────────────────────────────────────────────────────

    public function getDeltaAttribute(): ?int
    {
        if (is_null($this->counted_qty)) return null;
        return $this->counted_qty - $this->snapshot_qty;
    }

    public function getCostImpactAttribute(): ?float
    {
        $delta = $this->delta;
        if (is_null($delta)) return null;
        return round($delta * (float) $this->unit_cost, 2);
    }
}
