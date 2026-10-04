<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\RecipeIngredient;
use Illuminate\Database\Seeder;

class CafeRecipeSeeder extends Seeder
{
    /**
     * Bill of Materials for every made_to_order cafe product.
     * Recipes define what ingredients are deducted from stock
     * each time the product is sold via POS.
     *
     * Format per line: [ingredient_barcode, quantity, unit, notes]
     *
     * Ingredient barcodes (from CafeIngredientSeeder):
     *   1000001 Espresso Powder (g)         1000019 Ice Cubes (g)
     *   1000002 Brewed Coffee Grounds (g)   1000020 Purified Water (ml)
     *   1000003 Instant Coffee Powder (g)   1000021 Pancit Canton Noodles (pcs)
     *   1000004 Fresh Milk (ml)             1000022 Egg (pcs)
     *   1000005 All-purpose Cream (ml)      1000023 Hotdog (pcs)
     *   1000006 Condensed Milk (ml)         1000024 Vegetable Oil (ml)
     *   1000007 Evaporated Milk (ml)        1000025 Soy Sauce (ml)
     *   1000008 Black Tea Leaves (g)        1000026 Cabbage (g)
     *   1000009 Green Tea Powder (g)        1000027 Carrots (g)
     *   1000010 Oolong Tea Leaves (g)       1000031 Cup 12oz (pcs)
     *   1000011 Chamomile Tea Bags (pcs)    1000032 Cup 16oz (pcs)
     *   1000012 White Sugar (g)             1000033 Cup Lid (pcs)
     *   1000013 Brown Sugar (g)             1000034 Straw (pcs)
     *   1000014 Honey (ml)                  1000035 Styro Bowl (pcs)
     *   1000015 Caramel Syrup (ml)
     *   1000016 Vanilla Syrup (ml)
     *   1000017 Chocolate Syrup (ml)
     *   1000018 Matcha Powder (g)
     */
    public function run(): void
    {
        $recipes = [

            // ── HOT COFFEE ─────────────────────────────────────────

            '2000001' => [ // Brewed Coffee
                ['1000002', 18,  'g',   'medium grind coffee grounds'],
                ['1000020', 180, 'ml',  'hot water'],
                ['1000012', 10,  'g',   'white sugar on the side'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000002' => [ // Americano
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000020', 200, 'ml',  'hot water'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000003' => [ // Cappuccino
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 120, 'ml',  'steamed milk'],
                ['1000004', 30,  'ml',  'milk foam'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000004' => [ // Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 200, 'ml',  'steamed milk'],
                ['1000012', 8,   'g',   'white sugar'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000005' => [ // Caramel Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 200, 'ml',  'steamed milk'],
                ['1000015', 20,  'ml',  'caramel syrup'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000006' => [ // Vanilla Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 200, 'ml',  'steamed milk'],
                ['1000016', 20,  'ml',  'vanilla syrup'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],

            // ── ICED COFFEE ────────────────────────────────────────

            '2000007' => [ // Iced Americano
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000020', 150, 'ml',  'cold water'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000008' => [ // Iced Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 180, 'ml',  'cold fresh milk'],
                ['1000012', 10,  'g',   'white sugar'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000009' => [ // Iced Caramel Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 180, 'ml',  'cold fresh milk'],
                ['1000015', 25,  'ml',  'caramel syrup'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000010' => [ // Iced Mocha
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000004', 150, 'ml',  'cold fresh milk'],
                ['1000017', 30,  'ml',  'chocolate syrup'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000011' => [ // Iced Spanish Latte
                ['1000001', 8,   'g',   'double shot espresso'],
                ['1000006', 60,  'ml',  'condensed milk'],
                ['1000004', 120, 'ml',  'cold fresh milk'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000012' => [ // Iced Matcha Latte
                ['1000018', 8,   'g',   'matcha powder'],
                ['1000020', 30,  'ml',  'hot water to dissolve matcha'],
                ['1000004', 180, 'ml',  'cold fresh milk'],
                ['1000012', 10,  'g',   'white sugar'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000013' => [ // Iced Coffee Classic
                ['1000003', 15,  'g',   'instant coffee powder'],
                ['1000006', 40,  'ml',  'condensed milk'],
                ['1000019', 180, 'g',   'ice cubes'],
                ['1000020', 60,  'ml',  'water'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],

            // ── HOT TEA ────────────────────────────────────────────

            '2000014' => [ // Hot Black Tea
                ['1000008', 5,   'g',   'black tea leaves'],
                ['1000020', 200, 'ml',  'hot water'],
                ['1000012', 10,  'g',   'white sugar on the side'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000015' => [ // Hot Green Tea
                ['1000009', 4,   'g',   'green tea powder'],
                ['1000020', 200, 'ml',  'hot water'],
                ['1000012', 8,   'g',   'white sugar'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000016' => [ // Hot Chamomile Tea
                ['1000011', 1,   'pcs', 'chamomile tea bag'],
                ['1000020', 200, 'ml',  'hot water'],
                ['1000014', 10,  'ml',  'honey'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000017' => [ // Honey Lemon Tea
                ['1000008', 4,   'g',   'black tea leaves'],
                ['1000020', 200, 'ml',  'hot water'],
                ['1000014', 20,  'ml',  'honey'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],

            // ── ICED TEA ───────────────────────────────────────────

            '2000018' => [ // Iced Black Tea
                ['1000008', 5,   'g',   'black tea leaves'],
                ['1000020', 150, 'ml',  'hot water to steep'],
                ['1000013', 15,  'g',   'brown sugar'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000019' => [ // Iced Matcha
                ['1000018', 8,   'g',   'matcha powder'],
                ['1000020', 50,  'ml',  'hot water to dissolve'],
                ['1000012', 12,  'g',   'white sugar'],
                ['1000019', 180, 'g',   'ice cubes'],
                ['1000020', 80,  'ml',  'cold water'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],
            '2000020' => [ // Thai Iced Tea
                ['1000010', 8,   'g',   'oolong tea leaves'],
                ['1000020', 150, 'ml',  'hot water to steep'],
                ['1000006', 60,  'ml',  'condensed milk'],
                ['1000013', 15,  'g',   'brown sugar'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],

            // ── CHOCOLATE ──────────────────────────────────────────

            '2000021' => [ // Hot Chocolate
                ['1000017', 40,  'ml',  'chocolate syrup'],
                ['1000004', 180, 'ml',  'hot fresh milk'],
                ['1000012', 8,   'g',   'white sugar'],
                ['1000031', 1,   'pcs', '12oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
            ],
            '2000022' => [ // Iced Chocolate
                ['1000017', 40,  'ml',  'chocolate syrup'],
                ['1000004', 150, 'ml',  'cold fresh milk'],
                ['1000012', 8,   'g',   'white sugar'],
                ['1000019', 150, 'g',   'ice cubes'],
                ['1000032', 1,   'pcs', '16oz cup'],
                ['1000033', 1,   'pcs', 'cup lid'],
                ['1000034', 1,   'pcs', 'straw'],
            ],

            // ── FOOD ───────────────────────────────────────────────

            '2000023' => [ // Pancit Canton
                ['1000021', 1,   'pcs', 'one pack canton noodles'],
                ['1000024', 15,  'ml',  'vegetable oil'],
                ['1000025', 10,  'ml',  'soy sauce'],
                ['1000026', 30,  'g',   'cabbage shredded'],
                ['1000027', 20,  'g',   'carrots julienned'],
                ['1000035', 1,   'pcs', 'styro bowl'],
            ],
            '2000024' => [ // Pancit Canton with Egg
                ['1000021', 1,   'pcs', 'one pack canton noodles'],
                ['1000022', 1,   'pcs', 'egg'],
                ['1000024', 15,  'ml',  'vegetable oil'],
                ['1000025', 10,  'ml',  'soy sauce'],
                ['1000026', 30,  'g',   'cabbage'],
                ['1000027', 20,  'g',   'carrots'],
                ['1000035', 1,   'pcs', 'styro bowl'],
            ],
            '2000025' => [ // Pancit Canton with Hotdog
                ['1000021', 1,   'pcs', 'one pack canton noodles'],
                ['1000023', 1,   'pcs', 'hotdog sliced'],
                ['1000024', 15,  'ml',  'vegetable oil'],
                ['1000025', 10,  'ml',  'soy sauce'],
                ['1000026', 30,  'g',   'cabbage'],
                ['1000027', 20,  'g',   'carrots'],
                ['1000035', 1,   'pcs', 'styro bowl'],
            ],
            '2000026' => [ // Fried Egg
                ['1000022', 1,   'pcs', 'egg'],
                ['1000024', 10,  'ml',  'vegetable oil'],
                ['1000035', 1,   'pcs', 'styro bowl'],
            ],
            '2000027' => [ // Boiled Egg
                ['1000022', 1,   'pcs', 'egg'],
                ['1000020', 300, 'ml',  'water for boiling'],
            ],
        ];

        $lineCount = 0;

        foreach ($recipes as $productBarcode => $lines) {
            $product = Product::where('barcode', $productBarcode)->first();

            if (!$product) {
                $this->command->warn("  Product barcode {$productBarcode} not found, skipping.");
                continue;
            }

            foreach ($lines as [$ingredientBarcode, $quantity, $unit, $notes]) {
                $ingredient = Product::where('barcode', $ingredientBarcode)->first();

                if (!$ingredient) {
                    $this->command->warn("  Ingredient barcode {$ingredientBarcode} not found, skipping.");
                    continue;
                }

                RecipeIngredient::updateOrCreate(
                    ['product_id' => $product->id, 'ingredient_id' => $ingredient->id],
                    ['quantity' => $quantity, 'unit' => $unit, 'notes' => $notes]
                );

                $lineCount++;
            }
        }

        $this->command->info('✓ Cafe recipes seeded (' . count($recipes) . ' products, ' . $lineCount . ' ingredient lines)');
    }
}
