<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One entry in a customer's notification history: points earned after an order,
 * a birthday bonus, a reward claimed in-store, a claim that expired, and so on.
 * Stored in the database only — the customer app reads it from /account/notifications.
 */
class LoyaltyActivity extends Notification
{
    use Queueable;

    public const POINTS_EARNED = 'points_earned';

    public const BIRTHDAY_BONUS = 'birthday_bonus';

    public const REWARD_REDEEMED = 'reward_redeemed';

    public const CLAIM_RELEASED = 'claim_released';

    public const POINTS_RETURNED = 'points_returned';

    public const POINTS_EXPIRED = 'points_expired';

    public const POINTS_ADJUSTED = 'points_adjusted';

    public const MISSION_ASSIGNED = 'mission_assigned';

    public const MISSION_COMPLETED = 'mission_completed';

    public function __construct(
        public string $kind,
        public string $title,
        public string $body,
        public int $points = 0,
        public ?int $balance = null,
        public ?string $reference = null,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array{kind: string, title: string, body: string, points: int, balance: int|null, reference: string|null}
     */
    public function toArray(object $notifiable): array
    {
        return [
            'kind' => $this->kind,
            'title' => $this->title,
            'body' => $this->body,
            'points' => $this->points,
            'balance' => $this->balance,
            'reference' => $this->reference,
        ];
    }
}
