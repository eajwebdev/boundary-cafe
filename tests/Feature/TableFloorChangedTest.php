<?php

namespace Tests\Feature;

use App\Events\TableFloorChanged;
use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Supplier;
use App\Models\TableOrder;
use App\Models\User;
use Illuminate\Broadcasting\Broadcasters\NullBroadcaster;
use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class TableFloorChangedTest extends TestCase
{
    use RefreshDatabase;

    private const SOCKET_ID = '1234.5678';

    private function branch(string $code = 'TEST'): Branch
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => "Branch {$code}", 'code' => $code]);
    }

    /**
     * @param  array<int, string>  $access
     */
    private function staff(Branch $branch, string $role, array $access): User
    {
        return User::create([
            'fname' => 'Test',
            'lname' => ucfirst($role),
            'username' => "{$role}-{$branch->code}-".implode('-', $access),
            'password' => 'password',
            'role' => $role,
            'branch_id' => $branch->id,
            'access' => $access,
        ]);
    }

    /** Switch broadcasting from the test suite's null driver to Pusher with throwaway credentials. */
    private function usePusher(): void
    {
        config([
            'broadcasting.default' => 'pusher',
            'broadcasting.connections.pusher.key' => 'test-key',
            'broadcasting.connections.pusher.secret' => 'test-secret',
            'broadcasting.connections.pusher.app_id' => '1',
            'broadcasting.connections.pusher.options.cluster' => 'ap1',
        ]);

        // Channels were registered on the null driver at boot; register them on the Pusher driver too.
        require base_path('routes/channels.php');
    }

    /** Model changes made while arranging a test must not count as the change under test. */
    private function forgetArrangedSignals(): void
    {
        defer()->invoke();
    }

    private function authorize(int $branchId): TestResponse
    {
        return $this->postJson('/broadcasting/auth', [
            'socket_id' => self::SOCKET_ID,
            'channel_name' => 'private-'.TableFloorChanged::channelFor($branchId),
        ]);
    }

    // ── Who may listen ────────────────────────────────────────────────────

    /**
     * @param  array<int, string>  $access
     */
    #[DataProvider('floorStaff')]
    public function test_floor_staff_can_join_their_own_branch_channel(string $role, array $access): void
    {
        $this->usePusher();
        $branch = $this->branch();

        $response = $this->actingAs($this->staff($branch, $role, $access))->authorize($branch->id);

        $response->assertOk()->assertJsonStructure(['auth']);
    }

    /**
     * @return array<string, array{string, array<int, string>}>
     */
    public static function floorStaff(): array
    {
        return [
            'waiter with table ordering' => [User::ROLE_WAITER, ['41']],
            'cashier with the POS' => [User::ROLE_CASHIER, ['2']],
        ];
    }

    public function test_staff_from_another_branch_get_403_for_the_channel(): void
    {
        $this->usePusher();
        $branch = $this->branch();
        $outsider = $this->staff($this->branch('OTHER'), User::ROLE_WAITER, ['41']);

        $this->actingAs($outsider)->authorize($branch->id)->assertForbidden();
    }

    public function test_staff_without_table_or_pos_access_get_403_for_the_channel(): void
    {
        $this->usePusher();
        $branch = $this->branch();
        $backOffice = $this->staff($branch, User::ROLE_CASHIER, ['3']);

        $this->actingAs($backOffice)->authorize($branch->id)->assertForbidden();
    }

    public function test_guests_get_403_for_the_channel(): void
    {
        $this->usePusher();

        $this->authorize($this->branch()->id)->assertForbidden();
    }

    // ── What the browser is told ──────────────────────────────────────────

    public function test_waiter_page_shares_the_pusher_key_and_floor_channel_but_not_the_secret(): void
    {
        $this->usePusher();
        $branch = $this->branch();

        $response = $this->actingAs($this->staff($branch, User::ROLE_WAITER, ['41']))->get('/tables');

        $response->assertInertia(fn (Assert $page) => $page->where('realtime', [
            'key' => 'test-key',
            'cluster' => 'ap1',
            'floor_channel' => "private-branch.{$branch->id}.tables",
        ]));
    }

    public function test_waiter_page_shares_no_realtime_settings_when_pusher_is_not_the_broadcaster(): void
    {
        $response = $this->actingAs($this->staff($this->branch(), User::ROLE_WAITER, ['41']))->get('/tables');

        $response->assertInertia(fn (Assert $page) => $page->where('realtime', null));
    }

    // ── When the signal goes out ──────────────────────────────────────────

    public function test_marking_a_table_clean_announces_the_change_once_to_its_branch(): void
    {
        $branch = $this->branch();
        $table = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '7', 'status' => DiningTable::STATUS_CLEANING]);
        $this->forgetArrangedSignals();
        Event::fake([TableFloorChanged::class]);

        $this->actingAs($this->staff($branch, User::ROLE_WAITER, ['41']))->post("/tables/{$table->id}/available");

        Event::assertDispatchedTimes(TableFloorChanged::class, 1);
        Event::assertDispatched(fn (TableFloorChanged $event) => $event->branchId === $branch->id);
    }

    public function test_voiding_a_ticket_announces_one_change_even_though_ticket_and_table_both_update(): void
    {
        $branch = $this->branch();
        $cashier = $this->staff($branch, User::ROLE_CASHIER, ['2']);
        $table = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '7', 'status' => DiningTable::STATUS_OCCUPIED]);
        $ticket = TableOrder::create(['branch_id' => $branch->id, 'table_id' => $table->id, 'user_id' => $cashier->id]);
        $this->forgetArrangedSignals();
        Event::fake([TableFloorChanged::class]);

        $this->actingAs($cashier)->postJson("/pos/table-orders/{$ticket->id}/void", ['reason' => 'Guests left'])->assertOk();

        Event::assertDispatchedTimes(TableFloorChanged::class, 1);
        $this->assertSame(DiningTable::STATUS_CLEANING, $table->refresh()->status);
    }

    public function test_a_refused_request_that_changes_nothing_announces_nothing(): void
    {
        $branch = $this->branch();
        $waiter = $this->staff($branch, User::ROLE_WAITER, ['41']);
        $table = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '7', 'status' => DiningTable::STATUS_OCCUPIED]);
        TableOrder::create(['branch_id' => $branch->id, 'table_id' => $table->id, 'user_id' => $waiter->id]);
        $this->forgetArrangedSignals();
        Event::fake([TableFloorChanged::class]);

        $this->actingAs($waiter)->post("/tables/{$table->id}/available")->assertSessionHasErrors('error');

        Event::assertNotDispatched(TableFloorChanged::class);
    }

    public function test_a_pusher_outage_is_reported_and_does_not_fail_the_request(): void
    {
        Broadcast::extend('down', fn () => new class extends NullBroadcaster
        {
            public function broadcast(array $channels, $event, array $payload = []): void
            {
                throw new BroadcastException('Pusher is unreachable.');
            }
        });
        config(['broadcasting.default' => 'down', 'broadcasting.connections.down' => ['driver' => 'down']]);
        $branch = $this->branch();
        $table = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '7', 'status' => DiningTable::STATUS_CLEANING]);
        Exceptions::fake();

        $response = $this->actingAs($this->staff($branch, User::ROLE_WAITER, ['41']))->post("/tables/{$table->id}/available");

        $response->assertSessionHasNoErrors();
        $this->assertSame(DiningTable::STATUS_AVAILABLE, $table->refresh()->status);
        Exceptions::assertReported(BroadcastException::class);
    }
}
