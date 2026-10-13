<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoyaltyTransaction extends Model
{
    public const TYPE_EARN = 'earn';

    public const TYPE_REDEEM = 'redeem';

    public const TYPE_REVERSAL = 'reversal';

    public const TYPE_ADJUSTMENT = 'adjustment';

    public const TYPE_BONUS = 'bonus';

    /** Points held for a reward claim (becomes TYPE_REDEEM when the claim is redeemed). */
    public const TYPE_RESERVE = 'reserve';

    /** Held points returned because a reward claim was cancelled, expired or voided. */
    public const TYPE_RELEASE = 'release';

    public const TYPE_EXPIRE = 'expire';

    /** Bonus points for completing a daily mission. */
    public const TYPE_MISSION = 'mission';

    /** Ledger types that put new points into circulation. */
    public const ISSUED_TYPES = [self::TYPE_EARN, self::TYPE_BONUS, self::TYPE_MISSION];

    protected $fillable = [
        'customer_id', 'branch_id', 'sale_id', 'reward_claim_id', 'user_id', 'type',
        'points', 'balance_after', 'reason', 'meta',
    ];

    protected $casts = [
        'points' => 'integer',
        'balance_after' => 'integer',
        'meta' => 'array',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function rewardClaim(): BelongsTo
    {
        return $this->belongsTo(LoyaltyRewardClaim::class, 'reward_claim_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
