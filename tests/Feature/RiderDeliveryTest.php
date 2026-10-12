<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class RiderDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private Customer $joy;

    private User $staff;

    private User $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
        $this->joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        $this->staff = User::where('username', 'cashier_mab')->firstOrFail();
        $this->rider = User::where('username', 'rider')->firstOrFail();
    }

    public function test_rider_logs_in_to_their_dashboard_and_cannot_open_other_staff_pages(): void
    {
        $this->post('/login', ['username' => 'rider', 'password' => 'rider123'])->assertRedirect(route('rider.dashboard'));

        $this->actingAs($this->rider, 'web')->get(route('rider.dashboard'))
            ->assertInertia(fn (Assert $page) => $page->component('Rider/Dashboard')->has('store.lat'));
        $this->actingAs($this->rider, 'web')->get(route('online-orders.index'))->assertRedirect(route('rider.dashboard'));
        $this->actingAs($this->rider, 'web')->getJson('/pos/pending-orders')->assertForbidden();
    }

    public function test_staff_without_the_rider_role_cannot_use_the_rider_dashboard(): void
    {
        $this->actingAs($this->staff, 'web')->postJson(route('rider.position'), ['lat' => 9.7, 'lng' => 122.9])
            ->assertRedirect()
            ->assertSessionHas('error', 'You do not have access to that page.');

        $this->assertDatabaseCount('rider_positions', 0);
    }

    public function test_staff_assign_a_delivery_to_a_rider_of_the_same_branch_only(): void
    {
        $order = $this->deliveryOrder('ready');
        $otherBranchRider = $this->riderAt(Branch::where('code', 'BC-MAIN')->firstOrFail());

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.assign-rider', $order), ['rider_id' => $otherBranchRider->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['rider_id' => 'Choose a rider from this branch.']);

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.assign-rider', $order), ['rider_id' => $this->rider->id])
            ->assertOk()
            ->assertJsonPath('order.rider.id', $this->rider->id);

        $this->actingAs($this->rider, 'web')->getJson(route('rider.feed'))
            ->assertJsonPath('mine.0.id', $order->id)
            ->assertJsonPath('mine.0.collect', fn ($collect) => (float) $collect === (float) $order->total);
    }

    public function test_only_one_rider_can_claim_an_unassigned_delivery(): void
    {
        $order = $this->deliveryOrder('preparing');
        $secondRider = $this->riderAt(Branch::where('code', 'BC-MAB')->firstOrFail());

        $this->assertContains($order->id, $this->actingAs($this->rider, 'web')->getJson(route('rider.feed'))->json('available.*.id'));
        $this->actingAs($this->rider, 'web')->postJson(route('rider.claim', $order))->assertOk();
        $this->actingAs($secondRider, 'web')
            ->postJson(route('rider.claim', $order))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['order' => 'Another rider already took this delivery.']);

        $this->assertSame($this->rider->id, $order->fresh()->rider_id);
    }

    public function test_rider_delivers_records_the_sale_under_them_and_holds_the_cash_until_remitted(): void
    {
        $order = $this->deliveryOrder('preparing', assignTo: $this->rider);

        $this->actingAs($this->rider, 'web')
            ->postJson(route('rider.picked-up', $order))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->moveTo($order, 'ready');
        $this->actingAs($this->rider, 'web')->postJson(route('rider.delivered', $order))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status' => 'Tap "Picked up" before marking this order delivered.']);
        $this->actingAs($this->rider, 'web')->postJson(route('rider.picked-up', $order))->assertOk();
        $this->actingAs($this->rider, 'web')->postJson(route('rider.delivered', $order))->assertOk();

        $order->refresh();
        $this->assertSame('completed', $order->status);
        $sale = Sale::findOrFail($order->sale_id);
        $this->assertSame($this->rider->id, $sale->user_id);
        $this->assertSame('rider', $order->statusLogs()->reorder()->latest('id')->value('actor'));
        $this->actingAs($this->rider, 'web')->getJson(route('rider.feed'))
            ->assertJsonPath('cash_on_hand', fn ($cash) => (float) $cash === (float) $order->total)
            ->assertJsonPath('delivered_today.0.id', $order->id);

        $this->actingAs($this->staff, 'web')
            ->postJson(route('online-orders.remit-rider-cash', $this->rider))
            ->assertOk()
            ->assertJsonPath('orders', 1)
            ->assertJsonPath('amount', fn ($amount) => (float) $amount === (float) $order->total);

        $this->assertNotNull($order->fresh()->cash_remitted_at);
        $this->assertSame($this->staff->id, $order->fresh()->cash_remitted_to);
        $this->actingAs($this->rider, 'web')->getJson(route('rider.feed'))->assertJsonPath('cash_on_hand', 0);
    }

    public function test_rider_cannot_act_on_another_riders_delivery(): void
    {
        $secondRider = $this->riderAt(Branch::where('code', 'BC-MAB')->firstOrFail());
        $order = $this->deliveryOrder('ready', assignTo: $secondRider);

        $this->actingAs($this->rider, 'web')->postJson(route('rider.picked-up', $order))->assertNotFound();
        $this->assertSame('ready', $order->fresh()->status);
    }

    public function test_customer_sees_the_riders_live_position_only_while_the_order_is_on_the_way(): void
    {
        $order = $this->deliveryOrder('ready', assignTo: $this->rider);
        $this->actingAs($this->rider, 'web')->postJson(route('rider.position'), ['lat' => 9.7401, 'lng' => 122.9312, 'accuracy' => 12.4, 'heading' => 90])->assertOk();

        $this->actingAs($this->joy, 'customer')->getJson(route('customer.orders.status', $order->order_number))
            ->assertJsonPath('rider.name', 'Mabinay')
            ->assertJsonPath('rider.position', null);

        $this->actingAs($this->rider, 'web')->postJson(route('rider.picked-up', $order))->assertOk();

        $this->actingAs($this->joy, 'customer')->getJson(route('customer.orders.status', $order->order_number))
            ->assertJsonPath('rider.position.lat', 9.7401)
            ->assertJsonPath('rider.position.lng', 122.9312)
            ->assertJsonPath('rider.position.is_live', true);
        $this->actingAs($this->staff, 'web')->getJson(route('online-orders.feed'))
            ->assertJsonPath('riders.0.position.lat', 9.7401)
            ->assertJsonPath('riders.0.active_deliveries', 1);
    }

    public function test_takeout_orders_cannot_go_to_a_rider(): void
    {
        $this->actingAs($this->joy, 'customer')->post(route('customer.checkout.store'), [
            'items' => [['product_id' => Product::where('name', 'Boundary Burger')->value('id'), 'quantity' => 1]],
            'fulfillment_type' => 'pickup',
        ])->assertSessionHasNoErrors();
        $order = OnlineOrder::latest('id')->firstOrFail();
        $this->moveTo($order, 'accepted');

        $this->actingAs($this->rider, 'web')
            ->postJson(route('rider.claim', $order))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['order' => 'Only delivery orders go to a rider.']);
    }

    public function test_an_administrator_creating_a_rider_gets_rider_only_access(): void
    {
        $administrator = User::where('role', User::ROLE_ADMINISTRATOR)->firstOrFail();
        $mabinay = Branch::where('code', 'BC-MAB')->firstOrFail();

        $this->actingAs($administrator, 'web')->post(route('users.store'), [
            'fname' => 'New', 'lname' => 'Rider', 'username' => 'rider2', 'password' => 'secret123', 'password_confirmation' => 'secret123',
            'role' => User::ROLE_RIDER, 'branch_id' => $mabinay->id, 'access' => ['2', '40', '49'],
        ])->assertSessionHasNoErrors();

        $this->assertSame(['49'], User::where('username', 'rider2')->firstOrFail()->access);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function deliveryOrder(string $status, ?User $assignTo = null): OnlineOrder
    {
        $this->actingAs($this->joy, 'customer')->post(route('customer.checkout.store'), [
            'items' => [['product_id' => Product::where('name', 'Boundary Burger')->value('id'), 'quantity' => 2]],
            'fulfillment_type' => 'delivery',
            'address_id' => $this->joy->addresses()->firstOrFail()->id,
        ])->assertSessionHasNoErrors();
        $order = OnlineOrder::where('customer_id', $this->joy->id)->latest('id')->firstOrFail();

        $this->moveTo($order, 'accepted');
        if ($assignTo) {
            $this->actingAs($this->staff, 'web')->postJson(route('online-orders.assign-rider', $order), ['rider_id' => $assignTo->id])->assertOk();
        }
        $this->moveTo($order, $status);

        return $order->fresh();
    }

    /** Staff move the order forward along the normal path until it reaches $status. */
    private function moveTo(OnlineOrder $order, string $status): void
    {
        $path = ['accepted', 'preparing', 'ready'];
        foreach ($path as $step) {
            if (array_search($order->fresh()->status, ['pending', ...$path], true) >= array_search($step, ['pending', ...$path], true)) {
                continue;
            }
            $this->actingAs($this->staff, 'web')->postJson(route('online-orders.transition', $order), ['status' => $step])->assertOk();
            if ($step === $status) {
                return;
            }
        }
    }

    private function riderAt(Branch $branch): User
    {
        return User::create([
            'fname' => 'Other', 'lname' => 'Rider', 'username' => 'rider_'.$branch->code.'_'.User::count(), 'password' => 'password',
            'role' => User::ROLE_RIDER, 'branch_id' => $branch->id, 'access' => User::RIDER_MENUS,
        ]);
    }
}
