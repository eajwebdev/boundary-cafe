<?php

namespace App\Models;

use Database\Factories\DailyMissionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One member's mission for one day, e.g. "Spend ₱260 today → +10 points".
 * It is valid only on its mission_date; purchases that day count towards it.
 */
class DailyMission extends Model
{
    /** @use HasFactory<DailyMissionFactory> */
    use HasFactory;

    /** Spend at least ₱target today (all purchases, delivery fees excluded). */
    public const TYPE_SPEND = 'spend';

    /** Order at least `target` items today. */
    public const TYPE_ITEMS = 'items';

    /** Order at least `target` items from one category today. */
    public const TYPE_CATEGORY = 'category';

    public const TYPES = [self::TYPE_SPEND, self::TYPE_ITEMS, self::TYPE_CATEGORY];

    public const STATUS_ACTIVE = 'active';

    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'customer_id', 'mission_date', 'type', 'target', 'category_id', 'reward_points',
        'title', 'status', 'completed_at', 'sale_id',
    ];

    protected function casts(): array
    {
        return [
            'mission_date' => 'date',
            'target' => 'decimal:2',
            'reward_points' => 'integer',
            'completed_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function isCompleted(): bool
    {
        return $this->status === self::STATUS_COMPLETED;
    }
}
