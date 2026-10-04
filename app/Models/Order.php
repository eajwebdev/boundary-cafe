<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_number',
        'pr_number',
        'user_id',
        'branch_id',        // branch placing the order (buyer)
        'supplier_id',      // supplier being ordered from (seller)
        'order_type',
        'payment_method',
        'subtotal',
        'total',
        'status',
        'received_status',
        'fully_received_at',
        'notes',
    ];

    protected $casts = [
        'subtotal'          => 'decimal:2',
        'total'             => 'decimal:2',
        'fully_received_at' => 'datetime',
        'created_at'        => 'datetime',
        'updated_at'        => 'datetime',
    ];

    protected $attributes = [
        'status'          => 'pending',
        'received_status' => 'pending',
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::creating(function ($order) {
            if (empty($order->order_number)) {
                $order->order_number = static::generateOrderNumber();
            }
        });
    }

    public static function generateOrderNumber(): string
    {
        $prefix = 'ORD-' . now()->format('y') . '-';
        for ($i = 0; $i < 10; $i++) {
            $c = $prefix . str_pad(mt_rand(1, 999999), 6, '0', STR_PAD_LEFT);
            if (!static::where('order_number', $c)->exists()) return $c;
        }
        return $prefix . now()->format('His') . Str::random(4);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function user(): BelongsTo     { return $this->belongsTo(User::class); }
    public function branch(): BelongsTo   { return $this->belongsTo(Branch::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(Supplier::class); }
    public function items(): HasMany      { return $this->hasMany(OrderItem::class); }

    public function goodsReceivedNotes(): HasMany
    {
        return $this->hasMany(GoodsReceivedNote::class);
    }

    public function confirmedGrns(): HasMany
    {
        return $this->hasMany(GoodsReceivedNote::class)->where('status', 'confirmed');
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isPending(): bool       { return $this->status === 'pending'; }
    public function isCancelled(): bool     { return $this->status === 'cancelled'; }
    public function isFullyReceived(): bool { return $this->received_status === 'complete'; }

    public function canBeCancelled(): bool
    {
        return in_array($this->status, ['pending', 'confirmed']);
    }

    public function canReceiveGrn(): bool
    {
        return in_array($this->status, ['confirmed', 'shipped', 'delivered'])
            && $this->received_status !== 'complete';
    }

    public function getItemCountAttribute(): int
    {
        return $this->items()->count();
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedTotalAttribute(): string
    {
        return '₱' . number_format($this->total, 2);
    }

    public function getStatusLabelAttribute(): string
    {
        return ucfirst(str_replace('_', ' ', $this->status));
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'pending'   => 'warning',
            'confirmed' => 'info',
            'shipped'   => 'purple',
            'delivered' => 'success',
            'cancelled' => 'destructive',
            default     => 'secondary',
        };
    }

    public function getReceivedStatusVariantAttribute(): string
    {
        return match ($this->received_status) {
            'complete' => 'success',
            'partial'  => 'warning',
            default    => 'secondary',
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopePending($query)             { return $query->where('status', 'pending'); }
    public function scopeForBranch($query, int $id)  { return $query->where('branch_id', $id); }
    public function scopeForSupplier($query, int $id){ return $query->where('supplier_id', $id); }
    public function scopeForUser($query, int $id)    { return $query->where('user_id', $id); }

    public function scopeAwaitingReceiving($query)
    {
        return $query->whereIn('status', ['confirmed', 'shipped', 'delivered'])
                     ->where('received_status', '!=', 'complete');
    }
}
