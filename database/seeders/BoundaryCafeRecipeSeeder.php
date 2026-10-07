<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\RecipeIngredient;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Raw ingredients and starter recipes for the made-to-order menu.
 *
 * Ingredients are product_type "ingredient": they are stocked and bought per
 * branch but never shown on the POS, waiter or online menus. Selling a
 * made-to-order item deducts its recipe from the branch's ingredient stock.
 * Amounts are estimates — adjust them under Products → Recipes / BOM.
 */
class BoundaryCafeRecipeSeeder extends Seeder
{
    /**
     * name => [stock unit, cost per unit (₱), opening stock per branch]
     *
     * @var array<string, array{0: string, 1: float, 2: int}>
     */
    private const INGREDIENTS = [
        // Coffee bar
        'Espresso Beans' => ['g', 1.20, 10000],
        'Fresh Milk' => ['ml', 0.09, 60000],
        'Ice' => ['g', 0.01, 100000],
        'Sugar Syrup' => ['ml', 0.06, 10000],
        'Muscovado Sugar' => ['g', 0.15, 5000],
        'Caramel Sauce' => ['ml', 0.35, 5000],
        'French Vanilla Syrup' => ['ml', 0.40, 5000],
        'Salted Caramel Syrup' => ['ml', 0.40, 5000],
        'White Chocolate Sauce' => ['ml', 0.45, 5000],
        'Dark Chocolate Sauce' => ['ml', 0.45, 6000],
        'Condensed Milk' => ['ml', 0.20, 5000],
        'Matcha Powder' => ['g', 3.00, 2000],
        'Cream Foam' => ['ml', 0.30, 6000],
        'Whipped Cream' => ['g', 0.40, 5000],
        'Frappe Base Powder' => ['g', 0.50, 8000],
        'Strawberry Puree' => ['ml', 0.35, 6000],
        'Blueberry Puree' => ['ml', 0.40, 4000],
        'Mango Puree' => ['ml', 0.30, 4000],
        'Calamansi Juice' => ['ml', 0.20, 5000],
        'Soda Water' => ['ml', 0.05, 15000],
        'Cookie Crumbs' => ['g', 0.40, 3000],
        'Taro Powder' => ['g', 0.60, 3000],
        'Avocado' => ['g', 0.25, 5000],
        'Iced Tea Powder' => ['g', 0.25, 4000],
        'Cup 16oz with Lid' => ['pcs', 6.00, 1500],

        // Kitchen
        'Rice' => ['g', 0.06, 40000],
        'Egg' => ['pcs', 9.00, 600],
        'Hotdog' => ['pcs', 12.00, 300],
        'Tocino' => ['g', 0.35, 6000],
        'Chicken Piece' => ['pcs', 45.00, 300],
        'Chicken Fillet' => ['pcs', 30.00, 200],
        'Hungarian Sausage' => ['pcs', 35.00, 200],
        'Bacon' => ['g', 0.60, 6000],
        'Burger Patty' => ['pcs', 28.00, 400],
        'Burger Bun' => ['pcs', 8.00, 400],
        'Cheese Slice' => ['pcs', 5.00, 600],
        'Lettuce & Tomato' => ['g', 0.15, 6000],
        'French Fries' => ['g', 0.18, 30000],
        'Tortilla Chips' => ['g', 0.30, 8000],
        'Cheese Sauce' => ['ml', 0.30, 8000],
        'Ground Pork' => ['g', 0.35, 15000],
        'Lumpia Wrapper' => ['pcs', 1.50, 1500],
        'Miki Noodles' => ['g', 0.15, 6000],
        'Pork Broth' => ['ml', 0.05, 20000],
        'Bihon Noodles' => ['g', 0.12, 6000],
        'Mixed Vegetables' => ['g', 0.12, 6000],
        'Cooking Oil' => ['ml', 0.10, 20000],
        'Meal Box' => ['pcs', 6.00, 1000],
        'Party Tray' => ['pcs', 15.00, 200],
    ];

    private const LATTE = ['Espresso Beans' => 18, 'Fresh Milk' => 200, 'Ice' => 150, 'Cup 16oz with Lid' => 1];

    private const FRAPPE = ['Frappe Base Powder' => 30, 'Fresh Milk' => 150, 'Ice' => 220, 'Whipped Cream' => 20, 'Cup 16oz with Lid' => 1];

    private const ICED = ['Ice' => 150, 'Cup 16oz with Lid' => 1];

    private const BURGER = ['Burger Bun' => 1, 'Burger Patty' => 1, 'Cheese Slice' => 1, 'Lettuce & Tomato' => 30];

    private const FRIES = ['French Fries' => 150, 'Cooking Oil' => 30];

    private const NACHOS = ['Tortilla Chips' => 120, 'Cheese Sauce' => 60, 'Ground Pork' => 50, 'Lettuce & Tomato' => 30];

