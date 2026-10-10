<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoyaltyProgramControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_SUPER_ADMIN,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'enabled' => true,
            'spend_per_point' => 50,
            'peso_per_point' => 1,
            'minimum_redeem' => 20,
            'maximum_redeem' => 500,
            'tiers_enabled' => true,
            'birthday_bonus' => 25,
            'tiers' => [
                ['name' => 'Gold', 'min' => 1000, 'multiplier' => 1.5],
                ['name' => 'Member', 'min' => 0, 'multiplier' => 1],
            ],
        ];
    }

    public function test_saves_the_program_with_tiers_sorted_from_the_lowest(): void
    {
        $this->actingAs($this->admin())->put(route('loyalty-program.update'), $this->payload())
            ->assertRedirect()->assertSessionHasNoErrors();

        $this->assertEquals(50, SystemSetting::get('loyalty.spend_per_point'));
        $this->assertSame(['Member', 'Gold'], array_column(SystemSetting::get('loyalty.tiers'), 'name'));
    }

    public function test_the_first_tier_must_start_at_zero_points(): void
    {
        $this->actingAs($this->admin())->put(route('loyalty-program.update'), $this->payload([
            'tiers' => [['name' => 'Gold', 'min' => 1000, 'multiplier' => 1.5]],
        ]))->assertSessionHasErrors(['tiers' => 'The first tier must start at 0 points so every member has a tier.']);
    }

    public function test_the_maximum_redeem_cannot_be_below_the_minimum(): void
    {
        $this->actingAs($this->admin())->put(route('loyalty-program.update'), $this->payload(['minimum_redeem' => 100, 'maximum_redeem' => 50]))
            ->assertSessionHasErrors(['maximum_redeem' => 'Maximum points per sale must be at least the minimum.']);
    }
}
