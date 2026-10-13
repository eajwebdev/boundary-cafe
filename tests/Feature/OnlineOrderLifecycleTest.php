<?php

namespace Tests\Feature;

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
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * End-to-end customer orders for each way of ordering: dine-in, takeout (stored as "pickup") and delivery.
 * Each order goes from the storefront through the staff board to a recorded sale, using only HTTP endpoints.
 */
class OnlineOrderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private Customer $joy;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
        // These tests follow orders through recipe-ingredient deduction (the "on" setting).
        SystemSetting::set('inventory.ingredient_tracking', true);
        $this->joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        $this->staff = User::where('username', 'cashier_mab')->firstOrFail();
    }

    /**
     * @return array<string, array{0: string, 1: list<string>, 2: string}>
     */
    public static function fulfillments(): array
    {
        return [
            'dine-in' => ['dine_in', ['accepted', 'preparing', 'ready', 'completed'], 'pay_at_counter'],
            'takeout' => ['pickup', ['accepted', 'preparing', 'ready', 'completed'], 'pay_at_pickup'],
            'delivery' => ['delivery', ['accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'], 'cod'],
        ];
    }

    #[DataProvider('fulfillments')]
    public function test_order_goes_from_checkout_through_every_step_to_a_recorded_sale(string $type, array $expectedSteps, string $paymentMethod): void
    {
        $burger = $this->product('Boundary Burger');
        $cheesecake = $this->product('Cheesecake');
        $cheesecakeBefore = $this->stockOf($cheesecake);
        $ingredientsBefore = $this->ingredientStocks($burger);
        $pointsBefore = $this->joy->loyalty_points;

        // Storefront and checkout pages open for the customer.
        $this->get(route('home'))->assertOk();
        $this->actingAs($this->joy, 'customer')->get(route('customer.checkout'))->assertOk();

        // Quote: server prices the cart; only delivery has a fee (₱375 is under the ₱999 free-delivery minimum).
        $quote = $this->actingAs($this->joy, 'customer')
            ->postJson(route('customer.checkout.quote'), $this->checkoutPayload($type))
            ->assertOk()
            ->assertJsonPath('can_checkout', true)
            ->assertJsonPath('subtotal', 375)
            ->json();
        $this->assertSame($type === 'delivery' ? 49.0 : 0.0, (float) $quote['delivery_fee']);

        // Place the order.
        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.checkout.store'), $this->checkoutPayload($type))
            ->assertSessionHasNoErrors()
            ->assertRedirect();
        $order = OnlineOrder::where('customer_id', $this->joy->id)->latest('id')->firstOrFail();
        $this->assertSame($type, $order->fulfillment_type);
        $this->assertSame('pending', $order->status);
        $this->assertSame($paymentMethod, $order->payment_method);
        $this->assertEquals($quote['total'], (float) $order->total);
        $this->assertCount(2, $order->items);
        $this->assertSame($type === 'dine_in' ? '5' : null, $order->table_number);
        $this->assertSame($type === 'delivery', $order->barangay !== null);

        $this->actingAs($this->joy, 'customer')->get(route('customer.orders.show', $order->order_number))->assertOk();

        // The staff board's one-tap button walks the order through each step until it is finished.
        $this->actingAs($this->staff, 'web')->get(route('online-orders.index'))->assertOk();
        $steps = [];
        while ($next = $this->boardCard($order)['next_status'] ?? null) {
            $this->actingAs($this->staff, 'web')
                ->postJson(route('online-orders.transition', $order), ['status' => $next])
                ->assertOk()
                ->assertJsonPath('order.status', $next);
            $steps[] = $next;

            $this->actingAs($this->joy, 'customer')
                ->getJson(route('customer.orders.status', $order->order_number))
                ->assertOk()
                ->assertJsonPath('status', $next);

            if ($next === 'ready' && $type !== 'delivery') {
                $this->assertContains($order->id, $this->posPickupIds(), 'Ready dine-in and takeout orders show at the POS');
            }
            $this->assertLessThan(10, count($steps), 'The board should finish the order in a few steps');
        }
        $this->assertSame($expectedSteps, $steps);

        // Finished: one paid online sale, stock and ingredients used, points earned, every tracking step stamped.
        $order->refresh();
        $this->assertSame('completed', $order->status);
        $this->assertSame('paid', $order->payment_status);
        $sale = Sale::with('items')->findOrFail($order->sale_id);
        $this->assertSame('online', $sale->channel);
        $this->assertSame('completed', $sale->status);
        $this->assertEquals((float) $order->total, (float) $sale->total);
        $this->assertEquals((float) $order->delivery_fee, (float) $sale->delivery_fee);
        $this->assertCount(2, $sale->items);
        $this->assertSame($cheesecakeBefore - 1, $this->stockOf($cheesecake));
        foreach ($this->ingredientStocks($burger) as $ingredientId => $stock) {
            $this->assertLessThan($ingredientsBefore[$ingredientId], $stock, 'Each burger ingredient is used');
        }
        $this->assertSame($pointsBefore + (int) $order->loyalty_points_to_earn, $this->joy->fresh()->loyalty_points);
        $this->assertNotContains($order->id, $this->posPickupIds(), 'Finished orders leave the POS list');

        $tracking = $this->actingAs($this->joy, 'customer')
            ->getJson(route('customer.orders.status', $order->order_number))
            ->assertJsonPath('is_active', false)
            ->json();
        $this->assertSame(['pending', ...$expectedSteps], array_column($tracking['steps'], 'key'));
        $this->assertNotContains(null, array_column($tracking['steps'], 'at'), 'Every step shows when it happened');
    }

    #[DataProvider('fulfillments')]
    public function test_staff_can_decline_a_new_order_and_the_customer_sees_why(string $type): void
    {
        $order = $this->placeOrder($type);
        $cheesecakeBefore = $this->stockOf($this->product('Cheesecake'));

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.transition', $order), ['status' => 'rejected'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reason' => 'Please give a reason so the customer knows what happened.']);

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.transition', $order), ['status' => 'rejected', 'reason' => 'Item sold out'])
            ->assertOk();

        $this->actingAs($this->joy, 'customer')
            ->getJson(route('customer.orders.status', $order->order_number))
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('is_active', false);
        $this->assertSame('Item sold out', $order->fresh()->cancel_reason);
        $this->assertNull($order->fresh()->sale_id);
        $this->assertSame($cheesecakeBefore, $this->stockOf($this->product('Cheesecake')), 'A declined order uses no stock');
    }

    #[DataProvider('fulfillments')]
    public function test_customer_can_cancel_only_before_the_cafe_accepts(string $type): void
    {
        $cancelled = $this->placeOrder($type);
        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.orders.cancel', $cancelled->order_number), ['reason' => 'Changed my mind'])
            ->assertSessionHasNoErrors();
        $this->assertSame('cancelled', $cancelled->fresh()->status);

        $accepted = $this->placeOrder($type);
        $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $accepted), ['status' => 'accepted'])->assertOk();
        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.orders.cancel', $accepted->order_number))
            ->assertSessionHasErrors('status');
        $this->assertSame('accepted', $accepted->fresh()->status);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function counterOrders(): array
    {
        return ['dine-in' => ['dine_in'], 'takeout' => ['pickup']];
    }

    #[DataProvider('counterOrders')]
    public function test_dine_in_and_takeout_orders_never_go_out_for_delivery(string $type): void
    {
        $order = $this->placeOrder($type);
        foreach (['accepted', 'preparing', 'ready'] as $status) {
            $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $order), ['status' => $status])->assertOk();
        }

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.transition', $order), ['status' => 'out_for_delivery'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');
        $this->assertSame('ready', $order->fresh()->status);
    }

    /**
     * @return array<string, array{0: string, 1: string, 2: string}>
     */
    public static function switchableFulfillments(): array
    {
        return [
            'takeout' => ['pickup', 'online.pickup_enabled', 'Takeout is not available right now. Please choose another option.'],
            'delivery' => ['delivery', 'online.delivery_enabled', 'Delivery is not available right now. Please choose takeout or dine-in.'],
        ];
    }

    #[DataProvider('switchableFulfillments')]
    public function test_an_order_type_switched_off_cannot_be_ordered(string $type, string $setting, string $message): void
    {
        SystemSetting::set($setting, false);
        $ordersBefore = OnlineOrder::count();

        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.checkout.store'), $this->checkoutPayload($type))
            ->assertSessionHasErrors(['cart' => $message]);
        $this->assertSame($ordersBefore, OnlineOrder::count());
    }

    #[DataProvider('fulfillments')]
    public function test_no_order_type_can_be_placed_while_the_store_is_closed_today(string $type): void
    {
        $online = app(OnlineOrderService::class);
        $online->closeForToday($online->branch(), $this->staff, 'Town fiesta');
        $ordersBefore = OnlineOrder::count();

        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.checkout.store'), $this->checkoutPayload($type))
            ->assertSessionHasErrors(['store' => 'We are closed today: Town fiesta']);
        $this->assertSame($ordersBefore, OnlineOrder::count());
    }

    public function test_completing_an_order_whose_ingredients_ran_out_takes_them_negative_by_default(): void
    {
        $order = $this->placeOrder('pickup');
        foreach (['accepted', 'preparing', 'ready'] as $status) {
            $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $order), ['status' => $status])->assertOk();
        }
        $burger = $this->product('Boundary Burger');
        ProductStock::where('branch_id', $order->branch_id)->whereIn('product_id', $burger->recipeIngredients()->pluck('ingredient_id'))->update(['stock' => 0]);

        $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $order), ['status' => 'completed'])->assertOk();

        $this->assertNotNull($order->fresh()->sale_id);
        foreach ($this->ingredientStocks($burger) as $stock) {
            $this->assertLessThan(0, $stock);
        }
    }

    public function test_completing_an_order_whose_ingredients_ran_out_shows_a_clear_error(): void
    {
        SystemSetting::set('pos.allow_negative_stock', false);
        $order = $this->placeOrder('pickup');
        foreach (['accepted', 'preparing', 'ready'] as $status) {
            $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $order), ['status' => $status])->assertOk();
        }
        $branchId = $order->branch_id;
        ProductStock::where('branch_id', $branchId)
            ->whereIn('product_id', $this->product('Boundary Burger')->recipeIngredients()->pluck('ingredient_id'))
            ->update(['stock' => 0]);

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.transition', $order), ['status' => 'completed'])
            ->assertUnprocessable()
            ->assertJsonPath('message', fn (string $message) => str_starts_with($message, "Cannot complete {$order->order_number}: Insufficient stock for ingredient"));

        $this->assertSame('ready', $order->fresh()->status);
        $this->assertNull($order->fresh()->sale_id);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /**
     * @return array<string, mixed>
     */
    private function checkoutPayload(string $type): array
    {
        return [
            'items' => [
                ['product_id' => $this->product('Boundary Burger')->id, 'quantity' => 2, 'note' => 'No onions'],
                ['product_id' => $this->product('Cheesecake')->id, 'quantity' => 1],
            ],
            'fulfillment_type' => $type,
            'table_number' => $type === 'dine_in' ? '5' : null,
            'address_id' => $type === 'delivery' ? $this->joy->addresses()->firstOrFail()->id : null,
            'customer_note' => 'Please hurry',
        ];
    }

    private function placeOrder(string $type): OnlineOrder
    {
        $this->actingAs($this->joy, 'customer')
            ->post(route('customer.checkout.store'), $this->checkoutPayload($type))
            ->assertSessionHasNoErrors();

        return OnlineOrder::where('customer_id', $this->joy->id)->latest('id')->firstOrFail();
    }

    /**
     * @return array<string, mixed>
     */
    private function boardCard(OnlineOrder $order): array
    {
        $board = $this->actingAs($this->staff, 'web')->getJson(route('online-orders.feed'))->assertOk()->json();

        return collect($board['active'])->firstWhere('id', $order->id) ?? [];
    }

    /**
     * @return list<int>
     */
    private function posPickupIds(): array
    {
        return array_column($this->actingAs($this->staff, 'web')->getJson('/pos/pending-orders')->assertOk()->json('online_pickups'), 'id');
    }

    private function product(string $name): Product
    {
        return Product::where('name', $name)->firstOrFail();
    }

    private function stockOf(Product $product): float
    {
        return (float) ProductStock::where('product_id', $product->id)->where('branch_id', $this->staff->branch_id)->value('stock');
    }

    /**
     * @return array<int, float>
     */
    private function ingredientStocks(Product $product): array
    {
        return ProductStock::where('branch_id', $this->staff->branch_id)
            ->whereIn('product_id', $product->recipeIngredients()->pluck('ingredient_id'))
            ->pluck('stock', 'product_id')
            ->map(fn ($stock) => (float) $stock)
            ->all();
    }
}
