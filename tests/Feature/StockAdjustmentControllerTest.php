<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\StockAdjustment;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockAdjustmentControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{User, ProductStock}
     */
    private function managerWithStock(float $stock): array
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);
        $cake = Product::create(['name' => 'Chocolate Cake', 'barcode' => 'CAKE1', 'product_type' => 'standard', 'unit' => 'slice', 'status' => 'active']);
        $productStock = ProductStock::create(['product_id' => $cake->id, 'branch_id' => $branch->id, 'stock' => $stock, 'capital' => 40]);
        $manager = User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['31'],
        ]);

        return [$manager, $productStock];
    }

    public function test_recording_wastage_deducts_stock_and_deleting_it_restores_the_stock(): void
    {
        [$manager, $productStock] = $this->managerWithStock(10);

        $this->actingAs($manager)->post(route('stock-adjustments.store'), [
            'product_id' => $productStock->product_id, 'type' => 'damage', 'quantity' => 3, 'note' => 'Dropped',
        ])->assertSessionHasNoErrors();
        $this->assertEquals(7, $productStock->fresh()->stock);

        $this->actingAs($manager)->delete(route('stock-adjustments.destroy', StockAdjustment::sole()))->assertSessionHasNoErrors();
        $this->assertEquals(10, $productStock->fresh()->stock);
        $this->assertSame(0, StockAdjustment::count());
    }

    public function test_deleting_an_adjustment_larger_than_the_stock_restores_only_what_was_deducted(): void
    {
        [$manager, $productStock] = $this->managerWithStock(2);

        $this->actingAs($manager)->post(route('stock-adjustments.store'), [
            'product_id' => $productStock->product_id, 'type' => 'damage', 'quantity' => 5,
        ])->assertSessionHasNoErrors();
        $this->assertEquals(0, $productStock->fresh()->stock);

        $this->actingAs($manager)->delete(route('stock-adjustments.destroy', StockAdjustment::sole()))->assertSessionHasNoErrors();
        $this->assertEquals(2, $productStock->fresh()->stock);
    }
}
