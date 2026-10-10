<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Product;
use App\Models\Promo;
use App\Models\Supplier;
use App\Services\OnlineOrderService;
use Database\Seeders\BoundaryCafeProductSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EajCafeProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EajCafeProductsTest extends TestCase
{
    use RefreshDatabase;

    private string $outDir;

    /** A throwaway public/ folder, so these tests never write to or delete the real menu photos. */
    private string $publicDir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->outDir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'eaj-images-'.uniqid();

        $this->publicDir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'eaj-public-'.uniqid();
        File::copyDirectory(public_path(EajCafeProductSeeder::IMAGE_DIR.'/icons'), $this->publicDir.'/'.EajCafeProductSeeder::IMAGE_DIR.'/icons');
        File::ensureDirectoryExists(dirname($this->publicDir.EajCafeProductSeeder::LOGO));
        File::copy(public_path(ltrim(EajCafeProductSeeder::LOGO, '/')), $this->publicDir.EajCafeProductSeeder::LOGO);
        $this->app->usePublicPath($this->publicDir);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->outDir);
        File::deleteDirectory($this->publicDir);

        parent::tearDown();
    }

    private function pngBase64(): string
    {
        $image = imagecreatetruecolor(8, 8);
        ob_start();
        imagepng($image);

        return base64_encode((string) ob_get_clean());
    }

    private function fakeOpenAi(): void
    {
        config(['services.openai.key' => 'test-key', 'services.openai.image_model' => 'gpt-image-1']);
        Http::fake(['api.openai.com/*' => Http::response(['data' => [['b64_json' => $this->pngBase64()]]])]);
    }

    public function test_seeder_adds_the_boundary_menu_under_eaj_codes_with_icons_until_a_photo_exists(): void
    {
        $supplier = Supplier::create(['name' => 'Test Supplier']);
        Branch::create(['supplier_id' => $supplier->id, 'name' => 'EAJ Main', 'code' => 'EAJ-MAIN']);

        $photo = public_path(EajCafeProductSeeder::IMAGE_DIR.'/americano.webp');
        imagewebp(imagecreatetruecolor(4, 4), $photo);

        $this->seed(EajCafeProductSeeder::class);

        $this->assertSame(count(BoundaryCafeProductSeeder::MENU), Product::where('barcode', 'like', 'EAJ%')->count());
        $this->assertEqualsCanonicalizing(
            array_column(BoundaryCafeProductSeeder::MENU, 1),
            Product::where('barcode', 'like', 'EAJ%')->pluck('name')->all(),
        );
        $this->assertSame('/images/products/eaj/americano.webp', Product::where('name', 'Americano')->value('product_img'));
        // Without a photo each product shows its own icon, never the EAJ logo.
        $this->assertSame('/images/products/eaj/icons/taro.svg', Product::where('name', 'Taro')->value('product_img'));
        $this->assertSame(0, Product::where('barcode', 'like', 'EAJ%')->where('product_img', EajCafeProductSeeder::LOGO)->count());
        $this->assertSame(
            count(BoundaryCafeProductSeeder::MENU) - 1,
            Product::where('barcode', 'like', 'EAJ%')->where('product_img', 'like', '/images/products/eaj/icons/%.svg')->count(),
        );
        // Same price as Boundary Cafe (Americano ₱95): capital is 45% of it, as in BoundaryCafeProductSeeder.
        $this->assertEqualsWithDelta(42.75, (float) Product::where('name', 'Americano')->first()->stocks()->first()->capital, 0.001);
    }

    public function test_command_sends_the_eaj_logo_with_the_prompt_and_saves_a_webp(): void
    {
        $this->fakeOpenAi();

        $this->artisan('eaj:product-images', ['--only' => ['Americano'], '--path' => $this->outDir])->assertSuccessful();

        $file = $this->outDir.DIRECTORY_SEPARATOR.'americano.webp';
        $this->assertFileExists($file);
        $this->assertSame('WEBP', substr((string) file_get_contents($file), 8, 4));

        Http::assertSent(function (Request $request) {
            $parts = collect($request->data())->keyBy('name');

            return $request->url() === 'https://api.openai.com/v1/images/edits'
                && $request->hasHeader('Authorization', 'Bearer test-key')
                && $parts->has('image[]')
                && $parts['model']['contents'] === 'gpt-image-1'
                && str_contains($parts['prompt']['contents'], '"Americano"')
                && str_contains($parts['prompt']['contents'], 'EAJ logo');
        });
    }

    public function test_a_generated_photo_is_put_on_the_eaj_product_without_touching_prices(): void
    {
        $photo = public_path(EajCafeProductSeeder::IMAGE_DIR.'/'.EajCafeProductSeeder::imageFile('Americano'));

        $supplier = Supplier::create(['name' => 'Test Supplier']);
        Branch::create(['supplier_id' => $supplier->id, 'name' => 'EAJ Main', 'code' => 'EAJ-MAIN']);
        $this->seed(EajCafeProductSeeder::class);
        $americano = Product::where('name', 'Americano')->firstOrFail();
        $americano->stocks()->update(['price' => 99]);
        $this->fakeOpenAi();

        $this->artisan('eaj:product-images', ['--only' => ['Americano']])->assertSuccessful();

        $this->assertFileExists($photo);
        $this->assertSame('/images/products/eaj/americano.webp', $americano->fresh()->product_img);
        $this->assertEquals(99, $americano->stocks()->value('price'));
        $this->assertSame('/images/products/eaj/icons/taro.svg', Product::where('name', 'Taro')->value('product_img'));
    }

    public function test_command_skips_photos_that_already_exist_unless_forced(): void
    {
        $this->fakeOpenAi();
        $options = ['--only' => ['Americano'], '--path' => $this->outDir];

        $this->artisan('eaj:product-images', $options)->assertSuccessful();
        $this->artisan('eaj:product-images', $options)->assertSuccessful();
        Http::assertSentCount(1);

        $this->artisan('eaj:product-images', $options + ['--force' => true])->assertSuccessful();
        Http::assertSentCount(2);
    }

    public function test_command_refuses_to_run_without_an_api_key(): void
    {
        config(['services.openai.key' => null]);
        Http::fake();

        $this->artisan('eaj:product-images', ['--only' => ['Americano'], '--path' => $this->outDir])
            ->expectsOutputToContain('Set OPENAI_API_KEY')
            ->assertFailed();

        Http::assertNothingSent();
    }

    public function test_a_failed_image_is_reported_and_the_command_fails(): void
    {
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'Your organization must be verified']], 403)]);

        $this->artisan('eaj:product-images', ['--only' => ['Americano'], '--path' => $this->outDir])
            ->expectsOutputToContain('OpenAI 403: Your organization must be verified')
            ->assertFailed();

        $this->assertFileDoesNotExist($this->outDir.DIRECTORY_SEPARATOR.'americano.webp');
    }

    public function test_eaj_menu_seed_has_recipes_so_items_are_not_sold_out(): void
    {
        config(['app.menu_seeder' => 'eaj']);

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(0, Product::where('barcode', 'like', 'BC%')->count());
        $this->assertSame('/images/products/eaj/boundary-favorites-snack-bundle.webp', Promo::where('name', 'Barkada Treat')->value('banner_image'));
        $madeToOrder = Product::where('barcode', 'like', 'EAJ%')->where('product_type', 'made_to_order')->get();
        $this->assertNotEmpty($madeToOrder);
        $this->assertSame(0, $madeToOrder->filter(fn (Product $p) => $p->recipeIngredients()->doesntExist())->count());

        $online = app(OnlineOrderService::class);
        $taro = $online->catalog($online->branch())['products']->firstWhere('name', 'Taro');
        $this->assertFalse($taro['sold_out']);
    }
}
