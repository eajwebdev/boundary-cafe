<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Customer;
use App\Models\LoyaltyRewardClaim;
use App\Models\LoyaltyTransaction;
use App\Models\SystemSetting;
use App\Services\LoyaltyService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Rewards programme settings and overview (menu 44).
 */
class LoyaltyProgramController extends Controller
{
    /** Settings saved from the form, in the order they are logged. */
    private const SETTING_KEYS = [
        'enabled', 'spend_increment', 'points_per_increment', 'earn_channels', 'excluded_category_ids',
        'allow_peso_discount', 'peso_per_point', 'minimum_redeem', 'maximum_redeem',
        'claim_expiry_minutes', 'points_expiry_months', 'tiers_enabled', 'birthday_bonus',
    ];

    public function __construct(private LoyaltyService $loyalty) {}

    public function index(): Response
    {
        $rules = $this->loyalty->rules();
        $since = now()->subDays(30);

        $members = Customer::where('loyalty_enabled', true)->get(['id', 'name', 'customer_number', 'loyalty_points', 'reserved_points', 'lifetime_points_earned']);
        $tiers = collect($rules['tiers']);
        $tierCounts = $tiers->mapWithKeys(fn ($t) => [$t['name'] => 0])->all();
        foreach ($members as $m) {
            $tier = $tiers->filter(fn ($t) => (int) $m->lifetime_points_earned >= $t['min'])->last() ?? $tiers->first();
            if ($tier) {
                $tierCounts[$tier['name']]++;
            }
        }

        $outstanding = (int) $members->sum('loyalty_points');
        $redeemed30d = LoyaltyRewardClaim::where('status', LoyaltyRewardClaim::STATUS_REDEEMED)->where('redeemed_at', '>=', $since);

        return Inertia::render('LoyaltyProgram/Index', [
            'rules' => $rules,
            'categories' => Category::where('is_active', true)->orderBy('name')->get(['id', 'name']),
            'stats' => [
                'members' => $members->count(),
                'online_accounts' => Customer::whereNotNull('password')->count(),
                'outstanding_points' => $outstanding,
                'reserved_points' => (int) $members->sum('reserved_points'),
                'pending_claims' => LoyaltyRewardClaim::reserved()->where('expires_at', '>', now())->count(),
                'issued_30d' => (int) LoyaltyTransaction::whereIn('type', [LoyaltyTransaction::TYPE_EARN, LoyaltyTransaction::TYPE_BONUS])->where('created_at', '>=', $since)->sum('points'),
                'redeemed_30d' => (int) (clone $redeemed30d)->sum('points'),
                'rewards_value_30d' => round((float) (clone $redeemed30d)->sum('retail_value'), 2),
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
            'spend_increment' => ['required', 'numeric', 'min:1', 'max:100000'],
            'points_per_increment' => ['required', 'integer', 'min:1', 'max:100000'],
            'earn_channels' => ['present', 'array'],
            'earn_channels.*' => ['string', Rule::in(LoyaltyService::CHANNELS)],
            'excluded_category_ids' => ['present', 'array'],
            'excluded_category_ids.*' => ['integer', 'exists:categories,id'],
            'allow_peso_discount' => ['required', 'boolean'],
            'peso_per_point' => ['required', 'numeric', 'min:0.01', 'max:1000'],
            'minimum_redeem' => ['required', 'integer', 'min:1', 'max:100000'],
            'maximum_redeem' => ['required', 'integer', 'min:0', 'max:1000000'],
            'claim_expiry_minutes' => ['required', 'integer', 'min:5', 'max:1440'],
            'points_expiry_months' => ['required', 'integer', 'min:0', 'max:120'],
            'tiers_enabled' => ['required', 'boolean'],
            'birthday_bonus' => ['required', 'integer', 'min:0', 'max:100000'],
            'tiers' => ['required', 'array', 'min:1', 'max:6'],
            'tiers.*.name' => ['required', 'string', 'max:30', 'distinct'],
            'tiers.*.min' => ['required', 'integer', 'min:0', 'distinct'],
            'tiers.*.multiplier' => ['required', 'numeric', 'min:1', 'max:5'],
        ], [
            'claim_expiry_minutes.min' => 'A reward QR must stay valid for at least 5 minutes.',
            'claim_expiry_minutes.max' => 'A reward QR can stay valid for at most 24 hours (1440 minutes).',
        ]);

        if ($data['maximum_redeem'] > 0 && $data['maximum_redeem'] < $data['minimum_redeem']) {
            return back()->withErrors(['maximum_redeem' => 'Maximum points per sale must be at least the minimum.']);
        }

        $tiers = collect($data['tiers'])->sortBy('min')->values();
        if ((int) $tiers->first()['min'] !== 0) {
            return back()->withErrors(['tiers' => 'The first tier must start at 0 points so every member has a tier.']);
        }

        $before = $this->loyalty->rules();

        $data['earn_channels'] = array_values(array_unique($data['earn_channels']));
        $data['excluded_category_ids'] = array_values(array_unique(array_map('intval', $data['excluded_category_ids'])));
        foreach (self::SETTING_KEYS as $key) {
            SystemSetting::set("loyalty.{$key}", $data[$key]);
        }
        SystemSetting::set('loyalty.tiers', $tiers->map(fn ($t) => [
            'name' => trim($t['name']), 'min' => (int) $t['min'], 'multiplier' => round((float) $t['multiplier'], 2),
        ])->all());

        $after = $this->loyalty->rules();
        $changes = collect(self::SETTING_KEYS)
            ->filter(fn ($key) => $before[$key] != $after[$key])
            ->mapWithKeys(fn ($key) => [$key => ['from' => $before[$key], 'to' => $after[$key]]]);
        if ($before['tiers'] != $after['tiers']) {
            $changes['tiers'] = ['from' => $before['tiers'], 'to' => $after['tiers']];
        }
        if ($changes->isNotEmpty()) {
            ActivityLog::create([
                'user_id' => $request->user()->id,
                'action' => 'loyalty_settings_updated',
                'properties' => ['description' => 'Updated rewards settings', 'changes' => $changes->all()],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'url' => $request->fullUrl(),
            ]);
        }

        return back()->with('success', SystemSetting::rewardsName().' settings saved.');
    }
}
