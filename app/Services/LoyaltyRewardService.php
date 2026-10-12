<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\LoyaltyReward;
use App\Models\LoyaltyRewardClaim;
use App\Models\LoyaltyRewardClaimItem;
use App\Models\LoyaltyTransaction;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use App\Notifications\LoyaltyActivity;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Product rewards bought with points and claimed in-store.
 *
 * 1. The customer picks rewards in the app and taps Claim → the points are held
 *    (wallet − N, reserved + N) and a single-use, expiring QR is issued.
 * 2. The cashier scans the QR at any branch → the reward lines go on the sale at ₱0.
 * 3. When the sale completes the claim is redeemed (stock deducted, held points spent).
 *    Cancelled or expired claims give the points back; voiding the sale gives them back too.
 *
 * Every wallet change takes a row lock on the customer, and redemption locks the claim,
 * so a QR cannot be used twice and points cannot be spent twice or go negative.
 */
class LoyaltyRewardService
{
    /** Claims a customer may hold at once. */
    public const MAX_OPEN_CLAIMS = 3;

    public const MAX_QUANTITY = 20;

    /** Unambiguous characters for the code printed under the QR (no 0/O, 1/I). */
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(private LoyaltyService $loyalty) {}

    /** @return Collection<int, LoyaltyReward> */
    public function catalog(?int $branchId = null): Collection
    {
        return LoyaltyReward::active()
            ->with(['product.category:id,name', 'product.stocks', 'variant'])
            ->orderBy('sort_order')->orderBy('points_cost')
            ->get()
            ->filter(fn (LoyaltyReward $reward) => $reward->availableAt($branchId))
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    public function rewardToFrontend(LoyaltyReward $reward, ?int $branchId = null): array
    {
        $product = $reward->product;
        $stock = $product?->stocks->firstWhere('branch_id', $branchId) ?? $product?->stocks->first();

        return [
            'id' => $reward->id,
            'product_id' => $reward->product_id,
            'variant_id' => $reward->product_variant_id,
            'name' => $reward->displayName(),
            'category' => $product?->category?->name,
            'image' => Product::resolveImageUrl($product?->product_img),
            'points_cost' => $reward->points_cost,
            'max_per_claim' => $reward->max_per_claim,
            'retail_price' => round((float) ($stock?->price ?? 0) + (float) ($reward->variant?->extra_price ?? 0), 2),
            'branch_ids' => $reward->branch_ids ? array_map('intval', $reward->branch_ids) : null,
            'is_active' => $reward->is_active,
        ];
    }

    /**
     * Hold the points for the chosen rewards and issue a claim QR.
     *
     * @param  array<int, array{reward_id: int, quantity: int}>  $items
     */
    public function claim(Customer $customer, array $items): LoyaltyRewardClaim
    {
        $this->expireStale($customer);

        return DB::transaction(function () use ($customer, $items) {
            $customer = Customer::whereKey($customer->id)->lockForUpdate()->firstOrFail();
            if (! $customer->is_active || ! $customer->loyalty_enabled || ! $this->loyalty->enabled()) {
                throw ValidationException::withMessages(['items' => 'Rewards are not available on this account right now.']);
            }

            $openClaims = LoyaltyRewardClaim::where('customer_id', $customer->id)->reserved()->count();
            if ($openClaims >= self::MAX_OPEN_CLAIMS) {
                throw ValidationException::withMessages(['items' => 'You already have '.self::MAX_OPEN_CLAIMS.' rewards waiting. Claim or cancel one first.']);
            }

            $quantities = collect($items)
                ->groupBy(fn ($item) => (int) $item['reward_id'])
                ->map(fn ($group) => (int) $group->sum('quantity'))
                ->filter(fn (int $quantity) => $quantity > 0);
            if ($quantities->isEmpty()) {
                throw ValidationException::withMessages(['items' => 'Choose at least one reward.']);
            }

            $rewards = LoyaltyReward::active()->with(['product.stocks', 'variant'])->whereIn('id', $quantities->keys())->get()->keyBy('id');
            $lines = [];
            $total = 0;
            foreach ($quantities as $rewardId => $quantity) {
                $reward = $rewards->get($rewardId);
                if (! $reward) {
                    throw ValidationException::withMessages(['items' => 'One of the rewards is no longer available. Please refresh.']);
                }
                $limit = min(self::MAX_QUANTITY, $reward->max_per_claim ?: self::MAX_QUANTITY);
                if ($quantity > $limit) {
                    throw ValidationException::withMessages(['items' => "You can claim up to {$limit} {$reward->displayName()} at a time."]);
                }
                $lines[] = [$reward, $quantity, $reward->points_cost * $quantity];
                $total += $reward->points_cost * $quantity;
            }

            if ($total > $customer->loyalty_points) {
                $short = $total - $customer->loyalty_points;
                throw ValidationException::withMessages(['items' => "You need {$short} more points for this. You have {$customer->loyalty_points}."]);
            }

            $token = Str::random(48);
            $claim = LoyaltyRewardClaim::create([
                'customer_id' => $customer->id,
                'code' => $this->uniqueCode(),
                'token_hash' => LoyaltyRewardClaim::hashToken($token),
                'token' => $token,
                'status' => LoyaltyRewardClaim::STATUS_RESERVED,
                'points' => $total,
                'expires_at' => now()->addMinutes($this->loyalty->rules()['claim_expiry_minutes']),
            ]);

            foreach ($lines as [$reward, $quantity, $points]) {
                $claim->items()->create([
                    'loyalty_reward_id' => $reward->id,
                    'product_id' => $reward->product_id,
                    'product_variant_id' => $reward->product_variant_id,
                    'product_name' => $reward->displayName(),
                    'quantity' => $quantity,
                    'points_each' => $reward->points_cost,
                    'points_total' => $points,
                ]);
            }

            $customer->update([
                'loyalty_points' => $customer->loyalty_points - $total,
                'reserved_points' => $customer->reserved_points + $total,
            ]);

            LoyaltyTransaction::create([
                'customer_id' => $customer->id,
                'reward_claim_id' => $claim->id,
                'type' => LoyaltyTransaction::TYPE_RESERVE,
                'points' => -$total,
                'balance_after' => $customer->loyalty_points,
                'reason' => "Held for reward {$claim->code}",
            ]);

            return $claim->load('items');
        });
    }

    /** Customer or staff cancels a waiting claim; the points come back. */
    public function cancel(LoyaltyRewardClaim $claim, ?User $user = null): bool
    {
        return $this->release($claim, LoyaltyRewardClaim::STATUS_CANCELLED, $user);
    }

    /** Release every reserved claim past its expiry (optionally for one customer). Returns how many expired. */
    public function expireStale(?Customer $customer = null): int
    {
        return LoyaltyRewardClaim::reserved()
            ->where('expires_at', '<=', now())
            ->when($customer, fn ($q) => $q->where('customer_id', $customer->id))
            ->get()
            ->filter(fn (LoyaltyRewardClaim $claim) => $this->release($claim, LoyaltyRewardClaim::STATUS_EXPIRED))
            ->count();
    }

    /**
     * What the cashier sees after scanning a reward QR (or typing the code under it).
     * Expired claims are released on the spot.
     */
    public function findForRedemption(string $scanned, int $branchId): LoyaltyRewardClaim
    {
        $claim = $this->resolve($scanned);
        if ($claim->isReserved() && $claim->isPastExpiry()) {
            $this->release($claim, LoyaltyRewardClaim::STATUS_EXPIRED);
            $claim->refresh();
        }

        $this->assertRedeemable($claim, $branchId);

        return $claim->load(['items.product.stocks', 'customer']);
    }

    /**
     * @return array<string, mixed>
     */
    public function claimToPos(LoyaltyRewardClaim $claim, int $branchId): array
    {
        $claim->loadMissing(['items.product.stocks', 'customer']);
        $customer = $claim->customer;

        return [
            'code' => $claim->code,
            'points' => $claim->points,
            'expires_at' => $claim->expires_at->toIso8601String(),
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'customer_number' => $customer->customer_number,
                'contact_number' => $customer->contact_number,
                'loyalty_points' => (int) $customer->loyalty_points,
            ],
            'items' => $claim->items->map(fn (LoyaltyRewardClaimItem $item) => [
                'product_id' => $item->product_id,
                'variant_id' => $item->product_variant_id,
                'name' => $item->product_name,
                'quantity' => $item->quantity,
                'points' => $item->points_total,
                'image' => Product::resolveImageUrl($item->product?->product_img),
                'retail_price' => (float) ($item->product?->stocks->firstWhere('branch_id', $branchId)?->price ?? 0),
            ])->values(),
        ];
    }

