<?php

namespace Tests\Feature;

use App\Models\Barangay;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Moving online ordering to another town (e.g. Tagukon in Kabankalan City) is a settings change:
 * the town shown to customers, the barangays they can pick and the delivery checks all follow it.
 */
class OnlineServiceAreaTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->admin = User::where('username', 'admin')->firstOrFail();
    }

    public function test_moving_online_ordering_to_another_town_changes_what_customers_see_and_can_pick(): void
    {
        $this->moveToKabankalan();

        $this->get(route('customer.register'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('service_area', ['town' => 'Kabankalan City', 'province' => 'Negros Occidental'])
            ->where('barangays', fn ($names) => collect($names)->sort()->values()->all() === ['Inapoy', 'Tagukon', 'Tapi']));

        $this->post(route('customer.register.post'), $this->registration(['barangay' => 'Dahile']))
            ->assertSessionHasErrors(['barangay' => 'We currently deliver only within Kabankalan City. Please choose your barangay.']);
        $this->post(route('customer.register.post'), $this->registration(['barangay' => 'Tagukon']))
            ->assertSessionHasNoErrors();
    }

    public function test_a_barangay_name_found_in_two_towns_is_saved_under_the_town_we_deliver_to(): void
    {
        $this->moveToKabankalan();
        $center = SystemSetting::get('online.zone_center');
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();

        $this->actingAs($joy, 'customer')->post('/account/addresses', [
            'label' => 'Home', 'barangay' => 'Inapoy', 'landmark' => 'Near the chapel', 'lat' => $center['lat'], 'lng' => $center['lng'],
        ])->assertSessionHasNoErrors();

        $address = CustomerAddress::where('customer_id', $joy->id)->latest('id')->firstOrFail();
        $this->assertSame('Kabankalan City', $address->municipality);
        $this->assertSame('Negros Occidental', $address->province);
    }

    public function test_adding_barangays_skips_ones_already_listed_in_that_town(): void
    {
        $this->actingAs($this->admin)->post(route('delivery-zone.barangays.store'), [
            'municipality' => 'Mabinay', 'province' => 'Negros Oriental', 'names' => "Dahile\nNew Place, new  place", 'is_deliverable' => false,
        ])->assertSessionHasNoErrors()->assertSessionHas('success', '1 barangay(s) added to Mabinay (1 already listed).');

        $this->assertFalse(Barangay::where('municipality', 'Mabinay')->where('name', 'New Place')->sole()->is_deliverable);
    }

    public function test_a_barangay_with_saved_addresses_can_only_be_switched_off_not_removed(): void
    {
        $used = Barangay::where('municipality', 'Mabinay')->where('name', CustomerAddress::firstOrFail()->barangay)->firstOrFail();
        $unused = Barangay::create(['name' => 'Typo', 'municipality' => 'Mabinay', 'province' => 'Negros Oriental']);

        $this->actingAs($this->admin)->delete(route('delivery-zone.barangays.destroy', $used))->assertSessionHasErrors('barangay');
        $this->actingAs($this->admin)->delete(route('delivery-zone.barangays.destroy', $unused))->assertSessionHasNoErrors();

        $this->assertModelExists($used);
        $this->assertModelMissing($unused);
    }

    public function test_cashiers_cannot_change_the_barangay_list(): void
    {
        $cashier = User::where('username', 'cashier_mab')->firstOrFail();
        $before = Barangay::count();

        $this->actingAs($cashier)->post(route('delivery-zone.barangays.store'), [
            'municipality' => 'Anywhere', 'province' => 'Anywhere', 'names' => 'Somewhere', 'is_deliverable' => true,
        ])->assertRedirect();
        $this->actingAs($cashier)->patch(route('delivery-zone.towns.update'), ['municipality' => 'Mabinay', 'is_deliverable' => false])->assertRedirect();

        $this->assertSame($before, Barangay::count());
        $this->assertTrue(Barangay::where('municipality', 'Mabinay')->where('is_deliverable', true)->exists());
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** What the owner does on the Delivery Zone page: new town and province, its barangays on, Mabinay's off. */
    private function moveToKabankalan(): void
    {
        $settings = $this->actingAs($this->admin)->get(route('delivery-zone.index'))->viewData('page')['props']['settings'];
        $zone = $this->actingAs($this->admin)->get(route('delivery-zone.index'))->viewData('page')['props']['zone'];

        $this->actingAs($this->admin)->put(route('delivery-zone.update'), [
            ...collect($settings)->except(['zone_use_polygon'])->all(),
            'branch_code' => 'BC-TAG',
            'service_area' => 'Kabankalan City',
            'service_province' => 'Negros Occidental',
            'center' => $zone['center'],
            'radius_km' => $zone['radius_km'],
            'zone_use_polygon' => false,
            'polygon' => [],
        ])->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->post(route('delivery-zone.barangays.store'), [
            'municipality' => 'Kabankalan City', 'province' => 'Negros Occidental', 'names' => 'Tagukon, Tapi, Inapoy', 'is_deliverable' => true,
        ])->assertSessionHasNoErrors();
        $this->actingAs($this->admin)->patch(route('delivery-zone.towns.update'), ['municipality' => 'Mabinay', 'is_deliverable' => false])
            ->assertSessionHasNoErrors();
        auth()->guard('web')->logout();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function registration(array $overrides): array
    {
        return $overrides + [
            'name' => 'Rosa Tagukon',
            'contact_number' => '09998887777',
            'email' => 'rosa@example.test',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'terms' => true,
        ];
    }
}
