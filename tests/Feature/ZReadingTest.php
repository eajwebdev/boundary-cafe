<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Category;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\PettyCashFund;
use App\Models\PettyCashVoucher;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\ZReading;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ZReadingTest extends TestCase
{
    use RefreshDatabase;

    private Branch $branch;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-10-08 20:00:00');

        $this->branch = $this->makeBranch('MAIN');
        $this->manager = $this->makeUser('manager', User::ROLE_MANAGER, $this->branch, ['47', '14']);
    }

    public function test_generating_locks_the_day_with_its_totals(): void
    {
        $this->closedSession('2026-10-08 08:00:00', opening: 1000, expected: 1500, counted: 1480);
        $this->sale('2026-10-08 09:00:00', total: 300, method: 'cash', discount: 20, receipt: 'MAIN-0001');
        $this->sale('2026-10-08 10:00:00', total: 200, method: 'gcash', receipt: 'MAIN-0002');
        $this->sale('2026-10-08 11:00:00', total: 90, method: 'cash', status: 'voided', receipt: 'MAIN-0003');
        $this->sale('2026-10-07 23:30:00', total: 999, method: 'cash', receipt: 'MAIN-0000');

        $response = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $reading = ZReading::sole();
        $response->assertRedirect(route('z-readings.show', $reading));
        $this->assertSame(1, $reading->z_number);
        $this->assertSame(2, $reading->transaction_count);
        $this->assertSame(520.0, $reading->gross_sales);
        $this->assertSame(20.0, $reading->discount_total);
        $this->assertSame(500.0, $reading->net_sales);
        $this->assertSame(1, $reading->void_count);
        $this->assertSame(90.0, $reading->void_amount);
        $this->assertSame('MAIN-0001', $reading->first_receipt);
        $this->assertSame('MAIN-0003', $reading->last_receipt);
        $this->assertSame(-20.0, $reading->over_short);
        $this->assertSame(500.0, $reading->grand_total);
        $this->assertEqualsCanonicalizing(
            [['method' => 'cash', 'count' => 1, 'amount' => 300], ['method' => 'gcash', 'count' => 1, 'amount' => 200]],
            $reading->payments,
        );
    }

    public function test_the_z_reading_breaks_down_discounts_cash_payouts_and_what_sold(): void
    {
        $session = $this->closedSession('2026-10-08 08:00:00', opening: 1000, expected: 1280, counted: 1280);
        $coffee = Category::create(['name' => 'Coffee', 'slug' => 'coffee']);
        $burgers = Category::create(['name' => 'Burgers', 'slug' => 'burgers']);
        $latte = Product::create(['name' => 'Spanish Latte', 'category_id' => $coffee->id]);
        $burger = Product::create(['name' => 'Ultimate Burger', 'category_id' => $burgers->id]);

        $senior = $this->sale('2026-10-08 09:00:00', total: 260, discount: 65, extra: [
            'cash_session_id' => $session->id, 'manual_discount' => 65, 'discount_type' => 'senior_pwd', 'service_charge' => 25,
        ]);
        $senior->items()->create(['product_id' => $latte->id, 'quantity' => 2, 'price' => 145, 'total' => 290]);
        $promo = $this->sale('2026-10-08 10:00:00', total: 150, method: 'gcash', discount: 15, extra: ['promo_discount' => 15]);
        $promo->items()->create(['product_id' => $burger->id, 'quantity' => 1, 'price' => 165, 'total' => 165]);
        // An older sale that only stored the combined discount counts as a manual discount.
        $this->sale('2026-10-08 11:00:00', total: 90, discount: 10, extra: ['cash_session_id' => $session->id]);

        $fund = PettyCashFund::create(['branch_id' => $this->branch->id, 'managed_by' => $this->manager->id, 'fund_name' => 'Drawer', 'fund_amount' => 500, 'current_balance' => 430, 'status' => 'active']);
        $expense = Expense::create([
            'expense_category_id' => ExpenseCategory::firstOrCreate(['name' => 'Supplies'])->id,
            'branch_id' => $this->branch->id,
            'user_id' => $this->manager->id,
            'cash_session_id' => $session->id,
            'amount' => 70,
            'expense_date' => '2026-10-08',
            'payment_method' => 'cash',
            'description' => 'Ice for drinks',
            'status' => 'approved',
        ]);
        PettyCashVoucher::create([
            'voucher_number' => 'PCV-1', 'petty_cash_fund_id' => $fund->id, 'requested_by' => $this->manager->id,
            'expense_id' => $expense->id, 'voucher_type' => 'expense', 'amount' => 70, 'balance_before' => 500,
            'balance_after' => 430, 'payee' => 'Ice store', 'purpose' => 'Ice for drinks', 'status' => 'approved',
        ]);

        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $reading = ZReading::sole();
        $this->assertSame(90.0, $reading->discount_total);
        $this->assertSame(65.0, $reading->senior_pwd_discount);
        $this->assertSame(15.0, $reading->promo_discount);
        $this->assertSame(10.0, $reading->manual_discount);
        $this->assertSame(25.0, $reading->service_charge_total);
        // Drawer: opening 1,000 + cash sales 350 − paid out 70.
        $this->assertSame(350.0, $reading->cash_sales);
        $this->assertSame(70.0, $reading->cash_paid_out);
        $this->assertSame('Ice for drinks', $reading->payouts[0]['description']);
        $this->assertSame(70.0, (float) $reading->payouts[0]['amount']);
        $this->assertSame(['Spanish Latte', 'Ultimate Burger'], array_column($reading->top_items, 'name'));
        $this->assertSame(2.0, (float) $reading->top_items[0]['quantity']);
        $this->assertSame(['Coffee', 'Burgers'], array_column($reading->categories, 'category'));
    }

    public function test_numbers_and_grand_total_carry_over_from_the_previous_reading(): void
    {
        $this->sale('2026-10-07 12:00:00', total: 400);
        $this->sale('2026-10-08 12:00:00', total: 250);

        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-07']);
        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $second = ZReading::whereDate('business_date', '2026-10-08')->sole();
        $this->assertSame(2, $second->z_number);
        $this->assertSame(400.0, $second->previous_grand_total);
        $this->assertSame(650.0, $second->grand_total);
    }

    public function test_a_day_with_an_open_cash_session_cannot_be_closed(): void
    {
        CashSession::create([
            'user_id' => $this->manager->id,
            'branch_id' => $this->branch->id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => '2026-10-08 07:00:00',
        ]);

        $response = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $response->assertSessionHasErrors('z_reading');
        $this->assertDatabaseCount('z_readings', 0);
    }

    public function test_a_day_can_only_be_closed_once(): void
    {
        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);
        $response = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $response->assertSessionHasErrors(['z_reading' => 'This day already has a Z-reading.']);
        $this->assertDatabaseCount('z_readings', 1);
    }

    public function test_days_must_be_closed_in_order(): void
    {
        $this->sale('2026-10-05 12:00:00', total: 100);
        $this->sale('2026-10-06 12:00:00', total: 100);
        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-05']);

        $skipping = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);
        $skipping->assertSessionHasErrors(['z_reading' => 'Close Oct 6, 2026 first. Days must be closed in order.']);

        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-06'])->assertSessionHasNoErrors();
        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08'])->assertSessionHasNoErrors();

        $backdated = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-04']);
        $backdated->assertSessionHasErrors('z_reading');
        $this->assertSame(['2026-10-05', '2026-10-06', '2026-10-08'], ZReading::orderBy('z_number')->get()->map->business_date->map->toDateString()->all());
    }

    public function test_future_days_are_rejected(): void
    {
        $response = $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-09']);

        $response->assertSessionHasErrors('business_date');
        $this->assertDatabaseCount('z_readings', 0);
    }

    public function test_no_cash_session_can_be_opened_after_today_is_closed(): void
    {
        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $response = $this->actingAs($this->manager)->post(route('cash-sessions.open'), ['opening_cash' => 500]);

        $response->assertSessionHasErrors('error');
        $this->assertDatabaseCount('cash_sessions', 0);
    }

    public function test_vat_inclusive_sales_are_split_into_vatable_vat_and_exempt(): void
    {
        SystemSetting::set('tax.enable_vat', true);
        SystemSetting::set('tax.vat_rate', 12);
        SystemSetting::set('tax.vat_inclusive', true);
        $taxable = Product::create(['name' => 'Latte', 'is_taxable' => true]);
        $exempt = Product::create(['name' => 'Rice', 'is_taxable' => false]);
        $sale = $this->sale('2026-10-08 12:00:00', total: 212);
        $sale->items()->create(['product_id' => $taxable->id, 'quantity' => 1, 'price' => 112, 'total' => 112]);
        $sale->items()->create(['product_id' => $exempt->id, 'quantity' => 1, 'price' => 100, 'total' => 100]);

        $this->actingAs($this->manager)->post(route('z-readings.store'), ['business_date' => '2026-10-08']);

        $reading = ZReading::sole();
        $this->assertSame(100.0, $reading->vatable_sales);
        $this->assertSame(12.0, $reading->vat_amount);
        $this->assertSame(100.0, $reading->vat_exempt_sales);
    }

    public function test_index_previews_the_oldest_unclosed_day(): void
    {
        $this->sale('2026-10-06 12:00:00', total: 100);
        $this->sale('2026-10-07 12:00:00', total: 175);
        ZReading::factory()->create(['branch_id' => $this->branch->id, 'z_number' => 1, 'business_date' => '2026-10-06']);

        $response = $this->actingAs($this->manager)->get(route('z-readings.index'));

        $response->assertInertia(fn (Assert $page) => $page
            ->component('ZReadings/Index')
            ->where('date', '2026-10-07')
            ->where('pending_dates', ['2026-10-07'])
            ->where('preview.net_sales', 175)
            ->where('existing', null));
    }

    public function test_users_without_z_reading_access_are_turned_away(): void
    {
        $cashier = $this->makeUser('cashier', User::ROLE_CASHIER, $this->branch, ['2', '14']);

        $this->actingAs($cashier)->get(route('z-readings.index'))->assertRedirect();
        $this->actingAs($cashier)->post(route('z-readings.store'), ['business_date' => '2026-10-08'])->assertRedirect();

        $this->assertDatabaseCount('z_readings', 0);
    }

    public function test_managers_cannot_open_another_branchs_reading(): void
    {
        $other = ZReading::factory()->create(['branch_id' => $this->makeBranch('WEST')->id]);

        $this->actingAs($this->manager)->get(route('z-readings.show', $other))->assertForbidden();
        $this->actingAs($this->manager)->post(route('z-readings.reprint', $other))->assertForbidden();
    }

    public function test_reprinting_counts_copies(): void
    {
        $reading = ZReading::factory()->create(['branch_id' => $this->branch->id]);

        $this->actingAs($this->manager)->post(route('z-readings.reprint', $reading));
        $this->actingAs($this->manager)->post(route('z-readings.reprint', $reading));

        $this->assertSame(2, $reading->fresh()->reprint_count);
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
    private function makeUser(string $username, string $role, Branch $branch, array $access): User
    {
        return User::create([
            'fname' => ucfirst($username),
            'lname' => 'Tester',
            'username' => $username,
            'password' => 'password',
            'role' => $role,
            'branch_id' => $branch->id,
            'access' => $access,
        ]);
    }

    private function sale(
        string $at,
        float $total,
        string $method = 'cash',
        float $discount = 0,
        string $status = 'completed',
        ?string $receipt = null,
        array $extra = [],
    ): Sale {
        $sale = (new Sale)->forceFill([
            'receipt_number' => $receipt ?? 'R-'.uniqid(),
            'branch_id' => $this->branch->id,
            'user_id' => $this->manager->id,
            'total' => $total,
            'payment_method' => $method,
            'discount_amount' => $discount,
            'status' => $status,
            'created_at' => $at,
            'updated_at' => $at,
            ...$extra,
        ]);
        $sale->save();

        return $sale;
    }

    private function closedSession(string $openedAt, float $opening, float $expected, float $counted): CashSession
    {
        return CashSession::create([
            'user_id' => $this->manager->id,
            'branch_id' => $this->branch->id,
            'opening_cash' => $opening,
            'expected_cash' => $expected,
            'counted_cash' => $counted,
            'over_short' => $counted - $expected,
            'status' => 'closed',
            'opened_at' => $openedAt,
            'closed_at' => $openedAt,
        ]);
    }
}
