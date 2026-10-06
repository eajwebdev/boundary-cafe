<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class UserControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_edit_form_receives_each_users_access_as_strings_with_role_defaults(): void
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Branch', 'code' => 'BR']);
        $admin = User::create(['fname' => 'Super', 'lname' => 'Admin', 'username' => 'owner', 'password' => 'password', 'role' => User::ROLE_SUPER_ADMIN]);
        $manager = User::create([
            'fname' => 'Mara', 'lname' => 'Manager', 'username' => 'mara', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id,
        ]);
        $cashier = User::create([
            'fname' => 'Cara', 'lname' => 'Cashier', 'username' => 'cara', 'password' => 'password',
            'role' => User::ROLE_CASHIER, 'branch_id' => $branch->id,
        ]);

        // Older rows (e.g. from the seeder) hold numbers; a user can also have nothing saved.
        DB::table('users')->where('id', $manager->id)->update(['access' => json_encode([1, 2, 3])]);
        DB::table('users')->where('id', $cashier->id)->update(['access' => null]);

        $this->actingAs($admin)
            ->get('/users')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Users/Index')
                ->where('users', fn ($users) => collect($users)->firstWhere('username', 'mara')['access'] === ['1', '2', '3']
                    && collect($users)->firstWhere('username', 'cara')['access'] === User::defaultAccessFor(User::ROLE_CASHIER)));
    }

    public function test_access_is_saved_as_strings(): void
    {
        $user = User::create([
            'fname' => 'Mara', 'lname' => 'Manager', 'username' => 'mara', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'access' => [1, 2, '2', 14],
        ]);

        $this->assertSame('["1","2","14"]', $user->getRawOriginal('access') ?? DB::table('users')->where('id', $user->id)->value('access'));
        $this->assertSame(['1', '2', '14'], $user->fresh()->access);
    }
}
