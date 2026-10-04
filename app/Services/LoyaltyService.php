<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class LoyaltyService
{
    public function quote(Customer $customer, float $eligibleTotal, int $requestedPoints, ?int $branchId): array
    {
        if (! $customer->loyalty_enabled || ! (bool) SystemSetting::get('loyalty.enabled', $branchId, true)) {
            return ['points_to_redeem' => 0, 'discount' => 0.0, 'points_to_earn' => 0];
        }

        $minimum = max(1, (int) SystemSetting::get('loyalty.minimum_redeem', $branchId, 10));
        $pointValue = max(0.01, (float) SystemSetting::get('loyalty.peso_per_point', $branchId, 1));
        $maximum = max(0, (int) SystemSetting::get('loyalty.maximum_redeem', $branchId, 500));
        $redeem = max(0, min($requestedPoints, (int) $customer->loyalty_points, $maximum));

        if ($redeem > 0 && $redeem < $minimum) {
            throw ValidationException::withMessages(['loyalty_points' => "A minimum of {$minimum} points is required."]);
        }

        $redeem = min($redeem, (int) floor($eligibleTotal / $pointValue));
        $discount = round($redeem * $pointValue, 2);
        $spendPerPoint = max(1, (float) SystemSetting::get('loyalty.spend_per_point', $branchId, 100));
        $earn = (int) floor(max(0, $eligibleTotal - $discount) / $spendPerPoint);

        return ['points_to_redeem' => $redeem, 'discount' => $discount, 'points_to_earn' => $earn];
    }

    public function applyToSale(Sale $sale, Customer $customer, User $user, int $redeemed, int $earned): void
    {
        $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
        if ($redeemed > $customer->loyalty_points) {
            throw ValidationException::withMessages(['loyalty_points' => 'The customer does not have enough points.']);
        }

        if ($redeemed > 0) {
            $customer->decrement('loyalty_points', $redeemed);
            $customer->increment('lifetime_points_redeemed', $redeemed);
            $customer->refresh();
            LoyaltyTransaction::create([
                'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
                'sale_id' => $sale->id, 'user_id' => $user->id, 'type' => LoyaltyTransaction::TYPE_REDEEM,
                'points' => -$redeemed, 'balance_after' => $customer->loyalty_points,
                'reason' => "Redeemed on {$sale->receipt_number}",
            ]);
        }

        if ($earned > 0) {
            $customer->increment('loyalty_points', $earned);
            $customer->increment('lifetime_points_earned', $earned);
            $customer->refresh();
            LoyaltyTransaction::create([
                'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
                'sale_id' => $sale->id, 'user_id' => $user->id, 'type' => LoyaltyTransaction::TYPE_EARN,
                'points' => $earned, 'balance_after' => $customer->loyalty_points,
                'reason' => "Earned on {$sale->receipt_number}",
            ]);
        }
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

        $net = (int) $sale->loyalty_points_redeemed - (int) $sale->loyalty_points_earned;
        $newBalance = max(0, (int) $customer->loyalty_points + $net);
        $customer->update(['loyalty_points' => $newBalance]);
        LoyaltyTransaction::create([
            'customer_id' => $customer->id, 'branch_id' => $sale->branch_id,
            'sale_id' => $sale->id, 'user_id' => $user->id, 'type' => LoyaltyTransaction::TYPE_REVERSAL,
            'points' => $net, 'balance_after' => $newBalance,
            'reason' => "Sale voided: {$sale->receipt_number}",
        ]);
    }
}
