<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class Customer extends Authenticatable
{
    use Notifiable;

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
        'password',
        'address',
        'barangay',
        'notes',
        'is_active',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'loyalty_token',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'loyalty_enabled' => 'boolean',
        'loyalty_points' => 'integer',
        'lifetime_points_earned' => 'integer',
        'lifetime_points_redeemed' => 'integer',
        'joined_at' => 'date',
        'birthday' => 'date',
        'password' => 'hashed',
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'last_login_at' => 'datetime',
    ];

    /** Normalise PH mobile numbers to 09XXXXXXXXX so lookups and uniqueness are reliable. */
    public static function normalisePhone(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $raw);
        if (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        return $digits !== '' ? $digits : null;
    }

    public function setContactNumberAttribute(?string $value): void
    {
        $this->attributes['contact_number'] = static::normalisePhone($value);
    }

    public function setEmailAttribute(?string $value): void
    {
        $this->attributes['email'] = $value ? strtolower(trim($value)) : null;
    }

    public function hasOnlineAccount(): bool
    {
        return ! empty($this->attributes['password'] ?? null);
    }

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            $token = (string) Str::uuid();
            $customer->loyalty_token ??= $token;
            $customer->customer_number ??= SystemSetting::orderPrefix().'-'.strtoupper(substr(str_replace('-', '', $token), 0, 10));
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

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class)->orderByDesc('is_default')->latest();
    }

    public function onlineOrders(): HasMany
    {
        return $this->hasMany(OnlineOrder::class)->latest();
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
