<?php

namespace Tests\Feature;

use App\Models\CashSession;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MadeToOrderStockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    private function superAdmin(): User
    {
        return User::where('username', 'superadmin')->firstOrFail();
    }

    public function test_products_page_does_not_count_made_to_order_items_as_out_of_stock(): void
    {
        $this->actingAs($this->superAdmin())
            ->get('/products')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('stats.made_to_order', Product::where('product_type', 'made_to_order')->count())
                ->where('stats.ingredients', Product::where('product_type', 'ingredient')->count())
                ->where('stats.total_products', Product::where('product_type', '!=', 'ingredient')->count())
                ->where('stats.out_of_stock', 0));
    }

    public function test_inventory_lists_counted_stock_only(): void
    {
        $this->actingAs($this->superAdmin())
            ->get('/inventory?per_page=100')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('stats.out_of_stock', 0)
                ->where('branch_stocks', fn ($rows) => collect($rows)->isNotEmpty()
                    && collect($rows)->pluck('product_type')->unique()->diff(['standard', 'ingredient'])->isEmpty()));
    }

    public function test_selling_a_made_to_order_item_deducts_its_recipe_ingredients(): void
    {
        $cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $cashier->id, 'branch_id' => $cashier->branch_id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);
        $latte = Product::where('name', 'Spanish Latte')->with('recipeIngredients')->firstOrFail();
        $stockOf = fn (string $name) => (float) ProductStock::where('branch_id', $cashier->branch_id)
            ->whereHas('product', fn ($q) => $q->where('name', $name)->where('product_type', 'ingredient'))
            ->value('stock');
        $milkBefore = $stockOf('Fresh Milk');
        $beansBefore = $stockOf('Espresso Beans');

        $this->actingAs($cashier)
            ->post('/pos', ['items' => [['id' => $latte->id, 'qty' => 2]], 'payment_method' => 'cash', 'payment_amount' => 1000])
            ->assertSessionHasNoErrors();

        $this->assertSame($milkBefore - 400, $stockOf('Fresh Milk'));
        $this->assertSame($beansBefore - 36, $stockOf('Espresso Beans'));
        $this->assertSame(0.0, (float) ProductStock::where('product_id', $latte->id)->where('branch_id', $cashier->branch_id)->value('stock'));
    }
}
