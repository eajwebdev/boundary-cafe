<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\LoyaltyRewardClaim;
use App\Models\LoyaltyTransaction;
use App\Models\SaleItem;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Loyalty reports (menu 44): points issued / redeemed / expired, rewards given per branch,
 * most redeemed items with their retail value and cost, and the points ledger.
 *
 * Reward sales carry ₱0 in `sales.total`, so they never inflate paid sales or cash; their menu
 * value (retail) and cost are reported here for accounting (liability / marketing allocation).
 */
class LoyaltyReportController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ]);
        $from = CarbonImmutable::parse($filters['from'] ?? now()->startOfMonth())->startOfDay();
        $to = CarbonImmutable::parse($filters['to'] ?? now())->endOfDay();
        $branchId = $filters['branch_id'] ?? null;

        $ledger = fn (): Builder => LoyaltyTransaction::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));
        $redeemedClaims = fn (): Builder => LoyaltyRewardClaim::query()
            ->where('status', LoyaltyRewardClaim::STATUS_REDEEMED)
            ->whereBetween('redeemed_at', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $points = [
            'issued' => (int) $ledger()->whereIn('type', LoyaltyTransaction::ISSUED_TYPES)->sum('points'),
            'adjusted' => (int) $ledger()->where('type', LoyaltyTransaction::TYPE_ADJUSTMENT)->sum('points'),
            'redeemed_rewards' => (int) $redeemedClaims()->sum('points'),
            'redeemed_discount' => (int) abs($ledger()->where('type', LoyaltyTransaction::TYPE_REDEEM)->whereNull('reward_claim_id')->sum('points')),
            'expired' => (int) abs($ledger()->where('type', LoyaltyTransaction::TYPE_EXPIRE)->sum('points')),
            'reserved_now' => (int) Customer::sum('reserved_points'),
            'outstanding_now' => (int) Customer::where('loyalty_enabled', true)->sum('loyalty_points'),
        ];

        $rewards = [
            'claims' => $redeemedClaims()->count(),
            'retail_value' => round((float) $redeemedClaims()->sum('retail_value'), 2),
            'cost_value' => round((float) $redeemedClaims()->sum('cost_value'), 2),
            'expired_claims' => LoyaltyRewardClaim::where('status', LoyaltyRewardClaim::STATUS_EXPIRED)->whereBetween('closed_at', [$from, $to])->count(),
        ];

        $branches = Branch::orderBy('name')->get(['id', 'name']);
        $issuedByBranch = $ledger()->whereIn('type', LoyaltyTransaction::ISSUED_TYPES)
            ->selectRaw('branch_id, SUM(points) as points')->groupBy('branch_id')->pluck('points', 'branch_id');
        $claimsByBranch = $redeemedClaims()
            ->selectRaw('branch_id, COUNT(*) as claims, SUM(points) as points, SUM(retail_value) as retail, SUM(cost_value) as cost')
            ->groupBy('branch_id')->get()->keyBy('branch_id');
        $byBranch = $branches
            ->filter(fn ($branch) => ! $branchId || $branch->id === (int) $branchId)
            ->map(fn ($branch) => [
                'branch' => $branch->name,
                'points_issued' => (int) ($issuedByBranch[$branch->id] ?? 0),
                'claims' => (int) ($claimsByBranch[$branch->id]->claims ?? 0),
                'points_redeemed' => (int) ($claimsByBranch[$branch->id]->points ?? 0),
                'retail_value' => round((float) ($claimsByBranch[$branch->id]->retail ?? 0), 2),
                'cost_value' => round((float) ($claimsByBranch[$branch->id]->cost ?? 0), 2),
            ])->values();

        $topItems = SaleItem::query()
            ->where('is_reward', true)
            ->whereHas('sale', fn ($q) => $q->where('status', 'completed')
                ->whereBetween('created_at', [$from, $to])
                ->when($branchId, fn ($s) => $s->where('branch_id', $branchId)))
            ->with('product:id,name')
            ->selectRaw('product_id, SUM(quantity) as quantity, SUM(reward_points) as points, SUM(retail_price * quantity) as retail, SUM(unit_cost * quantity) as cost')
            ->groupBy('product_id')
            ->orderByDesc('quantity')
            ->limit(15)
            ->get()
            ->map(fn (SaleItem $item) => [
                'product' => $item->product?->name ?? '(deleted)',
                'quantity' => (float) $item->quantity,
                'points' => (int) $item->points,
                'retail_value' => round((float) $item->retail, 2),
                'cost_value' => round((float) $item->cost, 2),
            ]);

        $recentLedger = $ledger()->with(['customer:id,name,customer_number', 'branch:id,name', 'rewardClaim:id,code'])
            ->latest()->limit(50)->get()
            ->map(fn (LoyaltyTransaction $t) => [
                'id' => $t->id,
                'type' => $t->type,
                'points' => (int) $t->points,
                'balance_after' => (int) $t->balance_after,
                'reason' => $t->reason,
                'customer' => $t->customer ? ['id' => $t->customer->id, 'name' => $t->customer->name, 'customer_number' => $t->customer->customer_number] : null,
                'branch' => $t->branch?->name,
                'created_at' => $t->created_at?->toIso8601String(),
            ]);

        $wallets = Customer::where('loyalty_enabled', true)
            ->where(fn ($q) => $q->where('loyalty_points', '>', 0)->orWhere('reserved_points', '>', 0))
            ->orderByDesc('loyalty_points')->limit(25)
            ->get(['id', 'name', 'customer_number', 'loyalty_points', 'reserved_points', 'lifetime_points_earned', 'lifetime_points_redeemed'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'customer_number' => $c->customer_number,
                'points' => (int) $c->loyalty_points,
                'reserved' => (int) $c->reserved_points,
                'earned' => (int) $c->lifetime_points_earned,
                'redeemed' => (int) $c->lifetime_points_redeemed,
            ]);

        return Inertia::render('LoyaltyProgram/Reports', [
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'branch_id' => $branchId],
            'branches' => $branches,
            'points' => $points,
            'rewards' => $rewards,
            'by_branch' => $byBranch,
            'top_items' => $topItems,
            'ledger' => $recentLedger,
            'wallets' => $wallets,
        ]);
    }
}
