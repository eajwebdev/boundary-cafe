<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\DailyMission;
use App\Models\LoyaltyTransaction;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\LoyaltyActivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Daily missions: every day a random share of members (50% by default) gets one task that is
 * valid only today, e.g. "Spend ₱260 today → +10 points". Purchases that day — at the counter
 * or online — count towards it, and the bonus is added to the wallet once when it is met.
 *
 * Missions are handed out by the scheduler just after midnight; if the scheduler is not
 * running, the first storefront visit or member-card scan of the day hands them out instead.
 */
class DailyMissionService
{
    public const MAX_MISSIONS = 12;

    public function __construct(private LoyaltyService $loyalty) {}

    /**
     * @return array{enabled: bool, share: int, missions: list<array{type: string, target: float, points: int, category_id: int|null}>}
     */
    public function settings(): array
    {
        $missions = SystemSetting::get('loyalty.missions', null, []);

        return [
            'enabled' => (bool) SystemSetting::get('loyalty.missions_enabled', null, true),
            'share' => min(100, max(0, (int) SystemSetting::get('loyalty.missions_share', null, 50))),
            'missions' => collect(is_array($missions) ? $missions : [])
                ->filter(fn ($m) => is_array($m) && in_array($m['type'] ?? null, DailyMission::TYPES, true))
                ->map(fn ($m) => [
                    'type' => $m['type'],
                    'target' => max(1, (float) ($m['target'] ?? 1)),
                    'points' => max(1, (int) ($m['points'] ?? 1)),
                    'category_id' => isset($m['category_id']) ? (int) $m['category_id'] : null,
                ])
                ->values()->all(),
        ];
    }

    /** Missions are handed out and completed only while both they and the rewards programme are on. */
    public function isRunning(): bool
    {
        $settings = $this->settings();

        return $settings['enabled'] && $settings['share'] > 0 && $settings['missions'] !== [] && $this->loyalty->enabled();
    }

    /**
     * Hand out today's missions once. Later calls the same day do nothing, so members who join
     * during the day wait for tomorrow's draw. Returns how many missions were handed out.
     */
    public function assignToday(): int
    {
        if (! $this->isRunning()) {
            return 0;
        }

        $date = today();
        $doneKey = 'missions:assigned:'.$date->toDateString();
        if (Cache::get($doneKey)) {
            return 0;
        }

        return Cache::lock($doneKey.':lock', 60)->block(15, function () use ($date, $doneKey) {
            if (Cache::get($doneKey) || DailyMission::whereDate('mission_date', $date)->exists()) {
                Cache::put($doneKey, true, $date->copy()->endOfDay());

                return 0;
            }

            $settings = $this->settings();
            $templates = $this->usableTemplates($settings['missions']);
            $members = Customer::where('is_active', true)->where('loyalty_enabled', true)->pluck('id');
            $chosen = $templates === [] ? collect() : $members->shuffle()->take((int) round($members->count() * $settings['share'] / 100));

            $assigned = 0;
            Customer::whereIn('id', $chosen)->get()->each(function (Customer $customer) use ($date, $templates, &$assigned) {
                $template = Arr::random($templates);
                $mission = DailyMission::create([
                    'customer_id' => $customer->id,
                    'mission_date' => $date,
                    'type' => $template['type'],
                    'target' => $template['target'],
                    'category_id' => $template['category_id'],
                    'reward_points' => $template['points'],
                    'title' => $this->titleFor($template),
                    'status' => DailyMission::STATUS_ACTIVE,
                ]);
                $customer->notify(new LoyaltyActivity(
                    kind: LoyaltyActivity::MISSION_ASSIGNED,
                    title: "Today’s mission: {$mission->title}",
                    body: "Complete it before midnight to earn +{$mission->reward_points} bonus points.",
                ));
                $assigned++;
            });

            Cache::put($doneKey, true, $date->copy()->endOfDay());

            return $assigned;
        });
    }

