<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\WarehouseStock;

class GoodsReceivedNote extends Model
{
    use HasFactory;

    protected $table = 'goods_received_notes';

    protected $fillable = [
        'grn_number',
        'order_id',
        'branch_id',
        'supplier_id',
        'received_by',
        'confirmed_by',
        'status',
        'delivery_type',
        'delivery_reference',
        'received_date',
        'notes',
        'confirmed_at',
        'or_number',
        'payment_method',
        'check_date',
        'check_number',
        'paid_at',
        'source',
        'dest_type',
        'dest_id',
    ];

    protected $casts = [
        'received_date' => 'date',
        'confirmed_at'  => 'datetime',
        'check_date'    => 'date',
        'paid_at'       => 'datetime',
    ];

    protected $attributes = [
        'status'        => 'draft',
        'delivery_type' => 'full',
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function (GoodsReceivedNote $grn) {
            if (empty($grn->grn_number)) {
                $grn->grn_number = static::generateGrnNumber();
            }
        });
    }

    public static function generateGrnNumber(): string
    {
        $prefix = 'GRN-' . now()->format('Y') . '-';
        for ($i = 0; $i < 10; $i++) {
            $c = $prefix . str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
            if (!static::where('grn_number', $c)->exists()) return $c;
        }
        return $prefix . now()->format('His') . Str::random(4);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function order(): BelongsTo      { return $this->belongsTo(Order::class); }
    public function branch(): BelongsTo     { return $this->belongsTo(Branch::class); }
    public function supplier(): BelongsTo   { return $this->belongsTo(Supplier::class); }
    public function receivedBy(): BelongsTo { return $this->belongsTo(User::class, 'received_by'); }
    public function confirmedBy(): BelongsTo{ return $this->belongsTo(User::class, 'confirmed_by'); }
    public function items(): HasMany        { return $this->hasMany(GrnItem::class, 'goods_received_note_id'); }

    // ── Core: Confirm ──────────────────────────────────────────────

    /**
     * Confirm the GRN — this is the moment stock physically enters the branch.
     *
     * For each accepted item:
     *   1. firstOrCreate the product_stocks record for this branch
     *   2. Increment stock by accepted_qty
     *   3. Update capital to the new delivery unit_cost
     *   4. Price auto-recalculates via ProductStock::booted() saving hook
     *
     * Then updates the parent Order's received_status.
     */
    public function confirm(int $confirmedByUserId): void
    {
        if ($this->status !== 'draft') {
            throw new \RuntimeException("GRN {$this->grn_number} is already {$this->status}.");
        }

        DB::transaction(function () use ($confirmedByUserId) {
            $this->loadMissing('items');

            $destType = $this->dest_type ?? 'branch';
            $destId   = $this->dest_id   ?? $this->branch_id;

            foreach ($this->items as $item) {
                if ($item->accepted_qty <= 0) continue;

                if ($destType === 'warehouse') {
                    // ── Stock goes into a warehouse ───────────────────────
                    $stock = WarehouseStock::firstOrCreate(
                        ['product_id' => $item->product_id, 'warehouse_id' => $destId],
                        [
                            'stock'      => 0,
                            'capital'    => $item->unit_cost,
                            'markup'     => 0,
                            'price'      => $item->unit_cost,
                            'updated_by' => $confirmedByUserId,
                        ]
                    );
                    $stock->increment('stock', $item->accepted_qty);
                    $stock->update(['capital' => $item->unit_cost, 'updated_by' => $confirmedByUserId]);
                } else {
                    // ── Stock goes into a branch ──────────────────────────
                    $stock = ProductStock::firstOrCreate(
                        ['product_id' => $item->product_id, 'branch_id' => $destId],
                        [
                            'stock'      => 0,
                            'capital'    => $item->unit_cost,
                            'markup'     => 0,
                            'price'      => $item->unit_cost,
                            'updated_by' => $confirmedByUserId,
                        ]
                    );
                    $stock->increment('stock', $item->accepted_qty);
                    $stock->update(['capital' => $item->unit_cost, 'updated_by' => $confirmedByUserId]);
                }
            }

            $this->update([
                'status'       => 'confirmed',
                'confirmed_by' => $confirmedByUserId,
                'confirmed_at' => now(),
            ]);

            if ($this->order_id) {
                $this->syncOrderReceivedStatus();
            }
        });
    }

    public function cancel(): void
    {
        if ($this->status !== 'draft') {
            throw new \RuntimeException('Only draft GRNs can be cancelled.');
        }
        $this->update(['status' => 'cancelled']);
    }

    /**
     * Check whether every ordered item has been fully received across
     * all confirmed GRNs for the linked order and update its received_status.
     */
    public function syncOrderReceivedStatus(): void
    {
        $order = $this->order()->with('items')->first();
        if (!$order) return;

        $received = GrnItem::whereHas('goodsReceivedNote', fn($q) =>
            $q->where('order_id', $order->id)->where('status', 'confirmed')
        )->selectRaw('product_id, SUM(accepted_qty) as total_received')
         ->groupBy('product_id')
         ->pluck('total_received', 'product_id');

        $isComplete = $order->items->every(
            fn($oi) => ($received[$oi->product_id] ?? 0) >= $oi->quantity
        );

        $order->update([
            'received_status'   => $isComplete ? 'complete' : 'partial',
            'fully_received_at' => $isComplete ? now() : null,
        ]);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isDraft(): bool     { return $this->status === 'draft'; }
    public function isConfirmed(): bool { return $this->status === 'confirmed'; }
    public function isCancelled(): bool { return $this->status === 'cancelled'; }

    public function getTotalAcceptedAttribute(): int
    {
        return (int) $this->items->sum('accepted_qty');
    }

    public function getTotalValueAttribute(): float
    {
        return (float) $this->items->sum('line_total');
    }

    public function getFormattedTotalValueAttribute(): string
    {
        return '₱' . number_format($this->total_value, 2);
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'confirmed' => 'success',
            'cancelled' => 'destructive',
            default     => 'warning',
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeDraft($query)              { return $query->where('status', 'draft'); }
    public function scopeConfirmed($query)          { return $query->where('status', 'confirmed'); }
    public function scopeForBranch($query, int $id) { return $query->where('branch_id', $id); }
    public function scopeForOrder($query, int $id)  { return $query->where('order_id', $id); }
}
