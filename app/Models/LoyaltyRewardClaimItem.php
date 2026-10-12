<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyRewardClaimItem extends Model
{
    protected $fillable = [
        'loyalty_reward_claim_id', 'loyalty_reward_id', 'product_id', 'product_variant_id',
        'product_name', 'quantity', 'points_each', 'points_total',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'points_each' => 'integer',
            'points_total' => 'integer',
        ];
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(LoyaltyRewardClaim::class, 'loyalty_reward_claim_id');
    }

    public function reward(): BelongsTo
    {
        return $this->belongsTo(LoyaltyReward::class, 'loyalty_reward_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
