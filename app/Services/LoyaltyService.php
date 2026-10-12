<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\LoyaltyActivity;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Rewards programme — the single points engine for counter, dine-in and online sales.
 *
 * Earning: FLOOR(eligible amount / spend_increment) × points_per_increment (× tier multiplier).
 * Spending: points buy reward items claimed in-store (LoyaltyRewardService); the older
 * "points as a peso discount" stays available behind loyalty.allow_peso_discount.
 *
 * Settings (loyalty.*): enabled, spend_increment, points_per_increment, earn_channels,
 * excluded_category_ids, allow_peso_discount, peso_per_point, minimum_redeem, maximum_redeem,
 * claim_expiry_minutes, points_expiry_months, tiers_enabled, tiers (JSON), birthday_bonus.
 */
class LoyaltyService
{
    public const CHANNELS = ['counter', 'dine_in', 'online'];

    public const DEFAULT_TIERS = [
        ['name' => 'Bronze', 'min' => 0, 'multiplier' => 1],
        ['name' => 'Silver', 'min' => 500, 'multiplier' => 1.25],
        ['name' => 'Gold', 'min' => 1500, 'multiplier' => 1.5],
    ];

    public function enabled(?int $branchId = null): bool
    {
        return (bool) SystemSetting::get('loyalty.enabled', $branchId, true);
    }

    /** Programme rules for display on the storefront and settings page. */
    public function rules(?int $branchId = null): array
    {
        $channels = SystemSetting::get('loyalty.earn_channels', $branchId, self::CHANNELS);
        $excluded = SystemSetting::get('loyalty.excluded_category_ids', $branchId, []);

        return [
            'enabled' => $this->enabled($branchId),
            'spend_increment' => max(1, (float) SystemSetting::get('loyalty.spend_increment', $branchId, 100)),
            'points_per_increment' => max(0, (int) SystemSetting::get('loyalty.points_per_increment', $branchId, 5)),
            'earn_channels' => array_values(array_intersect(self::CHANNELS, is_array($channels) ? $channels : self::CHANNELS)),
            'excluded_category_ids' => array_values(array_map('intval', is_array($excluded) ? $excluded : [])),
            'allow_peso_discount' => (bool) SystemSetting::get('loyalty.allow_peso_discount', $branchId, false),
            'claim_expiry_minutes' => min(1440, max(5, (int) SystemSetting::get('loyalty.claim_expiry_minutes', $branchId, 120))),
            'points_expiry_months' => max(0, (int) SystemSetting::get('loyalty.points_expiry_months', $branchId, 0)),
            'peso_per_point' => max(0.01, (float) SystemSetting::get('loyalty.peso_per_point', $branchId, 1)),
            'minimum_redeem' => max(1, (int) SystemSetting::get('loyalty.minimum_redeem', $branchId, 10)),
            'maximum_redeem' => max(0, (int) SystemSetting::get('loyalty.maximum_redeem', $branchId, 500)),
            'tiers_enabled' => (bool) SystemSetting::get('loyalty.tiers_enabled', $branchId, true),
            'tiers' => $this->tiers($branchId),
            'birthday_bonus' => max(0, (int) SystemSetting::get('loyalty.birthday_bonus', $branchId, 50)),
        ];
    }

    public function tiers(?int $branchId = null): array
    {
        $raw = SystemSetting::get('loyalty.tiers', $branchId, null);
        $tiers = is_array($raw) ? $raw : (is_string($raw) ? json_decode($raw, true) : null);
        if (! is_array($tiers) || $tiers === []) {
            $tiers = self::DEFAULT_TIERS;
        }

        return collect($tiers)
            ->filter(fn ($t) => isset($t['name'], $t['min']))
            ->map(fn ($t) => [
                'name' => (string) $t['name'],
                'min' => max(0, (int) $t['min']),
                'multiplier' => max(1, (float) ($t['multiplier'] ?? 1)),
            ])
            ->sortBy('min')
            ->values()
            ->all();
    }

    /** Current tier, next tier and progress (based on lifetime points earned). */
    public function tierFor(Customer $customer, ?int $branchId = null): array
    {
        $tiers = $this->tiers($branchId);
        $lifetime = (int) $customer->lifetime_points_earned;
        $enabled = (bool) SystemSetting::get('loyalty.tiers_enabled', $branchId, true);

        $current = $tiers[0];
        $next = null;
        foreach ($tiers as $i => $tier) {
            if ($lifetime >= $tier['min']) {
                $current = $tier;
                $next = $tiers[$i + 1] ?? null;
            }
        }

        $progress = $next
            ? (int) round((($lifetime - $current['min']) / max(1, $next['min'] - $current['min'])) * 100)
            : 100;

        return [
            'enabled' => $enabled,
            'name' => $current['name'],
            'multiplier' => $enabled ? $current['multiplier'] : 1.0,
            'next' => $next ? ['name' => $next['name'], 'min' => $next['min'], 'points_needed' => max(0, $next['min'] - $lifetime)] : null,
            'progress' => max(0, min(100, $progress)),
        ];
    }

