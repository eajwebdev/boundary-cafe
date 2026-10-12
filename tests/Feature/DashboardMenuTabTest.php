<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Today:     order 1 = 2 Latte + 1 Cake, order 2 = 1 Latte + 1 Cake + 1 Tea (counter sales).
 * Yesterday: order 3 = 3 Tea (the previous period for a one-day range).
 */
class DashboardMenuTabTest extends TestCase
{
    use RefreshDatabase;

    public function test_menu_tab_shows_movers_basket_size_and_items_bought_together(): void
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $branch = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Cafe – Alpha', 'code' => 'A', 'business_type' => Branch::TYPE_CAFE]);
        $drinks = Category::create(['name' => 'Drinks', 'slug' => 'drinks']);
        [$latte, $cake, $tea] = collect(['Latte', 'Cake', 'Tea'])->map(function (string $name) use ($drinks, $branch) {
            $product = Product::create(['name' => $name, 'category_id' => $drinks->id, 'product_type' => 'standard', 'status' => 'active']);
            ProductStock::create(['product_id' => $product->id, 'branch_id' => $branch->id, 'stock' => 100, 'capital' => 30]);

            return $product;
        })->all();

        $this->sale($branch, [[$latte, 2], [$cake, 1]]);
        $this->sale($branch, [[$latte, 1], [$cake, 1], [$tea, 1]]);
        $this->sale($branch, [[$tea, 3]], now()->subDay());

        $admin = User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_ADMINISTRATOR, 'branch_id' => $branch->id,
        ]);
        $today = today()->toDateString();

        $menu = $this->actingAs($admin)->getJson("/dashboard/data?tab=menu&from={$today}&to={$today}")->assertOk()->json('data');

        $this->assertEquals(6, $menu['kpis']['items_sold']);
        $this->assertEquals(3, $menu['kpis']['items_per_order']);
        $this->assertEquals(100, $menu['kpis']['items_sold_change']); // 6 today vs 3 yesterday
        $this->assertSame(['Latte', 3], [$menu['movers']['up'][0]['name'], (int) $menu['movers']['up'][0]['change']]);
        $this->assertSame(['Tea', -2], [$menu['movers']['down'][0]['name'], (int) $menu['movers']['down'][0]['change']]);
        $this->assertSame(['3', 2], [$menu['order_sizes'][2]['size'], $menu['order_sizes'][2]['orders']]);
        $this->assertSame(2, $menu['pairs'][0]['orders']);
        $this->assertEqualsCanonicalizing(['Latte', 'Cake'], [$menu['pairs'][0]['a'], $menu['pairs'][0]['b']]);
        $this->assertEquals(100, $menu['pairs'][0]['attach_rate']);
        $this->assertEquals(6, array_sum($menu['category_hours'][0]['hours']));
        $this->assertEquals(6 * 100, $menu['category_channels'][0]['counter']);
        $this->assertSame('Latte', $menu['item_trends'][0]['name']);
    }

    /**
     * @param  list<array{0: Product, 1: int}>  $lines
     */
    private function sale(Branch $branch, array $lines, $at = null): void
    {
        $total = array_sum(array_map(fn ($line) => $line[1] * 100, $lines));
        $sale = Sale::create([
            'branch_id' => $branch->id, 'channel' => 'counter', 'total' => $total, 'amount_paid' => $total,
            'balance_due' => 0, 'payment_status' => 'paid', 'status' => 'completed',
        ]);
        foreach ($lines as [$product, $quantity]) {
            $sale->items()->create(['product_id' => $product->id, 'quantity' => $quantity, 'price' => 100, 'total' => $quantity * 100]);
        }
        if ($at) {
            $sale->forceFill(['created_at' => $at])->save();
        }
    }
}
