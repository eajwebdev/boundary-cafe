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
}
