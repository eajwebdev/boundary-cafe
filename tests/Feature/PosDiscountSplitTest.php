<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosDiscountSplitTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Product $burger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        $branch = Branch::where('code', 'BC-MAB')->firstOrFail();
        $this->cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $this->cashier->id, 'branch_id' => $branch->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);
        $this->burger = Product::where('name', 'Boundary Burger')->firstOrFail();
        SystemSetting::set('tax.enable_service_charge', true);
        SystemSetting::set('tax.service_charge_rate', 10);
    }

    public function test_a_senior_pwd_sale_keeps_its_discount_promo_and_service_charge_apart(): void
    {
        $promo = Promo::create([
            'name' => 'Lunch', 'discount_type' => 'fixed', 'discount_value' => 20,
            'applies_to' => 'all', 'is_active' => true, 'channels' => 'both',
        ]);

        $this->actingAs($this->cashier)->post('/pos', [
            'items' => [['id' => $this->burger->id, 'qty' => 3]],
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'discount_percent' => 20,
            'discount_type' => 'senior_pwd',
            'promo_id' => $promo->id,
        ])->assertSessionHasNoErrors();

        $sale = Sale::latest('id')->firstOrFail();
        $subtotal = 3 * (float) $this->burger->stocks()->value('price');
        $this->assertSame('senior_pwd', $sale->discount_type);
        $this->assertEquals(round($subtotal * 0.2, 2), $sale->manual_discount);
        $this->assertEquals(20, $sale->promo_discount);
        $this->assertEquals((float) $sale->manual_discount + 20, $sale->discount_amount);
        $this->assertEquals(round(($subtotal - (float) $sale->manual_discount - 20) * 0.1, 2), $sale->service_charge);
    }

    public function test_a_plain_percentage_discount_is_recorded_as_manual(): void
    {
        $this->actingAs($this->cashier)->post('/pos', [
            'items' => [['id' => $this->burger->id, 'qty' => 1]],
            'payment_method' => 'cash',
            'payment_amount' => 1000,
            'discount_percent' => 10,
        ])->assertSessionHasNoErrors();

        $sale = Sale::latest('id')->firstOrFail();
        $this->assertSame('manual', $sale->discount_type);
        $this->assertEquals(0, $sale->promo_discount);
    }
}
