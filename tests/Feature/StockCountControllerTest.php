<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\StockCountItem;
use App\Models\StockCountSession;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockCountControllerTest extends TestCase
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
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['36'],
        ]);

        return [$manager, $productStock];
    }

    public function test_a_committed_count_applies_the_difference_to_live_stock(): void
    {
        [$manager, $productStock] = $this->managerWithStock(20);

        $this->actingAs($manager)->post(route('stock-count.start'), ['name' => 'Month end', 'type' => 'full'])
            ->assertSessionHasNoErrors();
        $session = StockCountSession::sole();
        $item = StockCountItem::sole();
        $this->assertEquals(20, $item->snapshot_qty);

        // Two slices sell while the count is going on.
        $productStock->update(['stock' => 18]);

        $this->actingAs($manager)->patch(route('stock-count.save', $session), ['counts' => [['item_id' => $item->id, 'counted_qty' => 17]]])
            ->assertSessionHasNoErrors();
        $this->actingAs($manager)->post(route('stock-count.commit', $session))
            ->assertRedirect(route('stock-count.index'));

        // Counted 17 against a snapshot of 20: three missing, taken off the live 18.
        $this->assertEquals(15, $productStock->fresh()->stock);
        $this->assertSame('committed', $session->fresh()->status);
        $this->assertSame(1, (int) $session->fresh()->items_adjusted);
    }

    public function test_a_committed_count_cannot_be_saved_again(): void
    {
        [$manager] = $this->managerWithStock(20);
        $this->actingAs($manager)->post(route('stock-count.start'), ['name' => 'Month end', 'type' => 'full']);
        $session = StockCountSession::sole();
        $this->actingAs($manager)->post(route('stock-count.commit', $session));

        $this->actingAs($manager)->patch(route('stock-count.save', $session), ['counts' => [['item_id' => StockCountItem::sole()->id, 'counted_qty' => 1]]])
            ->assertSessionHasErrors(['error' => 'This session is already committed.']);
    }

    public function test_cancelling_a_draft_leaves_stock_untouched(): void
    {
        [$manager, $productStock] = $this->managerWithStock(20);
        $this->actingAs($manager)->post(route('stock-count.start'), ['name' => 'Month end', 'type' => 'full']);
        $session = StockCountSession::sole();
        $this->actingAs($manager)->patch(route('stock-count.save', $session), ['counts' => [['item_id' => StockCountItem::sole()->id, 'counted_qty' => 5]]]);

        $this->actingAs($manager)->delete(route('stock-count.cancel', $session))->assertRedirect(route('stock-count.index'));

        $this->assertSame('cancelled', $session->fresh()->status);
        $this->assertEquals(20, $productStock->fresh()->stock);
    }
}
