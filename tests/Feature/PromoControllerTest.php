<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Promo;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromoControllerTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'fname' => 'Test', 'lname' => 'Admin', 'username' => 'admin', 'password' => 'password',
            'role' => User::ROLE_SUPER_ADMIN,
        ]);
    }

    private function product(string $barcode): Product
    {
        return Product::create(['name' => "Item {$barcode}", 'barcode' => $barcode, 'product_type' => 'standard', 'unit' => 'pc', 'status' => 'active']);
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return $overrides + [
            'name' => 'Barkada Treat',
            'code' => 'barkada',
            'description' => null,
            'discount_type' => 'percent',
            'discount_value' => 10,
            'applies_to' => 'all',
        ];
    }

    public function test_creates_a_promo_for_specific_products_with_an_uppercase_code(): void
    {
        $burger = $this->product('P1');

        $this->actingAs($this->admin())->post(route('promos.store'), $this->payload([
            'applies_to' => 'specific_products',
            'product_ids' => [$burger->id],
        ]))->assertRedirect()->assertSessionHasNoErrors();

        $promo = Promo::sole();
        $this->assertSame('BARKADA', $promo->code);
        $this->assertSame([$burger->id], $promo->products()->pluck('products.id')->all());
    }

    public function test_rejects_a_percent_discount_above_100(): void
    {
        $this->actingAs($this->admin())->post(route('promos.store'), $this->payload(['discount_value' => 150]))
            ->assertSessionHasErrors(['discount_value' => 'Percent discount cannot exceed 100%.']);

        $this->assertSame(0, Promo::count());
    }

    public function test_switching_a_promo_to_all_items_clears_its_product_list(): void
    {
        $admin = $this->admin();
        $promo = Promo::create(['name' => 'Burger deal', 'discount_type' => 'fixed', 'discount_value' => 20, 'applies_to' => 'specific_products', 'is_active' => true]);
        $promo->products()->sync([$this->product('P1')->id]);

        $this->actingAs($admin)->patch(route('promos.update', $promo), $this->payload(['name' => 'Everything deal', 'code' => null]))
            ->assertSessionHasNoErrors();

        $promo->refresh();
        $this->assertSame('Everything deal', $promo->name);
        $this->assertSame('all', $promo->applies_to);
        $this->assertSame(0, $promo->products()->count());
    }

    public function test_toggles_and_deletes_a_promo(): void
    {
        $admin = $this->admin();
        $promo = Promo::create(['name' => 'Burger deal', 'discount_type' => 'fixed', 'discount_value' => 20, 'applies_to' => 'all', 'is_active' => true]);

        $this->actingAs($admin)->patch(route('promos.toggle', $promo))->assertSessionHasNoErrors();
        $this->assertFalse((bool) $promo->fresh()->is_active);

        $this->actingAs($admin)->delete(route('promos.destroy', $promo))->assertSessionHasNoErrors();
        $this->assertModelMissing($promo);
    }

    public function test_apply_returns_the_discount_for_an_active_code(): void
    {
        Promo::create(['name' => 'Barkada Treat', 'code' => 'BARKADA', 'discount_type' => 'percent', 'discount_value' => 10, 'applies_to' => 'all', 'is_active' => true, 'channels' => 'both']);

        $this->actingAs($this->admin())->postJson(route('promos.apply'), ['code' => 'barkada', 'subtotal' => 500])
            ->assertOk()
            ->assertJson(['valid' => true, 'discount_amount' => 50, 'final_total' => 450]);
    }
}
