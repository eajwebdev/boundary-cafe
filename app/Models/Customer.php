<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Customer extends Model
{
    protected $fillable = [
        'branch_id',
        'customer_number',
        'loyalty_token',
        'loyalty_enabled',
        'loyalty_points',
        'lifetime_points_earned',
        'lifetime_points_redeemed',
        'joined_at',
        'birthday',
        'name',
        'contact_number',
        'email',
        'address',
        'notes',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'loyalty_enabled' => 'boolean',
        'loyalty_points' => 'integer',
        'lifetime_points_earned' => 'integer',
        'lifetime_points_redeemed' => 'integer',
        'joined_at' => 'date',
        'birthday' => 'date',
    ];

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            $token = (string) Str::uuid();
            $customer->loyalty_token ??= $token;
            $customer->customer_number ??= 'BC-'.strtoupper(substr(str_replace('-', '', $token), 0, 10));
            $customer->joined_at ??= today();
        });
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class);
    }

    public function loyaltyTransactions(): HasMany
    {
        return $this->hasMany(LoyaltyTransaction::class)->latest();
    }

    public function getTotalPurchasesAttribute(): float
    {
        return (float) $this->sales()->where('status', 'completed')->sum('total');
    }

    public function getCreditBalanceAttribute(): float
    {
        return (float) $this->sales()
            ->where('status', 'completed')
            ->whereIn('payment_status', ['unpaid', 'partial'])
            ->sum('balance_due');
    }
}