    /** Lock a claim for checkout (inside SaleService's transaction) and check it can still be used. */
    public function lockForCheckout(string $code, int $branchId): LoyaltyRewardClaim
    {
        $claim = LoyaltyRewardClaim::with('items.reward')
            ->where('code', strtoupper(trim($code)))
            ->lockForUpdate()
            ->first();
        if (! $claim) {
            throw new RuntimeException('The reward claim was not found. Scan the QR again.');
        }
        if ($claim->isReserved() && $claim->isPastExpiry()) {
            throw new RuntimeException("Reward {$claim->code} has expired. Ask the customer to claim it again in the app.");
        }

        try {
            $this->assertRedeemable($claim, $branchId);
        } catch (ValidationException $e) {
            throw new RuntimeException(collect($e->errors())->flatten()->first());
        }

        return $claim;
    }

    /** Finalise a claim once its sale is saved: the held points are spent for good. */
    public function markRedeemed(LoyaltyRewardClaim $claim, Sale $sale, User $user, float $retailValue, float $costValue): void
    {
        $claim->update([
            'status' => LoyaltyRewardClaim::STATUS_REDEEMED,
            'branch_id' => $sale->branch_id,
            'sale_id' => $sale->id,
            'redeemed_by' => $user->id,
            'redeemed_at' => now(),
            'closed_at' => now(),
            'retail_value' => $retailValue,
            'cost_value' => $costValue,
        ]);

        $customer = Customer::whereKey($claim->customer_id)->lockForUpdate()->firstOrFail();
        $customer->update([
            'reserved_points' => max(0, $customer->reserved_points - $claim->points),
            'lifetime_points_redeemed' => $customer->lifetime_points_redeemed + $claim->points,
        ]);

        // The hold becomes the redemption — the wallet already moved when the points were reserved.
        LoyaltyTransaction::where('reward_claim_id', $claim->id)
            ->where('type', LoyaltyTransaction::TYPE_RESERVE)
            ->update([
                'type' => LoyaltyTransaction::TYPE_REDEEM,
                'branch_id' => $sale->branch_id,
                'user_id' => $user->id,
                'reason' => "Claimed {$claim->summary()} ({$claim->code}) on {$sale->receipt_number}",
            ]);

        $customer->notify(new LoyaltyActivity(
            kind: LoyaltyActivity::REWARD_REDEEMED,
            title: 'Reward claimed: '.$claim->summary(),
            body: "{$claim->points} points used at ".($sale->branch?->name ?? 'the café').'. Enjoy!',
            points: -$claim->points,
            balance: (int) $customer->loyalty_points,
            reference: $claim->code,
        ));
    }

