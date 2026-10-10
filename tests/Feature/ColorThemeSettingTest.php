<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ColorThemeSettingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        // The store administrator belongs to a branch, so Settings opens in that branch's scope.
        $this->admin = User::where('username', 'admin')->firstOrFail();
    }

    public function test_theme_saved_from_a_branch_view_applies_system_wide(): void
    {
        $this->actingAs($this->admin)->post('/settings/save', [
            'branch_id' => $this->admin->branch_id,
            'settings' => ['general.color_theme' => 'emerald'],
        ])->assertRedirect();

        $this->assertSame('emerald', SystemSetting::get('general.color_theme'));
        $this->assertFalse(SystemSetting::where('key', 'general.color_theme')->whereNotNull('branch_id')->exists());

        // Every page (staff and the customer store) renders with the new palette.
        $this->get('/')->assertSee('data-theme="emerald"', false);
        $this->actingAs($this->admin)->get('/settings')
            ->assertInertia(fn ($page) => $page->where('app.color_theme', 'emerald'));
    }

    public function test_saving_the_theme_clears_old_branch_overrides(): void
    {
        SystemSetting::set('general.color_theme', 'rose', $this->admin->branch_id);

        $this->actingAs($this->admin)->post('/settings/save', [
            'branch_id' => $this->admin->branch_id,
            'settings' => ['general.color_theme' => 'indigo'],
        ])->assertRedirect();

        $this->assertSame('indigo', SystemSetting::get('general.color_theme'));
        $this->assertFalse(SystemSetting::where('key', 'general.color_theme')->whereNotNull('branch_id')->exists());
    }

    public function test_branch_view_shows_the_system_wide_theme(): void
    {
        SystemSetting::set('general.color_theme', 'teal');
        SystemSetting::set('general.color_theme', 'rose', $this->admin->branch_id);

        $this->actingAs($this->admin)->get('/settings?branch_id='.$this->admin->branch_id)
            ->assertInertia(fn ($page) => $page->where('settings.general', function ($general) {
                $theme = collect($general)->get('general.color_theme');

                return $theme['value'] === 'teal' && $theme['is_overridden'] === false;
            }));
    }
}
