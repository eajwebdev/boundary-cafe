<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpenseCategoryControllerTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $role): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Staff', 'username' => strtolower($role), 'password' => 'password',
            'role' => $role, 'access' => ['27'],
        ]);
    }

    public function test_creates_a_category_with_only_a_name(): void
    {
        $this->actingAs($this->staff(User::ROLE_MANAGER))->post(route('expense-categories.store'), ['name' => 'Utilities'])
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('expense_categories', ['name' => 'Utilities', 'description' => null, 'is_active' => true]);
    }

    public function test_updates_and_toggles_a_category(): void
    {
        $manager = $this->staff(User::ROLE_MANAGER);
        $category = ExpenseCategory::create(['name' => 'Utilities', 'color' => '#3b82f6', 'is_active' => true]);

        $this->actingAs($manager)->patch(route('expense-categories.update', $category), [
            'name' => 'Power & Water',
            'description' => 'Monthly bills',
        ])->assertSessionHasNoErrors();
        $this->actingAs($manager)->patch(route('expense-categories.toggle', $category))->assertSessionHasNoErrors();

        $category->refresh();
        $this->assertSame('Power & Water', $category->name);
        $this->assertSame('Monthly bills', $category->description);
        $this->assertFalse((bool) $category->is_active);
    }

    public function test_deletes_an_unused_category_but_keeps_one_with_expenses(): void
    {
        $manager = $this->staff(User::ROLE_MANAGER);
        $unused = ExpenseCategory::create(['name' => 'Unused', 'is_active' => true]);
        $used = ExpenseCategory::create(['name' => 'Used', 'is_active' => true]);
        $branch = Branch::create(['supplier_id' => Supplier::create(['name' => 'Test Supplier'])->id, 'name' => 'Home Branch', 'code' => 'HOME']);
        Expense::create(['expense_category_id' => $used->id, 'branch_id' => $branch->id, 'user_id' => $manager->id, 'amount' => 50, 'expense_date' => today(), 'description' => 'Ice']);

        $this->actingAs($manager)->delete(route('expense-categories.destroy', $unused))->assertSessionHasNoErrors();
        $this->actingAs($manager)->delete(route('expense-categories.destroy', $used))
            ->assertSessionHasErrors(['error' => 'Cannot delete category with existing expenses.']);

        $this->assertModelMissing($unused);
        $this->assertModelExists($used);
    }

    public function test_forbids_a_cashier_from_deleting_a_category(): void
    {
        $category = ExpenseCategory::create(['name' => 'Utilities', 'is_active' => true]);

        $this->actingAs($this->staff(User::ROLE_CASHIER))->delete(route('expense-categories.destroy', $category))
            ->assertForbidden();

        $this->assertModelExists($category);
    }
}
