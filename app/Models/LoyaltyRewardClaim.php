<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A customer's reward claim. Its points are held (taken out of the wallet) while it is
 * reserved; the cashier scans the QR and the claim is redeemed when the sale completes.
 */
class LoyaltyRewardClaim extends Model
{
    public const STATUS_RESERVED = 'reserved';

    public const STATUS_REDEEMED = 'redeemed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_EXPIRED = 'expired';

    /** Redeemed on a sale that was later voided — points went back to the customer. */
    public const STATUS_VOIDED = 'voided';

    /** Prefix of the QR payload so the POS can tell a reward QR from a product barcode or member card. */
    public const QR_PREFIX = 'BCRWD-';

    protected $fillable = [
        'customer_id', 'code', 'token_hash', 'token', 'status', 'points', 'retail_value',
        'cost_value', 'expires_at', 'branch_id', 'sale_id', 'redeemed_by', 'redeemed_at', 'closed_at',
    ];

    protected $hidden = ['token', 'token_hash'];

    protected function casts(): array
    {
        return [
            'token' => 'encrypted',
            'points' => 'integer',
            'retail_value' => 'decimal:2',
            'cost_value' => 'decimal:2',
            'expires_at' => 'datetime',
            'redeemed_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(LoyaltyRewardClaimItem::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function redeemer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'redeemed_by');
    }

    public function scopeReserved(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_RESERVED);
    }

    public function isReserved(): bool
    {
        return $this->status === self::STATUS_RESERVED;
    }

    public function isPastExpiry(): bool
    {
        return $this->expires_at->isPast();
    }

    public function qrPayload(): string
    {
        return self::QR_PREFIX.$this->token;
    }

    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    /** Human label for each status, shown to customers and staff. */
    public static function statusLabel(string $status): string
    {
        return match ($status) {
            self::STATUS_RESERVED => 'Ready to claim',
            self::STATUS_REDEEMED => 'Claimed',
            self::STATUS_CANCELLED => 'Cancelled',
            self::STATUS_EXPIRED => 'Expired',
            self::STATUS_VOIDED => 'Voided',
            default => ucfirst($status),
        };
    }

    /** "2× Boundary Burger, 1× Caramel Latte" */
    public function summary(): string
    {
        return $this->items->map(fn (LoyaltyRewardClaimItem $item) => "{$item->quantity}× {$item->product_name}")->implode(', ');
    }
}
