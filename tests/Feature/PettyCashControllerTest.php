<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\ExpenseCategory;
use App\Models\PettyCashFund;
use App\Models\PettyCashVoucher;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PettyCashControllerTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);

        return User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['16'],
        ]);
    }

    private function fund(User $manager, float $balance = 1000): PettyCashFund
    {
        return PettyCashFund::create([
            'branch_id' => $manager->branch_id, 'managed_by' => $manager->id, 'fund_name' => 'Counter fund',
            'fund_amount' => $balance, 'current_balance' => $balance, 'status' => 'active',
        ]);
    }

    public function test_creates_a_fund_with_its_opening_balance(): void
    {
        $manager = $this->manager();

        $this->actingAs($manager)->post(route('petty-cash.funds.store'), ['fund_name' => 'Counter fund', 'fund_amount' => 2000])
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('petty_cash_funds', [
            'branch_id' => $manager->branch_id, 'fund_name' => 'Counter fund', 'fund_amount' => 2000, 'current_balance' => 2000, 'status' => 'active',
        ]);
    }

    public function test_a_withdrawal_takes_cash_from_the_fund_and_records_an_expense(): void
    {
        $manager = $this->manager();
        $fund = $this->fund($manager);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);

        $this->actingAs($manager)->post(route('petty-cash.store'), [
            'fund_id' => $fund->id, 'voucher_type' => 'withdrawal', 'amount' => 150,
            'expense_category_id' => $category->id, 'payee' => 'Ice supplier', 'purpose' => 'Two sacks of ice',
        ])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertEquals(850, $fund->fresh()->current_balance);
        $voucher = PettyCashVoucher::sole();
        $this->assertSame('approved', $voucher->status);
        $this->assertDatabaseHas('expenses', ['id' => $voucher->expense_id, 'branch_id' => $manager->branch_id, 'amount' => 150]);
    }

    public function test_rejects_a_withdrawal_larger_than_the_fund_balance(): void
    {
        $manager = $this->manager();
        $fund = $this->fund($manager, 100);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);

        $this->actingAs($manager)->post(route('petty-cash.store'), [
            'fund_id' => $fund->id, 'voucher_type' => 'withdrawal', 'amount' => 150,
            'expense_category_id' => $category->id, 'payee' => 'Ice supplier', 'purpose' => 'Two sacks of ice',
        ])->assertSessionHasErrors(['amount' => 'Insufficient petty cash balance. Available: ₱100.00']);

        $this->assertEquals(100, $fund->fresh()->current_balance);
        $this->assertSame(0, PettyCashVoucher::count());
    }

    public function test_rejecting_a_voucher_that_is_already_approved_shows_an_error(): void
    {
        $manager = $this->manager();
        $fund = $this->fund($manager);
        $voucher = PettyCashVoucher::create([
            'petty_cash_fund_id' => $fund->id, 'requested_by' => $manager->id, 'voucher_type' => 'replenishment',
            'amount' => 200, 'payee' => 'Owner', 'purpose' => 'Top up', 'status' => 'pending',
        ]);
        $voucher->approve($manager->id);

        $this->actingAs($manager)->post(route('petty-cash.reject', $voucher), ['reason' => 'Changed my mind'])
            ->assertRedirect()
            ->assertSessionHasErrors(['error' => 'This voucher is no longer pending.']);

        $this->assertSame('approved', $voucher->fresh()->status);
    }

    public function test_closes_a_fund(): void
    {
        $manager = $this->manager();
        $fund = $this->fund($manager);

        $this->actingAs($manager)->patch(route('petty-cash.funds.close', $fund))->assertSessionHasNoErrors();

        $this->assertSame('closed', $fund->fresh()->status);
    }
}
