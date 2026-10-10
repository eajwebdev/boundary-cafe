<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpenseControllerTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $role): User
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);
        $branch = Branch::firstOrCreate(['code' => 'HOME'], ['supplier_id' => $supplier->id, 'name' => 'Home Branch']);

        return User::create([
            'fname' => 'Test', 'lname' => 'Staff', 'username' => strtolower($role), 'password' => 'password',
            'role' => $role, 'branch_id' => $branch->id, 'access' => ['17'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(ExpenseCategory $category, array $overrides = []): array
    {
        return $overrides + [
            'expense_category_id' => $category->id,
            'amount' => 250,
            'expense_date' => '2026-10-10',
            'description' => 'Ice delivery',
            'payment_method' => 'cash',
            'notes' => 'Two sacks, paid to driver',
        ];
    }

    public function test_records_an_expense_with_its_notes(): void
    {
        $cashier = $this->staff(User::ROLE_CASHIER);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);

        $this->actingAs($cashier)->post(route('expenses.store'), $this->payload($category))
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('expenses', [
            'branch_id' => $cashier->branch_id,
            'user_id' => $cashier->id,
            'amount' => 250,
            'description' => 'Ice delivery',
            'notes' => 'Two sacks, paid to driver',
            'status' => 'approved',
        ]);
    }

    public function test_branchless_super_admin_records_the_expense_on_the_working_branch(): void
    {
        $branch = $this->staff(User::ROLE_CASHIER)->branch;
        $superAdmin = User::create([
            'fname' => 'Test', 'lname' => 'Owner', 'username' => 'owner', 'password' => 'password',
            'role' => User::ROLE_SUPER_ADMIN,
        ]);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);

        $this->actingAs($superAdmin)->post(route('expenses.store'), $this->payload($category))
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('expenses', ['branch_id' => $branch->id, 'user_id' => $superAdmin->id, 'amount' => 250]);
    }

    public function test_rejects_an_expense_with_a_zero_amount(): void
    {
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);

        $this->actingAs($this->staff(User::ROLE_CASHIER))->post(route('expenses.store'), $this->payload($category, ['amount' => 0]))
            ->assertSessionHasErrors('amount');

        $this->assertSame(0, Expense::count());
    }

    public function test_manager_updates_and_deletes_an_expense(): void
    {
        $manager = $this->staff(User::ROLE_MANAGER);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);
        $expense = Expense::create(['expense_category_id' => $category->id, 'branch_id' => $manager->branch_id, 'user_id' => $manager->id, 'amount' => 250, 'expense_date' => '2026-10-10', 'description' => 'Ice']);

        $this->actingAs($manager)->patch(route('expenses.update', $expense), $this->payload($category, ['amount' => 300, 'notes' => 'Corrected']))
            ->assertSessionHasNoErrors();
        $this->assertDatabaseHas('expenses', ['id' => $expense->id, 'amount' => 300, 'notes' => 'Corrected']);

        $this->actingAs($manager)->delete(route('expenses.destroy', $expense))->assertSessionHasNoErrors();
        $this->assertModelMissing($expense);
    }

    public function test_forbids_a_cashier_from_deleting_an_expense(): void
    {
        $cashier = $this->staff(User::ROLE_CASHIER);
        $category = ExpenseCategory::create(['name' => 'Supplies', 'is_active' => true]);
        $expense = Expense::create(['expense_category_id' => $category->id, 'branch_id' => $cashier->branch_id, 'user_id' => $cashier->id, 'amount' => 250, 'expense_date' => '2026-10-10', 'description' => 'Ice']);

        $this->actingAs($cashier)->delete(route('expenses.destroy', $expense))->assertForbidden();

        $this->assertModelExists($expense);
    }
}
