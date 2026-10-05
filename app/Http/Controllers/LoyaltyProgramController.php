<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use App\Models\SystemSetting;
use App\Services\LoyaltyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Boundary Rewards programme settings and overview (menu 44).
 */
class LoyaltyProgramController extends Controller
{
    public function __construct(private LoyaltyService $loyalty) {}

    public function index(): Response
    {
        $rules = $this->loyalty->rules();
        $since = now()->subDays(30);

        $members = Customer::where('loyalty_enabled', true)->get(['id', 'name', 'customer_number', 'loyalty_points', 'lifetime_points_earned']);
        $tiers = collect($rules['tiers']);
        $tierCounts = $tiers->mapWithKeys(fn ($t) => [$t['name'] => 0])->all();
        foreach ($members as $m) {
            $tier = $tiers->filter(fn ($t) => (int) $m->lifetime_points_earned >= $t['min'])->last() ?? $tiers->first();
            if ($tier) {
                $tierCounts[$tier['name']]++;
            }
        }

        $outstanding = (int) $members->sum('loyalty_points');

        return Inertia::render('LoyaltyProgram/Index', [
            'rules' => $rules,
            'stats' => [
                'members' => $members->count(),
                'online_accounts' => Customer::whereNotNull('password')->count(),
                'outstanding_points' => $outstanding,
                'liability' => round($outstanding * $rules['peso_per_point'], 2),
                'issued_30d' => (int) LoyaltyTransaction::whereIn('type', [LoyaltyTransaction::TYPE_EARN, LoyaltyTransaction::TYPE_BONUS])->where('created_at', '>=', $since)->sum('points'),
                'redeemed_30d' => (int) abs(LoyaltyTransaction::where('type', LoyaltyTransaction::TYPE_REDEEM)->where('created_at', '>=', $since)->sum('points')),
                'tier_counts' => $tierCounts,
            ],
            'top_members' => $members->sortByDesc('lifetime_points_earned')->take(10)->map(fn ($m) => [
                'id' => $m->id,
                'name' => $m->name,
                'customer_number' => $m->customer_number,
                'points' => (int) $m->loyalty_points,
                'lifetime' => (int) $m->lifetime_points_earned,
            ])->values(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'spend_per_point' => ['required', 'numeric', 'min:1', 'max:100000'],
            'peso_per_point' => ['required', 'numeric', 'min:0.01', 'max:1000'],
            'minimum_redeem' => ['required', 'integer', 'min:1', 'max:100000'],
            'maximum_redeem' => ['required', 'integer', 'min:0', 'max:1000000'],
            'tiers_enabled' => ['required', 'boolean'],
            'birthday_bonus' => ['required', 'integer', 'min:0', 'max:100000'],
            'tiers' => ['required', 'array', 'min:1', 'max:6'],
            'tiers.*.name' => ['required', 'string', 'max:30', 'distinct'],
            'tiers.*.min' => ['required', 'integer', 'min:0', 'distinct'],
            'tiers.*.multiplier' => ['required', 'numeric', 'min:1', 'max:5'],
        ]);

        if ($data['maximum_redeem'] > 0 && $data['maximum_redeem'] < $data['minimum_redeem']) {
            return back()->withErrors(['maximum_redeem' => 'Maximum points per sale must be at least the minimum.']);
        }

        $tiers = collect($data['tiers'])->sortBy('min')->values();
        if ((int) $tiers->first()['min'] !== 0) {
            return back()->withErrors(['tiers' => 'The first tier must start at 0 points so every member has a tier.']);
        }

        foreach (['enabled', 'spend_per_point', 'peso_per_point', 'minimum_redeem', 'maximum_redeem', 'tiers_enabled', 'birthday_bonus'] as $key) {
            SystemSetting::set("loyalty.{$key}", $data[$key]);
        }
        SystemSetting::set('loyalty.tiers', $tiers->map(fn ($t) => [
            'name' => trim($t['name']), 'min' => (int) $t['min'], 'multiplier' => round((float) $t['multiplier'], 2),
        ])->all());

        return back()->with('success', 'Boundary Rewards settings saved.');
    }
}