    /** A voided sale gives back the points of the reward it fulfilled (its stock is restored by the void). */
    public function reverseForSale(Sale $sale, User $user): void
    {
        $claim = LoyaltyRewardClaim::with('items')
            ->where('sale_id', $sale->id)
            ->where('status', LoyaltyRewardClaim::STATUS_REDEEMED)
            ->lockForUpdate()
            ->first();
        if (! $claim) {
            return;
        }

        $customer = Customer::whereKey($claim->customer_id)->lockForUpdate()->firstOrFail();
        $customer->update([
            'loyalty_points' => $customer->loyalty_points + $claim->points,
            'lifetime_points_redeemed' => max(0, $customer->lifetime_points_redeemed - $claim->points),
        ]);
        $claim->update(['status' => LoyaltyRewardClaim::STATUS_VOIDED, 'closed_at' => now()]);

        LoyaltyTransaction::create([
            'customer_id' => $customer->id,
            'branch_id' => $sale->branch_id,
            'reward_claim_id' => $claim->id,
            'user_id' => $user->id,
            'type' => LoyaltyTransaction::TYPE_RELEASE,
            'points' => $claim->points,
            'balance_after' => $customer->loyalty_points,
            'reason' => "Points returned — {$sale->receipt_number} was voided",
        ]);

        $customer->notify(new LoyaltyActivity(
            kind: LoyaltyActivity::POINTS_RETURNED,
            title: "{$claim->points} points returned",
            body: "Your reward {$claim->code} ({$claim->summary()}) was cancelled at the counter.",
            points: $claim->points,
            balance: (int) $customer->loyalty_points,
            reference: $claim->code,
        ));
    }

