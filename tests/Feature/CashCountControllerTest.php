<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashCount;
use App\Models\CashSession;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CashCountControllerTest extends TestCase
{
    use RefreshDatabase;

    private function cashier(): User
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);

        return User::create([
            'fname' => 'Test', 'lname' => 'Cashier', 'username' => 'cashier', 'password' => 'password',
            'role' => User::ROLE_CASHIER, 'branch_id' => $branch->id, 'access' => ['15'],
        ]);
    }

    public function test_a_closing_count_closes_the_session_with_its_over_short(): void
    {
        $cashier = $this->cashier();
        $session = CashSession::create(['user_id' => $cashier->id, 'branch_id' => $cashier->branch_id, 'opening_cash' => 500, 'status' => 'open', 'opened_at' => now()]);

        $this->actingAs($cashier)->post(route('cash-counts.store'), [
            'cash_session_id' => $session->id,
            'count_type' => 'closing',
            'denominations' => [
                ['denomination' => 500, 'quantity' => 1],
                ['denomination' => 20, 'quantity' => 1],
                ['denomination' => 1, 'quantity' => 0],
            ],
        ])->assertRedirect()->assertSessionHasNoErrors();

        $session->refresh();
        $this->assertSame('closed', $session->status);
        $this->assertEquals(520, $session->counted_cash);
        $this->assertEquals(20, $session->over_short);
        $this->assertEquals(520, CashCount::sole()->counted_total);
    }

    public function test_a_midshift_count_keeps_the_session_open(): void
    {
        $cashier = $this->cashier();
        $session = CashSession::create(['user_id' => $cashier->id, 'branch_id' => $cashier->branch_id, 'opening_cash' => 500, 'status' => 'open', 'opened_at' => now()]);

        $this->actingAs($cashier)->post(route('cash-counts.store'), [
            'cash_session_id' => $session->id,
            'count_type' => 'midshift',
            'denominations' => [['denomination' => 100, 'quantity' => 5]],
        ])->assertSessionHasNoErrors();

        $this->assertSame('open', $session->fresh()->status);
        $this->assertEquals(500, CashCount::sole()->counted_total);
    }

    public function test_another_cashier_cannot_submit_the_closing_count(): void
    {
        $owner = $this->cashier();
        $other = User::create([
            'fname' => 'Other', 'lname' => 'Cashier', 'username' => 'other', 'password' => 'password',
            'role' => User::ROLE_CASHIER, 'branch_id' => $owner->branch_id, 'access' => ['15'],
        ]);
        $session = CashSession::create(['user_id' => $owner->id, 'branch_id' => $owner->branch_id, 'opening_cash' => 500, 'status' => 'open', 'opened_at' => now()]);

        $this->actingAs($other)->post(route('cash-counts.store'), [
            'cash_session_id' => $session->id, 'count_type' => 'closing', 'denominations' => [],
        ])->assertSessionHasErrors('error');

        $this->assertSame('open', $session->fresh()->status);
    }
}
