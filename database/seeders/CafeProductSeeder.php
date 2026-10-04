<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\ProductVariant;
use App\Models\ProductVariantStock;
use Illuminate\Database\Seeder;

class CafeProductSeeder extends Seeder
{
    /**
     * Finished cafe products for COOP Main Campus (CMC).
     *
     * made_to_order drinks → SIZE VARIANTS (Small 12oz / Medium 16oz / Large 22oz)
     *   Stock lives in product_variant_stocks, base product stock = 0.
     *   Medium adds ₱15, Large adds ₱30 via extra_price.
     *
     * made_to_order food   → NO variants (pancit canton, eggs)
     *   Stock = 0, deduction driven by recipe ingredients.
     *
     * standard products    → direct stock in product_stocks
     *   Pre-made breads, bottled drinks, packaged snacks.
     *
     * Pricing: price = capital × (1 + markup / 100) + variant.extra_price
     * All auto-computed by ProductStock / ProductVariantStock boot hooks.
     */
    public function run(): void
    {
        $branch = Branch::where('code', 'CMC')->first();

        if (!$branch) {
            $this->command->warn('Branch CMC not found. Skipping.');
            return;
        }

        $cats         = Category::pluck('id', 'name');
        $productCount = 0;
        $variantCount = 0;

        // ── Helpers ────────────────────────────────────────────────

        $makeProduct = function (array $p) use ($cats, $branch, &$productCount): Product {
            $product = Product::firstOrCreate(
                ['barcode' => $p['barcode']],
                [
                    'name'         => $p['name'],
                    'category_id'  => $cats[$p['category']] ?? null,
                    'product_type' => $p['product_type'],
                ]
            );

            ProductStock::updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                [
                    'stock'   => $p['stock'] ?? 0,
                    'capital' => $p['capital'],
                    'markup'  => $p['markup'],
                ]
            );

            $productCount++;
            return $product;
        };

        $makeVariants = function (Product $product, array $variants) use ($branch, &$variantCount): void {
            foreach ($variants as $i => $v) {
                $variant = ProductVariant::firstOrCreate(
                    ['product_id' => $product->id, 'name' => $v['name']],
                    [
                        'product_id'  => $product->id,
                        'name'        => $v['name'],
                        'attributes'  => $v['attributes'] ?? [],
                        'extra_price' => $v['extra_price'],
                        'is_available'=> true,
                        'sort_order'  => $i,
                    ]
                );

                ProductVariantStock::updateOrCreate(
                    ['product_variant_id' => $variant->id, 'branch_id' => $branch->id],
                    [
                        'stock'   => 0, // stock tracked via ingredient deduction
                        'capital' => $v['capital'],
                        'markup'  => $v['markup'],
                    ]
                );

                $variantCount++;
            }
        };

        // Small = base price, Medium = +₱15, Large = +₱30
        $drinkSizes = fn(float $capital, float $markup) => [
            ['name' => 'Small (12oz)',  'attributes' => ['size' => 'Small',  'oz' => '12oz'], 'extra_price' => 0,  'capital' => $capital,      'markup' => $markup],
            ['name' => 'Medium (16oz)', 'attributes' => ['size' => 'Medium', 'oz' => '16oz'], 'extra_price' => 15, 'capital' => $capital + 5,  'markup' => $markup],
            ['name' => 'Large (22oz)',  'attributes' => ['size' => 'Large',  'oz' => '22oz'], 'extra_price' => 30, 'capital' => $capital + 10, 'markup' => $markup],
        ];

