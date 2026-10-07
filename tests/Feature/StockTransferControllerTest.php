<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\StockTransfer;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class StockTransferControllerTest extends TestCase
{
    use RefreshDatabase;

    private function branch(string $code): Branch
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => "Branch {$code}", 'code' => $code]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function transfer(Branch $from, Branch $to, User $requester, array $attributes): StockTransfer
    {
        static $sequence = 0;
        $product = Product::firstOrCreate(['barcode' => 'TT001'], ['name' => 'Test Beans', 'product_type' => 'standard', 'unit' => 'pc', 'status' => 'active']);

        return StockTransfer::create($attributes + [
            'transfer_number' => 'TRF-'.++$sequence,
            'from_type' => 'branch', 'from_id' => $from->id,
            'to_type' => 'branch', 'to_id' => $to->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'status' => 'pending',
            'requested_by' => $requester->id,
        ]);
    }

    public function test_index_summarises_only_transfers_the_branch_user_can_see(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 15));
        $home = $this->branch('HOME');
        $away = $this->branch('AWAY');
        $elsewhere = $this->branch('ELSE');
        $manager = User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $home->id, 'access' => ['34'],
        ]);

        $this->transfer($home, $away, $manager, ['status' => 'pending']);
        $this->transfer($away, $home, $manager, ['status' => 'completed', 'quantity' => 12, 'completed_at' => now()]);
        $this->transfer($home, $away, $manager, ['status' => 'completed', 'quantity' => 5, 'completed_at' => now()->subMonth()]);
        $this->transfer($home, $away, $manager, ['status' => 'cancelled']);
        // Not involving the manager's branch, so it must not be counted.
        $this->transfer($away, $elsewhere, $manager, ['status' => 'pending']);
        $this->transfer($away, $elsewhere, $manager, ['status' => 'completed', 'quantity' => 99, 'completed_at' => now()]);

        $this->actingAs($manager)
            ->get('/stock-transfers')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('StockTransfers/Index')
                ->where('stats', [
                    'pending' => 1,
                    'completed_month' => 1,
                    'units_month' => 12,
                    'cancelled_month' => 1,
                ])
                ->has('transfers', 4));
    }
}
