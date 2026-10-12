<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RiderNavigationAndHistoryTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $rider;

    protected function setUp(): void
    {
        parent::setUp();
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $this->branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Cafe – Mabinay', 'code' => 'BC-MAB', 'business_type' => Branch::TYPE_CAFE]);
        $this->rider = $this->makeRider('rider');
    }

    public function test_route_returns_the_road_path_with_plain_turn_instructions(): void
    {
        Http::fake(['router.project-osrm.org/*' => Http::response($this->osrmRoute())]);

        $this->actingAs($this->rider)
            ->getJson(route('rider.route', ['from_lat' => 9.7389, 'from_lng' => 122.9305, 'to_lat' => 9.7298, 'to_lng' => 122.9196]))
            ->assertOk()
            ->assertJsonPath('route.distance_m', 3114.8)
            ->assertJsonPath('route.geometry.1', [122.9348, 9.7338])
            ->assertJsonPath('route.steps.0.instruction', 'Start riding')
            ->assertJsonPath('route.steps.1.instruction', 'Turn right onto Kabankalan - Bais Road')
            ->assertJsonPath('route.steps.2.instruction', 'At the end of the road, turn left')
            ->assertJsonPath('route.steps.3.instruction', 'Arrive: the customer is on your right');

        Http::assertSent(fn ($request) => str_contains($request->url(), '/route/v1/driving/122.930500,9.738900;122.919600,9.729800'));
    }

    public function test_route_is_null_when_the_routing_server_is_down_so_the_app_can_fall_back(): void
    {
        Http::fake(['router.project-osrm.org/*' => Http::response('Service unavailable', 503)]);

        $this->actingAs($this->rider)
            ->getJson(route('rider.route', ['from_lat' => 9.7, 'from_lng' => 122.9, 'to_lat' => 9.71, 'to_lng' => 122.91]))
            ->assertOk()
            ->assertJsonPath('route', null);
    }

    public function test_history_filters_by_status_and_completed_date_and_shows_only_the_riders_own_deliveries(): void
    {
        $this->order('completed', completedAt: now()->subDays(3), remitted: true, total: 300);
        $this->order('completed', completedAt: now(), total: 250);
        $this->order('completed', completedAt: now(), total: 120, payment: 'online');
        $this->order('out_for_delivery');
        $this->order('cancelled');
        $this->order('completed', completedAt: now(), total: 999, rider: $this->makeRider('rider_two'));

        $today = today()->toDateString();

        $this->actingAs($this->rider)
            ->getJson(route('rider.history', ['status' => 'delivered', 'from' => $today, 'to' => $today]))
            ->assertOk()
            ->assertJsonCount(2, 'rows')
            ->assertJsonPath('summary.delivered', 2)
            ->assertJsonPath('summary.sales', fn ($sales) => (float) $sales === 370.0)
            ->assertJsonPath('summary.cash_collected', fn ($cash) => (float) $cash === 250.0)
            ->assertJsonPath('summary.cash_handed_over', 0);

        $all = $this->actingAs($this->rider)->getJson(route('rider.history'))->assertOk();
        $all->assertJsonPath('summary.deliveries', 5)
            ->assertJsonPath('summary.cash_handed_over', fn ($cash) => (float) $cash === 300.0);

        $this->actingAs($this->rider)->getJson(route('rider.history', ['status' => 'active']))->assertJsonCount(1, 'rows')->assertJsonPath('rows.0.status', 'out_for_delivery');
        $this->actingAs($this->rider)->getJson(route('rider.history', ['status' => 'cancelled']))->assertJsonCount(1, 'rows');
    }

    public function test_history_rejects_an_end_date_before_the_start_date(): void
    {
        $this->actingAs($this->rider)
            ->getJson(route('rider.history', ['from' => '2026-10-10', 'to' => '2026-10-01']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['to' => 'The to field must be a date after or equal to from.']);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function makeRider(string $username): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Rider', 'username' => $username, 'password' => 'password',
            'role' => User::ROLE_RIDER, 'branch_id' => $this->branch->id, 'access' => User::RIDER_MENUS,
        ]);
    }

    private function order(string $status, $completedAt = null, bool $remitted = false, float $total = 200, string $payment = 'cod', ?User $rider = null): OnlineOrder
    {
        $customer = Customer::create(['name' => 'Joy', 'branch_id' => $this->branch->id]);

        return OnlineOrder::create([
            'customer_id' => $customer->id,
            'branch_id' => $this->branch->id,
            'fulfillment_type' => 'delivery',
            'status' => $status,
            'payment_method' => $payment,
            'subtotal' => $total,
            'total' => $total,
            'contact_name' => 'Joy',
            'contact_number' => '09171234567',
            'barangay' => 'Poblacion',
            'rider_id' => ($rider ?? $this->rider)->id,
            'rider_assigned_at' => now()->subHour(),
            'completed_at' => $completedAt,
            'cancelled_at' => $status === 'cancelled' ? now() : null,
            'cash_remitted_at' => $remitted ? now() : null,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function osrmRoute(): array
    {
        $step = fn (string $type, ?string $modifier, string $name, array $location, float $distance) => [
            'maneuver' => array_filter(['type' => $type, 'modifier' => $modifier, 'location' => $location]),
            'name' => $name,
            'distance' => $distance,
        ];

        return [
            'code' => 'Ok',
            'routes' => [[
                'distance' => 3114.8,
                'duration' => 310.4,
                'geometry' => ['type' => 'LineString', 'coordinates' => [[122.9321, 9.7397], [122.9348, 9.7338], [122.9197, 9.7296]]],
                'legs' => [[
                    'steps' => [
                        $step('depart', 'right', '', [122.9321, 9.7397], 721),
                        $step('turn', 'right', 'Kabankalan - Bais Road', [122.9348, 9.7338], 1058),
                        $step('end of road', 'left', '', [122.9254, 9.7290], 605),
                        $step('arrive', 'right', '', [122.9197, 9.7296], 0),
                    ],
                ]],
            ]],
        ];
    }
}
