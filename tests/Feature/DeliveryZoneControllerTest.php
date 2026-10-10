<?php

namespace Tests\Feature;

use App\Models\Barangay;
use App\Models\Branch;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeliveryZoneControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_SUPER_ADMIN,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'enabled' => true,
            'branch_code' => 'HOME',
            'delivery_enabled' => true,
            'pickup_enabled' => true,
            'delivery_fee' => 49,
            'free_delivery_min' => 800,
            'min_order' => 150,
            'prep_minutes' => 20,
            'delivery_minutes' => 30,
            'store_hours' => ['open' => '08:00', 'close' => '21:00', 'days' => [1, 2, 3, 4, 5, 6]],
            'center' => ['lat' => 9.98, 'lng' => 122.85],
            'radius_km' => 8,
            'zone_use_polygon' => false,
            'polygon' => [],
        ];
    }

    public function test_saves_the_online_ordering_settings(): void
    {
        Branch::create(['supplier_id' => Supplier::create(['name' => 'Test Supplier'])->id, 'name' => 'Home Branch', 'code' => 'HOME']);

        $this->actingAs($this->admin())->put(route('delivery-zone.update'), $this->payload())
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertEquals(49, SystemSetting::get('online.delivery_fee'));
        $this->assertEquals(8, SystemSetting::get('online.zone_radius_km'));
        $this->assertSame([1, 2, 3, 4, 5, 6], SystemSetting::get('online.store_hours')['days']);
    }

    public function test_a_boundary_polygon_needs_at_least_three_points(): void
    {
        Branch::create(['supplier_id' => Supplier::create(['name' => 'Test Supplier'])->id, 'name' => 'Home Branch', 'code' => 'HOME']);

        $this->actingAs($this->admin())->put(route('delivery-zone.update'), $this->payload([
            'zone_use_polygon' => true,
            'polygon' => [[9.98, 122.85], [9.99, 122.86]],
        ]))->assertSessionHasErrors(['polygon' => 'Draw at least 3 points on the map to use a boundary polygon.']);
    }

    public function test_toggles_whether_a_barangay_is_deliverable(): void
    {
        $barangay = Barangay::create(['name' => 'Poblacion', 'municipality' => 'Mabinay', 'province' => 'Negros Oriental', 'is_deliverable' => true]);

        $this->actingAs($this->admin())->patch(route('delivery-zone.barangays.toggle', $barangay))->assertSessionHasNoErrors();

        $this->assertFalse((bool) $barangay->fresh()->is_deliverable);
    }
}