    /**
     * Points for an amount: FLOOR(amount / increment) × points per increment, then the tier multiplier.
     * e.g. every ₱100 = 5 pts → ₱99 = 0, ₱250 = 10, ₱490 = 20.
     */
    public function pointsFor(float $eligibleAmount, ?int $branchId = null, float $multiplier = 1.0): int
    {
        $rules = $this->rules($branchId);
        $increments = (int) floor(round(max(0, $eligibleAmount), 2) / $rules['spend_increment']);

        return (int) floor($increments * $rules['points_per_increment'] * max(1, $multiplier));
    }

    /**
     * Share (0–1) of a cart that earns points: reward lines and lines in excluded categories do not.
     *
     * @param  array<int, array{product_id: int|null, total: float|int|string, is_reward?: bool}>  $lines
     */
    public function earnableShare(array $lines, ?int $branchId = null): float
    {
        $subtotal = (float) collect($lines)->sum(fn ($line) => (float) $line['total']);
        if ($subtotal <= 0) {
            return 0.0;
        }

        $excluded = $this->rules($branchId)['excluded_category_ids'];
        $excludedProductIds = $excluded === []
            ? []
            : Product::whereIn('id', collect($lines)->pluck('product_id')->filter()->unique())
                ->whereIn('category_id', $excluded)->pluck('id')->all();

        $earnable = (float) collect($lines)
            ->reject(fn ($line) => ! empty($line['is_reward']) || in_array($line['product_id'], $excludedProductIds, true))
            ->sum(fn ($line) => (float) $line['total']);

        return max(0.0, min(1.0, $earnable / $subtotal));
    }

    /**
     * @return array{points_to_redeem: int, discount: float, points_to_earn: int}
     */
    public function quote(Customer $customer, float $eligibleTotal, int $requestedPoints, ?int $branchId, string $channel = 'counter', float $earnableShare = 1.0): array
    {
        if (! $customer->loyalty_enabled || ! $this->enabled($branchId)) {
            return ['points_to_redeem' => 0, 'discount' => 0.0, 'points_to_earn' => 0];
        }

        $rules = $this->rules($branchId);
        $redeem = $rules['allow_peso_discount']
            ? max(0, min($requestedPoints, (int) $customer->loyalty_points, $rules['maximum_redeem']))
            : 0;

        if ($redeem > 0 && $redeem < $rules['minimum_redeem']) {
            throw ValidationException::withMessages(['loyalty_points' => "A minimum of {$rules['minimum_redeem']} points is required."]);
        }

        $redeem = min($redeem, (int) floor($eligibleTotal / $rules['peso_per_point']));
        $discount = round($redeem * $rules['peso_per_point'], 2);
        $multiplier = $this->tierFor($customer, $branchId)['multiplier'];
        $earn = in_array($channel, $rules['earn_channels'], true)
            ? $this->pointsFor(max(0, $eligibleTotal - $discount) * $earnableShare, $branchId, $multiplier)
            : 0;

        return ['points_to_redeem' => $redeem, 'discount' => $discount, 'points_to_earn' => $earn];
    }

    public function applyToSale(Sale $sale, Customer $customer, ?User $user, int $redeemed, int $earned): void
    {
        $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
        if ($redeemed > $customer->loyalty_points) {
            throw ValidationException::withMessages(['loyalty_points' => 'The customer does not have enough points.']);
        }

        if ($redeemed > 0) {
            $customer->decrement('loyalty_points', $redeemed);
            $customer->increment('lifetime_points_redeemed', $redeemed);
            $customer->refresh();
            $this->log($customer, $sale, $user, LoyaltyTransaction::TYPE_REDEEM, -$redeemed, "Redeemed on {$sale->receipt_number}");
        }

        $this->earn($sale, $customer, $user, $earned);
    }

    /** Award earned points (and a once-a-year birthday bonus) for a completed sale. */
    public function earn(Sale $sale, Customer $customer, ?User $user, int $earned): void
    {
        $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();

        if ($earned > 0) {
            $customer->increment('loyalty_points', $earned);
            $customer->increment('lifetime_points_earned', $earned);
            $customer->refresh();
            $this->log($customer, $sale, $user, LoyaltyTransaction::TYPE_EARN, $earned, "Earned on {$sale->receipt_number}", $this->ruleSnapshot($customer, $sale));
            $this->notifyEarned($customer, $sale, $earned, LoyaltyActivity::POINTS_EARNED);
        }

        $this->maybeAwardBirthdayBonus($sale, $customer, $user);
    }