    /**
     * The member's mission for today with live progress, or null when they did not get one.
     * A mission already met by earlier purchases (e.g. before it was handed out) is completed here.
     * Pass $assign = false to only read what was already handed out (the popup shared on every page).
     *
     * @return array<string, mixed>|null
     */
    public function forCustomer(Customer $customer, bool $assign = true): ?array
    {
        if (! $customer->loyalty_enabled || ! $customer->is_active || ! $this->isRunning()) {
            return null;
        }

        if ($assign) {
            $this->assignToday();
        }
        $mission = DailyMission::with('category:id,name')->where('customer_id', $customer->id)->whereDate('mission_date', today())->first();
        if (! $mission) {
            return null;
        }

        if (! $mission->isCompleted() && $this->progress($mission) >= (float) $mission->target) {
            $latestSale = $this->salesFor($mission)->latest('id')->first();
            if ($latestSale) {
                $this->complete($mission, $latestSale, null);
                $mission->refresh();
            }
        }

        return $this->toFrontend($mission);
    }

    /** A completed sale for a member: completes today's mission once its target is met. */
    public function recordSale(Sale $sale, ?User $user): void
    {
        if (! $sale->customer_id || $sale->status !== 'completed' || ! $sale->created_at?->isToday() || ! $this->isRunning()) {
            return;
        }

        $mission = DailyMission::where('customer_id', $sale->customer_id)
            ->whereDate('mission_date', $sale->created_at)
            ->where('status', DailyMission::STATUS_ACTIVE)
            ->first();
        if ($mission && $this->progress($mission) >= (float) $mission->target) {
            $this->complete($mission, $sale, $user);
        }
    }

    /**
     * A voided sale no longer counts. Its ledger rows (the mission bonus included) were already
     * reversed by LoyaltyService::reverseSale, so the mission is reopened — and completed again
     * straight away if the member's other purchases that day still meet the target.
     */
    public function saleVoided(Sale $sale, User $user): void
    {
        $mission = DailyMission::where('sale_id', $sale->id)->where('status', DailyMission::STATUS_COMPLETED)->first();
        if (! $mission) {
            return;
        }

        $mission->update(['status' => DailyMission::STATUS_ACTIVE, 'completed_at' => null, 'sale_id' => null]);

        $otherSale = $this->salesFor($mission)->latest('id')->first();
        if ($mission->mission_date->isToday() && $otherSale && $this->progress($mission) >= (float) $mission->target) {
            $this->complete($mission, $otherSale, $user);
        }
    }

    /** How far the member is today: pesos spent, or items ordered. */
    public function progress(DailyMission $mission): float
    {
        if ($mission->type === DailyMission::TYPE_SPEND) {
            return round((float) $this->salesFor($mission)->sum(DB::raw('total - COALESCE(delivery_fee, 0)')), 2);
        }

        return (float) SaleItem::whereIn('sale_id', $this->salesFor($mission)->select('id'))
            ->where('is_reward', false)
            ->where('is_bundle_component', false)
            ->when($mission->type === DailyMission::TYPE_CATEGORY, fn ($q) => $q->whereHas('product', fn ($p) => $p->where('category_id', $mission->category_id)))
            ->sum('quantity');
    }

    /**
     * @param  array{type: string, target: float, points: int, category_id: int|null}  $template
     */
    public function titleFor(array $template, ?string $categoryName = null): string
    {
        $target = (float) $template['target'];
        $count = (int) $target;

        return match ($template['type']) {
            DailyMission::TYPE_SPEND => 'Spend ₱'.number_format($target, fmod($target, 1) == 0 ? 0 : 2).' today',
            DailyMission::TYPE_CATEGORY => 'Order '.$count.' '.($count === 1 ? 'item' : 'items').' from '
                .($categoryName ?? Category::whereKey($template['category_id'])->value('name') ?? 'the menu').' today',
            default => 'Order '.$count.' '.($count === 1 ? 'item' : 'items').' today',
        };
    }

