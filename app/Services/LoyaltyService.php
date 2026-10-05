<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Boundary Rewards — the single points engine for counter, dine-in and online sales.
 *
 * Settings (loyalty.*): enabled, spend_per_point, peso_per_point, minimum_redeem,
 * maximum_redeem, tiers_enabled, tiers (JSON), birthday_bonus.
 */
class LoyaltyService
{
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
        return [
            'enabled' => $this->enabled($branchId),
            'spend_per_point' => max(1, (float) SystemSetting::get('loyalty.spend_per_point', $branchId, 100)),
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

    public function quote(Customer $customer, float $eligibleTotal, int $requestedPoints, ?int $branchId): array
    {
        if (! $customer->loyalty_enabled || ! $this->enabled($branchId)) {
            return ['points_to_redeem' => 0, 'discount' => 0.0, 'points_to_earn' => 0];
        }

        $rules = $this->rules($branchId);
        $redeem = max(0, min($requestedPoints, (int) $customer->loyalty_points, $rules['maximum_redeem']));

        if ($redeem > 0 && $redeem < $rules['minimum_redeem']) {
            throw ValidationException::withMessages(['loyalty_points' => "A minimum of {$rules['minimum_redeem']} points is required."]);
        }

        $redeem = min($redeem, (int) floor($eligibleTotal / $rules['peso_per_point']));
        $discount = round($redeem * $rules['peso_per_point'], 2);
        $multiplier = $this->tierFor($customer, $branchId)['multiplier'];
        $earn = (int) floor((max(0, $eligibleTotal - $discount) / $rules['spend_per_point']) * $multiplier);

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
            $this->log($customer, $sale, $user, LoyaltyTransaction::TYPE_EARN, $earned, "Earned on {$sale->receipt_number}");
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
        $this->log($customer, $sale, $user, LoyaltyTransaction::TYPE_BONUS, $bonus, 'Happy birthday from Boundary Cafe!');
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

    private function reservationReason(OnlineOrder $order): string
    {
        return "Held for online order {$order->order_number}";
    }

    private function log(Customer $customer, Sale $sale, ?User $user, string $type, int $points, string $reason): void
    {
        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
            'sale_id' => $sale->id, 'user_id' => $user?->id, 'type' => $type,
            'points' => $points, 'balance_after' => $customer->loyalty_points,
            'reason' => $reason,
        ]);
    }
}
