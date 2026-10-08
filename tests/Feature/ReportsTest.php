<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\RecipeIngredient;
use App\Models\Sale;
use App\Models\StockAdjustment;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ReportsTest extends TestCase
{
    use RefreshDatabase;

    private const ALL_REPORTS = ['18', '19', '20', '21', '30', '31'];

    private Branch $branch;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-10-08 20:00:00');
        $this->branch = $this->makeBranch('MAIN');
        $this->manager = $this->makeUser('manager', $this->branch, self::ALL_REPORTS);
    }

    public function test_daily_summary_counts_voids_once_and_every_cash_session(): void
    {
        $this->sale('2026-10-08 09:00:00', 300);
        $this->sale('2026-10-08 10:00:00', 200, 'gcash');
        $this->sale('2026-10-08 11:00:00', 90, status: 'voided');
        $this->closedSession('2026-10-08 07:00:00', expected: 800, counted: 790);
        $this->closedSession('2026-10-08 13:00:00', expected: 600, counted: 605);
        $this->expense('2026-10-08', 50, 'approved');
        $this->expense('2026-10-08', 30, 'pending');

        $response = $this->actingAs($this->manager)->get(route('reports.daily', ['date' => '2026-10-08']));

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Reports/DailySummary')
            ->where('report.figures.net_sales', 500)
            ->where('report.figures.void_amount', 90)
            ->where('report.figures.over_short', -5)
            ->has('report.figures.sessions', 2)
            ->where('report.expenses.total', 50)
            ->where('report.sales_less_expenses', 450));
        $this->assertDatabaseCount('daily_summaries', 0);
    }

    public function test_sales_report_totals_cover_the_whole_period_not_just_one_page(): void
    {
        foreach (range(1, 30) as $i) {
            $this->sale('2026-10-0'.(1 + $i % 7).' 12:00:00', 100);
        }
        $this->sale('2026-10-08 12:00:00', 500, 'credit', amountPaid: 200, balance: 300);
        $this->sale('2026-10-08 13:00:00', 999, status: 'voided');
        $this->sale('2026-09-30 12:00:00', 777);

        $response = $this->actingAs($this->manager)->get(route('reports.sales', ['from' => '2026-10-01', 'to' => '2026-10-08']));

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Reports/SalesReport')
            ->where('report.summary.transactions', 31)
            ->where('report.summary.net_sales', 3500)
            ->where('report.summary.collected', 3200)
            ->where('report.summary.outstanding', 300)
            ->where('report.summary.void_count', 1)
            ->where('register.total', 31)
            ->has('register.data', 25));
    }

    public function test_managers_only_see_their_own_branch(): void
    {
        $other = $this->makeBranch('WEST');
        $this->sale('2026-10-08 12:00:00', 100);
        $this->sale('2026-10-08 12:00:00', 400, branch: $other);

        $response = $this->actingAs($this->manager)->get(route('reports.sales', ['branch_id' => $other->id, 'from' => '2026-10-08', 'to' => '2026-10-08']));

        $response->assertInertia(fn (Assert $page) => $page->where('report.summary.net_sales', 100));
    }

    public function test_each_report_checks_its_own_permission(): void
    {
        $dailyOnly = $this->makeUser('daily-only', $this->branch, ['18']);

        $this->actingAs($dailyOnly)->get(route('reports.daily'))->assertOk();
        $this->actingAs($dailyOnly)->get(route('reports.sales'))->assertRedirect();
        $this->actingAs($dailyOnly)->get(route('reports.sales.pdf'))->assertRedirect();
    }

    public function test_inventory_report_values_stock_and_flags_items_needing_attention(): void
    {
        SystemSetting::set('inventory.low_stock_threshold', 10);
        $this->stockedProduct('Milk', stock: 4, capital: 50);
        $this->stockedProduct('Sugar', stock: 0, capital: 20);
        $this->stockedProduct('Cream', stock: 40, capital: 30, expiry: '2026-10-10');
        $fresh = $this->stockedProduct('Beans', stock: 25, capital: 100, expiry: '2026-12-31');
        Product::create(['name' => 'Latte', 'product_type' => 'made_to_order']);

        $response = $this->actingAs($this->manager)->get(route('reports.inventory'));

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Reports/InventoryReport')
            ->where('report.summary.items', 4)
            ->where('report.summary.value', 3900)
            ->where('report.summary.low', 1)
            ->where('report.summary.out', 1)
            ->where('report.summary.expiring', 1)
            ->where('report.excluded_count', 1));
        $this->assertFalse($fresh->stocks()->first()->isNearExpiry());
    }

    public function test_ingredient_usage_ignores_voided_sales_and_variant_lines(): void
    {
        $milk = $this->stockedProduct('Milk', stock: 1000, capital: 0.1);
        $latte = Product::create(['name' => 'Latte', 'product_type' => 'made_to_order']);
        RecipeIngredient::create(['product_id' => $latte->id, 'ingredient_id' => $milk->id, 'quantity' => 150, 'unit' => 'ml']);

        $this->sale('2026-10-07 09:00:00', 300)->items()->create(['product_id' => $latte->id, 'quantity' => 2, 'price' => 150, 'total' => 300]);
        $this->sale('2026-10-08 09:00:00', 150, status: 'voided')->items()->create(['product_id' => $latte->id, 'quantity' => 1, 'price' => 150, 'total' => 150]);

        $response = $this->actingAs($this->manager)->get(route('reports.ingredient-usage', ['from' => '2026-10-07', 'to' => '2026-10-08']));

        $response->assertInertia(fn (Assert $page) => $page
            ->has('report.rows', 1)
            ->where('report.rows.0.used', 300)
            ->where('report.rows.0.per_day', 150)
            ->where('report.rows.0.on_hand', 1000)
            ->where('report.rows.0.days_left', 6.7));
    }

    public function test_expense_report_totals_only_approved_expenses(): void
    {
        $this->expense('2026-10-02', 300, 'approved', 'Utilities');
        $this->expense('2026-10-05', 100, 'approved', 'Supplies');
        $this->expense('2026-10-06', 999, 'pending', 'Supplies');

        $response = $this->actingAs($this->manager)->get(route('reports.expenses', ['from' => '2026-10-01', 'to' => '2026-10-08']));

        $response->assertInertia(fn (Assert $page) => $page
            ->where('report.summary.total', 400)
            ->where('report.summary.not_approved_amount', 999)
            ->where('report.by_category.0.name', 'Utilities')
            ->where('report.by_category.0.share', 75)
            ->has('register.data', 2));
    }

    public function test_stock_loss_report_values_write_offs_at_cost(): void
    {
        $milk = $this->stockedProduct('Milk', stock: 10, capital: 50);
        $this->writeOff($milk, 'damage', 2, 50);
        $this->writeOff($milk, 'expired', 3, 50);

        $response = $this->actingAs($this->manager)->get(route('reports.stock-loss', ['type' => 'expired']));

        $response->assertInertia(fn (Assert $page) => $page
            ->where('report.summary.records', 1)
            ->where('report.summary.value', 150)
            ->where('report.summary.top_cause', 'Expired'));
    }

    public function test_every_report_downloads_as_a_pdf(): void
    {
        $this->sale('2026-10-08 09:00:00', 300);
        $this->expense('2026-10-08', 50, 'approved');
        $this->stockedProduct('Milk', stock: 4, capital: 50);

        foreach (['reports.daily.pdf', 'reports.sales.pdf', 'reports.inventory.pdf', 'reports.expenses.pdf', 'reports.ingredient-usage.pdf', 'reports.stock-loss.pdf'] as $route) {
            $response = $this->actingAs($this->manager)->get(route($route));

            $response->assertOk();
            $this->assertSame('application/pdf', $response->headers->get('Content-Type'), $route);
        }
    }

    public function test_periods_longer_than_a_year_are_rejected(): void
    {
        $response = $this->actingAs($this->manager)->get(route('reports.sales', ['from' => '2025-01-01', 'to' => '2026-10-08']));

        $response->assertSessionHasErrors('to');
    }

    private function makeBranch(string $code): Branch
    {
        return Branch::create([
            'supplier_id' => Supplier::create(['name' => "Supplier {$code}"])->id,
            'name' => "Branch {$code}",
            'code' => $code,
        ]);
    }

    /** @param list<string> $access */
    private function makeUser(string $username, Branch $branch, array $access): User
    {
        return User::create([
            'fname' => ucfirst($username),
            'lname' => 'Tester',
            'username' => $username,
            'password' => 'password',
            'role' => User::ROLE_MANAGER,
            'branch_id' => $branch->id,
            'access' => $access,
        ]);
    }

    private function sale(
        string $at,
        float $total,
        string $method = 'cash',
        string $status = 'completed',
        ?float $amountPaid = null,
        float $balance = 0,
        ?Branch $branch = null,
    ): Sale {
        $sale = (new Sale)->forceFill([
            'receipt_number' => 'R-'.uniqid(),
            'branch_id' => ($branch ?? $this->branch)->id,
            'user_id' => $this->manager->id,
            'total' => $total,
            'payment_method' => $method,
            'amount_paid' => $amountPaid ?? $total,
            'balance_due' => $balance,
            'status' => $status,
            'created_at' => $at,
            'updated_at' => $at,
        ]);
        $sale->save();

        return $sale;
    }

    private function closedSession(string $openedAt, float $expected, float $counted): void
    {
        CashSession::create([
            'user_id' => $this->manager->id,
            'branch_id' => $this->branch->id,
            'opening_cash' => 500,
            'expected_cash' => $expected,
            'counted_cash' => $counted,
            'over_short' => $counted - $expected,
            'status' => 'closed',
            'opened_at' => $openedAt,
            'closed_at' => $openedAt,
        ]);
    }

    private function expense(string $date, float $amount, string $status, string $category = 'General'): void
    {
        Expense::create([
            'expense_category_id' => ExpenseCategory::firstOrCreate(['name' => $category])->id,
            'branch_id' => $this->branch->id,
            'user_id' => $this->manager->id,
            'amount' => $amount,
            'expense_date' => $date,
            'payment_method' => 'cash',
            'status' => $status,
        ]);
    }

    private function stockedProduct(string $name, float $stock, float $capital, ?string $expiry = null): Product
    {
        $product = Product::create(['name' => $name, 'product_type' => 'standard']);
        ProductStock::create([
            'product_id' => $product->id,
            'branch_id' => $this->branch->id,
            'stock' => $stock,
            'capital' => $capital,
            'price' => $capital * 2,
            'expiry_date' => $expiry,
            'days_before_expiry_warning' => 7,
        ]);

        return $product;
    }

    private function writeOff(Product $product, string $type, int $quantity, float $unitCost): void
    {
        StockAdjustment::create([
            'branch_id' => $this->branch->id,
            'product_id' => $product->id,
            'recorded_by' => $this->manager->id,
            'type' => $type,
            'quantity' => $quantity,
            'unit_cost' => $unitCost,
        ]);
    }
}
