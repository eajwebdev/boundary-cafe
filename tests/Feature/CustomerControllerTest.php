<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\CustomerSocialAccount;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CustomerControllerTest extends TestCase
{
    use RefreshDatabase;

    private function branch(string $code): Branch
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => "Branch {$code}", 'code' => $code]);
    }

    private function sale(Branch $branch, Customer $customer, float $balanceDue, string $status = 'completed'): Sale
    {
        return Sale::create([
            'branch_id' => $branch->id,
            'customer_id' => $customer->id,
            'total' => 500,
            'amount_paid' => 500 - $balanceDue,
            'balance_due' => $balanceDue,
            'payment_status' => $balanceDue > 0 ? 'partial' : 'paid',
            'status' => $status,
        ]);
    }

    public function test_index_summarises_customers_and_lists_who_owes_credit_in_the_branch(): void
    {
        $branch = $this->branch('HOME');
        $otherBranch = $this->branch('AWAY');
        $manager = User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['39'],
        ]);

        $ana = Customer::create(['name' => 'Ana', 'branch_id' => $branch->id, 'password' => 'secret123', 'loyalty_points' => 40]);
        $ben = Customer::create(['name' => 'Ben', 'branch_id' => $branch->id, 'loyalty_points' => 10]);
        Customer::create(['name' => 'Cy', 'branch_id' => $branch->id, 'is_active' => false]);
        $outsider = Customer::create(['name' => 'Dee', 'branch_id' => $otherBranch->id, 'loyalty_points' => 999]);

        $this->sale($branch, $ana, 120);
        $this->sale($branch, $ana, 500, 'voided');
        $this->sale($branch, $ben, 0);
        $this->sale($otherBranch, $outsider, 300);

        $this->actingAs($manager)
            ->get('/customers')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Customers/Index')
                ->where('stats', [
                    'total' => 3,
                    'active' => 2,
                    'online_accounts' => 1,
                    'loyalty_points' => 50,
                    'owing_count' => 1,
                    'credit_outstanding' => 120,
                ])
                ->where('owing', [
                    ['id' => $ana->id, 'name' => 'Ana', 'customer_number' => $ana->customer_number, 'credit_balance' => 120],
                ])
                ->where('customers.data.0.name', 'Ana')
                ->where('customers.data.0.has_online_account', 1)
                ->missing('customers.data.0.password')
                ->where('customers.data.1.has_online_account', 0));
    }

    public function test_customers_registered_online_under_another_branch_are_listed(): void
    {
        $branch = $this->branch('HOME');
        $onlineBranch = $this->branch('ONLINE');
        $manager = $this->manager($branch);

        Customer::create(['name' => 'Ana', 'branch_id' => $onlineBranch->id, 'password' => 'secret123']);
        $google = Customer::create(['name' => 'Ben', 'branch_id' => $onlineBranch->id]);
        CustomerSocialAccount::create(['customer_id' => $google->id, 'provider' => 'google', 'provider_user_id' => 'g-1']);
        Customer::create(['name' => 'Cy', 'branch_id' => $onlineBranch->id]);

        $this->actingAs($manager)
            ->get('/customers')
            ->assertInertia(fn (Assert $page) => $page
                ->where('stats.total', 2)
                ->where('stats.online_accounts', 2)
                ->has('customers.data', 2)
                ->where('customers.data.0.name', 'Ana')
                ->where('customers.data.1.name', 'Ben')
                ->where('customers.data.1.has_online_account', 1));
    }

    public function test_staff_can_open_a_registered_customer_from_another_branch_but_not_delete_them(): void
    {
        $branch = $this->branch('HOME');
        $onlineBranch = $this->branch('ONLINE');
        $manager = $this->manager($branch);
        $registered = Customer::create(['name' => 'Ana', 'branch_id' => $onlineBranch->id, 'password' => 'secret123']);
        $walkIn = Customer::create(['name' => 'Cy', 'branch_id' => $onlineBranch->id]);

        $this->actingAs($manager)->get("/customers/{$registered->id}")->assertOk();
        $this->actingAs($manager)->delete("/customers/{$registered->id}")->assertForbidden();
        $this->actingAs($manager)->get("/customers/{$walkIn->id}")->assertForbidden();

        $this->assertModelExists($registered);
    }

    public function test_new_customers_get_running_member_numbers_from_c_0001(): void
    {
        $manager = $this->manager($this->branch('HOME'));

        $this->actingAs($manager)->post('/customers', ['name' => 'Ana'])->assertSessionHasNoErrors();
        $this->actingAs($manager)->post('/customers', ['name' => 'Ben'])->assertSessionHasNoErrors();

        $this->assertSame(['C-0001', 'C-0002'], Customer::orderBy('id')->pluck('customer_number')->all());

        Customer::create(['name' => 'Cy', 'customer_number' => 'C-9999']);
        $this->assertSame('C-10000', Customer::create(['name' => 'Dee'])->customer_number);
    }

    private function manager(Branch $branch): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['39'],
        ]);
    }
}