    /**
     * Recipe per made-to-order product: ingredient => quantity per serving.
     *
     * @return array<string, array<string, float|int>>
     */
    private function recipes(): array
    {
        $meal = fn (array $extra) => ['Rice' => 150, 'Meal Box' => 1] + $extra;

        return [
            // Signature Blends
            'Strawberry Cloud' => ['Strawberry Puree' => 40, 'Fresh Milk' => 180, 'Cream Foam' => 40] + self::ICED,
            'Muscovado Caramel Espresso Frappe' => ['Espresso Beans' => 18, 'Muscovado Sugar' => 20, 'Caramel Sauce' => 20] + self::FRAPPE,
            'Muscovado Cream Latte' => ['Muscovado Sugar' => 20, 'Cream Foam' => 40] + self::LATTE,
            'Dark Chocolate Cloud' => ['Dark Chocolate Sauce' => 30, 'Fresh Milk' => 180, 'Cream Foam' => 40] + self::ICED,

            // Coffee
            'French Vanilla Latte' => ['French Vanilla Syrup' => 25] + self::LATTE,
            'Americano' => ['Espresso Beans' => 18] + self::ICED,
            'Caramel Latte' => ['Caramel Sauce' => 25] + self::LATTE,
            'Salted Caramel Latte' => ['Salted Caramel Syrup' => 25] + self::LATTE,
            'White Chocolate' => ['White Chocolate Sauce' => 30] + self::LATTE,
            'Spanish Latte' => ['Condensed Milk' => 30] + self::LATTE,
            'Matcha Espresso Fusion' => ['Matcha Powder' => 5, 'Sugar Syrup' => 15] + self::LATTE,
            'Mocha Latte' => ['Dark Chocolate Sauce' => 20] + self::LATTE,

            // Non-Coffee
            'Strawberry Sparkle' => ['Strawberry Puree' => 40, 'Soda Water' => 250] + self::ICED,
            'Blueberry Sparkle' => ['Blueberry Puree' => 40, 'Soda Water' => 250] + self::ICED,
            'Fresh Calamansi' => ['Calamansi Juice' => 60, 'Sugar Syrup' => 30, 'Ice' => 200, 'Cup 16oz with Lid' => 1],
            'Dark Chocolate' => ['Dark Chocolate Sauce' => 35, 'Fresh Milk' => 220] + self::ICED,
            'Strawberry Latte' => ['Strawberry Puree' => 40, 'Fresh Milk' => 220] + self::ICED,
            'Matcha Latte' => ['Matcha Powder' => 6, 'Fresh Milk' => 220, 'Sugar Syrup' => 20] + self::ICED,

            // Frappes
            "Cookies n' Cream" => ['Cookie Crumbs' => 30] + self::FRAPPE,
            'Taro' => ['Taro Powder' => 30] + self::FRAPPE,
            'Strawberry' => ['Strawberry Puree' => 45] + self::FRAPPE,
            'Avocado' => ['Avocado' => 80] + self::FRAPPE,
            'Mango' => ['Mango Puree' => 50] + self::FRAPPE,
            'Dark Chocolate Frappe' => ['Dark Chocolate Sauce' => 30] + self::FRAPPE,
            'Japanese Matcha' => ['Matcha Powder' => 8] + self::FRAPPE,

            // Sulit Meals
            'Fiesta Meal A' => $meal(['Chicken Piece' => 1, 'Lumpia Wrapper' => 2, 'Ground Pork' => 40, 'Cooking Oil' => 30]),
            'Fiesta Meal B' => $meal(['Hungarian Sausage' => 1, 'French Fries' => 80, 'Cooking Oil' => 20]),
            'Tocino Meal' => $meal(['Tocino' => 100, 'Egg' => 1]),
            'Chicken Meal' => $meal(['Chicken Piece' => 1, 'Cooking Oil' => 30]),
            'Hungarian Sausage Meal' => $meal(['Hungarian Sausage' => 1, 'Egg' => 1]),
            'Bacon Meal' => $meal(['Bacon' => 80, 'Egg' => 1]),

            // Burgers
            'Boundary Burger' => self::BURGER,
            'Chicken Burger' => ['Burger Bun' => 1, 'Chicken Fillet' => 1, 'Lettuce & Tomato' => 30, 'Cooking Oil' => 20],
            'Ultimate Burger' => ['Burger Bun' => 1, 'Burger Patty' => 2, 'Cheese Slice' => 2, 'Bacon' => 30, 'Egg' => 1, 'Lettuce & Tomato' => 30],

            // Snacks and Sides
            'Nachos' => self::NACHOS,
            'Lumpia Shanghai' => ['Lumpia Wrapper' => 6, 'Ground Pork' => 120, 'Cooking Oil' => 30],
            'Cheesy Fries' => ['French Fries' => 180, 'Cheese Sauce' => 50, 'Cooking Oil' => 30],
            'Batchoy' => ['Miki Noodles' => 150, 'Pork Broth' => 400, 'Ground Pork' => 40, 'Egg' => 1],

            // Combos
            'Nachos & Fries Combo' => self::NACHOS + self::FRIES,
            'Burger & Fries Combo' => self::BURGER + self::FRIES,

            // Shareable Plates
            'Pancit Bihon' => ['Bihon Noodles' => 500, 'Mixed Vegetables' => 200, 'Ground Pork' => 150, 'Cooking Oil' => 40, 'Party Tray' => 1],
            'Lumpia Shanghai Bundle' => ['Lumpia Wrapper' => 20, 'Ground Pork' => 400, 'Cooking Oil' => 80, 'Party Tray' => 1],
            'Fried Chicken Bundle' => ['Chicken Piece' => 6, 'Cooking Oil' => 150, 'Party Tray' => 1],
            'Boundary Favorites Snack Bundle' => [
                'French Fries' => 300, 'Lumpia Wrapper' => 10, 'Ground Pork' => 200, 'Tortilla Chips' => 150,
                'Cheese Sauce' => 100, 'Cooking Oil' => 100, 'Party Tray' => 1,
            ],
            'Barkada Fries' => ['French Fries' => 600, 'Cheese Sauce' => 100, 'Cooking Oil' => 80, 'Party Tray' => 1],
            'Barkada Nachos' => ['Tortilla Chips' => 400, 'Cheese Sauce' => 200, 'Ground Pork' => 150, 'Lettuce & Tomato' => 80, 'Party Tray' => 1],
            'Barkada Burgers' => ['Burger Bun' => 4, 'Burger Patty' => 4, 'Cheese Slice' => 4, 'Lettuce & Tomato' => 120, 'Party Tray' => 1],

            // Add-ons
            'Rice' => ['Rice' => 150],
            'Pitcher Juice' => ['Iced Tea Powder' => 80, 'Ice' => 400],
            'Bacon Bits' => ['Bacon' => 60],
            'Egg' => ['Egg' => 1, 'Cooking Oil' => 10],
            'Hotdog' => ['Hotdog' => 1, 'Cooking Oil' => 10],
            'Extra Espresso Shot' => ['Espresso Beans' => 18],
            'Whipped Cream' => ['Whipped Cream' => 25],
            'Flavor Syrup' => ['French Vanilla Syrup' => 20],
        ];
    }

