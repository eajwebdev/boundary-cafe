<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\OnlineOrderService;
use Carbon\Carbon;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class OnlineFulfillmentTest extends TestCase
{
    use RefreshDatabase;

    private Customer $joy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
        SystemSetting::set('online.min_order', 0);
        $this->joy = Customer::where('contact_number', '09171234567')->firstOrFail();
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function placeOrder(string $fulfillment, array $extra = []): TestResponse
    {
        return $this->actingAs($this->joy, 'customer')->post('/checkout', array_merge([
            'items' => [['product_id' => Product::where('name', 'Boundary Burger')->value('id'), 'quantity' => 1]],
            'fulfillment_type' => $fulfillment,
        ], $extra));
    }

    public function test_a_customer_inside_the_cafe_can_order_dine_in_with_a_table_number(): void
    {
        $this->placeOrder('dine_in', ['table_number' => 'T5'])->assertSessionHasNoErrors()->assertRedirect();

        $order = OnlineOrder::latest('id')->firstOrFail();
        $this->assertSame('dine_in', $order->fulfillment_type);
        $this->assertSame('T5', $order->table_number);
        $this->assertSame('pay_at_counter', $order->payment_method);
        $this->assertEquals(0, $order->delivery_fee);
        $this->assertNull($order->barangay);

        // Dine-in skips "out for delivery": ready → served.
        $order->update(['status' => OnlineOrder::STATUS_READY]);
        $this->assertSame([OnlineOrder::STATUS_COMPLETED], $order->allowedTransitions());
    }

    public function test_online_orders_are_taken_from_8am_to_5pm_by_default(): void
    {
        $default = collect(SystemSetting::defaults())->firstWhere('key', 'online.store_hours')['value'];
        SystemSetting::set('online.store_hours', json_decode($default, true));
        $online = app(OnlineOrderService::class);

        $this->assertTrue($online->storeStatus($online->branch(), Carbon::parse('2026-10-12 16:59', 'Asia/Manila'))['is_open']);
        $closed = $online->storeStatus($online->branch(), Carbon::parse('2026-10-12 17:01', 'Asia/Manila'));
        $this->assertFalse($closed['is_open']);
        $this->assertSame('5:00 PM', $closed['closes_at']);
    }

    public function test_dine_in_can_be_switched_off(): void
    {
        SystemSetting::set('online.dine_in_enabled', false);
        $before = OnlineOrder::count();

        $this->placeOrder('dine_in')->assertSessionHasErrors('cart');
        $this->assertSame($before, OnlineOrder::count());
    }

    public function test_a_delivery_uses_the_account_contact_by_default(): void
    {
        $address = $this->joy->addresses()->firstOrFail();

        $this->placeOrder('delivery', ['address_id' => $address->id])->assertSessionHasNoErrors();

        $order = OnlineOrder::latest('id')->firstOrFail();
        $this->assertSame($this->joy->name, $order->contact_name);
        $this->assertSame('09171234567', $order->contact_number);
    }

    public function test_a_delivery_can_go_to_another_contact_person(): void
    {
        $address = $this->joy->addresses()->firstOrFail();

        $this->placeOrder('delivery', [
            'address_id' => $address->id,
            'use_account_contact' => false,
            'contact_name' => 'Lola Nena',
            'contact_number' => '+63 918 765 4321',
        ])->assertSessionHasNoErrors();

        $order = OnlineOrder::latest('id')->firstOrFail();
        $this->assertSame('Lola Nena', $order->contact_name);
        $this->assertSame('09187654321', $order->contact_number, '+63 numbers are stored as 09…');
    }

    public function test_another_contact_person_needs_a_name_and_valid_mobile(): void
    {
        $address = $this->joy->addresses()->firstOrFail();
        $before = OnlineOrder::count();

        $this->placeOrder('delivery', [
            'address_id' => $address->id,
            'use_account_contact' => false,
            'contact_name' => '',
            'contact_number' => '12345',
        ])->assertSessionHasErrors(['contact_name', 'contact_number']);

        $this->assertSame($before, OnlineOrder::count());
    }

    public function test_a_saved_address_gets_city_province_and_zip_and_needs_a_landmark(): void
    {
        $address = ['label' => 'Home', 'barangay' => 'Dahile', 'street' => 'Purok 2', 'lat' => 9.7360, 'lng' => 122.9270];

        $this->actingAs($this->joy, 'customer')->post('/account/addresses', $address)->assertSessionHasErrors('landmark');

        $this->actingAs($this->joy, 'customer')->post('/account/addresses', $address + ['landmark' => 'Green gate near the school'])
            ->assertSessionHasNoErrors();

        $saved = $this->joy->addresses()->where('barangay', 'Dahile')->firstOrFail();
        $this->assertSame('Mabinay', $saved->municipality);
        $this->assertSame('Negros Oriental', $saved->province);
        $this->assertSame('6207', $saved->zip_code);
        $this->assertSame('Dahile, Mabinay, Negros Oriental 6207', $saved->locality());
    }

    public function test_the_delivery_order_keeps_the_full_address(): void
    {
        $address = $this->joy->addresses()->firstOrFail();
        $address->update(['barangay' => 'Dahile', 'street' => 'Purok 2', 'municipality' => 'Mabinay', 'province' => 'Negros Oriental', 'zip_code' => '6207']);

        $this->placeOrder('delivery', ['address_id' => $address->id])->assertSessionHasNoErrors();

        $order = OnlineOrder::latest('id')->firstOrFail();
        $this->assertSame('Purok 2, Dahile, Mabinay, Negros Oriental 6207', $order->addressSummary());
    }

    public function test_current_location_resolves_barangay_city_province_and_zip(): void
    {
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response([
            'display_name' => 'Dahile, Mabinay, Negros Oriental, Philippines',
            'address' => ['village' => 'Dahile', 'town' => 'Mabinay', 'state' => 'Negros Island Region', 'country' => 'Philippines'],
        ])]);

        $this->actingAs($this->joy, 'customer')->getJson('/geocode/reverse?lat=9.7411&lng=122.9312')
            ->assertOk()
            ->assertJson([
                'barangay' => 'Dahile',
                'municipality' => 'Mabinay',
                'province' => 'Negros Oriental',
                'zip_code' => '6207',
            ]);
    }

    public function test_dine_in_and_takeout_orders_show_in_the_pos_pending_list(): void
    {
        $this->placeOrder('dine_in', ['table_number' => '7'])->assertSessionHasNoErrors();
        OnlineOrder::latest('id')->firstOrFail()->update(['status' => OnlineOrder::STATUS_READY]);

        $this->actingAs(User::where('username', 'cashier_mab')->firstOrFail(), 'web')
            ->getJson('/pos/pending-orders')
            ->assertOk()
            ->assertJsonPath('online_pickups.0.fulfillment_label', 'Dine-in')
            ->assertJsonPath('online_pickups.0.table_number', '7');
    }
}
