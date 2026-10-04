<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use Illuminate\Database\Seeder;

class CafeIngredientSeeder extends Seeder
{
    /**
     * Raw material ingredients for COOP Main Campus (CMC).
     *
     * All are product_type = 'standard'.
     * They are NEVER sold directly — the recipe system deducts them
     * automatically when a made_to_order product is sold.
     *
     * markup = 0 (cost only, never priced for direct sale).
     * stock unit is in the comment (g = grams, ml = millilitres, pcs = pieces).
     */
    public function run(): void
    {
        $branch   = Branch::where('code', 'CMC')->first();
        $category = Category::where('name', 'Raw Materials')->first();

        if (!$branch || !$category) {
            $this->command->warn('Branch CMC or Raw Materials category not found. Skipping.');
            return;
        }

        $ingredients = [
            // ── Coffee base ────────────────────────────────────────
            ['barcode' => '1000001', 'name' => 'Espresso Powder',        'capital' => 2.50,  'stock' => 5000],   // g
            ['barcode' => '1000002', 'name' => 'Brewed Coffee Grounds',  'capital' => 1.80,  'stock' => 5000],   // g
            ['barcode' => '1000003', 'name' => 'Instant Coffee Powder',  'capital' => 1.20,  'stock' => 5000],   // g

            // ── Milk & cream ───────────────────────────────────────
            ['barcode' => '1000004', 'name' => 'Fresh Milk',             'capital' => 0.065, 'stock' => 20000],  // ml
            ['barcode' => '1000005', 'name' => 'All-purpose Cream',      'capital' => 0.090, 'stock' => 10000],  // ml
            ['barcode' => '1000006', 'name' => 'Condensed Milk',         'capital' => 0.080, 'stock' => 10000],  // ml
            ['barcode' => '1000007', 'name' => 'Evaporated Milk',        'capital' => 0.060, 'stock' => 10000],  // ml

            // ── Tea ────────────────────────────────────────────────
            ['barcode' => '1000008', 'name' => 'Black Tea Leaves',       'capital' => 1.50,  'stock' => 3000],   // g
            ['barcode' => '1000009', 'name' => 'Green Tea Powder',       'capital' => 3.00,  'stock' => 3000],   // g
            ['barcode' => '1000010', 'name' => 'Oolong Tea Leaves',      'capital' => 2.00,  'stock' => 2000],   // g
            ['barcode' => '1000011', 'name' => 'Chamomile Tea Bags',     'capital' => 8.00,  'stock' => 500],    // pcs

            // ── Sweeteners ─────────────────────────────────────────
            ['barcode' => '1000012', 'name' => 'White Sugar',            'capital' => 0.060, 'stock' => 20000],  // g
            ['barcode' => '1000013', 'name' => 'Brown Sugar',            'capital' => 0.070, 'stock' => 10000],  // g
            ['barcode' => '1000014', 'name' => 'Honey',                  'capital' => 0.25,  'stock' => 5000],   // ml
            ['barcode' => '1000015', 'name' => 'Caramel Syrup',          'capital' => 0.18,  'stock' => 5000],   // ml
            ['barcode' => '1000016', 'name' => 'Vanilla Syrup',          'capital' => 0.20,  'stock' => 5000],   // ml
            ['barcode' => '1000017', 'name' => 'Chocolate Syrup',        'capital' => 0.22,  'stock' => 5000],   // ml
            ['barcode' => '1000018', 'name' => 'Matcha Powder',          'capital' => 4.50,  'stock' => 2000],   // g

            // ── Ice & water ────────────────────────────────────────
            ['barcode' => '1000019', 'name' => 'Ice Cubes',              'capital' => 0.050, 'stock' => 50000],  // g
            ['barcode' => '1000020', 'name' => 'Purified Water',         'capital' => 0.005, 'stock' => 100000], // ml

            // ── Food base ──────────────────────────────────────────
            ['barcode' => '1000021', 'name' => 'Pancit Canton Noodles',  'capital' => 12.00, 'stock' => 500],    // pcs (pack)
            ['barcode' => '1000022', 'name' => 'Egg',                    'capital' => 8.00,  'stock' => 300],    // pcs
            ['barcode' => '1000023', 'name' => 'Hotdog',                 'capital' => 15.00, 'stock' => 200],    // pcs
            ['barcode' => '1000024', 'name' => 'Vegetable Oil',          'capital' => 0.090, 'stock' => 10000],  // ml
            ['barcode' => '1000025', 'name' => 'Soy Sauce',              'capital' => 0.10,  'stock' => 5000],   // ml
            ['barcode' => '1000026', 'name' => 'Cabbage',                'capital' => 0.080, 'stock' => 5000],   // g
            ['barcode' => '1000027', 'name' => 'Carrots',                'capital' => 0.060, 'stock' => 5000],   // g

            // ── Bread / pastry base ────────────────────────────────
            ['barcode' => '1000028', 'name' => 'All-purpose Flour',      'capital' => 0.040, 'stock' => 20000],  // g
            ['barcode' => '1000029', 'name' => 'Butter',                 'capital' => 0.35,  'stock' => 5000],   // g
            ['barcode' => '1000030', 'name' => 'Baking Powder',          'capital' => 0.50,  'stock' => 2000],   // g

            // ── Cups & packaging ───────────────────────────────────
            ['barcode' => '1000031', 'name' => 'Disposable Cup 12oz',    'capital' => 4.00,  'stock' => 1000],   // pcs
            ['barcode' => '1000032', 'name' => 'Disposable Cup 16oz',    'capital' => 5.00,  'stock' => 1000],   // pcs
            ['barcode' => '1000033', 'name' => 'Cup Lid',                'capital' => 1.50,  'stock' => 2000],   // pcs
            ['barcode' => '1000034', 'name' => 'Straw',                  'capital' => 0.50,  'stock' => 5000],   // pcs
            ['barcode' => '1000035', 'name' => 'Styro Bowl',             'capital' => 3.00,  'stock' => 500],    // pcs
        ];

        foreach ($ingredients as $item) {
            $product = Product::firstOrCreate(
                ['barcode' => $item['barcode']],
                [
                    'name'         => $item['name'],
                    'category_id'  => $category->id,
                    'product_type' => 'standard',
                ]
            );

            ProductStock::updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                [
                    'stock'   => $item['stock'],
                    'capital' => $item['capital'],
                    'markup'  => 0,
                ]
            );
        }

        $this->command->info('✓ Cafe ingredients seeded (' . count($ingredients) . ')');
    }
}
