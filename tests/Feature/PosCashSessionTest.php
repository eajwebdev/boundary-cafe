<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PosCashSessionTest extends TestCase
{
    use RefreshDatabase;

    private function cashier(): User
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create([
            'supplier_id' => $supplier->id,
            'name' => 'Test Branch',
            'code' => 'TEST',
        ]);

        return User::create([
            'fname' => 'Test',
            'lname' => 'Cashier',
            'username' => 'test-cashier',
            'password' => 'password',
            'role' => User::ROLE_CASHIER,
            'branch_id' => $branch->id,
            'access' => ['2'],
        ]);
    }

    public function test_cashier_without_a_session_today_is_locked_out_of_checkout(): void
    {
        $cashier = $this->cashier();

        $response = $this->actingAs($cashier)
            ->from(route('pos.index'))
            ->post(route('pos.store'));

        $response->assertRedirect(route('pos.index'));
        $response->assertSessionHasErrors([
            'cash_session' => "Open today's cash session before processing a sale.",
        ]);
        $this->assertDatabaseCount('cash_sessions', 0);
    }

    public function test_cashier_can_open_todays_session_directly_from_pos(): void
    {
        $cashier = $this->cashier();

        $response = $this->actingAs($cashier)
            ->from(route('pos.index'))
            ->post(route('pos.session.open'), [
                'opening_cash' => 1250.50,
                'notes' => 'Morning shift',
            ]);

        $response->assertRedirect(route('pos.index'));
        $response->assertSessionHasNoErrors();
        $this->assertDatabaseHas('cash_sessions', [
            'user_id' => $cashier->id,
            'branch_id' => $cashier->branch_id,
            'opening_cash' => 1250.50,
            'notes' => 'Morning shift',
            'status' => 'open',
        ]);
    }

    public function test_a_background_poll_does_not_swallow_the_flash_meant_for_the_pos(): void
    {
        $cashier = $this->cashier();

        $this->actingAs($cashier)->from(route('pos.index'))
            ->post(route('pos.session.open'), ['opening_cash' => 500])
            ->assertRedirect(route('pos.index'));

        // The pending-orders poll fires before the browser follows the redirect.
        $this->actingAs($cashier)->getJson(route('pos.pending'))->assertOk();

        $this->actingAs($cashier)->get(route('pos.index'))
            ->assertInertia(fn (Assert $page) => $page->where('flash.message.type', 'success'));
    }

    public function test_pos_only_returns_an_open_session_from_today_for_a_cashier(): void
    {
        $cashier = $this->cashier();

        CashSession::create([
            'user_id' => $cashier->id,
            'branch_id' => $cashier->branch_id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now()->subDay(),
        ]);

        $this->actingAs($cashier)
            ->get(route('pos.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Pos/Index')
                ->where('session', null));
    }

    public function test_pos_flags_yesterdays_unclosed_session_so_the_cashier_can_close_it(): void
    {
        $cashier = $this->cashier();
        $stale = CashSession::create([
            'user_id' => $cashier->id,
            'branch_id' => $cashier->branch_id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now()->subDay(),
        ]);

        $this->actingAs($cashier)
            ->get(route('pos.index'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('session', null)
                ->where('stale_session.id', $stale->id)
                ->where('stale_session.expected_cash', 500)
                ->where('stale_session.sale_count', 0));
    }

    public function test_cashier_closes_yesterdays_session_from_pos_then_opens_today(): void
    {
        $cashier = $this->cashier();
        $stale = CashSession::create([
            'user_id' => $cashier->id,
            'branch_id' => $cashier->branch_id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now()->subDay(),
        ]);

        $this->actingAs($cashier)->from(route('pos.index'))
            ->post(route('pos.session.close', $stale), ['counted_cash' => 480, 'notes' => 'Forgot to close'])
            ->assertRedirect(route('pos.index'))
            ->assertSessionHasNoErrors();

        $stale->refresh();
        $this->assertSame('closed', $stale->status);
        $this->assertEquals(-20, $stale->over_short);

        $this->actingAs($cashier)->from(route('pos.index'))
            ->post(route('pos.session.open'), ['opening_cash' => 480])
            ->assertSessionHasNoErrors();

        $this->actingAs($cashier)
            ->get(route('pos.index'))
            ->assertInertia(fn (Assert $page) => $page
                ->where('stale_session', null)
                ->where('session.opening_cash', 480));
    }

    public function test_cashier_cannot_close_someone_elses_session_from_pos(): void
    {
        $cashier = $this->cashier();
        $other = User::create([
            'fname' => 'Other',
            'lname' => 'Cashier',
            'username' => 'other-cashier',
            'password' => 'password',
            'role' => User::ROLE_CASHIER,
            'branch_id' => $cashier->branch_id,
            'access' => ['2'],
        ]);
        $session = CashSession::create([
            'user_id' => $other->id,
            'branch_id' => $cashier->branch_id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now()->subDay(),
        ]);

        $this->actingAs($cashier)
            ->post(route('pos.session.close', $session), ['counted_cash' => 500])
            ->assertForbidden();
        $this->assertSame('open', $session->fresh()->status);
    }
}