    /**
     * @return array<string, mixed>
     */
    public function claimToCustomer(LoyaltyRewardClaim $claim): array
    {
        $claim->loadMissing(['items', 'branch:id,name']);

        return [
            'id' => $claim->id,
            'code' => $claim->code,
            'status' => $claim->status,
            'status_label' => LoyaltyRewardClaim::statusLabel($claim->status),
            'points' => $claim->points,
            'summary' => $claim->summary(),
            'items' => $claim->items->map(fn (LoyaltyRewardClaimItem $item) => [
                'name' => $item->product_name,
                'quantity' => $item->quantity,
                'points' => $item->points_total,
            ])->values(),
            'qr' => $claim->isReserved() ? $claim->qrPayload() : null,
            'expires_at' => $claim->expires_at?->toIso8601String(),
            'redeemed_at' => $claim->redeemed_at?->toIso8601String(),
            'branch' => $claim->branch?->name,
            'created_at' => $claim->created_at?->toIso8601String(),
        ];
    }

    /** Return a reserved claim's points to the wallet and close it. Idempotent. */
    private function release(LoyaltyRewardClaim $claim, string $status, ?User $user = null): bool
    {
        return DB::transaction(function () use ($claim, $status, $user) {
            $claim = LoyaltyRewardClaim::with('items')->whereKey($claim->id)->lockForUpdate()->first();
            if (! $claim?->isReserved()) {
                return false;
            }

            $customer = Customer::whereKey($claim->customer_id)->lockForUpdate()->firstOrFail();
            $customer->update([
                'loyalty_points' => $customer->loyalty_points + $claim->points,
                'reserved_points' => max(0, $customer->reserved_points - $claim->points),
            ]);
            $claim->update(['status' => $status, 'closed_at' => now()]);

            LoyaltyTransaction::create([
                'customer_id' => $customer->id,
                'reward_claim_id' => $claim->id,
                'user_id' => $user?->id,
                'type' => LoyaltyTransaction::TYPE_RELEASE,
                'points' => $claim->points,
                'balance_after' => $customer->loyalty_points,
                'reason' => $status === LoyaltyRewardClaim::STATUS_EXPIRED
                    ? "Reward {$claim->code} expired — points returned"
                    : "Reward {$claim->code} cancelled — points returned",
            ]);

            if ($status === LoyaltyRewardClaim::STATUS_EXPIRED) {
                $customer->notify(new LoyaltyActivity(
                    kind: LoyaltyActivity::CLAIM_RELEASED,
                    title: 'Reward QR expired',
                    body: "{$claim->summary()} was not claimed in time, so your {$claim->points} points are back.",
                    points: $claim->points,
                    balance: (int) $customer->loyalty_points,
                    reference: $claim->code,
                ));
            }

            return true;
        });
    }

    private function resolve(string $scanned): LoyaltyRewardClaim
    {
        $value = trim($scanned);
        $claim = str_starts_with($value, LoyaltyRewardClaim::QR_PREFIX)
            ? LoyaltyRewardClaim::where('token_hash', LoyaltyRewardClaim::hashToken(substr($value, strlen(LoyaltyRewardClaim::QR_PREFIX))))->first()
            : LoyaltyRewardClaim::where('code', strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value)))->first();

        if (! $claim) {
            throw ValidationException::withMessages(['code' => 'This reward QR is not valid.']);
        }

        return $claim;
    }

    private function assertRedeemable(LoyaltyRewardClaim $claim, int $branchId): void
    {
        $message = match ($claim->status) {
            LoyaltyRewardClaim::STATUS_RESERVED => null,
            LoyaltyRewardClaim::STATUS_REDEEMED => "Reward {$claim->code} was already claimed".($claim->redeemed_at ? ' on '.$claim->redeemed_at->timezone(config('app.timezone'))->format('M j, g:i A') : '').'.',
            LoyaltyRewardClaim::STATUS_EXPIRED => "Reward {$claim->code} has expired. The points went back to the customer — they can claim again in the app.",
            LoyaltyRewardClaim::STATUS_CANCELLED => "Reward {$claim->code} was cancelled.",
            default => "Reward {$claim->code} can no longer be used.",
        };
        if ($message) {
            throw ValidationException::withMessages(['code' => $message]);
        }

        $claim->loadMissing('items.reward');
        foreach ($claim->items as $item) {
            if ($item->reward && ! $item->reward->availableAt($branchId)) {
                throw ValidationException::withMessages(['code' => "{$item->product_name} cannot be claimed at this branch."]);
            }
        }
    }

    private function uniqueCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            }
        } while (LoyaltyRewardClaim::where('code', $code)->exists());

        return $code;
    }
}
