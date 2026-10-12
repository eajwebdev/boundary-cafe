<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\LoyaltyReward;
use App\Models\LoyaltyRewardClaim;
use App\Models\LoyaltyTransaction;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use App\Notifications\LoyaltyActivity;
use App\Services\LoyaltyService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LoyaltyRewardsTest extends TestCase
{
    use RefreshDatabase;

    private Branch $mabinay;

    private User $cashier;

    private Customer $joy;

    private LoyaltyReward $burgerReward;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        // Every ₱100 = 5 points, no tier multipliers or birthday bonus muddying the numbers.
        SystemSetting::set('loyalty.spend_increment', 100);
        SystemSetting::set('loyalty.points_per_increment', 5);
        SystemSetting::set('loyalty.tiers_enabled', false);
        SystemSetting::set('loyalty.birthday_bonus', 0);

        $this->mabinay = Branch::where('code', 'BC-MAB')->firstOrFail();
        $this->cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $this->cashier->id, 'branch_id' => $this->mabinay->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);

        $this->joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        $this->joy->update(['loyalty_points' => 100, 'reserved_points' => 0]);

        $this->burgerReward = LoyaltyReward::create([
            'product_id' => $this->product('Boundary Burger')->id,
            'points_cost' => 50,
            'is_active' => true,
        ]);
    }

    private function product(string $name): Product
    {
        return Product::where('name', $name)->firstOrFail();
    }

    private function claimBurgers(int $quantity, ?Customer $customer = null): LoyaltyRewardClaim
    {
        $customer ??= $this->joy;
        $this->actingAs($customer, 'customer')
            ->post('/account/rewards/claims', ['items' => [['reward_id' => $this->burgerReward->id, 'quantity' => $quantity]]])
            ->assertSessionHasNoErrors()
            ->assertRedirect();

        return LoyaltyRewardClaim::where('customer_id', $customer->id)->latest('id')->firstOrFail();
    }

    private function redeemAtPos(LoyaltyRewardClaim $claim, array $extra = []): TestResponse
    {
        return $this->actingAs($this->cashier, 'web')->post('/pos', ['reward_code' => $claim->code] + $extra);
    }

    // ── Earning ──────────────────────────────────────────────────────────

    /**
     * @return array<string, array{0: float, 1: int}>
     */
    public static function spendExamples(): array
    {
        return [
            '₱99' => [99, 0],
            '₱100' => [100, 5],
            '₱250' => [250, 10],
            '₱490' => [490, 20],
            '₱500' => [500, 25],
        ];
    }

    #[DataProvider('spendExamples')]
    public function test_points_are_earned_per_full_spend_increment(float $amount, int $expectedPoints): void
    {
        $this->assertSame($expectedPoints, app(LoyaltyService::class)->pointsFor($amount));
    }

    public function test_a_paid_sale_awards_points_records_the_rule_and_notifies_the_customer(): void
    {
        // 4 × ₱125 Boundary Burger = ₱500 → 25 points
        $this->actingAs($this->cashier, 'web')->post('/pos', [
            'items' => [['id' => $this->product('Boundary Burger')->id, 'qty' => 4]],
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'customer_id' => $this->joy->id,
        ])->assertSessionHasNoErrors();

        $sale = Sale::latest('id')->firstOrFail();
        $this->assertEquals(500, $sale->total);
        $this->assertSame(25, $sale->loyalty_points_earned);
        $this->assertSame(125, $this->joy->fresh()->loyalty_points);

        $earn = LoyaltyTransaction::where('sale_id', $sale->id)->where('type', 'earn')->firstOrFail();
        $this->assertEquals(['spend_increment' => 100, 'points_per_increment' => 5], array_intersect_key($earn->meta, ['spend_increment' => 1, 'points_per_increment' => 1]));

        $notification = $this->joy->notifications()->where('data->reference', $sale->receipt_number)->firstOrFail();
        $this->assertSame(LoyaltyActivity::POINTS_EARNED, $notification->data['kind']);
        $this->assertSame(25, $notification->data['points']);
    }

    public function test_items_in_excluded_categories_do_not_earn_points(): void
    {
        $latte = $this->product('Caramel Latte');
        SystemSetting::set('loyalty.excluded_category_ids', [$latte->category_id]);

        $this->actingAs($this->cashier, 'web')->post('/pos', [
            'items' => [['id' => $latte->id, 'qty' => 4]],
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'customer_id' => $this->joy->id,
        ])->assertSessionHasNoErrors();

        $this->assertSame(0, Sale::latest('id')->firstOrFail()->loyalty_points_earned);
    }

    public function test_points_cannot_be_spent_as_an_online_discount_unless_enabled(): void
    {
        $quote = $this->actingAs($this->joy, 'customer')->postJson('/checkout/quote', [
            'items' => [['product_id' => $this->product('Boundary Burger')->id, 'quantity' => 2]],
            'fulfillment_type' => 'pickup',
            'loyalty_points' => 50,
        ])->assertOk()->json('loyalty');

        $this->assertFalse($quote['redeem_enabled']);
        $this->assertSame(0, $quote['points_to_redeem']);
    }

    // ── Claiming ─────────────────────────────────────────────────────────

    public function test_claiming_rewards_holds_the_points_and_issues_a_qr(): void
    {
        $claim = $this->claimBurgers(2);

        $this->assertSame(LoyaltyRewardClaim::STATUS_RESERVED, $claim->status);
        $this->assertSame(100, $claim->points);
        $this->assertSame(2, $claim->items->first()->quantity);
        $this->assertTrue($claim->expires_at->isFuture());

        $joy = $this->joy->fresh();
        $this->assertSame(0, $joy->loyalty_points);
        $this->assertSame(100, $joy->reserved_points);
        $this->assertSame(-100, (int) LoyaltyTransaction::where('reward_claim_id', $claim->id)->where('type', 'reserve')->value('points'));

        $this->actingAs($joy, 'customer')->get("/account/rewards/claims/{$claim->code}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Customer/RewardClaim')->where('claim.qr', $claim->qrPayload()));
    }

    public function test_claims_cannot_spend_more_points_than_the_customer_has(): void
    {
        $this->actingAs($this->joy, 'customer')
            ->post('/account/rewards/claims', ['items' => [['reward_id' => $this->burgerReward->id, 'quantity' => 3]]])
            ->assertSessionHasErrors(['items' => 'You need 50 more points for this. You have 100.']);

        $this->claimBurgers(1);
        $this->claimBurgers(1);
        $this->actingAs($this->joy, 'customer')
            ->post('/account/rewards/claims', ['items' => [['reward_id' => $this->burgerReward->id, 'quantity' => 1]]])
            ->assertSessionHasErrors('items');

        $this->assertSame(0, $this->joy->fresh()->loyalty_points);
        $this->assertSame(2, LoyaltyRewardClaim::where('customer_id', $this->joy->id)->count());
    }

    public function test_inactive_rewards_cannot_be_claimed(): void
    {
        $this->burgerReward->update(['is_active' => false]);

        $this->actingAs($this->joy, 'customer')
            ->post('/account/rewards/claims', ['items' => [['reward_id' => $this->burgerReward->id, 'quantity' => 1]]])
            ->assertSessionHasErrors('items');

        $this->assertSame(100, $this->joy->fresh()->loyalty_points);
    }

    public function test_a_customer_can_cancel_a_waiting_claim_and_get_the_points_back(): void
    {
        $claim = $this->claimBurgers(2);

        $this->actingAs($this->joy, 'customer')->post("/account/rewards/claims/{$claim->code}/cancel")->assertRedirect('/account/rewards');

        $this->assertSame(LoyaltyRewardClaim::STATUS_CANCELLED, $claim->fresh()->status);
        $this->assertSame(100, $this->joy->fresh()->loyalty_points);
        $this->assertSame(0, $this->joy->fresh()->reserved_points);
    }

    public function test_customers_cannot_open_someone_elses_claim(): void
    {
        $claim = $this->claimBurgers(1);
        $paolo = Customer::where('contact_number', '09181234567')->firstOrFail();

        $this->actingAs($paolo, 'customer')->get("/account/rewards/claims/{$claim->code}")->assertNotFound();
        $this->actingAs($paolo, 'customer')->post("/account/rewards/claims/{$claim->code}/cancel")->assertNotFound();
        $this->assertTrue($claim->fresh()->isReserved());
    }

    public function test_an_expired_claim_returns_its_points_and_cannot_be_scanned(): void
    {
        $claim = $this->claimBurgers(2);
        $this->travel(SystemSetting::get('loyalty.claim_expiry_minutes') + 1)->minutes();

        $this->artisan('loyalty:expire-claims')->assertSuccessful();

        $this->assertSame(LoyaltyRewardClaim::STATUS_EXPIRED, $claim->fresh()->status);
        $this->assertSame(100, $this->joy->fresh()->loyalty_points);
        $this->actingAs($this->cashier, 'web')->postJson('/pos/rewards/scan', ['code' => $claim->qrPayload()])
            ->assertStatus(422)->assertJsonValidationErrors('code');
    }

    // ── Redeeming at the POS ─────────────────────────────────────────────

    public function test_the_cashier_scans_a_reward_qr_and_completes_it_as_a_zero_sale(): void
    {
        $claim = $this->claimBurgers(2);
        $bun = ProductStock::where('branch_id', $this->mabinay->id)->whereHas('product', fn ($q) => $q->where('name', 'Burger Bun'))->firstOrFail();
        $bunsBefore = (float) $bun->stock;

        $this->actingAs($this->cashier, 'web')->postJson('/pos/rewards/scan', ['code' => $claim->qrPayload()])
            ->assertOk()
            ->assertJsonPath('claim.code', $claim->code)
            ->assertJsonPath('claim.customer.id', $this->joy->id)
            ->assertJsonPath('claim.items.0.quantity', 2);

        $this->redeemAtPos($claim)->assertSessionHasNoErrors()->assertSessionHas('pos_result');

        $sale = Sale::latest('id')->with('items')->firstOrFail();
        $this->assertEquals(0, $sale->total);
        $this->assertSame('reward', $sale->payment_method);
        $this->assertSame($this->joy->id, $sale->customer_id);
        $this->assertEquals(250, $sale->reward_retail_value);
        $item = $sale->items->sole();
        $this->assertTrue($item->is_reward);
        $this->assertEquals(0, $item->price);
        $this->assertEquals(125, $item->retail_price);
        $this->assertSame(100, $item->reward_points);
        $this->assertEquals($bunsBefore - 2, (float) $bun->fresh()->stock, 'Reward items use up stock like any sale');

        $claim->refresh();
        $this->assertSame(LoyaltyRewardClaim::STATUS_REDEEMED, $claim->status);
        $this->assertSame($sale->id, $claim->sale_id);
        $this->assertSame($this->mabinay->id, $claim->branch_id);

        $joy = $this->joy->fresh();
        $this->assertSame(0, $joy->loyalty_points);
        $this->assertSame(0, $joy->reserved_points);
        $this->assertSame(100, $joy->lifetime_points_redeemed);
        $this->assertSame(0, $sale->loyalty_points_earned, 'A reward-only visit earns nothing');
        $this->assertSame(1, LoyaltyTransaction::where('reward_claim_id', $claim->id)->where('type', 'redeem')->count());
        $this->assertTrue($joy->notifications()->where('data->reference', $claim->code)->where('data->kind', LoyaltyActivity::REWARD_REDEEMED)->exists());
    }

    public function test_a_reward_can_be_claimed_at_any_branch(): void
    {
        $claim = $this->claimBurgers(1);
        $tagukon = Branch::where('code', 'BC-TAG')->firstOrFail();
        $tagCashier = User::where('username', 'cashier_tag')->firstOrFail();
        CashSession::create(['user_id' => $tagCashier->id, 'branch_id' => $tagukon->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);

        $this->actingAs($tagCashier, 'web')->post('/pos', ['reward_code' => $claim->code])->assertSessionHasNoErrors();

        $this->assertSame($tagukon->id, $claim->fresh()->branch_id);
    }

    public function test_a_reward_limited_to_other_branches_is_refused(): void
    {
        $this->burgerReward->update(['branch_ids' => [Branch::where('code', 'BC-TAG')->value('id')]]);
        $claim = $this->claimBurgers(1);

        $this->actingAs($this->cashier, 'web')->postJson('/pos/rewards/scan', ['code' => $claim->qrPayload()])->assertStatus(422);
        $this->redeemAtPos($claim)->assertSessionHasErrors('error');
        $this->assertTrue($claim->fresh()->isReserved());
    }

    public function test_a_reward_qr_cannot_be_used_twice(): void
    {
        $claim = $this->claimBurgers(1);
        $this->redeemAtPos($claim)->assertSessionHasNoErrors();

        $this->actingAs($this->cashier, 'web')->postJson('/pos/rewards/scan', ['code' => $claim->qrPayload()])
            ->assertStatus(422)->assertJsonValidationErrors('code');
        $this->redeemAtPos($claim)->assertSessionHasErrors('error');

        $this->assertSame(1, Sale::where('customer_id', $this->joy->id)->where('payment_method', 'reward')->count());
    }

    public function test_a_reward_and_paid_items_share_one_sale_and_only_paid_items_earn(): void
    {
        $claim = $this->claimBurgers(1);

        // Burger reward (₱0) + 1 Caramel Latte at ₱135 → pay ₱135, earn 5 points.
        $this->redeemAtPos($claim, [
            'items' => [['id' => $this->product('Caramel Latte')->id, 'qty' => 1]],
            'payment_method' => 'cash',
            'payment_amount' => 200,
        ])->assertSessionHasNoErrors();

        $sale = Sale::latest('id')->with('items')->firstOrFail();
        $this->assertEquals(135, $sale->total);
        $this->assertSame('cash', $sale->payment_method);
        $this->assertCount(2, $sale->items);
        $this->assertSame(5, $sale->loyalty_points_earned);
        $this->assertSame(55, $this->joy->fresh()->loyalty_points); // 100 − 50 held + 5 earned
    }

    public function test_a_reward_cannot_be_added_to_another_customers_sale(): void
    {
        $claim = $this->claimBurgers(1);
        $paolo = Customer::where('contact_number', '09181234567')->firstOrFail();

        $this->redeemAtPos($claim, ['customer_id' => $paolo->id])->assertSessionHasErrors('error');
        $this->assertTrue($claim->fresh()->isReserved());
    }

    public function test_voiding_a_reward_sale_returns_the_points_and_the_stock(): void
    {
        $claim = $this->claimBurgers(2);
        $this->redeemAtPos($claim)->assertSessionHasNoErrors();
        $sale = Sale::latest('id')->firstOrFail();
        $bun = ProductStock::where('branch_id', $this->mabinay->id)->whereHas('product', fn ($q) => $q->where('name', 'Burger Bun'))->firstOrFail();
        $bunsAfterSale = (float) $bun->stock;

        $this->actingAs($this->cashier, 'web')->post("/pos/{$sale->id}/void", ['reason' => 'Wrong customer'])->assertSessionHasNoErrors();

        $this->assertSame(LoyaltyRewardClaim::STATUS_VOIDED, $claim->fresh()->status);
        $this->assertSame(100, $this->joy->fresh()->loyalty_points);
        $this->assertSame(0, $this->joy->fresh()->lifetime_points_redeemed);
        $this->assertEquals($bunsAfterSale + 2, (float) $bun->fresh()->stock);
    }

    // ── Customer app ─────────────────────────────────────────────────────

    public function test_the_rewards_popup_shows_once_a_day(): void
    {
        $this->actingAs($this->joy, 'customer')->get('/')
            ->assertInertia(fn ($page) => $page->where('rewards_popup.points', 100)->has('rewards_popup.affordable', 1));

        $this->actingAs($this->joy, 'customer')->postJson('/account/rewards/popup-seen')->assertOk();
        $this->actingAs($this->joy->fresh(), 'customer')->get('/')->assertInertia(fn ($page) => $page->where('rewards_popup', null));

        $this->travel(1)->days();
        $this->actingAs($this->joy->fresh(), 'customer')->get('/')->assertInertia(fn ($page) => $page->where('rewards_popup.points', 100));
    }

    public function test_the_notification_history_lists_points_earned_and_marks_them_read(): void
    {
        $this->joy->notifications()->delete();
        $this->actingAs($this->cashier, 'web')->post('/pos', [
            'items' => [['id' => $this->product('Boundary Burger')->id, 'qty' => 4]],
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'customer_id' => $this->joy->id,
        ])->assertSessionHasNoErrors();
        $this->assertSame(1, $this->joy->unreadNotifications()->count());

        $this->actingAs($this->joy, 'customer')->get('/account/notifications')
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Customer/Notifications')
                ->where('notifications.data.0.title', 'You earned 25 points')
                ->where('notifications.data.0.unread', true));

        $this->assertSame(0, $this->joy->unreadNotifications()->count());
    }

    // ── Admin ────────────────────────────────────────────────────────────

    public function test_admin_adds_a_reward_and_the_same_item_cannot_be_added_twice(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $latte = $this->product('Caramel Latte');

        $this->actingAs($admin, 'web')->post('/loyalty-program/rewards', [
            'product_id' => $latte->id, 'points_cost' => 75, 'is_active' => true,
        ])->assertSessionHasNoErrors();
        $this->assertSame(75, LoyaltyReward::where('product_id', $latte->id)->value('points_cost'));

        $this->actingAs($admin, 'web')->post('/loyalty-program/rewards', [
            'product_id' => $latte->id, 'points_cost' => 60, 'is_active' => true,
        ])->assertSessionHasErrors('product_id');
    }

    public function test_cashiers_cannot_manage_the_reward_catalog(): void
    {
        $this->actingAs($this->cashier, 'web')->post('/loyalty-program/rewards', [
            'product_id' => $this->product('Caramel Latte')->id, 'points_cost' => 75, 'is_active' => true,
        ])->assertRedirect();

        $this->assertSame(1, LoyaltyReward::count());
    }
}