    private function maybeAwardBirthdayBonus(Sale $sale, Customer $customer, ?User $user): void
    {
        $bonus = (int) SystemSetting::get('loyalty.birthday_bonus', $sale->branch_id, 50);
        if ($bonus <= 0 || ! $customer->birthday || ! $customer->loyalty_enabled || ! $this->enabled($sale->branch_id)) {
            return;
        }
        if ((int) $customer->birthday->month !== (int) now()->month) {
            return;
        }

        $alreadyThisYear = LoyaltyTransaction::where('customer_id', $customer->id)
            ->where('type', LoyaltyTransaction::TYPE_BONUS)
            ->whereYear('created_at', now()->year)
            ->exists();
        if ($alreadyThisYear) {
            return;
        }

        $customer->increment('loyalty_points', $bonus);
        $customer->increment('lifetime_points_earned', $bonus);
        $customer->refresh();
        $this->log($customer, $sale, $user, LoyaltyTransaction::TYPE_BONUS, $bonus, 'Happy birthday from '.SystemSetting::businessName($sale->branch_id).'!');
        $this->notifyEarned($customer, $sale, $bonus, LoyaltyActivity::BIRTHDAY_BONUS);
    }

    /**
     * Hold points for an online order at checkout so they cannot be spent twice.
     * The hold becomes the order's redemption when it completes, or is released on cancel.
     */
    public function reserveForOnlineOrder(Customer $customer, OnlineOrder $order, int $points): void
    {
        if ($points <= 0) {
            return;
        }

        $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
        if ($points > $customer->loyalty_points) {
            throw ValidationException::withMessages(['loyalty_points' => 'You do not have enough points.']);
        }

        $customer->decrement('loyalty_points', $points);
        $customer->increment('lifetime_points_redeemed', $points);
        $customer->refresh();

        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $order->branch_id, 'sale_id' => null, 'user_id' => null,
            'type' => LoyaltyTransaction::TYPE_REDEEM, 'points' => -$points, 'balance_after' => $customer->loyalty_points,
            'reason' => $this->reservationReason($order),
        ]);
    }

    /** Return held points to the customer when an online order is cancelled or declined. Idempotent. */
    public function releaseOnlineReservation(OnlineOrder $order): void
    {
        $points = (int) $order->loyalty_points_redeemed;
        if ($points <= 0) {
            return;
        }

        $releaseReason = "Points returned — {$order->order_number} was ".OnlineOrder::statusLabel($order->status);
        $alreadyReleased = LoyaltyTransaction::where('customer_id', $order->customer_id)
            ->where('type', LoyaltyTransaction::TYPE_REVERSAL)
            ->where('reason', 'like', "Points returned — {$order->order_number}%")
            ->exists();
        if ($alreadyReleased) {
            return;
        }

        $customer = Customer::whereKey($order->customer_id)->lockForUpdate()->firstOrFail();
        $customer->increment('loyalty_points', $points);
        $customer->decrement('lifetime_points_redeemed', min($points, (int) $customer->lifetime_points_redeemed));
        $customer->refresh();

        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $order->branch_id, 'sale_id' => null, 'user_id' => null,
            'type' => LoyaltyTransaction::TYPE_REVERSAL, 'points' => $points, 'balance_after' => $customer->loyalty_points,
            'reason' => $releaseReason,
        ]);
    }

    /** Link an online order's held points to the sale created when the order completes. */
    public function attachReservationToSale(OnlineOrder $order, Sale $sale): void
    {
        LoyaltyTransaction::where('customer_id', $order->customer_id)
            ->whereNull('sale_id')
            ->where('type', LoyaltyTransaction::TYPE_REDEEM)
            ->where('reason', $this->reservationReason($order))
            ->update(['sale_id' => $sale->id, 'reason' => "Redeemed on {$sale->receipt_number} ({$order->order_number})"]);
    }

    public function reverseSale(Sale $sale, User $user): void
    {
        if (! $sale->customer_id || LoyaltyTransaction::where('sale_id', $sale->id)->where('type', LoyaltyTransaction::TYPE_REVERSAL)->exists()) {
            return;
        }

        $customer = Customer::whereKey($sale->customer_id)->lockForUpdate()->first();
        if (! $customer) {
            return;
        }

        // Undo exactly what this sale did: redeemed points come back, earned/bonus points go away.
        $applied = (int) LoyaltyTransaction::where('sale_id', $sale->id)
            ->where('type', '!=', LoyaltyTransaction::TYPE_REVERSAL)
            ->sum('points');
        $net = -$applied;
        if ($net === 0) {
            return;
        }

        $newBalance = max(0, (int) $customer->loyalty_points + $net);
        $customer->update(['loyalty_points' => $newBalance]);
        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
            'sale_id' => $sale->id, 'user_id' => $user->id, 'type' => LoyaltyTransaction::TYPE_REVERSAL,
            'points' => $net, 'balance_after' => $newBalance,
            'reason' => "Sale voided: {$sale->receipt_number}",
        ]);
    }

    /**
     * Expire the balance of members with no earning activity for the configured number of months.
     * Returns how many members lost points. Safe to run repeatedly (an emptied wallet is skipped).
     */
    public function expireInactivePoints(): int
    {
        $months = $this->rules()['points_expiry_months'];
        if ($months <= 0) {
            return 0;
        }

        $cutoff = now()->subMonths($months);
        $expired = 0;

        Customer::where('loyalty_points', '>', 0)
            ->whereDoesntHave('loyaltyTransactions', fn ($q) => $q
                ->whereIn('type', [LoyaltyTransaction::TYPE_EARN, LoyaltyTransaction::TYPE_BONUS, LoyaltyTransaction::TYPE_ADJUSTMENT])
                ->where('created_at', '>=', $cutoff))
            ->where('created_at', '<', $cutoff)
            ->pluck('id')
            ->each(function (int $customerId) use ($months, &$expired) {
                DB::transaction(function () use ($customerId, $months, &$expired) {
                    $customer = Customer::whereKey($customerId)->lockForUpdate()->first();
                    $points = (int) $customer?->loyalty_points;
                    if ($points <= 0) {
                        return;
                    }

                    $customer->update(['loyalty_points' => 0]);
                    LoyaltyTransaction::create([
                        'customer_id' => $customer->id, 'type' => LoyaltyTransaction::TYPE_EXPIRE,
                        'points' => -$points, 'balance_after' => 0,
                        'reason' => "Points expired after {$months} months without activity",
                    ]);
                    $customer->notify(new LoyaltyActivity(
                        kind: LoyaltyActivity::POINTS_EXPIRED,
                        title: "{$points} points expired",
                        body: "Points expire after {$months} months without a purchase. Order again to start earning.",
                        points: -$points,
                        balance: 0,
                    ));
                    $expired++;
                });
            });

        return $expired;
    }

    private function reservationReason(OnlineOrder $order): string
    {
        return "Held for online order {$order->order_number}";
    }

    /**
     * The earning rule in force when points were issued, kept on the ledger row so a
     * later rule change never alters how an old transaction was calculated.
     *
     * @return array<string, mixed>
     */
    private function ruleSnapshot(Customer $customer, Sale $sale): array
    {
        $rules = $this->rules($sale->branch_id);

        return [
            'spend_increment' => $rules['spend_increment'],
            'points_per_increment' => $rules['points_per_increment'],
            'tier_multiplier' => $this->tierFor($customer, $sale->branch_id)['multiplier'],
            'excluded_category_ids' => $rules['excluded_category_ids'],
            'sale_total' => (float) $sale->total,
            'channel' => $sale->channel,
        ];
    }

    /** "You earned 20 points" in the customer's notification history. */
    private function notifyEarned(Customer $customer, Sale $sale, int $points, string $kind): void
    {
        $isBirthday = $kind === LoyaltyActivity::BIRTHDAY_BONUS;
        $branchName = $sale->branch?->name;

        $customer->notify(new LoyaltyActivity(
            kind: $kind,
            title: $isBirthday ? "Happy birthday! +{$points} points" : "You earned {$points} points",
            body: $isBirthday
                ? 'A birthday gift from '.SystemSetting::businessName($sale->branch_id).'. Enjoy!'
                : 'From your ₱'.number_format((float) $sale->total, 2)." order {$sale->receipt_number}".($branchName ? " at {$branchName}" : '').'.',
            points: $points,
            balance: (int) $customer->loyalty_points,
            reference: $sale->receipt_number,
        ));
    }

    /**
     * @param  array<string, mixed>|null  $meta
     */
    private function log(Customer $customer, Sale $sale, ?User $user, string $type, int $points, string $reason, ?array $meta = null): void
    {
        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
            'sale_id' => $sale->id, 'user_id' => $user?->id, 'type' => $type,
            'points' => $points, 'balance_after' => $customer->loyalty_points,
            'reason' => $reason, 'meta' => $meta,
        ]);
    }
}
