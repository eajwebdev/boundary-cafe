<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\GoodsReceivedNote;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PurchaseControllerTest extends TestCase
{
    use RefreshDatabase;

    private function manager(Branch $branch): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Manager', 'username' => 'manager', 'password' => 'password',
            'role' => User::ROLE_MANAGER, 'branch_id' => $branch->id, 'access' => ['12'],
        ]);
    }

    public function test_recording_a_purchase_adds_the_stock_to_the_branch(): void
    {
        $supplier = Supplier::create(['name' => 'Bean Traders']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);
        $beans = Product::create(['name' => 'Espresso Beans', 'barcode' => 'ING1', 'product_type' => 'ingredient', 'unit' => 'g', 'status' => 'active']);
        ProductStock::create(['product_id' => $beans->id, 'branch_id' => $branch->id, 'stock' => 100, 'capital' => 1]);

        $this->actingAs($this->manager($branch))->post(route('purchase-orders.store'), [
            'supplier_id' => $supplier->id,
            'payment_method' => 'credit',
            'received_date' => '2026-10-10',
            'dest_type' => 'branch',
            'dest_id' => $branch->id,
            'items' => [['product_id' => $beans->id, 'quantity' => 1000, 'unit_cost' => 1.2]],
        ])->assertRedirect(route('purchase-orders.index'))->assertSessionHasNoErrors();

        $stock = ProductStock::where('product_id', $beans->id)->where('branch_id', $branch->id)->sole();
        $this->assertEquals(1100, $stock->stock);
        $this->assertEquals(1.2, $stock->capital);
        $this->assertNull(GoodsReceivedNote::sole()->paid_at);
    }

    public function test_rejects_a_purchase_without_items(): void
    {
        $supplier = Supplier::create(['name' => 'Bean Traders']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);

        $this->actingAs($this->manager($branch))->post(route('purchase-orders.store'), [
            'supplier_id' => $supplier->id, 'payment_method' => 'cash', 'received_date' => '2026-10-10',
            'dest_type' => 'branch', 'dest_id' => $branch->id, 'items' => [],
        ])->assertSessionHasErrors(['items' => 'Please add at least one item.']);

        $this->assertSame(0, GoodsReceivedNote::count());
    }

    public function test_marks_a_credit_purchase_as_paid_once(): void
    {
        $supplier = Supplier::create(['name' => 'Bean Traders']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Home Branch', 'code' => 'HOME']);
        $manager = $this->manager($branch);
        $purchase = GoodsReceivedNote::create([
            'supplier_id' => $supplier->id, 'branch_id' => $branch->id, 'dest_type' => 'branch', 'dest_id' => $branch->id,
            'received_by' => $manager->id, 'received_date' => '2026-10-10', 'payment_method' => 'credit',
            'source' => 'purchase', 'delivery_type' => 'full',
        ]);

        $this->actingAs($manager)->post(route('purchase-orders.mark-paid', $purchase))->assertSessionHasNoErrors();
        $this->assertNotNull($purchase->fresh()->paid_at);

        $this->actingAs($manager)->post(route('purchase-orders.mark-paid', $purchase))
            ->assertSessionHasErrors(['error' => 'This purchase is already marked as paid.']);
    }
}