    public function run(): void
    {
        $category = Category::firstOrCreate(['name' => 'Raw Materials']);
        $branches = Branch::whereIn('code', ['BC-TAG', 'BC-MAB', 'BC-MAIN'])->get();

        $ingredients = [];
        $number = 0;
        foreach (self::INGREDIENTS as $name => [$unit, $cost, $openingStock]) {
            $ingredient = Product::updateOrCreate(['barcode' => 'ING'.str_pad((string) ++$number, 3, '0', STR_PAD_LEFT)], [
                'name' => $name, 'category_id' => $category->id, 'description' => 'Raw ingredient — deducted through recipes, never sold directly.',
                'product_type' => 'ingredient', 'unit' => $unit, 'status' => 'active', 'is_taxable' => false,
            ]);
            foreach ($branches as $branch) {
                ProductStock::updateOrCreate(['product_id' => $ingredient->id, 'branch_id' => $branch->id], [
                    'stock' => $openingStock, 'capital' => $cost, 'markup' => 0,
                ]);
            }
            $ingredients[$name] = $ingredient;
        }

        $madeToOrder = Product::where('product_type', 'made_to_order')->where('barcode', 'like', 'BC%')->get()->keyBy('name');
        foreach ($this->recipes() as $productName => $lines) {
            $product = $madeToOrder[$productName] ?? throw new RuntimeException("Recipe for unknown made-to-order product \"{$productName}\".");

            RecipeIngredient::where('product_id', $product->id)->delete();
            foreach ($lines as $ingredientName => $quantity) {
                $ingredient = $ingredients[$ingredientName] ?? throw new RuntimeException("Unknown ingredient \"{$ingredientName}\" in {$productName}.");
                RecipeIngredient::create([
                    'product_id' => $product->id,
                    'ingredient_id' => $ingredient->id,
                    'quantity' => $quantity,
                    'unit' => self::INGREDIENTS[$ingredientName][0],
                ]);
            }
        }

        $missing = $madeToOrder->keys()->diff(array_keys($this->recipes()));
        if ($missing->isNotEmpty()) {
            throw new RuntimeException('Made-to-order products without a recipe: '.$missing->implode(', '));
        }

        $this->command?->info(count(self::INGREDIENTS).' ingredients and '.count($this->recipes()).' recipes seeded.');
    }
}
