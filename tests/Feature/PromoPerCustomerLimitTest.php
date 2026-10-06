<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\OnlineOrder;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PromoPerCustomerLimitTest extends TestCase
{
    use RefreshDatabase;

    private Branch $mabinay;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->mabinay = Branch::where('code', 'BC-MAB')->firstOrFail();

        // Midday in Manila, so the store is open for online orders.
        $this->travelTo(now('Asia/Manila')->setTime(12, 0));
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function joy(): Customer
    {
        return Customer::where('contact_number', '09171234567')->firstOrFail();
    }

    private function anotherCustomer(): Customer
    {
        return Customer::where('is_active', true)->whereKeyNot($this->joy()->id)->firstOrFail();
    }

    /** @return array<int, array{product_id: int, quantity: int}> */
    private function cart(): array
    {
        return [['product_id' => Product::where('name', 'Boundary Burger')->firstOrFail()->id, 'quantity' => 3]];
    }

    private function checkout(Customer $customer, ?string $promoCode): TestResponse
    {
        return $this->actingAs($customer, 'customer')->post('/checkout', [
            'items' => $this->cart(),
            'fulfillment_type' => 'pickup',
            'promo_code' => $promoCode,
        ]);
    }

    private function cashier(): User
    {
        $cashier = User::where('username', 'cashier_mab')->firstOrFail();
        CashSession::create(['user_id' => $cashier->id, 'branch_id' => $this->mabinay->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);

        return $cashier;
    }

    private function chargeAtPos(User $cashier, Promo $promo, ?Customer $customer): TestResponse
    {
        $product = Product::where('name', 'Boundary Burger')->firstOrFail();

        return $this->actingAs($cashier, 'web')->post('/pos', [
            'items' => [['id' => $product->id, 'qty' => 3]],
            'payment_method' => 'cash',
            'payment_amount' => 5000,
            'promo_id' => $promo->id,
            'customer_id' => $customer?->id,
        ]);
    }

    /** A one-per-customer promo usable both at the counter and online. */
    private function oneTimePromoForBothChannels(): Promo
    {
        return Promo::create([
            'name' => 'First visit', 'code' => 'FIRST20', 'discount_type' => 'fixed', 'discount_value' => 20,
            'applies_to' => 'all', 'max_uses_per_customer' => 1, 'is_active' => true, 'channels' => 'both',
        ]);
    }

    // ── Online checkout ──────────────────────────────────────────────────

    public function test_welcome_code_is_one_time_per_customer_and_rejects_a_second_order(): void
    {
        $ordersBefore = OnlineOrder::where('customer_id', $this->joy()->id)->count();

        $this->checkout($this->joy(), 'WELCOME50')->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame(1, OnlineOrder::where('customer_id', $this->joy()->id)->where('promo_discount', 50)->count());

        $this->checkout($this->joy(), 'welcome50')->assertSessionHasErrors(['promo_code' => 'You have already used this promo code.']);

        $this->assertSame($ordersBefore + 1, OnlineOrder::where('customer_id', $this->joy()->id)->count());
    }

    public function test_one_customers_use_does_not_block_another_customer(): void
    {
        $this->checkout($this->joy(), 'WELCOME50')->assertSessionHasNoErrors();

        $this->checkout($this->anotherCustomer(), 'WELCOME50')->assertSessionHasNoErrors()->assertRedirect();

        $this->assertSame(1, OnlineOrder::where('customer_id', $this->anotherCustomer()->id)->where('promo_discount', 50)->count());
    }

    public function test_cancelled_order_gives_the_customer_their_use_back(): void
    {
        $this->checkout($this->joy(), 'WELCOME50')->assertSessionHasNoErrors();
        $order = OnlineOrder::where('customer_id', $this->joy()->id)->latest('id')->firstOrFail();

        $this->actingAs($this->joy(), 'customer')
            ->post("/account/orders/{$order->order_number}/cancel", ['reason' => 'Changed my mind'])
            ->assertSessionHasNoErrors();

        $this->checkout($this->joy(), 'WELCOME50')->assertSessionHasNoErrors();
        $this->assertSame(1, OnlineOrder::where('customer_id', $this->joy()->id)->where('status', '!=', 'cancelled')->where('promo_discount', 50)->count());
    }

    public function test_auto_applied_promo_stops_applying_once_the_customer_has_used_it(): void
    {
        Promo::query()->update(['is_active' => false]);
        Promo::create([
            'name' => 'Opening treat', 'code' => null, 'discount_type' => 'fixed', 'discount_value' => 30, 'applies_to' => 'all',
            'max_uses_per_customer' => 1, 'is_active' => true, 'show_on_storefront' => true, 'channels' => 'online',
        ]);

        $lastSeededOrderId = (int) OnlineOrder::max('id');

        $this->checkout($this->joy(), null)->assertSessionHasNoErrors();
        $this->checkout($this->joy(), null)->assertSessionHasNoErrors();

        $this->assertSame(['30.00', '0.00'], OnlineOrder::where('id', '>', $lastSeededOrderId)->orderBy('id')->pluck('promo_discount')->all());
    }

    // ── POS ──────────────────────────────────────────────────────────────

    public function test_pos_refuses_a_per_customer_promo_without_a_customer(): void
    {
        $promo = $this->oneTimePromoForBothChannels();

        $this->chargeAtPos($this->cashier(), $promo, null)
            ->assertSessionHasErrors(['error' => 'Select the customer first — "First visit" is limited per customer.']);

        $this->assertSame(0, Sale::where('channel', 'counter')->count());
    }

    public function test_pos_refuses_a_customer_who_already_used_the_promo_online(): void
    {
        $promo = $this->oneTimePromoForBothChannels();
        $this->checkout($this->joy(), 'FIRST20')->assertSessionHasNoErrors();

        $this->chargeAtPos($this->cashier(), $promo, $this->joy())
            ->assertSessionHasErrors(['error' => "{$this->joy()->name} has already used \"First visit\"."]);

        $this->assertSame(0, Sale::where('channel', 'counter')->count());
    }

    public function test_counter_use_counts_against_later_online_checkout(): void
    {
        $promo = $this->oneTimePromoForBothChannels();

        $this->chargeAtPos($this->cashier(), $promo, $this->joy())->assertSessionHasNoErrors()->assertSessionHas('pos_result');
        $this->assertSame($promo->id, Sale::where('channel', 'counter')->where('customer_id', $this->joy()->id)->sole()->promo_id);

        $this->checkout($this->joy(), 'FIRST20')->assertSessionHasErrors(['promo_code' => 'You have already used this promo code.']);
    }

    public function test_voided_counter_sale_gives_the_customer_their_use_back(): void
    {
        $promo = $this->oneTimePromoForBothChannels();
        $this->chargeAtPos($this->cashier(), $promo, $this->joy())->assertSessionHasNoErrors();
        Sale::where('channel', 'counter')->update(['status' => 'voided']);

        $this->checkout($this->joy(), 'FIRST20')->assertSessionHasNoErrors();
    }
}
