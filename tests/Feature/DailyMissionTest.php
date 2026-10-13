<?php

namespace Tests\Feature;

use App\Models\CashSession;
use App\Models\Category;
use App\Models\Customer;
use App\Models\DailyMission;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\LoyaltyActivity;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Daily missions: a random share of members gets one task each day, valid that day only,
 * completed by that day's purchases for a one-time bonus. Boundary Burger is ₱125.
 */
class DailyMissionTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Customer $joy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->travelTo(today()->setTime(10, 0));

        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
        // Every ₱100 = 5 points, no tier multiplier or birthday bonus muddying the numbers.
        SystemSetting::set('loyalty.spend_increment', 100);
        SystemSetting::set('loyalty.points_per_increment', 5);
        SystemSetting::set('loyalty.tiers_enabled', false);
        SystemSetting::set('loyalty.birthday_bonus', 0);

        $this->cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $this->cashier->id, 'branch_id' => $this->cashier->branch_id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);
        $this->joy = Customer::where('contact_number', '09171234567')->firstOrFail();
    }

    // ── Handing out ──────────────────────────────────────────────────────

    public function test_half_of_the_members_get_one_mission_for_today_and_are_notified(): void
    {
        $members = Customer::where('is_active', true)->where('loyalty_enabled', true)->count();

        $this->artisan('loyalty:assign-missions')->assertSuccessful();

        $missions = DailyMission::whereDate('mission_date', today())->get();
        $this->assertCount((int) round($members / 2), $missions);
        $this->assertSame($missions->count(), $missions->unique('customer_id')->count());
        $this->assertSame(
            $missions->count(),
            Customer::whereIn('id', $missions->pluck('customer_id'))->get()
                ->filter(fn (Customer $c) => $c->notifications()->where('data->kind', LoyaltyActivity::MISSION_ASSIGNED)->exists())->count(),
        );

        // Running again the same day hands out nothing more.
        $this->artisan('loyalty:assign-missions')->assertSuccessful();
        $this->assertSame($missions->count(), DailyMission::count());
    }

    public function test_only_active_rewards_members_can_be_picked(): void
    {
        SystemSetting::set('loyalty.missions_share', 100);
        $optedOut = $this->member('09998880001', ['loyalty_enabled' => false]);
        $inactive = $this->member('09998880002', ['is_active' => false]);

        $this->artisan('loyalty:assign-missions')->assertSuccessful();

        $this->assertTrue(DailyMission::where('customer_id', $this->joy->id)->exists());
        $this->assertFalse(DailyMission::whereIn('customer_id', [$optedOut->id, $inactive->id])->exists());
    }

    public function test_nothing_is_handed_out_while_missions_or_the_rewards_programme_are_off(): void
    {
        SystemSetting::set('loyalty.missions_share', 100);
        SystemSetting::set('loyalty.missions_enabled', false);
        $this->artisan('loyalty:assign-missions')->assertSuccessful();

        SystemSetting::set('loyalty.missions_enabled', true);
        SystemSetting::set('loyalty.enabled', false);
        $this->artisan('loyalty:assign-missions')->assertSuccessful();

        $this->assertSame(0, DailyMission::count());
    }

    public function test_the_first_visit_of_the_day_hands_out_missions_when_the_scheduler_did_not_run(): void
    {
        SystemSetting::set('loyalty.missions_share', 100);
        $this->onlyMission(['type' => 'spend', 'target' => 260, 'points' => 10, 'category_id' => null]);

        $this->actingAs($this->joy, 'customer')->get(route('home'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('mission.title', 'Spend ₱260 today')
            ->where('mission.reward_points', 10)
            ->where('mission.completed', false));
    }

    // ── Completing ───────────────────────────────────────────────────────

    public function test_purchases_through_the_day_add_up_and_complete_the_mission_once(): void
    {
        $mission = DailyMission::factory()->create(['customer_id' => $this->joy->id]); // spend ₱260 → +10
        $balance = (int) $this->joy->loyalty_points;
        $earnedToday = fn () => (int) Sale::where('customer_id', $this->joy->id)->whereDate('created_at', today())->sum('loyalty_points_earned');

        $this->sellBurgers(2); // ₱250
        $this->assertFalse($mission->fresh()->isCompleted());

        $this->sellBurgers(1); // ₱375 in total
        $completingSale = Sale::latest('id')->firstOrFail();
        $mission->refresh();
        $this->assertTrue($mission->isCompleted());
        $this->assertSame($completingSale->id, $mission->sale_id);
        $this->assertSame($balance + $earnedToday() + 10, (int) $this->joy->fresh()->loyalty_points);
        $this->assertDatabaseHas('loyalty_transactions', [
            'customer_id' => $this->joy->id, 'sale_id' => $completingSale->id, 'type' => LoyaltyTransaction::TYPE_MISSION, 'points' => 10,
        ]);
        $this->assertTrue($this->joy->notifications()->where('data->kind', LoyaltyActivity::MISSION_COMPLETED)->exists());

        $this->sellBurgers(2);
        $this->assertSame(1, LoyaltyTransaction::where('type', LoyaltyTransaction::TYPE_MISSION)->count());
    }

    public function test_an_item_mission_counts_items_and_a_category_mission_only_that_categorys_items(): void
    {
        $latte = Product::where('name', 'Spanish Latte')->firstOrFail();
        $burger = Product::where('name', 'Boundary Burger')->firstOrFail();
        $this->assertNotSame($latte->category_id, $burger->category_id);
        $mission = DailyMission::factory()->create([
            'customer_id' => $this->joy->id, 'type' => DailyMission::TYPE_CATEGORY, 'target' => 2,
            'category_id' => $latte->category_id, 'title' => 'Order 2 items from Coffee today',
        ]);

        $this->sellBurgers(3);
        $this->assertFalse($mission->fresh()->isCompleted());

        $this->sell($latte, 2);
        $this->assertTrue($mission->fresh()->isCompleted());

        $other = $this->member('09998880003');
        $itemMission = DailyMission::factory()->items(3)->create(['customer_id' => $other->id]);
        $this->sellBurgers(2, $other);
        $this->assertFalse($itemMission->fresh()->isCompleted());
        $this->sell($latte, 1, $other);
        $this->assertTrue($itemMission->fresh()->isCompleted());
    }

    public function test_a_completed_online_order_counts_towards_the_mission(): void
    {
        $mission = DailyMission::factory()->create(['customer_id' => $this->joy->id, 'target' => 200]);

        $this->actingAs($this->joy, 'customer')->post(route('customer.checkout.store'), [
            'items' => [['product_id' => Product::where('name', 'Boundary Burger')->value('id'), 'quantity' => 2]],
            'fulfillment_type' => 'pickup',
        ])->assertSessionHasNoErrors();
        $order = OnlineOrder::where('customer_id', $this->joy->id)->latest('id')->firstOrFail();
        $this->assertFalse($mission->fresh()->isCompleted(), 'Placing the order alone does not count — it must be completed.');

        foreach (['accepted', 'preparing', 'ready', 'completed'] as $status) {
            $this->actingAs($this->cashier, 'web')->postJson(route('online-orders.transition', $order), ['status' => $status])->assertOk();
        }

        $this->assertSame($order->fresh()->sale_id, $mission->fresh()->sale_id);
    }

    public function test_voiding_the_completing_sale_takes_the_bonus_back_and_reopens_the_mission(): void
    {
        $mission = DailyMission::factory()->create(['customer_id' => $this->joy->id]);
        $this->sellBurgers(3);
        $sale = Sale::latest('id')->firstOrFail();
        $balanceBefore = (int) $this->joy->fresh()->loyalty_points - 10 - (int) $sale->loyalty_points_earned;

        $this->actingAs($this->cashier)->post("/pos/{$sale->id}/void", ['reason' => 'Wrong customer'])->assertSessionHasNoErrors();

        $this->assertSame(DailyMission::STATUS_ACTIVE, $mission->fresh()->status);
        $this->assertNull($mission->fresh()->sale_id);
        $this->assertSame($balanceBefore, (int) $this->joy->fresh()->loyalty_points);

        // A new qualifying purchase the same day completes it again.
        $this->sellBurgers(3);
        $this->assertTrue($mission->fresh()->isCompleted());
    }

    public function test_voiding_one_sale_keeps_the_mission_when_the_other_purchases_still_meet_it(): void
    {
        $mission = DailyMission::factory()->create(['customer_id' => $this->joy->id, 'target' => 200]);
        $balanceBefore = (int) $this->joy->loyalty_points;
        $this->sellBurgers(2); // ₱250 completes it
        $first = Sale::latest('id')->firstOrFail();
        $this->sellBurgers(2);
        $second = Sale::latest('id')->firstOrFail();

        $this->actingAs($this->cashier)->post("/pos/{$first->id}/void", ['reason' => 'Test'])->assertSessionHasNoErrors();

        $mission->refresh();
        $this->assertTrue($mission->isCompleted());
        $this->assertSame($second->id, $mission->sale_id);
        // The first sale's points (bonus included) went back; the bonus is now paid once, on the second sale.
        $this->assertSame($balanceBefore + (int) $second->loyalty_points_earned + 10, (int) $this->joy->fresh()->loyalty_points);
    }

    public function test_yesterdays_mission_cannot_be_completed_today(): void
    {
        $yesterday = DailyMission::factory()->create(['customer_id' => $this->joy->id, 'mission_date' => today()->subDay()]);
        DailyMission::factory()->create(); // someone else's mission today: today's draw has already run

        $this->sellBurgers(3);

        $this->assertFalse($yesterday->fresh()->isCompleted());
        $this->assertFalse(LoyaltyTransaction::where('customer_id', $this->joy->id)->where('type', LoyaltyTransaction::TYPE_MISSION)->exists());
    }

    public function test_a_mission_already_met_before_it_was_handed_out_completes_when_the_member_opens_it(): void
    {
        $this->sellBurgers(1); // ₱125, before any mission exists today
        SystemSetting::set('loyalty.missions_share', 100);
        $this->onlyMission(['type' => 'spend', 'target' => 100, 'points' => 15, 'category_id' => null]);

        $this->actingAs($this->joy, 'customer')->get(route('customer.rewards'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('mission.completed', true)
            ->where('mission.percent', 100));

        $this->assertSame(1, LoyaltyTransaction::where('customer_id', $this->joy->id)->where('type', LoyaltyTransaction::TYPE_MISSION)->where('points', 15)->count());
    }

    // ── Showing ──────────────────────────────────────────────────────────

    public function test_the_rewards_page_and_the_pos_member_scan_show_todays_progress(): void
    {
        DailyMission::factory()->create(['customer_id' => $this->joy->id]);
        $this->sellBurgers(1);

        $this->actingAs($this->joy, 'customer')->get(route('customer.rewards'))->assertInertia(fn (Assert $page) => $page
            ->where('mission.title', 'Spend ₱260 today')
            ->where('mission.progress_label', '₱125 of ₱260')
            ->where('mission.remaining_label', '₱135 to go')
            ->where('mission.percent', 48));

        $this->actingAs($this->cashier, 'web')->postJson(route('loyalty.lookup'), ['code' => $this->joy->customer_number])
            ->assertOk()
            ->assertJsonPath('mission.remaining_label', '₱135 to go');
    }

    public function test_a_member_without_a_mission_today_sees_none(): void
    {
        SystemSetting::set('loyalty.missions_share', 1);
        DailyMission::factory()->create(['mission_date' => today()]); // someone else's — today's draw has run

        $this->actingAs($this->joy, 'customer')->get(route('customer.rewards'))->assertInertia(fn (Assert $page) => $page
            ->where('mission', null)
            ->where('missionsRunning', true));
    }

    // ── Settings ─────────────────────────────────────────────────────────

    public function test_admin_saves_the_share_and_mission_list(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $category = Category::firstOrFail();

        $this->actingAs($admin)->put(route('loyalty-program.missions.update'), [
            'enabled' => true,
            'share' => 30,
            'missions' => [
                ['type' => 'spend', 'target' => 299.5, 'points' => 12, 'category_id' => null],
                ['type' => 'category', 'target' => 2.4, 'points' => 8, 'category_id' => $category->id],
            ],
        ])->assertSessionHasNoErrors();

        $this->assertSame(30, SystemSetting::get('loyalty.missions_share'));
        $this->assertEquals([
            ['type' => 'spend', 'target' => 299.5, 'points' => 12, 'category_id' => null],
            ['type' => 'category', 'target' => 2, 'points' => 8, 'category_id' => $category->id],
        ], SystemSetting::get('loyalty.missions'));
    }

    public function test_a_category_mission_needs_a_category_and_the_list_cannot_be_empty(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $save = fn (array $missions) => $this->actingAs($admin)->put(route('loyalty-program.missions.update'), [
            'enabled' => true, 'share' => 50, 'missions' => $missions,
        ]);

        $save([['type' => 'category', 'target' => 2, 'points' => 8, 'category_id' => null]])
            ->assertSessionHasErrors(['missions.0.category_id' => 'Pick the category for this mission.']);
        $save([])->assertSessionHasErrors('missions');
    }

    public function test_cashiers_cannot_change_missions(): void
    {
        $this->actingAs($this->cashier)->put(route('loyalty-program.missions.update'), [
            'enabled' => false, 'share' => 50, 'missions' => [['type' => 'spend', 'target' => 1, 'points' => 1, 'category_id' => null]],
        ])->assertRedirect();

        $this->assertTrue(SystemSetting::get('loyalty.missions_enabled'));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * @param  array{type: string, target: float|int, points: int, category_id: int|null}  $mission
     */
    private function onlyMission(array $mission): void
    {
        SystemSetting::set('loyalty.missions', [$mission]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function member(string $phone, array $attributes = []): Customer
    {
        return Customer::create(['name' => 'Test Member', 'contact_number' => $phone, 'loyalty_enabled' => true, 'is_active' => true, ...$attributes]);
    }

    private function sellBurgers(int $qty, ?Customer $customer = null): void
    {
        $this->sell(Product::where('name', 'Boundary Burger')->firstOrFail(), $qty, $customer);
    }

    private function sell(Product $product, int $qty, ?Customer $customer = null): void
    {
        $this->actingAs($this->cashier, 'web')->post('/pos', [
            'items' => [['id' => $product->id, 'qty' => $qty]],
            'payment_method' => 'cash',
            'payment_amount' => 5000,
            'customer_id' => ($customer ?? $this->joy)->id,
        ])->assertSessionHasNoErrors();
    }
}
