<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\Product;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BoundaryCafeTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_landing_page_is_available(): void
    {
        $this->get('/')->assertOk()->assertInertia(fn ($page) => $page->component('Landing/Index'));
    }

    public function test_boundary_cafe_seed_data_is_repeatable(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(3, Branch::whereIn('code', ['BC-TAG', 'BC-MAB', 'BC-MAIN'])->count());
        $this->assertSame(58, Product::where('barcode', 'like', 'BC%')->count());
        $this->assertSame(0, Product::where('barcode', 'like', 'BC%')->where('product_img', 'like', '/uploads/boundary%.jpg')->count());

        Product::where('barcode', 'like', 'BC%')->pluck('product_img')->unique()->each(function (string $image): void {
            $this->assertFileExists(public_path(ltrim($image, '/')));
        });

        $this->assertSame('/images/products/boundary/coffee-hot.svg', Product::where('name', 'Americano')->value('product_img'));
        $this->assertSame('/images/products/boundary/dessert.svg', Product::where('name', 'Cheesecake')->value('product_img'));
    }

    public function test_customer_receives_an_opaque_public_loyalty_card(): void
    {
        $this->seed(DatabaseSeeder::class);
        $customer = Customer::firstOrFail();

        $this->assertNotNull($customer->customer_number);
        $this->assertNotNull($customer->loyalty_token);
        $this->assertStringNotContainsString($customer->name, $customer->loyalty_token);

        $this->get("/loyalty/card/{$customer->loyalty_token}")
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Loyalty/Card'));
        $this->get('/loyalty/card/not-a-real-token')->assertNotFound();
    }
}
