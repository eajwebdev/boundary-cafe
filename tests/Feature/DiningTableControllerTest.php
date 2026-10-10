<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Supplier;
use App\Models\TableOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DiningTableControllerTest extends TestCase
{
    use RefreshDatabase;

    private function branch(string $code): Branch
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => "Branch {$code}", 'code' => $code]);
    }

    private function manager(Branch $branch): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['42'],
        ]);
    }

    public function test_creates_a_table_in_the_managers_branch(): void
    {
        $branch = $this->branch('HOME');

        $this->actingAs($this->manager($branch))->post(route('dining-tables.store'), [
            'table_number' => ' 7 ',
            'section' => 'Patio',
            'capacity' => 6,
        ])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('tables', [
            'branch_id' => $branch->id, 'table_number' => '7', 'section' => 'Patio', 'capacity' => 6, 'status' => 'available',
        ]);
    }

    public function test_rejects_a_table_without_a_number(): void
    {
        $this->actingAs($this->manager($this->branch('HOME')))->post(route('dining-tables.store'), ['table_number' => ''])
            ->assertSessionHasErrors('table_number');

        $this->assertSame(0, DiningTable::count());
    }

    public function test_updates_a_table(): void
    {
        $branch = $this->branch('HOME');
        $table = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '7', 'capacity' => 4, 'status' => 'available', 'is_active' => true]);

        $this->actingAs($this->manager($branch))->patch(route('dining-tables.update', $table), [
            'table_number' => '8',
            'capacity' => 2,
            'status' => 'reserved',
            'is_active' => false,
        ])->assertRedirect()->assertSessionHasNoErrors();

        $table->refresh();
        $this->assertSame('8', $table->table_number);
        $this->assertSame(2, (int) $table->capacity);
        $this->assertSame('reserved', $table->status);
        $this->assertFalse((bool) $table->is_active);
    }

    public function test_forbids_editing_another_branchs_table(): void
    {
        $away = DiningTable::create(['branch_id' => $this->branch('AWAY')->id, 'table_number' => '1', 'status' => 'available', 'is_active' => true]);

        $this->actingAs($this->manager($this->branch('HOME')))
            ->patch(route('dining-tables.update', $away), ['table_number' => 'X'])
            ->assertForbidden();

        $this->assertSame('1', $away->fresh()->table_number);
    }

    public function test_deletes_a_free_table_but_keeps_one_with_an_open_order(): void
    {
        $branch = $this->branch('HOME');
        $manager = $this->manager($branch);
        $free = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '1', 'status' => 'available', 'is_active' => true]);
        $busy = DiningTable::create(['branch_id' => $branch->id, 'table_number' => '2', 'status' => 'occupied', 'is_active' => true]);
        TableOrder::create(['order_number' => 'TO-1', 'branch_id' => $branch->id, 'table_id' => $busy->id, 'user_id' => $manager->id, 'status' => 'open']);

        $this->actingAs($manager)->delete(route('dining-tables.destroy', $free))->assertSessionHasNoErrors();
        $this->actingAs($manager)->delete(route('dining-tables.destroy', $busy))
            ->assertSessionHasErrors(['error' => 'Cannot delete a table with an active order.']);

        $this->assertModelMissing($free);
        $this->assertModelExists($busy);
    }
}
