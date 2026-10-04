<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    use HasFactory;

    // ── Business type constants ────────────────────────────────────
    const TYPE_RETAIL      = 'retail';
    const TYPE_CAFE        = 'cafe';
    const TYPE_RESTAURANT  = 'restaurant';
    const TYPE_FOOD_STALL  = 'food_stall';
    const TYPE_BAR         = 'bar';
    const TYPE_BAKERY      = 'bakery';
    const TYPE_PHARMACY    = 'pharmacy';
    const TYPE_SALON       = 'salon';
    const TYPE_LAUNDRY     = 'laundry';
    const TYPE_HARDWARE    = 'hardware';
    const TYPE_SCHOOL      = 'school';
    const TYPE_WAREHOUSE   = 'warehouse';
    const TYPE_MIXED       = 'mixed';

    public static function businessTypes(): array
    {
        return [
            // ── Food & Beverage ───────────────────────────────────────
            self::TYPE_CAFE        => 'Cafe / Milk Tea / Juice Bar',
            self::TYPE_RESTAURANT  => 'Restaurant / Canteen (Dine-in)',
            self::TYPE_FOOD_STALL  => 'Food Stall / Carinderia / Turo-turo',
            self::TYPE_BAKERY      => 'Bakery / Pastry / Dessert Shop',
            self::TYPE_BAR         => 'Bar / Pub / Nightlife',
            // ── Retail & Services ─────────────────────────────────────
            self::TYPE_RETAIL      => 'Retail / Grocery / Sari-sari',
            self::TYPE_PHARMACY    => 'Pharmacy / Drugstore',
            self::TYPE_HARDWARE    => 'Hardware / Construction Supply',
            self::TYPE_SALON       => 'Salon / Spa / Personal Care',
            self::TYPE_LAUNDRY     => 'Laundry / Dry Cleaning',
            // ── Other ─────────────────────────────────────────────────
            self::TYPE_SCHOOL      => 'School / Tutorial / Training Center',
            self::TYPE_WAREHOUSE   => 'Warehouse / Distribution Center',
            self::TYPE_MIXED       => 'Mixed (All features enabled)',
        ];
    }

    /**
     * Default feature flags per business type.
     * Applied automatically by booted() when business_type changes.
     */
    public static function defaultFlagsFor(string $type): array
    {
        return match ($type) {
            self::TYPE_RETAIL => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => true,
                'use_recipe_system'   => false,
                'use_bundles'         => true,
            ],
            self::TYPE_CAFE => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => true,
                'use_bundles'         => false,
            ],
            self::TYPE_RESTAURANT => [
                'use_table_ordering'  => true,
                'use_variants'        => false,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => true,
                'use_bundles'         => false,
            ],
            self::TYPE_FOOD_STALL => [
                'use_table_ordering'  => false,
                'use_variants'        => false,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => true,
                'use_bundles'         => false,
            ],
            self::TYPE_BAR => [
                'use_table_ordering'  => true,
                'use_variants'        => true,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => true,
                'use_bundles'         => true,
            ],
            self::TYPE_BAKERY => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => true,
                'use_recipe_system'   => true,
                'use_bundles'         => true,
            ],
            self::TYPE_PHARMACY => [
                'use_table_ordering'  => false,
                'use_variants'        => false,
                'use_expiry_tracking' => true,
                'use_recipe_system'   => false,
                'use_bundles'         => false,
            ],
            self::TYPE_SALON => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => false,
                'use_bundles'         => true,
            ],
            self::TYPE_LAUNDRY => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => false,
                'use_bundles'         => true,
            ],
            self::TYPE_HARDWARE => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => false,
                'use_bundles'         => true,
            ],
            self::TYPE_SCHOOL => [
                'use_table_ordering'  => false,
                'use_variants'        => false,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => false,
                'use_bundles'         => true,
            ],
            self::TYPE_WAREHOUSE => [
                'use_table_ordering'  => false,
                'use_variants'        => true,
                'use_expiry_tracking' => true,
                'use_recipe_system'   => false,
                'use_bundles'         => false,
            ],
            self::TYPE_MIXED => [
                'use_table_ordering'  => true,
                'use_variants'        => true,
                'use_expiry_tracking' => true,
                'use_recipe_system'   => true,
                'use_bundles'         => true,
            ],
            default => [
                'use_table_ordering'  => false,
                'use_variants'        => false,
                'use_expiry_tracking' => false,
                'use_recipe_system'   => false,
                'use_bundles'         => false,
            ],
        };
    }

    protected $fillable = [
        'supplier_id',
        'name',
        'code',
        'address',
        'phone',
        'contact_person',
        'is_active',
        'business_type',
        'use_table_ordering',
        'use_variants',
        'use_expiry_tracking',
        'use_recipe_system',
        'use_bundles',
    ];

    protected $casts = [
        'is_active'           => 'boolean',
        'use_table_ordering'  => 'boolean',
        'use_variants'        => 'boolean',
        'use_expiry_tracking' => 'boolean',
        'use_recipe_system'   => 'boolean',
        'use_bundles'         => 'boolean',
    ];

    protected $attributes = [
        'business_type'       => self::TYPE_RETAIL,
        'use_table_ordering'  => false,
        'use_variants'        => false,
        'use_expiry_tracking' => false,
        'use_recipe_system'   => false,
        'use_bundles'         => false,
    ];

    // ── Boot ───────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (Branch $branch) {
            if ($branch->isDirty('business_type')) {
                $defaults = static::defaultFlagsFor($branch->business_type);
                foreach ($defaults as $flag => $value) {
                    if (!$branch->isDirty($flag)) {
                        $branch->{$flag} = $value;
                    }
                }
            }
        });
    }

    // ── Business Type Helpers ──────────────────────────────────────

    public function isRetail(): bool     { return $this->business_type === self::TYPE_RETAIL; }
    public function isCafe(): bool       { return $this->business_type === self::TYPE_CAFE; }
    public function isRestaurant(): bool { return $this->business_type === self::TYPE_RESTAURANT; }
    public function isFoodStall(): bool  { return $this->business_type === self::TYPE_FOOD_STALL; }
    public function isBar(): bool        { return $this->business_type === self::TYPE_BAR; }
    public function isBakery(): bool     { return $this->business_type === self::TYPE_BAKERY; }
    public function isPharmacy(): bool   { return $this->business_type === self::TYPE_PHARMACY; }
    public function isSalon(): bool      { return $this->business_type === self::TYPE_SALON; }
    public function isLaundry(): bool    { return $this->business_type === self::TYPE_LAUNDRY; }
    public function isHardware(): bool   { return $this->business_type === self::TYPE_HARDWARE; }
    public function isSchool(): bool     { return $this->business_type === self::TYPE_SCHOOL; }
    public function isWarehouse(): bool  { return $this->business_type === self::TYPE_WAREHOUSE; }
    public function isMixed(): bool      { return $this->business_type === self::TYPE_MIXED; }

    public function getBusinessTypeLabelAttribute(): string
    {
        return static::businessTypes()[$this->business_type] ?? ucfirst($this->business_type);
    }

    // ── Feature Flag Helpers ───────────────────────────────────────

    public function usesTableOrdering(): bool  { return (bool) $this->use_table_ordering; }
    public function usesVariants(): bool       { return (bool) $this->use_variants; }
    public function usesExpiryTracking(): bool { return (bool) $this->use_expiry_tracking; }
    public function usesRecipeSystem(): bool   { return (bool) $this->use_recipe_system; }
    public function usesBundles(): bool        { return (bool) $this->use_bundles; }

    /**
     * All feature flags as an array — pass this to Inertia/Vue frontend.
     */
    public function getFeatureFlagsAttribute(): array
    {
        return [
            'table_ordering'  => $this->use_table_ordering,
            'variants'        => $this->use_variants,
            'expiry_tracking' => $this->use_expiry_tracking,
            'recipe_system'   => $this->use_recipe_system,
            'bundles'         => $this->use_bundles,
        ];
    }

    // ── System Settings Shortcut ───────────────────────────────────

    /**
     * Read a system setting scoped to this branch.
     * Shortcut for SystemSetting::get($key, $this->id, $default).
     *
     * Usage: $branch->setting('pos.require_cash_session')
     */
    public function setting(string $key, mixed $default = null): mixed
    {
        return SystemSetting::get($key, $this->id, $default);
    }

    /**
     * Read all settings for this branch (branch overrides global).
     */
    public function allSettings(): array
    {
        return SystemSetting::allForBranch($this->id);
    }

    // ── Relationships ──────────────────────────────────────────────

    public function supplier(): BelongsTo         { return $this->belongsTo(Supplier::class); }
    public function users(): HasMany              { return $this->hasMany(User::class); }
    public function productStocks(): HasMany      { return $this->hasMany(ProductStock::class); }
    public function sales(): HasMany              { return $this->hasMany(Sale::class); }
    public function orders(): HasMany             { return $this->hasMany(Order::class); }
    public function cashSessions(): HasMany       { return $this->hasMany(CashSession::class); }
    public function expenses(): HasMany           { return $this->hasMany(Expense::class); }
    public function dailySummaries(): HasMany     { return $this->hasMany(DailySummary::class); }
    public function goodsReceivedNotes(): HasMany { return $this->hasMany(GoodsReceivedNote::class); }
    public function diningTables(): HasMany       { return $this->hasMany(DiningTable::class); }
    public function tableOrders(): HasMany        { return $this->hasMany(TableOrder::class); }

    public function pettyCashFunds(): HasMany
    {
        return $this->hasMany(PettyCashFund::class);
    }

    public function activePettyCashFund()
    {
        return $this->hasOne(PettyCashFund::class)->where('status', 'active')->latestOfMany();
    }

    public function settings(): HasMany
    {
        return $this->hasMany(SystemSetting::class);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getTotalStockAttribute(): int
    {
        return (int) $this->productStocks()->sum('stock');
    }

    public function getLowStockCountAttribute(): int
    {
        $threshold = SystemSetting::lowStockThreshold($this->id);
        return $this->productStocks()
            ->where('stock', '>', 0)
            ->where('stock', '<=', $threshold)
            ->count();
    }

    public function getExpiredStockCountAttribute(): int
    {
        if (!$this->use_expiry_tracking) return 0;
        return $this->productStocks()->whereDate('expiry_date', '<', now())->count();
    }

    public function getAvailableTablesCountAttribute(): int
    {
        if (!$this->use_table_ordering) return 0;
        return $this->diningTables()->where('status', 'available')->where('is_active', true)->count();
    }

    public function getOccupiedTablesCountAttribute(): int
    {
        if (!$this->use_table_ordering) return 0;
        return $this->diningTables()->where('status', 'occupied')->count();
    }

    public function getPettyCashBalanceAttribute(): float
    {
        return (float) ($this->activePettyCashFund?->current_balance ?? 0.00);
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)              { return $query->where('is_active', true); }
    public function scopeOfType($query, string $type){ return $query->where('business_type', $type); }
    public function scopeWithTableOrdering($query)   { return $query->where('use_table_ordering', true); }
    public function scopeWithRecipeSystem($query)    { return $query->where('use_recipe_system', true); }
    public function scopeWithBundles($query)         { return $query->where('use_bundles', true); }
}