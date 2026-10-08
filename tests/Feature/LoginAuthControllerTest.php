<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\BranchSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LoginAuthControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_login_lists_seeded_waiter_without_exposing_superadmin_or_passwords(): void
    {
        config()->set('app.demo', true);
        $this->seed([BranchSeeder::class, UserSeeder::class]);

        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
            ->component('Login')
            ->where('is_demo', true)
            ->where('demo_users', fn ($users) => collect($users)->contains(fn ($user) => $user['username'] === 'waiter' && $user['role'] === User::ROLE_WAITER)
                && collect($users)->doesntContain(fn ($user) => $user['role'] === User::ROLE_SUPER_ADMIN || array_key_exists('password', $user))));
    }

    public function test_demo_shortcut_signs_in_seeded_waiter_and_opens_table_orders(): void
    {
        config()->set('app.demo', true);
        $this->seed([BranchSeeder::class, UserSeeder::class]);

        $this->post(route('login.demo'), ['username' => 'waiter'])
            ->assertRedirect(route('table-orders.index'));

        $this->assertAuthenticatedAs(User::where('username', 'waiter')->firstOrFail());
    }

    public function test_demo_shortcut_is_unavailable_when_demo_is_disabled(): void
    {
        config()->set('app.demo', false);
        $this->seed([BranchSeeder::class, UserSeeder::class]);

        $this->get(route('login'))->assertInertia(fn (Assert $page) => $page
            ->component('Login')
            ->where('is_demo', false)
            ->where('demo_users', []));

        $this->post(route('login.demo'), ['username' => 'waiter'])->assertNotFound();
        $this->assertGuest();
    }

    public function test_demo_shortcut_rejects_superadmin_and_unlisted_accounts(): void
    {
        config()->set('app.demo', true);
        $this->seed([BranchSeeder::class, UserSeeder::class]);

        $this->post(route('login.demo'), ['username' => 'superadmin'])->assertNotFound();
        $this->post(route('login.demo'), ['username' => 'someone_else'])->assertNotFound();
        $this->assertGuest();
    }

    public function test_demo_shortcut_rejects_seeded_username_if_its_role_becomes_superadmin(): void
    {
        config()->set('app.demo', true);
        $this->seed([BranchSeeder::class, UserSeeder::class]);
        User::where('username', 'waiter')->firstOrFail()->update(['role' => User::ROLE_SUPER_ADMIN]);

        $this->post(route('login.demo'), ['username' => 'waiter'])->assertNotFound();
        $this->assertGuest();
    }

    public function test_demo_password_fallback_cannot_sign_in_superadmin(): void
    {
        config()->set('app.demo', true);
        $this->seed([BranchSeeder::class, UserSeeder::class]);

        $this->post(route('login.post'), ['username' => 'superadmin', 'password' => 'admin123'])
            ->assertSessionHasErrors('username');

        $this->assertGuest();
    }
}
