<?php

namespace Tests\Feature;

use App\Models\OnlineOrder;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BusinessNameSettingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->admin = User::where('username', 'admin')->firstOrFail();
    }

    public function test_branch_staff_see_a_renamed_business_straight_away(): void
    {
        $branchId = $this->admin->branch_id;
        $this->assertNotNull($branchId);

        // Warm the branch cache with the old name, as a page load would.
        $this->assertSame('Boundary Cafe', SystemSetting::businessName($branchId));

        SystemSetting::set('general.business_name', 'EAJ Cafe');

        $this->assertSame('EAJ Cafe', SystemSetting::businessName($branchId));
        $this->actingAs($this->admin)->get('/settings')->assertInertia(fn ($page) => $page
            ->where('app.name', 'EAJ Cafe')
            ->where('auth.user.branch.location', $this->admin->branch->location)
        );
    }

    public function test_rewards_name_and_blank_receipt_header_follow_the_business_name(): void
    {
        SystemSetting::set('general.business_name', 'EAJ Cafe');
        SystemSetting::set('general.tagline', 'Good food daily');
        SystemSetting::set('receipt.header_text', '');

        $this->assertSame('EAJ Cafe Rewards', SystemSetting::rewardsName());
        $this->assertSame('EAJ Cafe — Good food daily', SystemSetting::receiptHeader());

        SystemSetting::set('receipt.header_text', 'Custom header');
        $this->assertSame('Custom header', SystemSetting::receiptHeader());
    }

    public function test_the_cashier_pos_shows_the_business_name_not_the_old_branch_brand(): void
    {
        $cashier = User::where('username', 'cashier')->firstOrFail();
        $cashier->branch->update(['name' => 'Boundary Cafe – Tagukon']);
        SystemSetting::set('general.business_name', 'EAJ Cafe');

        $this->actingAs($cashier)->get('/pos')->assertInertia(fn ($page) => $page
            ->where('branch.name', 'EAJ Cafe – Tagukon')
        );
    }

    public function test_order_numbers_take_their_prefix_from_settings(): void
    {
        SystemSetting::set('general.business_name', 'Boundary Cafe');
        $this->assertSame('BC', SystemSetting::orderPrefix());

        SystemSetting::set('general.business_name', 'EAJ Cafe');
        $this->assertSame('EAJ', SystemSetting::orderPrefix());
        $this->assertStringStartsWith('EAJ-ONL-'.now()->format('ymd').'-', OnlineOrder::generateOrderNumber());

        SystemSetting::set('general.order_prefix', 'ej-1');
        $this->assertSame('EJ1', SystemSetting::orderPrefix());
    }

    public function test_branch_location_drops_the_brand_prefix(): void
    {
        $branch = $this->admin->branch;
        $branch->name = 'Boundary Cafe – Tagukon';
        $this->assertSame('Tagukon', $branch->location);

        $branch->name = 'Downtown';
        $this->assertSame('Downtown', $branch->location);
    }
}
