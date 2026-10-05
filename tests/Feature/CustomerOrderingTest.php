<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\DiningTable;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\TableOrder;
use App\Models\User;
use App\Services\SaleService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerOrderingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $mabinay;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->mabinay = Branch::where('code', 'BC-MAB')->firstOrFail();

        // Keep the store open regardless of when the suite runs.
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function customer(): Customer
    {
        return Customer::where('contact_number', '09171234567')->firstOrFail(); // Joy (seeded, password "password")
    }

    private function product(string $name = 'Boundary Burger'): Product
    {
        return Product::where('name', $name)->firstOrFail();
    }

    private function cart(int $qty = 2, string $name = 'Boundary Burger'): array
    {
        return [['product_id' => $this->product($name)->id, 'quantity' => $qty]];
    }

    private function placeOrder(Customer $customer, array $extra = []): OnlineOrder
    {
        $address = $customer->addresses()->firstOrFail();
        $this->actingAs($customer, 'customer')->post('/checkout', array_merge([
            'items' => $this->cart(),
            'fulfillment_type' => 'delivery',
            'address_id' => $address->id,
        ], $extra))->assertSessionHasNoErrors()->assertRedirect();

        return OnlineOrder::where('customer_id', $customer->id)->latest('id')->firstOrFail();
    }

    private function staff(string $username = 'cashier_mab'): User
    {
        return User::where('username', $username)->firstOrFail();
    }

    // ── Guests ───────────────────────────────────────────────────────────

    public function test_guest_can_browse_the_storefront_but_not_checkout(): void
    {
        $this->get('/')->assertOk()->assertInertia(fn ($page) => $page
            ->component('Landing/Index')
            ->has('products', 58)
            ->where('customer', null));

        $ordersBefore = OnlineOrder::count();
        $this->get('/checkout')->assertRedirect(route('customer.login'));
        $this->post('/checkout', ['items' => $this->cart(), 'fulfillment_type' => 'pickup'])->assertRedirect(route('customer.login'));
        $this->postJson('/checkout/quote', ['items' => $this->cart(), 'fulfillment_type' => 'pickup'])->assertUnauthorized();
        $this->assertSame($ordersBefore, OnlineOrder::count());
    }

    public function test_storefront_promos_are_visible_to_guests(): void
    {
        Promo::create([
            'name' => 'Rainy Day Deal', 'discount_type' => 'percent', 'discount_value' => 15, 'applies_to' => 'all',
            'is_active' => true, 'show_on_storefront' => true, 'channels' => 'online',
        ]);
        Promo::create([
            'name' => 'Staff counter only', 'discount_type' => 'percent', 'discount_value' => 5, 'applies_to' => 'all',
            'is_active' => true, 'show_on_storefront' => false, 'channels' => 'pos',
        ]);

        $this->get('/')->assertInertia(fn ($page) => $page
            ->where('storefrontPromos', fn ($promos) => collect($promos)->pluck('name')->contains('Rainy Day Deal')
                && ! collect($promos)->pluck('name')->contains('Staff counter only'))
            ->where('promos', []));
    }

    // ── Registration & login ─────────────────────────────────────────────

    public function test_customer_can_register_with_a_mabinay_barangay_only(): void
    {
        $payload = [
            'name' => 'Ana Lopez', 'contact_number' => '0917 555 1234', 'email' => 'ana.lopez@example.test',
            'password' => 'secret123', 'password_confirmation' => 'secret123', 'terms' => true,
        ];

        $this->post('/account/register', $payload + ['barangay' => 'Dumaguete City'])->assertSessionHasErrors('barangay');
        $this->assertGuest('customer');

        $this->post('/account/register', $payload + ['barangay' => 'Poblacion'])->assertSessionHasNoErrors()->assertRedirect('/');
        $this->assertAuthenticated('customer');
        $this->assertSame('09175551234', Customer::where('email', 'ana.lopez@example.test')->value('contact_number'));
    }

    public function test_walk_in_customer_can_claim_their_record_and_keep_points(): void
    {
        $walkIn = Customer::where('contact_number', '09170000001')->firstOrFail(); // Ana (seeded walk-in, no password)
        $walkIn->update(['loyalty_points' => 77]);

        $this->post('/account/register', [
            'name' => 'Ana Villanueva', 'contact_number' => '09170000001', 'email' => 'ana.v@example.test',
            'password' => 'secret123', 'password_confirmation' => 'secret123', 'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasNoErrors();

        $this->assertAuthenticatedAs($walkIn->fresh(), 'customer');
        $this->assertSame(77, $walkIn->fresh()->loyalty_points);
    }

    public function test_customer_cannot_open_staff_pages_and_staff_session_is_separate(): void
    {
        $this->actingAs($this->customer(), 'customer')->get('/dashboard')->assertRedirect('/');
        $this->assertGuest('web');
    }

    // ── Delivery zone ────────────────────────────────────────────────────

    public function test_addresses_outside_mabinay_are_rejected(): void
    {
        $customer = $this->customer();
        $base = ['label' => 'Work', 'barangay' => 'Poblacion', 'street' => 'Somewhere'];

        // Cebu City — far outside the zone
        $this->actingAs($customer, 'customer')->post('/account/addresses', $base + ['lat' => 10.3157, 'lng' => 123.8854])
            ->assertSessionHasErrors('lat');
        // Inside the zone but not a Mabinay barangay
        $this->actingAs($customer, 'customer')->post('/account/addresses', array_merge($base, ['barangay' => 'Taclobo', 'lat' => 9.7360, 'lng' => 122.9270]))
            ->assertSessionHasErrors('barangay');
        // Valid
        $this->actingAs($customer, 'customer')->post('/account/addresses', $base + ['lat' => 9.7360, 'lng' => 122.9270])
            ->assertSessionHasNoErrors();
    }

    public function test_checkout_rejects_a_delivery_address_outside_the_zone(): void
    {
        $customer = $this->customer();
        // Simulate a stale/forged address row outside Mabinay
        $bad = CustomerAddress::create([
            'customer_id' => $customer->id, 'label' => 'Other', 'barangay' => 'Poblacion',
            'lat' => 9.3077, 'lng' => 123.3054, // Dumaguete
        ]);

        $this->actingAs($customer, 'customer')->post('/checkout', [
            'items' => $this->cart(), 'fulfillment_type' => 'delivery', 'address_id' => $bad->id,
        ])->assertSessionHasErrors('address_id');
    }

    // ── Pricing integrity ────────────────────────────────────────────────

    public function test_client_supplied_prices_and_totals_are_ignored(): void
    {
        $customer = $this->customer();
        $serverPrice = app(SaleService::class)->unitPrice($this->product()->load('stocks', 'variants'), $this->mabinay->id);

        $order = $this->placeOrder($customer, [
            'items' => [['product_id' => $this->product()->id, 'quantity' => 2, 'price' => 1, 'unit_price' => 1]],
            'total' => 1,
            'subtotal' => 1,
            'delivery_fee' => 0,
        ]);

        $this->assertEquals(round($serverPrice * 2, 2), (float) $order->subtotal);
        $this->assertEquals(round($serverPrice, 2), (float) $order->items()->first()->price);
        $this->assertGreaterThan(1, (float) $order->total);
    }

    public function test_quote_endpoint_returns_server_breakdown(): void
    {
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/checkout/quote', ['items' => $this->cart(3), 'fulfillment_type' => 'delivery', 'promo_code' => 'WELCOME50'])
            ->assertOk()
            ->assertJsonPath('promo.code', 'WELCOME50')
            ->assertJsonPath('promo.discount', 50)
            ->assertJsonStructure(['lines', 'subtotal', 'vat', 'loyalty' => ['points_to_earn'], 'delivery_fee', 'total', 'errors', 'can_checkout']);
    }

    // ── Tracking & privacy ───────────────────────────────────────────────

    public function test_customer_can_track_own_order_but_not_someone_elses(): void
    {
        $order = $this->placeOrder($this->customer());
        $other = Customer::where('contact_number', '09181234567')->firstOrFail(); // Paolo

        $this->actingAs($this->customer(), 'customer')->get("/account/orders/{$order->order_number}")
            ->assertOk()->assertInertia(fn ($page) => $page->component('Customer/OrderTrack')->where('order.status', 'pending'));
        $this->actingAs($this->customer(), 'customer')->getJson("/account/orders/{$order->order_number}/status")
            ->assertOk()->assertJsonPath('order_number', $order->order_number);

        $this->actingAs($other, 'customer')->get("/account/orders/{$order->order_number}")->assertNotFound();
        $this->actingAs($other, 'customer')->getJson("/account/orders/{$order->order_number}/status")->assertNotFound();
    }

    // ── Status machine ───────────────────────────────────────────────────

    public function test_status_machine_rejects_invalid_transitions(): void
    {
        $order = $this->placeOrder($this->customer());
        $staff = $this->staff();

        $this->actingAs($staff, 'web')->postJson("/online-orders/{$order->id}/transition", ['status' => 'completed'])->assertStatus(422);
        $this->actingAs($staff, 'web')->postJson("/online-orders/{$order->id}/transition", ['status' => 'rejected'])->assertStatus(422); // reason required
        $this->assertSame('pending', $order->fresh()->status);

        $this->actingAs($staff, 'web')->postJson("/online-orders/{$order->id}/transition", ['status' => 'accepted'])->assertOk();
        // Customers can no longer cancel once the cafe accepted
        $this->actingAs($this->customer(), 'customer')->post("/account/orders/{$order->order_number}/cancel")->assertSessionHasErrors('status');
        $this->assertSame('accepted', $order->fresh()->status);
    }

    public function test_completing_an_online_order_creates_one_sale_and_awards_points_once(): void
    {
        $customer = $this->customer();
        $before = $customer->loyalty_points;
        $order = $this->placeOrder($customer, ['loyalty_points' => 20]);
        $this->assertSame($before - 20, $customer->fresh()->loyalty_points, 'Points are held at checkout');

        $staff = $this->staff();
        foreach (['accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'completed'] as $status) {
            $this->actingAs($staff, 'web')->postJson("/online-orders/{$order->id}/transition", ['status' => $status])->assertOk();
        }

        $order->refresh();
        $this->assertSame('completed', $order->status);
        $this->assertSame(1, Sale::where('channel', 'online')->where('customer_id', $customer->id)->whereNotNull('id')->where('id', $order->sale_id)->count());
        $this->assertSame(1, Sale::where('notes', 'like', "%{$order->order_number}%")->count());

        $earned = LoyaltyTransaction::where('sale_id', $order->sale_id)->where('type', 'earn')->sum('points');
        $this->assertSame((int) $order->loyalty_points_to_earn, (int) $earned);
        $this->assertSame(1, LoyaltyTransaction::where('sale_id', $order->sale_id)->where('type', 'redeem')->count(), 'Held points become the redemption');
        $this->assertSame($before - 20 + $order->loyalty_points_to_earn, $customer->fresh()->loyalty_points);
    }

    public function test_cancelled_order_returns_held_points(): void
    {
        $customer = $this->customer();
        $before = $customer->loyalty_points;
        $order = $this->placeOrder($customer, ['loyalty_points' => 15]);

        $this->actingAs($customer, 'customer')->post("/account/orders/{$order->order_number}/cancel", ['reason' => 'Changed my mind'])
            ->assertSessionHasNoErrors();

        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertSame($before, $customer->fresh()->loyalty_points);
    }

    // ── Dine-in: waiter → cashier ────────────────────────────────────────

    public function test_waiter_table_order_appears_pending_and_charging_it_frees_the_table(): void
    {
        $waiter = $this->staff('waiter');
        $table = DiningTable::where('branch_id', $this->mabinay->id)->where('table_number', '5')->firstOrFail();

        $this->actingAs($waiter, 'web')->post('/tables/orders', [
            'table_id' => $table->id,
            'items' => [['product_id' => $this->product('Tocino Meal')->id, 'quantity' => 2, 'note' => 'extra rice']],
        ])->assertSessionHasNoErrors();

        $this->assertSame('occupied', $table->fresh()->status);
        $this->assertSame(0, Sale::where('table_order_id', '!=', null)->count(), 'Sending to the cashier does not create a sale');

        // Waiters cannot reach the POS or its pending queue
        $this->actingAs($waiter, 'web')->get('/pos')->assertRedirect();

        $cashier = $this->staff();
        CashSession::create(['user_id' => $cashier->id, 'branch_id' => $this->mabinay->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);

        $pending = $this->actingAs($cashier, 'web')->getJson('/pos/pending-orders')->assertOk()->json('table_orders');
        $ticket = collect($pending)->firstWhere('table_number', '5');
        $this->assertNotNull($ticket);
        $this->assertSame(2, $ticket['item_count']);

        $this->actingAs($cashier, 'web')->post('/pos', [
            'items' => collect($ticket['items'])->map(fn ($i) => ['id' => $i['product_id'], 'qty' => $i['quantity'], 'variant_id' => $i['variant_id']])->all(),
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'table_order_id' => $ticket['id'],
        ])->assertSessionHasNoErrors()->assertSessionHas('pos_result');

        $order = TableOrder::findOrFail($ticket['id']);
        $this->assertSame('closed', $order->status);
        $this->assertNotNull($order->sale_id);
        $this->assertSame('dine_in', Sale::find($order->sale_id)->channel);
        $this->assertSame('cleaning', $table->fresh()->status);

        // A second charge of the same ticket is refused
        $this->actingAs($cashier, 'web')->post('/pos', [
            'items' => [['id' => $this->product('Tocino Meal')->id, 'qty' => 2]],
            'payment_method' => 'cash', 'payment_amount' => 1000, 'table_order_id' => $ticket['id'],
        ])->assertSessionHasErrors('error');
        $this->assertSame(1, Sale::where('table_order_id', $ticket['id'])->count());

        $this->assertCount(0, collect($this->actingAs($cashier, 'web')->getJson('/pos/pending-orders')->json('table_orders'))->where('table_number', '5'));
    }

    // ── Dashboard tabs ───────────────────────────────────────────────────

    public function test_dashboard_tabs_return_their_data_and_respect_access(): void
    {
        $admin = User::where('username', 'admin')->firstOrFail();
        $expected = [
            'sales' => ['kpis', 'trend', 'heatmap', 'channels', 'payments', 'recent'],
            'orders' => ['kpis', 'live', 'trend', 'by_barangay', 'cancel_reasons', 'pending_tables'],
            'menu' => ['kpis', 'top_by_qty', 'top_by_revenue', 'bottom', 'category_mix', 'never_sold'],
            'inventory' => ['kpis', 'low_stock', 'out_of_stock', 'losses', 'ingredient_usage', 'pending_purchase_orders'],
            'customers' => ['kpis', 'top_customers', 'tier_distribution', 'promos'],
            'cash' => ['kpis', 'expenses_by_category', 'trend', 'sessions'],
        ];

        $this->actingAs($admin, 'web')->get('/dashboard')->assertOk()->assertInertia(fn ($page) => $page->component('Dashboard/Index')->where('tabs', array_keys($expected)));

        foreach ($expected as $tab => $keys) {
            $this->actingAs($admin, 'web')->getJson("/dashboard/data?tab={$tab}&from=".now()->subDays(7)->toDateString().'&to='.now()->toDateString())
                ->assertOk()->assertJsonPath('tab', $tab)->assertJsonStructure(['data' => $keys, 'period']);
        }

        // Online sales seeded by the demo data show up in the channel split
        $channels = collect($this->actingAs($admin, 'web')->getJson('/dashboard/data?tab=sales&from='.now()->subDays(7)->toDateString())->json('data.channels'));
        $this->assertTrue($channels->pluck('channel')->contains('online'));

        $this->actingAs($admin, 'web')->getJson('/dashboard/data?tab=bogus')->assertNotFound();

        // A manager limited to the dashboard + POS only sees Sales and Orders
        $limited = User::create([
            'fname' => 'Limited', 'lname' => 'Manager', 'username' => 'limited', 'password' => 'secret123',
            'role' => User::ROLE_MANAGER, 'branch_id' => $this->mabinay->id, 'access' => ['1', '2'],
        ]);
        $this->actingAs($limited, 'web')->getJson('/dashboard/data?tab=cash')->assertForbidden();
        $this->actingAs($limited, 'web')->getJson('/dashboard/data?tab=orders')->assertOk();
    }
}
