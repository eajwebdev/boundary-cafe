<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class Supplier extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'is_campus',
        'phone',
        'address',
        'contact_person',
    ];

    protected $casts = [
        'is_campus' => 'boolean',
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    /** Orders placed WITH this supplier (as the selling party) */
    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    /** GRNs where this supplier was the delivering party */
    public function goodsReceivedNotes(): HasMany
    {
        return $this->hasMany(GoodsReceivedNote::class);
    }

    /** All users across all branches */
    public function users(): HasManyThrough
    {
        return $this->hasManyThrough(User::class, Branch::class);
    }

    /** All product stocks across all branches */
    public function stocks(): HasManyThrough
    {
        return $this->hasManyThrough(ProductStock::class, Branch::class);
    }

    /** All sales across all branches */
    public function sales(): HasManyThrough
    {
        return $this->hasManyThrough(Sale::class, Branch::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isCampus(): bool { return (bool) $this->is_campus; }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeCampus($query)    { return $query->where('is_campus', true); }
    public function scopeNonCampus($query) { return $query->where('is_campus', false); }

    // ── Accessors ──────────────────────────────────────────────────

    public function getTotalStockAttribute(): int
    {
        return (int) $this->stocks()->sum('stock');
    }

    public function getActiveBranchCountAttribute(): int
    {
        return $this->branches()->where('is_active', true)->count();
    }
}