    /**
     * Today's numbers for the rewards programme page.
     *
     * @return array{assigned: int, completed: int, points_awarded: int, completion_rate_7d: float|null}
     */
    public function stats(): array
    {
        $today = DailyMission::whereDate('mission_date', today());
        $week = DailyMission::whereDate('mission_date', '>=', today()->subDays(6));
        $weekCount = (clone $week)->count();

        return [
            'assigned' => (clone $today)->count(),
            'completed' => (clone $today)->where('status', DailyMission::STATUS_COMPLETED)->count(),
            'points_awarded' => (int) (clone $today)->where('status', DailyMission::STATUS_COMPLETED)->sum('reward_points'),
            'completion_rate_7d' => $weekCount > 0
                ? round((clone $week)->where('status', DailyMission::STATUS_COMPLETED)->count() / $weekCount * 100, 1)
                : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toFrontend(DailyMission $mission): array
    {
        $target = (float) $mission->target;
        $progress = $mission->isCompleted() ? $target : min($target, $this->progress($mission));
        $isSpend = $mission->type === DailyMission::TYPE_SPEND;
        $left = max(0, $target - $progress);
        $money = fn (float $n) => '₱'.number_format($n, fmod($n, 1) == 0 ? 0 : 2);

        return [
            'id' => $mission->id,
            'title' => $mission->title,
            'type' => $mission->type,
            'target' => $target,
            'reward_points' => (int) $mission->reward_points,
            'progress' => $progress,
            'percent' => $target > 0 ? (int) floor($progress / $target * 100) : 0,
            'progress_label' => $isSpend ? $money($progress).' of '.$money($target) : (int) $progress.' of '.(int) $target.' items',
            'remaining_label' => $isSpend ? $money($left).' to go' : (int) $left.' more '.((int) $left === 1 ? 'item' : 'items').' to go',
            'category' => $mission->category?->name,
            'completed' => $mission->isCompleted(),
            'completed_at' => $mission->completed_at?->toIso8601String(),
            'ends_at' => $mission->mission_date->copy()->endOfDay()->toIso8601String(),
        ];
    }

    /** Add the bonus to the wallet, log it on the ledger against the sale, and tell the member. */
    private function complete(DailyMission $mission, Sale $sale, ?User $user): void
    {
        DB::transaction(function () use ($mission, $sale, $user) {
            $mission = DailyMission::whereKey($mission->id)->lockForUpdate()->first();
            if (! $mission || $mission->isCompleted()) {
                return;
            }

            $customer = Customer::whereKey($mission->customer_id)->lockForUpdate()->firstOrFail();
            $points = (int) $mission->reward_points;
            $customer->increment('loyalty_points', $points);
            $customer->increment('lifetime_points_earned', $points);
            $customer->refresh();

            LoyaltyTransaction::create([
                'customer_id' => $customer->id, 'branch_id' => $sale->branch_id, 'sale_id' => $sale->id,
                'user_id' => $user?->id, 'type' => LoyaltyTransaction::TYPE_MISSION, 'points' => $points,
                'balance_after' => $customer->loyalty_points, 'reason' => "Daily mission: {$mission->title}",
                'meta' => ['mission_id' => $mission->id],
            ]);
            $mission->update(['status' => DailyMission::STATUS_COMPLETED, 'completed_at' => now(), 'sale_id' => $sale->id]);

            $customer->notify(new LoyaltyActivity(
                kind: LoyaltyActivity::MISSION_COMPLETED,
                title: "Mission complete! +{$points} points",
                body: "{$mission->title} — done. Salamat!",
                points: $points,
                balance: (int) $customer->loyalty_points,
                reference: $sale->receipt_number,
            ));
        });
    }

    /** The member's completed purchases on the mission's day. */
    private function salesFor(DailyMission $mission): Builder
    {
        return Sale::where('customer_id', $mission->customer_id)
            ->where('status', 'completed')
            ->whereDate('created_at', $mission->mission_date);
    }

    /**
     * Templates that can be handed out (a category mission needs its category to still exist).
     *
     * @param  list<array{type: string, target: float, points: int, category_id: int|null}>  $templates
     * @return list<array{type: string, target: float, points: int, category_id: int|null}>
     */
    private function usableTemplates(array $templates): array
    {
        $categoryIds = Category::whereIn('id', array_filter(array_column($templates, 'category_id')))->pluck('id')->all();

        return array_values(array_filter($templates, fn ($t) => $t['type'] !== DailyMission::TYPE_CATEGORY
            || in_array($t['category_id'], $categoryIds, true)));
    }
}
