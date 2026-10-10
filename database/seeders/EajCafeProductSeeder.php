<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * The same menu as Boundary Cafe (names, categories and prices from BoundaryCafeProductSeeder::MENU), branded
 * for the EAJ Restaurant / Cafe Management System. Photos are AI-generated with the EAJ logo printed on the
 * packaging (`php artisan eaj:product-images`); until a photo exists the product shows its own SVG icon.
 *
 * Run on its own: php artisan db:seed --class=EajCafeProductSeeder
 */
class EajCafeProductSeeder extends Seeder
{
    /** Where the generated photos live, relative to public/. */
    public const IMAGE_DIR = 'images/products/eaj';

    /** The EAJ logo: the reference image for the AI photos (never used as a product image). */
    public const LOGO = '/images/eaj/eaj-logo.png';

    /** Categories sold from counted stock; everything else is made to order (same rule as Boundary Cafe). */
    private const STOCKED_CATEGORIES = ['Desserts'];

    private const OPENING_STOCK = 30;

    public function run(): void
    {
        $categories = collect(array_unique(array_column(BoundaryCafeProductSeeder::MENU, 0)))
            ->mapWithKeys(fn (string $name) => [$name => Category::updateOrCreate(
                ['slug' => Str::slug($name)],
                ['name' => $name, 'description' => "EAJ Cafe {$name}", 'is_active' => true],
            )->id]);
        $branches = Branch::where('is_active', true)->get();

        foreach (BoundaryCafeProductSeeder::MENU as $index => [$category, $name, $price]) {
            $isStocked = in_array($category, self::STOCKED_CATEGORIES, true);
            $product = Product::updateOrCreate(['barcode' => self::barcode($index)], [
                'name' => $name,
                'category_id' => $categories[$category],
                'description' => "EAJ Cafe {$category} item. Seed price is an editable estimate.",
                'product_img' => self::imagePath($name),
                'product_type' => $isStocked ? 'standard' : 'made_to_order',
                'unit' => $isStocked ? 'slice' : 'serving',
                'status' => 'active',
                'is_taxable' => true,
            ]);

            foreach ($branches as $branch) {
                $capital = round($price * .45, 2);
                ProductStock::updateOrCreate(['product_id' => $product->id, 'branch_id' => $branch->id], [
                    'stock' => $isStocked ? self::OPENING_STOCK : 0,
                    'capital' => $capital,
                    'markup' => round((($price / $capital) - 1) * 100, 2),
                ]);
            }
        }

        $this->command?->info('EAJ Cafe menu seeded ('.count(BoundaryCafeProductSeeder::MENU).' items across '.$branches->count().' branches).');
    }

    /** Barcode of the menu item at this position in BoundaryCafeProductSeeder::MENU, e.g. "EAJ00001". */
    public static function barcode(int $menuIndex): string
    {
        return 'EAJ'.str_pad((string) ($menuIndex + 1), 5, '0', STR_PAD_LEFT);
    }

    /** File name of a product's generated photo, e.g. "cookies-n-cream.webp". */
    public static function imageFile(string $name): string
    {
        return Str::slug($name).'.webp';
    }

    /**
     * The product's AI photo when it has been generated, otherwise its own SVG icon
     * (public/images/products/eaj/icons, e.g. a coffee mug for lattes, a burger for burgers).
     */
    public static function imagePath(string $name): string
    {
        $photo = self::IMAGE_DIR.'/'.self::imageFile($name);
        if (file_exists(public_path($photo))) {
            return '/'.$photo;
        }

        $icon = self::IMAGE_DIR.'/icons/'.Str::slug($name).'.svg';

        return file_exists(public_path($icon)) ? '/'.$icon : '/images/products/default-product.svg';
    }
}
