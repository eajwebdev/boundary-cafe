<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\OnlineOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StoreSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    protected function setUp(): void
    {
        parent::setUp();
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $this->branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Boundary Cafe – Mabinay', 'code' => 'BC-MAB', 'business_type' => Branch::TYPE_CAFE]);
        SystemSetting::set('online.store_hours', ['open' => '00:00', 'close' => '23:59', 'days' => [0, 1, 2, 3, 4, 5, 6]]);
    }

    public function test_manager_closing_the_store_today_shows_it_closed_on_the_storefront(): void
    {
        $this->actingAs($this->staff(User::ROLE_MANAGER))
            ->post(route('store-settings.close-today', $this->branch), ['note' => 'Town fiesta'])
            ->assertRedirect();

        $this->get(route('home'))->assertInertia(fn (Assert $page) => $page
            ->where('store.status.is_open', false)
            ->where('store.status.closed_today', true)
            ->where('store.status.message', 'We are closed today: Town fiesta'));
        $this->assertDatabaseHas('activity_logs', ['action' => 'store_closed_today', 'subject_id' => $this->branch->id]);
    }

    public function test_closure_lapses_the_next_day(): void
    {
        $this->travelTo(now()->timezone('Asia/Manila')->setTime(10, 0));
        $this->actingAs($this->staff(User::ROLE_MANAGER))->post(route('store-settings.close-today', $this->branch));

        $this->travel(1)->days();

        $status = app(OnlineOrderService::class)->storeStatus($this->branch);
        $this->assertTrue($status['is_open']);
        $this->assertFalse($status['closed_today']);
    }

    public function test_reopening_lets_customers_order_again_today(): void
    {
        $manager = $this->staff(User::ROLE_MANAGER);
        $this->actingAs($manager)->post(route('store-settings.close-today', $this->branch));

        $this->actingAs($manager)->delete(route('store-settings.reopen', $this->branch))->assertRedirect();

        $this->assertTrue(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    public function test_cashier_without_store_settings_access_cannot_close_the_store(): void
    {
        $this->actingAs($this->staff(User::ROLE_CASHIER))
            ->post(route('store-settings.close-today', $this->branch))
            ->assertRedirect()
            ->assertSessionHas('error', 'You do not have access to that page.');

        $this->assertTrue(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    public function test_cashier_granted_store_settings_access_can_close_the_store(): void
    {
        $cashier = $this->staff(User::ROLE_CASHIER);
        $cashier->update(['access' => array_merge(User::defaultAccessFor(User::ROLE_CASHIER), ['48'])]);

        $this->actingAs($cashier)->post(route('store-settings.close-today', $this->branch))->assertSessionHasNoErrors();

        $this->assertFalse(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    public function test_administrator_can_close_and_reopen_a_branch_other_than_their_own(): void
    {
        $administrator = $this->staff(User::ROLE_ADMINISTRATOR, $this->otherBranch());

        $this->actingAs($administrator)->get(route('store-settings.index'))->assertInertia(fn (Assert $page) => $page
            ->component('StoreSettings/Index')
            ->has('branches', 2)
            ->where('branches.0.id', $this->branch->id)
            ->where('branches.0.takes_online_orders', true));

        $this->actingAs($administrator)->post(route('store-settings.close-today', $this->branch))->assertSessionHasNoErrors();
        $this->assertFalse(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);

        $this->actingAs($administrator)->delete(route('store-settings.reopen', $this->branch))->assertRedirect();
        $this->assertTrue(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    public function test_manager_cannot_close_another_branch(): void
    {
        $manager = $this->staff(User::ROLE_MANAGER, $this->otherBranch());

        $this->actingAs($manager)->get(route('store-settings.index'))->assertInertia(fn (Assert $page) => $page->has('branches', 1));
        $this->actingAs($manager)->post(route('store-settings.close-today', $this->branch))->assertForbidden();

        $this->assertTrue(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    public function test_reason_longer_than_160_characters_is_rejected(): void
    {
        $this->actingAs($this->staff(User::ROLE_MANAGER))
            ->post(route('store-settings.close-today', $this->branch), ['note' => str_repeat('a', 161)])
            ->assertSessionHasErrors(['note' => 'The note field must not be greater than 160 characters.']);

        $this->assertTrue(app(OnlineOrderService::class)->storeStatus($this->branch)['is_open']);
    }

    private function otherBranch(): Branch
    {
        return Branch::create(['supplier_id' => $this->branch->supplier_id, 'name' => 'Boundary Cafe – Tagukon', 'code' => 'BC-TAG', 'business_type' => Branch::TYPE_CAFE]);
    }

    private function staff(string $role, ?Branch $branch = null): User
    {
        return User::create([
            'fname' => 'Test',
            'lname' => 'Staff',
            'username' => strtolower($role),
            'password' => 'password',
            'role' => $role,
            'branch_id' => ($branch ?? $this->branch)->id,
        ]);
    }
}
