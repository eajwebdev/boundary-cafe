<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class OnlineOrder extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_PREPARING = 'preparing';

    public const STATUS_READY = 'ready';

    public const STATUS_OUT_FOR_DELIVERY = 'out_for_delivery';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_REJECTED = 'rejected';

    public const ACTIVE_STATUSES = [
        self::STATUS_PENDING, self::STATUS_ACCEPTED, self::STATUS_PREPARING,
        self::STATUS_READY, self::STATUS_OUT_FOR_DELIVERY,
    ];

    public const FINAL_STATUSES = [self::STATUS_COMPLETED, self::STATUS_CANCELLED, self::STATUS_REJECTED];

    /** Statuses that require a written reason when staff move an order into them. */
    public const NEEDS_REASON = [self::STATUS_CANCELLED, self::STATUS_REJECTED];

    /** Timestamp column stamped when an order enters each status. */
    public const STATUS_TIMESTAMPS = [
        self::STATUS_ACCEPTED => 'accepted_at',
        self::STATUS_PREPARING => 'preparing_at',
        self::STATUS_READY => 'ready_at',
        self::STATUS_OUT_FOR_DELIVERY => 'out_for_delivery_at',
        self::STATUS_COMPLETED => 'completed_at',
        self::STATUS_CANCELLED => 'cancelled_at',
        self::STATUS_REJECTED => 'cancelled_at',
    ];

    protected $fillable = [
        'order_number', 'customer_id', 'branch_id', 'fulfillment_type', 'status', 'payment_method',
        'payment_status', 'subtotal', 'promo_id', 'promo_label', 'promo_discount', 'vat_amount',
        'loyalty_points_redeemed', 'loyalty_discount', 'loyalty_points_to_earn', 'delivery_fee', 'total',
        'contact_name', 'contact_number', 'barangay', 'street', 'landmark', 'notes_for_rider',
        'lat', 'lng', 'customer_note', 'estimated_minutes', 'estimated_ready_at',
        'accepted_at', 'preparing_at', 'ready_at', 'out_for_delivery_at', 'completed_at',
        'cancelled_at', 'cancel_reason', 'cancelled_by', 'handled_by', 'sale_id',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'promo_discount' => 'decimal:2',
        'vat_amount' => 'decimal:2',
        'loyalty_discount' => 'decimal:2',
        'delivery_fee' => 'decimal:2',
        'total' => 'decimal:2',
        'loyalty_points_redeemed' => 'integer',
        'loyalty_points_to_earn' => 'integer',
        'estimated_minutes' => 'integer',
        'lat' => 'float',
        'lng' => 'float',
        'estimated_ready_at' => 'datetime',
        'accepted_at' => 'datetime',
        'preparing_at' => 'datetime',
        'ready_at' => 'datetime',
        'out_for_delivery_at' => 'datetime',
        'completed_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    protected $attributes = [
        'status' => self::STATUS_PENDING,
        'fulfillment_type' => 'delivery',
        'payment_method' => 'cod',
        'payment_status' => 'unpaid',
    ];

    protected static function booted(): void
    {
        static::creating(function (OnlineOrder $order) {
            $order->order_number ??= static::generateOrderNumber();
        });
    }

    public static function generateOrderNumber(): string
    {
        $prefix = 'BC-ONL-'.now()->format('ymd').'-';
        for ($i = 0; $i < 10; $i++) {
            $candidate = $prefix.str_pad((string) random_int(1, 9999), 4, '0', STR_PAD_LEFT);
            if (! static::where('order_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        return $prefix.strtoupper(Str::random(6));
    }

    // ── State machine ──────────────────────────────────────────────

    /**
     * Allowed next statuses from the current one, for a given actor.
     * This is the single source of truth for status transitions.
     */
    public function allowedTransitions(string $actor = 'staff'): array
    {
        if ($actor === 'customer') {
            return $this->status === self::STATUS_PENDING ? [self::STATUS_CANCELLED] : [];
        }

        $isPickup = $this->fulfillment_type === 'pickup';

        return match ($this->status) {
            self::STATUS_PENDING => [self::STATUS_ACCEPTED, self::STATUS_REJECTED, self::STATUS_CANCELLED],
            self::STATUS_ACCEPTED => [self::STATUS_PREPARING, self::STATUS_CANCELLED],
            self::STATUS_PREPARING => [self::STATUS_READY],
            self::STATUS_READY => $isPickup ? [self::STATUS_COMPLETED] : [self::STATUS_OUT_FOR_DELIVERY],
            self::STATUS_OUT_FOR_DELIVERY => [self::STATUS_COMPLETED],
            default => [],
        };
    }

    public function canTransitionTo(string $status, string $actor = 'staff'): bool
    {
        return in_array($status, $this->allowedTransitions($actor), true);
    }

    /** The "happy path" next step, used for one-tap buttons on the staff board. */
    public function nextStatus(): ?string
    {
        return collect($this->allowedTransitions('staff'))
            ->first(fn ($s) => ! in_array($s, self::NEEDS_REASON, true));
    }

    /** Ordered steps shown on the customer tracking stepper. */
    public function trackingSteps(): array
    {
        $steps = [
            self::STATUS_PENDING => 'Order placed',
            self::STATUS_ACCEPTED => 'Confirmed by the cafe',
            self::STATUS_PREPARING => 'Preparing your food',
            self::STATUS_READY => $this->fulfillment_type === 'pickup' ? 'Ready for pickup' : 'Packed and ready',
        ];
        if ($this->fulfillment_type !== 'pickup') {
            $steps[self::STATUS_OUT_FOR_DELIVERY] = 'Rider on the way';
        }
        $steps[self::STATUS_COMPLETED] = $this->fulfillment_type === 'pickup' ? 'Picked up' : 'Delivered';

        return $steps;
    }

    public function isActive(): bool
    {
        return in_array($this->status, self::ACTIVE_STATUSES, true);
    }

    public function isFinal(): bool
    {
        return in_array($this->status, self::FINAL_STATUSES, true);
    }

    public static function statusLabel(string $status): string
    {
        return match ($status) {
            self::STATUS_PENDING => 'Waiting for confirmation',
            self::STATUS_ACCEPTED => 'Confirmed',
            self::STATUS_PREPARING => 'Preparing',
            self::STATUS_READY => 'Ready',
            self::STATUS_OUT_FOR_DELIVERY => 'Out for delivery',
            self::STATUS_COMPLETED => 'Completed',
            self::STATUS_CANCELLED => 'Cancelled',
            self::STATUS_REJECTED => 'Declined',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }

    // ── Relationships ──────────────────────────────────────────────

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function promo(): BelongsTo
    {
        return $this->belongsTo(Promo::class);
    }

    public function handler(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by');
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OnlineOrderItem::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(OnlineOrderStatusLog::class)->orderBy('created_at')->orderBy('id');
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }

    public function scopeForBranch($query, int $branchId)
    {
        return $query->where('branch_id', $branchId);
    }

    // ── Presentation ───────────────────────────────────────────────

    public function addressSummary(): ?string
    {
        if ($this->fulfillment_type === 'pickup') {
            return null;
        }

        return collect([$this->street, $this->barangay, 'Mabinay'])->filter()->implode(', ');
    }

    public function toTrackingArray(): array
    {
        $this->loadMissing(['items', 'statusLogs', 'branch']);

        $reached = $this->statusLogs->pluck('created_at', 'to_status');
        $steps = collect($this->trackingSteps())->map(fn ($label, $key) => [
            'key' => $key,
            'label' => $label,
            'at' => $reached->get($key)?->toIso8601String()
                ?? ($key === self::STATUS_PENDING ? $this->created_at?->toIso8601String() : null),
        ])->values();

        return [
            'id' => $this->id,
            'order_number' => $this->order_number,
            'status' => $this->status,
            'status_label' => self::statusLabel($this->status),
            'is_active' => $this->isActive(),
            'can_cancel' => $this->canTransitionTo(self::STATUS_CANCELLED, 'customer'),
            'fulfillment_type' => $this->fulfillment_type,
            'payment_method' => $this->payment_method,
            'subtotal' => (float) $this->subtotal,
            'promo_label' => $this->promo_label,
            'promo_discount' => (float) $this->promo_discount,
            'vat_amount' => (float) $this->vat_amount,
            'loyalty_points_redeemed' => $this->loyalty_points_redeemed,
            'loyalty_discount' => (float) $this->loyalty_discount,
            'loyalty_points_to_earn' => $this->loyalty_points_to_earn,
            'delivery_fee' => (float) $this->delivery_fee,
            'total' => (float) $this->total,
            'contact_name' => $this->contact_name,
            'contact_number' => $this->contact_number,
            'address' => $this->addressSummary(),
            'landmark' => $this->landmark,
            'notes_for_rider' => $this->notes_for_rider,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'customer_note' => $this->customer_note,
            'cancel_reason' => $this->cancel_reason,
            'cancelled_by' => $this->cancelled_by,
            'estimated_ready_at' => $this->estimated_ready_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
            'branch' => [
                'name' => $this->branch?->name,
                'phone' => $this->branch?->phone ?: SystemSetting::get('general.phone', $this->branch_id, ''),
                'address' => $this->branch?->address,
            ],
            'steps' => $steps,
            'items' => $this->items->map(fn (OnlineOrderItem $i) => [
                'id' => $i->id,
                'name' => $i->product_name,
                'variant' => $i->variant_name,
                'quantity' => $i->quantity,
                'price' => (float) $i->price,
                'total' => (float) $i->total,
                'note' => $i->note,
            ])->values(),
        ];
    }
}
