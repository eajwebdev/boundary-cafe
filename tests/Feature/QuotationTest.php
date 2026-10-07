<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuotationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_quotation_details_are_public_and_use_the_defaults(): void
    {
        $this->getJson('/quotation/details')
            ->assertOk()
            ->assertExactJson([
                'client_name'    => 'Boundary Café',
                'client_address' => 'Mabinay, Negros Oriental',
                'project_name'   => 'Boundary Café POS & Ordering System',
                'project_note'   => [
                    'subscription' => 'Cloud-hosted restaurant POS, inventory and online ordering',
                    'one_time'     => 'Offline restaurant POS and inventory, installed at your café',
                ],
            ]);
    }

    public function test_admin_can_change_the_quotation_details_in_system_settings(): void
    {
        $superAdmin = User::where('username', 'superadmin')->firstOrFail();

        $this->actingAs($superAdmin)->post('/settings/save', [
            'settings' => [
                'quotation.client_name'    => 'Kape Uno',
                'quotation.client_address' => 'Dumaguete City',
                'quotation.project_name'   => 'Kape Uno POS',
            ],
        ])->assertRedirect();

        $this->getJson('/quotation/details')
            ->assertOk()
            ->assertJsonPath('client_name', 'Kape Uno')
            ->assertJsonPath('client_address', 'Dumaguete City')
            ->assertJsonPath('project_name', 'Kape Uno POS')
            ->assertJsonPath('project_note.subscription', 'Cloud-hosted restaurant POS, inventory and online ordering');
    }

    public function test_quotation_settings_cannot_be_overridden_per_branch(): void
    {
        $superAdmin = User::where('username', 'superadmin')->firstOrFail();
        $branch = Branch::firstOrFail();

        $this->actingAs($superAdmin)->post('/settings/save', [
            'branch_id' => $branch->id,
            'settings'  => ['quotation.client_name' => 'Branch Override'],
        ])->assertRedirect();

        $this->assertFalse(SystemSetting::where('key', 'quotation.client_name')->where('branch_id', $branch->id)->exists());
        $this->getJson('/quotation/details')->assertJsonPath('client_name', 'Boundary Café');
    }

    public function test_quotation_group_is_shown_in_global_settings_only(): void
    {
        $superAdmin = User::where('username', 'superadmin')->firstOrFail();
        $branch = Branch::firstOrFail();

        $this->actingAs($superAdmin)->get('/settings')
            ->assertInertia(fn ($page) => $page->has('settings.quotation', 5));

        $this->actingAs($superAdmin)->get('/settings?branch_id=' . $branch->id)
            ->assertInertia(fn ($page) => $page->missing('settings.quotation'));
    }
}
