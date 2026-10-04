<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class TableOrder extends Model
{
    use HasFactory;

    protected $table = 'table_orders';

    protected $fillable = [
        'order_number',
        'branch_id',
        'table_id',
        'user_id',
        'sale_id',
        'covers',
        'customer_name',
        'subtotal',
        'discount_amount',
        'total',
        'status',
        'notes',
        'opened_at',
        'closed_at',
    ];

    protected $casts = [
        'covers'          => 'integer',
        'subtotal'        => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total'           => 'decimal:2',
        'opened_at'       => 'datetime',
        'closed_at'       => 'datetime',
    ];

    protected $attributes = [
        'status'          => 'open',
        'covers'          => 1,
        'subtotal'        => 0.00,
        'discount_amount' => 0.00,
        'total'           => 0.00,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function (TableOrder $order) {
            if (empty($order->order_number)) {
                $order->order_number = static::generateOrderNumber();
            }
            if (empty($order->opened_at)) {
                $order->opened_at = now();
            }
        });

        // When a table_order is closed, mark the physical table as cleaning
        static::updated(function (TableOrder $order) {
            if ($order->wasChanged('status') && in_array($order->status, ['closed', 'cancelled'])) {
                $order->table->markCleaning();
            }
        });
    }

    public static function generateOrderNumber(): string
    {
        $prefix = 'TO-' . now()->format('y') . '-';
        for ($i = 0; $i < 10; $i++) {
            $c = $prefix . str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
            if (!static::where('order_number', $c)->exists()) return $c;
        }
        return $prefix . now()->format('His') . Str::random(4);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function branch(): BelongsTo  { return $this->belongsTo(Branch::class); }
    public function table(): BelongsTo   { return $this->belongsTo(DiningTable::class, 'table_id'); }
    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
    public function sale(): BelongsTo    { return $this->belongsTo(Sale::class); }
    public function items(): HasMany     { return $this->hasMany(TableOrderItem::class); }

    public function servedItems(): HasMany
    {
        return $this->hasMany(TableOrderItem::class)->where('status', 'served');
    }

    public function pendingItems(): HasMany
    {
        return $this->hasMany(TableOrderItem::class)->where('status', 'pending');
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isOpen(): bool      { return $this->status === 'open'; }
    public function isBilled(): bool    { return $this->status === 'billed'; }
    public function isClosed(): bool    { return $this->status === 'closed'; }
    public function isCancelled(): bool { return $this->status === 'cancelled'; }

    /**
     * Recompute subtotal and total from all non-cancelled items.
     * Call this after adding/removing/updating items.
     */
    public function recalculate(): void
    {
        $subtotal = (float) $this->items()
            ->where('status', '!=', 'cancelled')
            ->sum('total');

        $this->update([
            'subtotal' => $subtotal,
            'total'    => round($subtotal - (float) $this->discount_amount, 2),
        ]);
    }

    /**
     * Convert to a Sale record on payment collection.
     * Closes the table_order and links it to the sale.
     */
    public function settle(array $saleData): Sale
    {
        $sale = Sale::create(array_merge($saleData, [
            'branch_id' => $this->branch_id,
            'total'     => $this->total,
        ]));

        // Create sale_items from served table_order_items
        $this->items()->where('status', 'served')->each(function ($item) use ($sale) {
            $sale->items()->create([
                'product_id'         => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'quantity'           => $item->quantity,
                'price'              => $item->price,
                'total'              => $item->total,
            ]);
        });

        $this->update([
            'sale_id'   => $sale->id,
            'status'    => 'closed',
            'closed_at' => now(),
        ]);

        return $sale;
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedTotalAttribute(): string
    {
        return '₱' . number_format($this->total, 2);
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'open'      => 'info',
            'billed'    => 'warning',
            'closed'    => 'success',
            'cancelled' => 'destructive',
            default     => 'secondary',
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeOpen($query)             { return $query->where('status', 'open'); }
    public function scopeBilled($query)           { return $query->where('status', 'billed'); }
    public function scopeForBranch($query, int $id){ return $query->where('branch_id', $id); }
    public function scopeForTable($query, int $id) { return $query->where('table_id', $id); }
    public function scopeToday($query)
    {
        return $query->whereDate('opened_at', today());
    }
}
