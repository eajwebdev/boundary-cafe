<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
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
        'reserved_points',
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
        'rewards_popup_seen_on',
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
        'reserved_points' => 'integer',
        'lifetime_points_earned' => 'integer',
        'lifetime_points_redeemed' => 'integer',
        'joined_at' => 'date',
        'birthday' => 'date',
        'password' => 'hashed',
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'last_login_at' => 'datetime',
        'rewards_popup_seen_on' => 'date',
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

    /**
     * A walk-in record created at the POS: no password and no Google/Facebook login yet.
     * Whoever registers with its mobile number takes it over (and keeps its points).
     */
    public function isWalkIn(): bool
    {
        return ! $this->hasOnlineAccount() && ! $this->socialAccounts()->exists();
    }

    public function socialAccounts(): HasMany
    {
        return $this->hasMany(CustomerSocialAccount::class);
    }

    /** Customers who registered on the storefront, with a password or a Google/Facebook login. */
    public function scopeRegisteredOnline(Builder $query): void
    {
        $query->where(fn (Builder $q) => $q->whereNotNull('password')->orWhereHas('socialAccounts'));
    }

    /**
     * Customers a branch may see and serve: its own walk-ins, unassigned records and every registered
     * customer. A storefront account is shop-wide, so it is usable at any branch, not just the one it signed up under.
     */
    public function scopeVisibleToBranch(Builder $query, ?int $branchId): void
    {
        if ($branchId === null) {
            return;
        }

        $query->where(fn (Builder $q) => $q
            ->where('branch_id', $branchId)
            ->orWhereNull('branch_id')
            ->orWhere(fn (Builder $registered) => $registered->registeredOnline()));
    }

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            $token = (string) Str::uuid();
            $customer->loyalty_token ??= $token;
            $customer->customer_number ??= static::nextCustomerNumber();
            $customer->joined_at ??= today();
        });
    }

    /** Member numbers run in sign-up order: C-0001, C-0002 … C-9999, C-10000. */
    public static function nextCustomerNumber(): string
    {
        $last = static::where('customer_number', 'like', 'C-%')
            ->orderByRaw('LENGTH(customer_number) DESC')
            ->orderByDesc('customer_number')
            ->value('customer_number');

        return 'C-'.str_pad((string) ((int) substr((string) $last, 2) + 1), 4, '0', STR_PAD_LEFT);
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

    public function rewardClaims(): HasMany
    {
        return $this->hasMany(LoyaltyRewardClaim::class)->latest();
    }

    /** "0917•••4567" — safe to print on a loyalty card. */
    public function maskedContactNumber(): ?string
    {
        $number = $this->contact_number;
        if (! $number || strlen($number) < 7) {
            return $number;
        }

        return substr($number, 0, 4).str_repeat('•', strlen($number) - 8).substr($number, -4);
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
