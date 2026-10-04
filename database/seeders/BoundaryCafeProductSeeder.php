<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use Illuminate\Database\Seeder;

class BoundaryCafeProductSeeder extends Seeder
{
    /** Estimated launch prices. Update this one list after owner approval. */
    private array $menu = [
        ['Signature Blends', 'Strawberry Cloud', 145], ['Signature Blends', 'Muscovado Caramel Espresso Frappe', 165], ['Signature Blends', 'Muscovado Cream Latte', 145], ['Signature Blends', 'Dark Chocolate Cloud', 145],
        ['Coffee', 'French Vanilla Latte', 135], ['Coffee', 'Americano', 95], ['Coffee', 'Caramel Latte', 135], ['Coffee', 'Salted Caramel Latte', 145], ['Coffee', 'White Chocolate', 145], ['Coffee', 'Spanish Latte', 145], ['Coffee', 'Matcha Espresso Fusion', 155], ['Coffee', 'Mocha Latte', 145],
        ['Non-Coffee', 'Strawberry Sparkle', 115], ['Non-Coffee', 'Blueberry Sparkle', 115], ['Non-Coffee', 'Fresh Calamansi', 95], ['Non-Coffee', 'Dark Chocolate', 125], ['Non-Coffee', 'Strawberry Latte', 135], ['Non-Coffee', 'Matcha Latte', 145],
        ['Frappes', "Cookies n' Cream", 145], ['Frappes', 'Taro', 135], ['Frappes', 'Strawberry', 135], ['Frappes', 'Avocado', 145], ['Frappes', 'Mango', 135], ['Frappes', 'Dark Chocolate Frappe', 145], ['Frappes', 'Japanese Matcha', 155],
        ['Sulit Meals', 'Fiesta Meal A', 195], ['Sulit Meals', 'Fiesta Meal B', 195], ['Sulit Meals', 'Tocino Meal', 135], ['Sulit Meals', 'Chicken Meal', 145], ['Sulit Meals', 'Hungarian Sausage Meal', 145], ['Sulit Meals', 'Bacon Meal', 145],
        ['Burgers', 'Boundary Burger', 125], ['Burgers', 'Chicken Burger', 135], ['Burgers', 'Ultimate Burger', 165],
        ['Snacks and Sides', 'Nachos', 125], ['Snacks and Sides', 'Lumpia Shanghai', 95], ['Snacks and Sides', 'Cheesy Fries', 115], ['Snacks and Sides', 'Batchoy', 135],
        ['Desserts', 'Cheesecake', 125], ['Desserts', 'Mango Graham Cake', 115], ['Desserts', 'Tiramisu Classic', 135],
        ['Combos', 'Nachos & Fries Combo', 195], ['Combos', 'Burger & Fries Combo', 195],
        ['Shareable Plates', 'Pancit Bihon', 295], ['Shareable Plates', 'Lumpia Shanghai Bundle', 245], ['Shareable Plates', 'Fried Chicken Bundle', 395], ['Shareable Plates', 'Boundary Favorites Snack Bundle', 445], ['Shareable Plates', 'Barkada Fries', 295], ['Shareable Plates', 'Barkada Nachos', 295], ['Shareable Plates', 'Barkada Burgers', 495],
        ['Add-ons', 'Rice', 30], ['Add-ons', 'Pitcher Juice', 80], ['Add-ons', 'Bacon Bits', 100], ['Add-ons', 'Egg', 25], ['Add-ons', 'Hotdog', 35], ['Add-ons', 'Extra Espresso Shot', 40], ['Add-ons', 'Whipped Cream', 25], ['Add-ons', 'Flavor Syrup', 25],
    ];

    public function run(): void
    {
        $categories = Category::pluck('id', 'name');
        $branches = Branch::whereIn('code', ['BC-TAG', 'BC-MAB', 'BC-MAIN'])->get();
        foreach ($this->menu as $index => [$category, $name, $price]) {
            $product = Product::updateOrCreate(['barcode' => 'BC'.str_pad((string) ($index + 1), 5, '0', STR_PAD_LEFT)], [
                'name' => $name, 'category_id' => $categories[$category], 'description' => "Boundary Cafe {$category} item. Seed price is an editable estimate.",
                'product_img' => $this->productImage($category, $name), 'product_type' => 'standard', 'unit' => 'serving', 'status' => 'active', 'is_taxable' => true,
            ]);
            foreach ($branches as $branch) {
                $capital = round($price * .45, 2);
                ProductStock::updateOrCreate(['product_id' => $product->id, 'branch_id' => $branch->id], ['stock' => 100, 'capital' => $capital, 'markup' => round((($price / $capital) - 1) * 100, 2)]);
            }
        }
        $this->command->info('Boundary Cafe menu seeded ('.count($this->menu).' items across 3 branches).');
    }

    private function productImage(string $category, string $name): string
    {
        if ($category === 'Coffee') {
            return str_contains($name, 'Americano')
                ? '/images/products/boundary/coffee-hot.svg'
                : '/images/products/boundary/coffee-iced.svg';
        }

        return '/images/products/boundary/'.match ($category) {
            'Signature Blends' => 'signature-blend.svg',
            'Non-Coffee' => 'non-coffee.svg',
            'Frappes' => 'frappe.svg',
            'Sulit Meals' => 'sulit-meal.svg',
            'Burgers' => 'burger.svg',
            'Snacks and Sides' => 'snacks.svg',
            'Shareable Plates' => 'shareable-plate.svg',
            'Combos' => 'combo.svg',
            'Desserts' => 'dessert.svg',
            'Add-ons' => 'addon.svg',
            default => 'default-menu-item.svg',
        };
    }
}
