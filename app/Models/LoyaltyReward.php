<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A menu item customers can buy with points (e.g. Boundary Burger = 50 pts).
 *
 * branch_ids: null = every branch, otherwise the branches where it can be claimed.
 * max_per_claim: null = no limit on quantity in a single claim.
 */
class LoyaltyReward extends Model
{
    protected $fillable = [
        'product_id', 'product_variant_id', 'points_cost', 'is_active',
        'max_per_claim', 'branch_ids', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'points_cost' => 'integer',
            'is_active' => 'boolean',
            'max_per_claim' => 'integer',
            'branch_ids' => 'array',
            'sort_order' => 'integer',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true)
            ->whereHas('product', fn (Builder $product) => $product->where('status', 'active'));
    }

    public function availableAt(?int $branchId): bool
    {
        if (empty($this->branch_ids) || $branchId === null) {
            return true;
        }

        return in_array($branchId, array_map('intval', $this->branch_ids), true);
    }

    public function displayName(): string
    {
        $name = $this->product?->name ?? 'Reward';

        return $this->variant ? "{$name} – {$this->variant->name}" : $name;
    }
}