        // ══════════════════════════════════════════════════════════
        // HOT COFFEE — made_to_order with size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000001', 'name' => 'Brewed Coffee',    'capital' => 18.00, 'markup' => 111.11],
            ['barcode' => '2000002', 'name' => 'Americano',        'capital' => 20.00, 'markup' => 100.00],
            ['barcode' => '2000003', 'name' => 'Cappuccino',       'capital' => 28.00, 'markup' => 107.14],
            ['barcode' => '2000004', 'name' => 'Latte',            'capital' => 30.00, 'markup' => 100.00],
            ['barcode' => '2000005', 'name' => 'Caramel Latte',    'capital' => 35.00, 'markup' => 100.00],
            ['barcode' => '2000006', 'name' => 'Vanilla Latte',    'capital' => 35.00, 'markup' => 100.00],
        ] as $p) {
            $product = $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'made_to_order', 'stock' => 0]));
            $makeVariants($product, $drinkSizes($p['capital'], $p['markup']));
        }

        // ══════════════════════════════════════════════════════════
        // ICED COFFEE — made_to_order with size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000007', 'name' => 'Iced Americano',      'capital' => 22.00, 'markup' => 127.27],
            ['barcode' => '2000008', 'name' => 'Iced Latte',          'capital' => 32.00, 'markup' => 87.50],
            ['barcode' => '2000009', 'name' => 'Iced Caramel Latte',  'capital' => 38.00, 'markup' => 84.21],
            ['barcode' => '2000010', 'name' => 'Iced Mocha',          'capital' => 38.00, 'markup' => 84.21],
            ['barcode' => '2000011', 'name' => 'Iced Spanish Latte',  'capital' => 40.00, 'markup' => 87.50],
            ['barcode' => '2000012', 'name' => 'Iced Matcha Latte',   'capital' => 42.00, 'markup' => 78.57],
            ['barcode' => '2000013', 'name' => 'Iced Coffee Classic', 'capital' => 18.00, 'markup' => 111.11],
        ] as $p) {
            $product = $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'made_to_order', 'stock' => 0]));
            $makeVariants($product, $drinkSizes($p['capital'], $p['markup']));
        }

        // ══════════════════════════════════════════════════════════
        // HOT TEA — made_to_order with size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000014', 'name' => 'Hot Black Tea',    'capital' => 12.00, 'markup' => 133.33],
            ['barcode' => '2000015', 'name' => 'Hot Green Tea',    'capital' => 15.00, 'markup' => 100.00],
            ['barcode' => '2000016', 'name' => 'Hot Chamomile Tea','capital' => 14.00, 'markup' => 114.29],
            ['barcode' => '2000017', 'name' => 'Honey Lemon Tea',  'capital' => 16.00, 'markup' => 112.50],
        ] as $p) {
            $product = $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'made_to_order', 'stock' => 0]));
            $makeVariants($product, $drinkSizes($p['capital'], $p['markup']));
        }

        // ══════════════════════════════════════════════════════════
        // ICED TEA — made_to_order with size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000018', 'name' => 'Iced Black Tea', 'capital' => 16.00, 'markup' => 112.50],
            ['barcode' => '2000019', 'name' => 'Iced Matcha',    'capital' => 30.00, 'markup' => 100.00],
            ['barcode' => '2000020', 'name' => 'Thai Iced Tea',  'capital' => 28.00, 'markup' => 107.14],
        ] as $p) {
            $product = $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'made_to_order', 'stock' => 0]));
            $makeVariants($product, $drinkSizes($p['capital'], $p['markup']));
        }

        // ══════════════════════════════════════════════════════════
        // CHOCOLATE — made_to_order with size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000021', 'name' => 'Hot Chocolate',  'capital' => 25.00, 'markup' => 100.00],
            ['barcode' => '2000022', 'name' => 'Iced Chocolate', 'capital' => 28.00, 'markup' => 107.14],
        ] as $p) {
            $product = $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'made_to_order', 'stock' => 0]));
            $makeVariants($product, $drinkSizes($p['capital'], $p['markup']));
        }

        // ══════════════════════════════════════════════════════════
        // FOOD — made_to_order, no size variants
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000023', 'name' => 'Pancit Canton',             'capital' => 35.00, 'markup' => 57.14],
            ['barcode' => '2000024', 'name' => 'Pancit Canton with Egg',    'capital' => 43.00, 'markup' => 55.81],
            ['barcode' => '2000025', 'name' => 'Pancit Canton with Hotdog', 'capital' => 50.00, 'markup' => 50.00],
            ['barcode' => '2000026', 'name' => 'Fried Egg',                 'capital' => 10.00, 'markup' => 100.00],
            ['barcode' => '2000027', 'name' => 'Boiled Egg',                'capital' => 8.00,  'markup' => 125.00],
        ] as $p) {
            $makeProduct(array_merge($p, ['category' => 'Food', 'product_type' => 'made_to_order', 'stock' => 0]));
        }

        // ══════════════════════════════════════════════════════════
        // BREADS & PASTRIES — standard (pre-made, delivered by baker)
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000028', 'name' => 'Pandesal (per piece)', 'capital' => 3.00,  'markup' => 66.67,  'stock' => 100],
            ['barcode' => '2000029', 'name' => 'Ensaymada',            'capital' => 12.00, 'markup' => 66.67,  'stock' => 50],
            ['barcode' => '2000030', 'name' => 'Cheese Bread',         'capital' => 15.00, 'markup' => 66.67,  'stock' => 50],
            ['barcode' => '2000031', 'name' => 'Croissant',            'capital' => 25.00, 'markup' => 80.00,  'stock' => 30],
            ['barcode' => '2000032', 'name' => 'Banana Bread (slice)', 'capital' => 18.00, 'markup' => 94.44,  'stock' => 30],
            ['barcode' => '2000033', 'name' => 'Muffin',               'capital' => 20.00, 'markup' => 100.00, 'stock' => 30],
            ['barcode' => '2000034', 'name' => 'Cookies (per piece)',   'capital' => 8.00,  'markup' => 87.50,  'stock' => 100],
        ] as $p) {
            $makeProduct(array_merge($p, ['category' => 'Food', 'product_type' => 'standard']));
        }

        // ══════════════════════════════════════════════════════════
        // BOTTLED & PACKAGED DRINKS — standard
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000035', 'name' => 'Bottled Water 500ml',  'capital' => 8.00,  'markup' => 87.50, 'stock' => 100],
            ['barcode' => '2000036', 'name' => 'Canned Soda 330ml',    'capital' => 28.00, 'markup' => 42.86, 'stock' => 48],
            ['barcode' => '2000037', 'name' => 'Juice Tetra Pack',     'capital' => 18.00, 'markup' => 66.67, 'stock' => 50],
            ['barcode' => '2000038', 'name' => '3-in-1 Coffee Sachet', 'capital' => 8.00,  'markup' => 87.50, 'stock' => 100],
        ] as $p) {
            $makeProduct(array_merge($p, ['category' => 'Beverages', 'product_type' => 'standard']));
        }

        // ══════════════════════════════════════════════════════════
        // SNACKS — standard (packaged)
        // ══════════════════════════════════════════════════════════
        foreach ([
            ['barcode' => '2000039', 'name' => 'Chips (small bag)',      'capital' => 18.00, 'markup' => 66.67,  'stock' => 50, 'category' => 'Snacks'],
            ['barcode' => '2000040', 'name' => 'Crackers',               'capital' => 10.00, 'markup' => 100.00, 'stock' => 50, 'category' => 'Snacks'],
            ['barcode' => '2000041', 'name' => 'Instant Noodles (pack)', 'capital' => 12.00, 'markup' => 66.67,  'stock' => 50, 'category' => 'Groceries'],
            ['barcode' => '2000042', 'name' => 'Chocolate Bar',          'capital' => 22.00, 'markup' => 59.09,  'stock' => 30, 'category' => 'Snacks'],
            ['barcode' => '2000043', 'name' => 'Energy Bar',             'capital' => 30.00, 'markup' => 66.67,  'stock' => 20, 'category' => 'Snacks'],
        ] as $p) {
            $makeProduct(array_merge($p, ['product_type' => 'standard']));
        }

        $this->command->info("✓ Cafe products seeded ({$productCount} products, {$variantCount} variants)");
    }
}
