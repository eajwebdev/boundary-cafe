<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BusinessLogoTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        Storage::fake('public');
        // The store administrator belongs to a branch, so Settings opens in that branch's scope.
        $this->admin = User::where('username', 'admin')->firstOrFail();
    }

    private function upload(?int $branchId): string
    {
        $this->actingAs($this->admin)->post('/settings/logo', [
            'branch_id' => $branchId,
            'logo' => UploadedFile::fake()->image('logo.png', 256, 256),
        ])->assertRedirect()->assertSessionHasNoErrors();

        return (string) SystemSetting::get('general.logo');
    }

    public function test_administrator_logo_upload_shows_everywhere_whatever_the_view(): void
    {
        $fromBranch = $this->upload($this->admin->branch_id);
        $fromGlobal = $this->upload(null);

        $this->assertStringStartsWith('logos/', $fromBranch);
        $this->assertStringStartsWith('logos/', $fromGlobal);
        $this->assertFalse(SystemSetting::where('key', 'general.logo')->whereNotNull('branch_id')->exists());
        $url = asset('storage/'.$fromGlobal);
        $this->assertSame($url, SystemSetting::logoUrl());

        // Staff pages, the login page and the customer store all get the new logo.
        $this->actingAs($this->admin)->get('/settings')->assertInertia(fn ($page) => $page->where('app.logo_url', $url));
        auth()->logout();
        $this->get('/login')->assertInertia(fn ($page) => $page->where('logo_url', $url));
        $this->get('/')->assertSee('href="'.$url.'"', false);
    }

    public function test_replacing_the_logo_deletes_the_old_upload(): void
    {
        $first = $this->upload(null);
        $second = $this->upload(null);

        Storage::disk('public')->assertMissing($first);
        Storage::disk('public')->assertExists($second);
    }

    public function test_old_branch_only_logos_no_longer_hide_the_business_logo(): void
    {
        $global = $this->upload(null);
        SystemSetting::set('general.logo', 'logos/old-branch-logo.png', $this->admin->branch_id);

        $this->assertSame(asset('storage/'.$global), SystemSetting::logoUrl($this->admin->branch_id));
    }

    public function test_staff_without_settings_access_cannot_upload_a_logo(): void
    {
        $cashier = User::where('username', 'cashier')->firstOrFail();
        $before = SystemSetting::get('general.logo');

        // The settings access middleware turns staff away with a redirect.
        $this->actingAs($cashier)->post('/settings/logo', ['logo' => UploadedFile::fake()->image('logo.png')])->assertRedirect();

        $this->assertSame($before, SystemSetting::get('general.logo'));
        $this->assertSame([], Storage::disk('public')->allFiles('logos'));
    }

    public function test_login_page_uses_the_settings_tagline_and_the_branch_places(): void
    {
        SystemSetting::set('general.tagline', 'Restaurant & Cafe System');

        $this->get('/login')->assertInertia(fn ($page) => $page
            ->where('tagline', 'Restaurant & Cafe System')
            ->where('locations', fn (string $locations) => $locations !== '' && ! str_contains($locations, 'Boundary Cafe')));
    }
}
