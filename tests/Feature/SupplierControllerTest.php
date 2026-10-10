<?php

namespace Tests\Feature;

use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupplierControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_SUPER_ADMIN,
        ]);
    }

    public function test_creates_a_supplier(): void
    {
        $this->actingAs($this->admin())->post(route('suppliers.store'), [
            'name' => '  Bean Traders  ',
            'phone' => '09171234567',
            'contact_person' => 'Rosa',
        ])->assertRedirect()->assertSessionHasNoErrors();

        $this->assertDatabaseHas('suppliers', ['name' => 'Bean Traders', 'phone' => '09171234567', 'contact_person' => 'Rosa']);
    }

    public function test_rejects_a_duplicate_supplier_name(): void
    {
        Supplier::create(['name' => 'Bean Traders']);

        $this->actingAs($this->admin())->post(route('suppliers.store'), ['name' => 'Bean Traders'])
            ->assertSessionHasErrors(['name' => 'A supplier with this name already exists.']);

        $this->assertSame(1, Supplier::where('name', 'Bean Traders')->count());
    }

    public function test_updates_a_supplier_and_clears_fields_left_empty(): void
    {
        $supplier = Supplier::create(['name' => 'Bean Traders', 'phone' => '09171234567', 'contact_person' => 'Rosa']);

        $this->actingAs($this->admin())->patch(route('suppliers.update', $supplier), [
            'name' => 'Bean Traders Inc.',
            'phone' => '',
            'contact_person' => 'Lito',
        ])->assertRedirect()->assertSessionHasNoErrors();

        $supplier->refresh();
        $this->assertSame('Bean Traders Inc.', $supplier->name);
        $this->assertNull($supplier->phone);
        $this->assertSame('Lito', $supplier->contact_person);
    }

    public function test_deletes_a_supplier_without_orders(): void
    {
        $supplier = Supplier::create(['name' => 'Bean Traders']);

        $this->actingAs($this->admin())->delete(route('suppliers.destroy', $supplier))
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertModelMissing($supplier);
    }
}
