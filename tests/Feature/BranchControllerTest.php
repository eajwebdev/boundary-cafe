<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BranchControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_superadmin_can_create_branch(): void
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $superAdmin = $this->staff(User::ROLE_SUPER_ADMIN);

        $this->actingAs($superAdmin)->post(route('branches.store'), [
            'name' => 'New Branch',
            'code' => 'NEW',
            'business_type' => Branch::TYPE_CAFE,
            'supplier_id' => $supplier->id,
        ])->assertRedirect();

        $this->assertDatabaseHas('branches', ['name' => 'New Branch', 'code' => 'NEW']);
    }

    public function test_administrator_cannot_create_branch(): void
    {
        $administrator = $this->staff(User::ROLE_ADMINISTRATOR);

        $this->actingAs($administrator)->post(route('branches.store'), [
            'name' => 'Unauthorized Branch',
            'code' => 'NOPE',
            'business_type' => Branch::TYPE_CAFE,
        ])->assertForbidden();

        $this->assertDatabaseMissing('branches', ['code' => 'NOPE']);
    }

    public function test_administrator_can_view_and_edit_branch_details(): void
    {
        $branch = $this->branch();
        $administrator = $this->staff(User::ROLE_ADMINISTRATOR, $branch);

        $this->actingAs($administrator)->get(route('branches.index'))->assertOk();
        $this->actingAs($administrator)->patch(route('branches.update', $branch), [
            'name' => 'Renamed Branch',
            'code' => 'BR',
            'business_type' => Branch::TYPE_CAFE,
            'supplier_id' => $branch->supplier_id,
        ])->assertRedirect();

        $this->assertDatabaseHas('branches', ['id' => $branch->id, 'name' => 'Renamed Branch']);
    }

    public function test_administrator_cannot_change_branch_active_status(): void
    {
        $branch = $this->branch();
        $administrator = $this->staff(User::ROLE_ADMINISTRATOR, $branch);

        $this->actingAs($administrator)->patch(route('branches.update', $branch), [
            'name' => $branch->name,
            'code' => $branch->code,
            'business_type' => Branch::TYPE_CAFE,
            'is_active' => false,
        ])->assertForbidden();
        $this->actingAs($administrator)->patch(route('branches.toggle', $branch))->assertForbidden();

        $this->assertTrue($branch->fresh()->is_active);
    }

    public function test_administrator_cannot_delete_branch(): void
    {
        $branch = $this->branch();
        $administrator = $this->staff(User::ROLE_ADMINISTRATOR, $branch);

        $this->actingAs($administrator)->delete(route('branches.destroy', $branch))->assertForbidden();

        $this->assertModelExists($branch);
    }

    public function test_manager_cannot_edit_branch_even_with_branch_menu_access(): void
    {
        $branch = $this->branch();
        $manager = $this->staff(User::ROLE_MANAGER, $branch);
        $manager->update(['access' => ['25']]);

        $this->actingAs($manager)->get(route('branches.index'))->assertForbidden();
        $this->actingAs($manager)->patch(route('branches.update', $branch), [
            'name' => 'Unauthorized Name',
            'code' => 'BR',
            'business_type' => Branch::TYPE_CAFE,
            'supplier_id' => $branch->supplier_id,
        ])->assertForbidden();

        $this->assertSame('Branch', $branch->fresh()->name);
    }

    private function branch(): Branch
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => 'Branch', 'code' => 'BR', 'business_type' => Branch::TYPE_CAFE]);
    }

    private function staff(string $role, ?Branch $branch = null): User
    {
        return User::create([
            'fname' => 'Test',
            'lname' => 'Staff',
            'username' => strtolower($role),
            'password' => 'password',
            'role' => $role,
            'branch_id' => $branch?->id,
        ]);
    }
}
