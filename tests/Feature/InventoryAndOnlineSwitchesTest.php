<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\OnlineOrderService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * The two System Settings switches: ingredient calculations (off by default) and online ordering / delivery.
 */
class InventoryAndOnlineSwitchesTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Product $latte;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
        $this->cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $this->cashier->id, 'branch_id' => $this->cashier->branch_id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);
        $this->latte = Product::where('name', 'Spanish Latte')->firstOrFail();
    }

    // ── Ingredient calculations ──────────────────────────────────────────

    public function test_ingredient_calculations_are_off_after_seeding_and_a_sale_leaves_ingredients_untouched(): void
    {
        $this->assertFalse(SystemSetting::ingredientTracking());
        $milkBefore = $this->ingredient('Fresh Milk');

        $this->sellLattes(2);

        $this->assertSame($milkBefore, $this->ingredient('Fresh Milk'));
        $this->assertFalse(Sale::latest('id')->firstOrFail()->items()->sole()->ingredients_deducted);
    }

    public function test_turning_ingredient_calculations_on_deducts_recipe_ingredients(): void
    {
        SystemSetting::set('inventory.ingredient_tracking', true);
        $milkBefore = $this->ingredient('Fresh Milk');

        $this->sellLattes(2);

        $this->assertSame($milkBefore - 400, $this->ingredient('Fresh Milk'));
        $this->assertTrue(Sale::latest('id')->firstOrFail()->items()->sole()->ingredients_deducted);
    }

    public function test_a_made_to_order_item_only_sells_out_online_when_ingredient_calculations_are_on(): void
    {
        $burger = Product::where('name', 'Boundary Burger')->firstOrFail();
        ProductStock::where('branch_id', $this->cashier->branch_id)
            ->whereIn('product_id', $burger->recipeIngredients()->pluck('ingredient_id'))
            ->update(['stock' => 0]);
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        $quote = fn () => $this->actingAs($joy, 'customer')
            ->postJson(route('customer.checkout.quote'), ['items' => [['product_id' => $burger->id, 'quantity' => 1]], 'fulfillment_type' => 'pickup'])
            ->assertOk();

        $quote()->assertJsonPath('can_checkout', true);

        SystemSetting::set('inventory.ingredient_tracking', true);
        $quote()->assertJsonPath('can_checkout', false)->assertJsonPath('errors.0', 'Boundary Burger is sold out.');
    }

    public function test_voiding_a_sale_restores_only_the_ingredients_that_sale_took(): void
    {
        SystemSetting::set('inventory.ingredient_tracking', true);
        $milkBefore = $this->ingredient('Fresh Milk');
        $this->sellLattes(1);
        $deductedSale = Sale::latest('id')->firstOrFail();

        SystemSetting::set('inventory.ingredient_tracking', false);
        $this->sellLattes(1);
        $plainSale = Sale::latest('id')->firstOrFail();

        // Voided after the switch flipped: the first sale gives its milk back, the second had none to give.
        $this->actingAs($this->cashier)->post("/pos/{$deductedSale->id}/void", ['reason' => 'Test'])->assertSessionHasNoErrors();
        $this->assertSame($milkBefore, $this->ingredient('Fresh Milk'));

        SystemSetting::set('inventory.ingredient_tracking', true);
        $this->actingAs($this->cashier)->post("/pos/{$plainSale->id}/void", ['reason' => 'Test'])->assertSessionHasNoErrors();
        $this->assertSame($milkBefore, $this->ingredient('Fresh Milk'));
    }

    public function test_ingredient_calculations_can_be_turned_on_for_one_branch_only(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $tagukon = Branch::where('code', 'BC-TAG')->firstOrFail();

        $this->actingAs($admin)
            ->post(route('settings.save'), ['branch_id' => $this->cashier->branch_id, 'settings' => ['inventory.ingredient_tracking' => true]])
            ->assertSessionHasNoErrors();

        $this->assertTrue(SystemSetting::ingredientTracking($this->cashier->branch_id));
        $this->assertFalse(SystemSetting::ingredientTracking($tagukon->id));
        $this->assertFalse(SystemSetting::ingredientTracking());
    }

    public function test_without_ingredient_calculations_profit_uses_the_items_own_cost_price(): void
    {
        $capital = (float) ProductStock::where('product_id', $this->latte->id)->where('branch_id', $this->cashier->branch_id)->value('capital');

        $this->sellLattes(1);

        $this->assertEquals($capital, (float) Sale::latest('id')->firstOrFail()->items()->sole()->unit_cost);
    }

    // ── System Settings page ─────────────────────────────────────────────

    public function test_admin_sees_both_switches_in_system_settings_and_can_turn_ingredient_calculations_on(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();

        // Setting keys contain dots, so check the groups as whole arrays.
        $this->actingAs($admin)->get(route('settings.index'))->assertInertia(fn (Assert $page) => $page
            ->where('settings.inventory', fn ($group) => ($group['inventory.ingredient_tracking']['value'] ?? null) === 'false'
                && ($group['inventory.ingredient_tracking']['type'] ?? null) === 'boolean')
            ->where('settings.online', fn ($group) => collect($group)->keys()->sort()->values()->all() === ['online.delivery_enabled', 'online.enabled']));

        $this->actingAs($admin)->post(route('settings.save'), ['settings' => ['inventory.ingredient_tracking' => true]])->assertSessionHasNoErrors();

        $this->assertTrue(SystemSetting::ingredientTracking());
    }

    public function test_turning_off_online_orders_in_system_settings_stops_checkout_but_not_browsing(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();

        $this->actingAs($admin)->post(route('settings.save'), ['settings' => ['online.enabled' => false]])->assertSessionHasNoErrors();

        $this->get(route('home'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('store.status.is_open', false)
            ->where('store.status.message', 'Online ordering is paused right now.'));
        $before = OnlineOrder::count();
        $this->actingAs($joy, 'customer')->post(route('customer.checkout.store'), [
            'items' => [['product_id' => $this->latte->id, 'quantity' => 1]],
            'fulfillment_type' => 'pickup',
        ])->assertSessionHasErrors(['store' => 'Online ordering is paused right now.']);
        $this->assertSame($before, OnlineOrder::count());
    }

    public function test_turning_off_delivery_in_system_settings_keeps_takeout_working(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();

        $this->actingAs($admin)->post(route('settings.save'), ['settings' => ['online.delivery_enabled' => false]])->assertSessionHasNoErrors();

        $this->assertFalse(app(OnlineOrderService::class)->settings()['delivery_enabled']);
        $order = fn (string $type) => $this->actingAs($joy, 'customer')->post(route('customer.checkout.store'), [
            'items' => [['product_id' => $this->latte->id, 'quantity' => 1]],
            'fulfillment_type' => $type,
            'address_id' => $joy->addresses()->firstOrFail()->id,
        ]);
        $order('delivery')->assertSessionHasErrors(['cart' => 'Delivery is not available right now. Please choose takeout or dine-in.']);
        $order('pickup')->assertSessionHasNoErrors();
    }

    public function test_system_settings_cannot_change_the_other_online_ordering_settings(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();

        $this->actingAs($admin)->post(route('settings.save'), ['settings' => ['online.delivery_fee' => 0]])->assertSessionHasNoErrors();

        $this->assertEquals(49, SystemSetting::get('online.delivery_fee'));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function sellLattes(int $qty): void
    {
        $this->actingAs($this->cashier)
            ->post('/pos', ['items' => [['id' => $this->latte->id, 'qty' => $qty]], 'payment_method' => 'cash', 'payment_amount' => 1000])
            ->assertSessionHasNoErrors();
    }

    private function ingredient(string $name): float
    {
        return (float) ProductStock::where('branch_id', $this->cashier->branch_id)
            ->whereHas('product', fn ($q) => $q->where('name', $name)->where('product_type', 'ingredient'))
            ->value('stock');
    }
}
