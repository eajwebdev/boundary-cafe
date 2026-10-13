<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\RecipeIngredient;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Worked example used throughout (prices in pesos):
 *   Branch A, sale 1: 2 Latte @100 + 1 Cake @150 = 350, 10% off → paid 315. Latte capital 40, Cake 60.
 *                     Plus a free Latte reward (cost 40) — not a sale.
 *   Branch B, sale 2: 1 Latte @100 + ₱49 delivery fee → paid 149. Latte capital 50.
 *   Branch A, sale 3: 1 Latte @100, recorded before costs were saved (no unit cost); Latte capital is now 45.
 */
class ProfitAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branchA;

    private Branch $branchB;

    private Product $latte;

    private Product $cake;

    protected function setUp(): void
    {
        parent::setUp();
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $this->branchA = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Cafe – Alpha', 'code' => 'A', 'business_type' => Branch::TYPE_CAFE]);
        $this->branchB = Branch::create(['supplier_id' => $supplier->id, 'name' => 'Cafe – Beta', 'code' => 'B', 'business_type' => Branch::TYPE_CAFE]);
        $drinks = Category::create(['name' => 'Drinks', 'slug' => 'drinks']);
        $desserts = Category::create(['name' => 'Desserts', 'slug' => 'desserts']);
        $this->latte = Product::create(['name' => 'Latte', 'category_id' => $drinks->id, 'product_type' => 'standard', 'status' => 'active']);
        $this->cake = Product::create(['name' => 'Cake', 'category_id' => $desserts->id, 'product_type' => 'standard', 'status' => 'active']);
        $this->capital($this->latte, $this->branchA, 40);
        $this->capital($this->latte, $this->branchB, 50);
        $this->capital($this->cake, $this->branchA, 60);
    }

    public function test_ranks_branches_and_products_by_net_revenue_minus_cost(): void
    {
        $this->seedWorkedExample();

        $this->actingAs($this->admin())
            ->get(route('reports.profit', ['from' => today()->toDateString(), 'to' => today()->toDateString()]))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Reports/ProfitAnalytics')
                ->where('report.totals.revenue', 515)
                ->where('report.totals.cost', 235)
                ->where('report.totals.profit', 280)
                ->where('report.totals.margin', 54.4)
                ->where('report.totals.units', 5)
                ->where('report.totals.estimated_cost_share', 19.1)
                ->where('report.totals.reward_cost', 40)
                ->where('report.branches.0.id', $this->branchA->id)
                ->where('report.branches.0.profit', 230)
                ->where('report.branches.0.top_product.name', 'Latte')
                ->where('report.branches.1.profit', 50)
                ->where('report.products.0.name', 'Latte')
                ->where('report.products.0.units', 4)
                ->where('report.products.0.revenue', 380)
                ->where('report.products.0.cost', 175)
                ->where('report.products.0.class', 'workhorse')
                ->where('report.products.1.name', 'Cake')
                ->where('report.products.1.revenue', 135)
                ->where('report.products.1.margin', 55.6)
                ->where('report.products.1.class', 'puzzle')
                ->where('report.categories.0.name', 'Drinks')
                ->where('report.best_by_branch.1.products.0.name', 'Latte')
                ->where('report.trend.0.profit', 280));
    }

    public function test_branch_filter_shows_only_that_branchs_products(): void
    {
        $this->seedWorkedExample();

        $this->actingAs($this->admin())
            ->get(route('reports.profit', ['branch_id' => $this->branchB->id, 'from' => today()->toDateString(), 'to' => today()->toDateString()]))
            ->assertInertia(fn (Assert $page) => $page
                ->where('report.totals.revenue', 100)
                ->where('report.totals.cost', 50)
                ->has('report.products', 1)
                ->has('report.branches', 1));
    }

    public function test_a_sold_line_keeps_the_cost_it_had_when_it_was_sold(): void
    {
        $sale = $this->sale($this->branchA, 100, [[$this->latte, 1, 100]]);
        $this->capital($this->latte, $this->branchA, 70);

        $this->assertEquals(40, $sale->items()->value('unit_cost'));
    }

    public function test_a_made_to_order_line_is_costed_from_its_recipe(): void
    {
        SystemSetting::set('inventory.ingredient_tracking', true); // this test is about recipe ingredients
        $beans = Product::create(['name' => 'Beans', 'product_type' => 'standard', 'status' => 'active']);
        $milk = Product::create(['name' => 'Milk', 'product_type' => 'standard', 'status' => 'active']);
        $this->capital($beans, $this->branchA, 2);    // per gram
        $this->capital($milk, $this->branchA, 0.1);   // per ml
        $mocha = Product::create(['name' => 'Mocha', 'product_type' => 'made_to_order', 'status' => 'active']);
        RecipeIngredient::create(['product_id' => $mocha->id, 'ingredient_id' => $beans->id, 'quantity' => 18, 'unit' => 'g']);
        RecipeIngredient::create(['product_id' => $mocha->id, 'ingredient_id' => $milk->id, 'quantity' => 200, 'unit' => 'ml']);

        $sale = $this->sale($this->branchA, 150, [[$mocha, 1, 150]]);

        $this->assertEquals(56, $sale->items()->value('unit_cost')); // 18 × 2 + 200 × 0.1
    }

    public function test_cashiers_cannot_open_profit_analytics(): void
    {
        $cashier = User::create([
            'fname' => 'Test', 'lname' => 'Cashier', 'username' => 'cashier', 'password' => 'password',
            'role' => User::ROLE_CASHIER, 'branch_id' => $this->branchA->id,
        ]);

        $this->actingAs($cashier)->get(route('reports.profit'))->assertRedirect();
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function seedWorkedExample(): void
    {
        $first = $this->sale($this->branchA, 315, [[$this->latte, 2, 100], [$this->cake, 1, 150]]);
        $first->items()->create(['product_id' => $this->latte->id, 'quantity' => 1, 'price' => 0, 'total' => 0, 'is_reward' => true, 'unit_cost' => 40]);

        $this->sale($this->branchB, 149, [[$this->latte, 1, 100]], deliveryFee: 49);

        // A sale recorded before unit costs were saved: insert the line directly so it has no unit cost.
        $legacy = $this->sale($this->branchA, 100, []);
        DB::table('sale_items')->insert([
            'sale_id' => $legacy->id, 'product_id' => $this->latte->id, 'quantity' => 1, 'price' => 100, 'total' => 100,
            'is_bundle_component' => false, 'is_reward' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->capital($this->latte, $this->branchA, 45);
    }

    /**
     * @param  list<array{0: Product, 1: int, 2: float}>  $lines
     */
    private function sale(Branch $branch, float $total, array $lines, float $deliveryFee = 0): Sale
    {
        $sale = Sale::create([
            'branch_id' => $branch->id, 'total' => $total, 'amount_paid' => $total, 'balance_due' => 0,
            'payment_status' => 'paid', 'status' => 'completed', 'delivery_fee' => $deliveryFee,
        ]);
        foreach ($lines as [$product, $quantity, $price]) {
            $sale->items()->create(['product_id' => $product->id, 'quantity' => $quantity, 'price' => $price, 'total' => $quantity * $price]);
        }

        return $sale;
    }

    private function capital(Product $product, Branch $branch, float $capital): void
    {
        ProductStock::updateOrCreate(['product_id' => $product->id, 'branch_id' => $branch->id], ['stock' => 100, 'capital' => $capital]);
    }

    private function admin(): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_ADMINISTRATOR, 'branch_id' => $this->branchA->id,
        ]);
    }
}
