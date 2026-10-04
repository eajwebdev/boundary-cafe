<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class DiningTable extends Model
{
    use HasFactory;

    protected $table = 'tables';

    protected $fillable = [
        'branch_id',
        'table_number',
        'section',
        'capacity',
        'status',
        'is_active',
    ];

    protected $casts = [
        'capacity'  => 'integer',
        'is_active' => 'boolean',
    ];

    protected $attributes = [
        'status'    => 'available',
        'capacity'  => 4,
        'is_active' => true,
    ];

    const STATUS_AVAILABLE = 'available';
    const STATUS_OCCUPIED  = 'occupied';
    const STATUS_RESERVED  = 'reserved';
    const STATUS_CLEANING  = 'cleaning';

    // ── Relationships ──────────────────────────────────────────────

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function tableOrders(): HasMany
    {
        return $this->hasMany(TableOrder::class, 'table_id');
    }

    public function activeOrder(): HasOne
    {
        return $this->hasOne(TableOrder::class, 'table_id')
            ->whereIn('status', ['open', 'billed'])
            ->latestOfMany();
    }

    // ── Helpers ────────────────────────────────────────────────────

    public function isAvailable(): bool { return $this->status === self::STATUS_AVAILABLE; }
    public function isOccupied(): bool  { return $this->status === self::STATUS_OCCUPIED; }
    public function isReserved(): bool  { return $this->status === self::STATUS_RESERVED; }
    public function isCleaning(): bool  { return $this->status === self::STATUS_CLEANING; }

    public function markOccupied(): void  { $this->update(['status' => self::STATUS_OCCUPIED]); }
    public function markAvailable(): void { $this->update(['status' => self::STATUS_AVAILABLE]); }
    public function markCleaning(): void  { $this->update(['status' => self::STATUS_CLEANING]); }
    public function markReserved(): void  { $this->update(['status' => self::STATUS_RESERVED]); }

    // ── Accessors ──────────────────────────────────────────────────

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'available' => 'success',
            'occupied'  => 'destructive',
            'reserved'  => 'warning',
            'cleaning'  => 'secondary',
            default     => 'secondary',
        };
    }

    public function getLabelAttribute(): string
    {
        return $this->section
            ? "{$this->section} — Table {$this->table_number}"
            : "Table {$this->table_number}";
    }

    public function getDisplayNameAttribute(): string
    {
        return $this->section
            ? "{$this->section} — {$this->table_number}"
            : $this->table_number;
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeAvailable($query)             { return $query->where('status', 'available'); }
    public function scopeOccupied($query)              { return $query->where('status', 'occupied'); }
    public function scopeActive($query)                { return $query->where('is_active', true); }
    public function scopeForBranch($query, int $id)    { return $query->where('branch_id', $id); }
    public function scopeInSection($query, string $sec){ return $query->where('section', $sec); }
}
