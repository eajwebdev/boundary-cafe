<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class OrderTakerAccessTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();

        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $this->branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Branch TEST', 'code' => 'TEST']);
    }

    /**
     * @param  array<int, string>  $access
     */
    private function staff(string $role, array $access = []): User
    {
        return User::create([
            'fname' => 'Test',
            'lname' => ucfirst($role),
            'username' => $role,
            'password' => 'password',
            'role' => $role,
            'branch_id' => $this->branch->id,
            'access' => $access,
        ]);
    }

    /** An order taker who was (wrongly) ticked for POS, products and dashboard access. */
    private function orderTakerWithExtraAccess(): User
    {
        return $this->staff(User::ROLE_WAITER, ['1', '2', '6', '41']);
    }

    public function test_order_taker_opens_the_table_ordering_screen_with_only_table_access_shared(): void
    {
        $this->actingAs($this->orderTakerWithExtraAccess())
            ->get('/tables')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('TableOrders/Waiter')
                ->where('auth.user.access', ['41']));
    }

    #[TestWith(['/pos'])]
    #[TestWith(['/products'])]
    #[TestWith(['/dashboard'])]
    public function test_order_taker_is_sent_back_to_tables_from_other_pages_despite_ticked_access(string $page): void
    {
        $this->actingAs($this->orderTakerWithExtraAccess())
            ->get($page)
            ->assertRedirect(route('table-orders.index'));
    }

    #[TestWith(['/loyalty/lookup'])]
    #[TestWith(['/ai/chat'])]
    public function test_order_taker_is_forbidden_from_staff_actions_without_a_menu_check(string $uri): void
    {
        $this->actingAs($this->orderTakerWithExtraAccess())
            ->post($uri, ['code' => 'X'])
            ->assertForbidden()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Errors/403')
                ->where('message', 'Order takers can only take table orders.'));
    }

    public function test_order_taker_is_forbidden_instead_of_redirect_looping_when_table_ordering_is_disabled(): void
    {
        SystemSetting::set('modules.menu_41', 'false');

        $this->actingAs($this->orderTakerWithExtraAccess())
            ->get('/pos')
            ->assertForbidden();
    }

    public function test_cashier_still_reaches_staff_actions_outside_table_ordering(): void
    {
        $this->actingAs($this->staff(User::ROLE_CASHIER))
            ->postJson('/loyalty/lookup', ['code' => 'missing'])
            ->assertNotFound();
    }

    public function test_saving_an_order_taker_stores_table_ordering_access_only(): void
    {
        $this->actingAs($this->staff(User::ROLE_SUPER_ADMIN))
            ->post('/users', [
                'fname' => 'Olive',
                'lname' => 'Taker',
                'username' => 'olive',
                'password' => 'secret123',
                'role' => User::ROLE_WAITER,
                'branch_id' => $this->branch->id,
                'access' => ['1', '2', '6', '41'],
            ])
            ->assertSessionHasNoErrors();

        $this->assertSame(['41'], User::where('username', 'olive')->value('access'));
    }
}
