<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\Schema;

class Promo extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'code',
        'description',
        'discount_type',    // percent | fixed
        'discount_value',
        'applies_to',       // all | specific_products | specific_categories
        'minimum_purchase',
        'max_uses',
        'max_uses_per_customer',
        'uses_count',
        'starts_at',
        'expires_at',
        'is_active',
        'show_on_storefront',
        'banner_image',
        'channels',         // pos | online | both
        'created_by',
    ];

    protected $casts = [
        'discount_value' => 'decimal:2',
        'minimum_purchase' => 'decimal:2',
        'max_uses' => 'integer',
        'max_uses_per_customer' => 'integer',
        'uses_count' => 'integer',
        'is_active' => 'boolean',
        'show_on_storefront' => 'boolean',
        'starts_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    protected $attributes = [
        'discount_type' => 'percent',
        'applies_to' => 'all',
        'uses_count' => 0,
        'is_active' => true,
        'channels' => 'both',
        'show_on_storefront' => false,
    ];

    // ── Table guard ────────────────────────────────────────────────
    //
    // Returns true only when the promos table actually exists in the DB.
    // Use this before any Promo query to avoid crashes on fresh installs
    // where migrations haven't been run yet.
    //
    // Usage in controllers/middleware:
    //   if (Promo::tableExists()) { ... query ... }

    public static function tableExists(): bool
    {
        static $exists = null;
        if ($exists === null) {
            $exists = Schema::hasTable('promos');
        }

        return $exists;
    }

    // ── Relationships ──────────────────────────────────────────────

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** Products this promo explicitly applies to */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'promo_products');
    }

    /** Categories this promo explicitly applies to */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'promo_categories');
    }

    // ── Status helpers ─────────────────────────────────────────────

    public function isValid(): bool
    {
        if (! $this->is_active) {
            return false;
        }
        if ($this->starts_at && $this->starts_at->isFuture()) {
            return false;
        }
        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }
        if ($this->max_uses && $this->uses_count >= $this->max_uses) {
            return false;
        }

        return true;
    }

    public function isLimitedPerCustomer(): bool
    {
        return (bool) $this->max_uses_per_customer;
    }

    /**
     * How many times a customer has used this promo: online orders that were not
     * cancelled or rejected, plus counter / dine-in sales that were not voided.
     */
    public function usesByCustomer(int $customerId): int
    {
        $onlineUses = OnlineOrder::where('promo_id', $this->id)
            ->where('customer_id', $customerId)
            ->where('promo_discount', '>', 0)
            ->whereNotIn('status', [OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED])
            ->count();

        // Completed online orders also create a sale; the order above already counts it.
        $counterUses = Sale::where('promo_id', $this->id)
            ->where('customer_id', $customerId)
            ->where('channel', '!=', 'online')
            ->where('status', '!=', 'voided')
            ->count();

        return $onlineUses + $counterUses;
    }

    /** True when the customer has reached this promo's per-customer limit. */
    public function isUsedUpBy(int $customerId): bool
    {
        return $this->isLimitedPerCustomer() && $this->usesByCustomer($customerId) >= $this->max_uses_per_customer;
    }

    public function isExpired(): bool
    {
        return $this->expires_at && $this->expires_at->isPast();
    }

    public function getStatusAttribute(): string
    {
        if (! $this->is_active) {
            return 'inactive';
        }
        if ($this->isExpired()) {
            return 'expired';
        }
        if ($this->starts_at?->isFuture()) {
            return 'scheduled';
        }
        if ($this->max_uses && $this->uses_count >= $this->max_uses) {
            return 'exhausted';
        }

        return 'active';
    }

    public function getStatusLabelAttribute(): string
    {
        return match ($this->status) {
            'active' => 'Active',
            'inactive' => 'Inactive',
            'expired' => 'Expired',
            'scheduled' => 'Scheduled',
            'exhausted' => 'Limit reached',
            default => ucfirst($this->status),
        };
    }

    // ── Discount computation ───────────────────────────────────────

    /**
     * Compute the discount amount for a given subtotal.
     * Returns 0.0 if the minimum purchase threshold is not met.
     */
    public function computeDiscount(float $subtotal): float
    {
        if ($this->minimum_purchase && $subtotal < (float) $this->minimum_purchase) {
            return 0.0;
        }

        if ($this->discount_type === 'percent') {
            return round($subtotal * ((float) $this->discount_value / 100), 2);
        }

        // Fixed amount — cap at subtotal so total never goes negative
        return min(round((float) $this->discount_value, 2), $subtotal);
    }

    /**
     * Check whether this promo applies to a given product.
     * Requires 'products' and 'categories' relations to be loaded.
     */
    public function appliesToProduct(Product $product): bool
    {
        return match ($this->applies_to) {
            'all' => true,
            'specific_products' => $this->products->contains($product->id),
            'specific_categories' => $product->category_id !== null
                && $this->categories->pluck('id')->contains($product->category_id),
            default => false,
        };
    }

    // ── Scopes ─────────────────────────────────────────────────────

    /**
     * Only currently active, non-expired, within-usage-limit promos.
     */
    public function scopeActive($query)
    {
        return $query
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()))
            ->where(fn ($q) => $q->whereNull('max_uses')->orWhereColumn('uses_count', '<', 'max_uses'));
    }

    /** Promos usable on a given channel ('pos' or 'online'). */
    public function scopeForChannel($query, string $channel)
    {
        return $query->whereIn('channels', [$channel, 'both']);
    }

    /** Active promos the customer storefront should advertise. */
    public function scopeOnStorefront($query)
    {
        return $query->active()->forChannel('online')->where('show_on_storefront', true);
    }

    public function availableOn(string $channel): bool
    {
        return in_array($this->channels ?? 'both', [$channel, 'both'], true);
    }

    public function getBannerUrlAttribute(): ?string
    {
        $img = $this->banner_image;
        if (! $img) {
            return null;
        }
        if (str_starts_with($img, '/') || str_starts_with($img, 'http')) {
            return $img;
        }

        return asset('storage/'.$img);
    }

    /**
     * Find by promo code — case-insensitive.
     */
    public function scopeByCode($query, string $code)
    {
        return $query->whereRaw('LOWER(code) = ?', [strtolower(trim($code))]);
    }
}
