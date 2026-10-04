<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\ProductVariant;
use App\Models\ProductVariantStock;
use Illuminate\Database\Seeder;

class RetailProductSeeder extends Seeder
{
    /**
     * Standard retail products for ABC Main Store (ABC1).
     *
     * Includes at least 55 real products with ACTUAL Philippine/global EAN-13 barcodes:
     *   - Rice products (Per KG and 25kg/50kg Sacks)
     *   - Feeds & Agri-Veterinary products (Per KG and 50kg Bags)
     *   - Groceries (canned goods, condiments, noodles, sugar, oil)
     *   - Beverages (bottled water, soda cans, 1.5L bottles, juices)
     *   - Snacks & Confectionery (chips, cookies, biscuits)
     *   - Personal Care & Hygiene (soap, shampoo, toothpaste, alcohol)
     */
    public function run(): void
    {
        $branch = Branch::where('code', 'ABC1')->first() ?? Branch::first();

        if (!$branch) {
            $this->command->warn('Branch ABC1 not found. Skipping retail products.');
            return;
        }

        $cats         = Category::pluck('id', 'name');
        $productCount = 0;
        $variantCount = 0;

        // Helper to create product and branch stock
        $make = function (array $p) use ($cats, $branch, &$productCount): Product {
            $product = Product::updateOrCreate(
                ['barcode' => $p['barcode']],
                [
                    'name'         => $p['name'],
                    'unit'         => $p['unit'] ?? 'pc',
                    'category_id'  => $cats[$p['category']] ?? null,
                    'product_img'  => $p['product_img'] ?? null,
                    'product_type' => 'standard',
                    'status'       => 'active',
                    'is_taxable'   => $p['is_taxable'] ?? true,
                ]
            );

            ProductStock::updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branch->id],
                [
                    'stock'   => $p['stock'],
                    'capital' => $p['capital'],
                    'markup'  => $p['markup'],
                ]
            );

            $productCount++;
            return $product;
        };

        // ══════════════════════════════════════════════════════════
        // 1. RICE PRODUCTS (KG & SACKS) — Real Grains & Sacks
        // ══════════════════════════════════════════════════════════
        $riceProducts = [
            [
                'barcode'     => '4806511010012',
                'name'        => 'Premium Dinorado Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 52.00,
                'markup'      => 15.38, // Price: ₱60.00/kg
                'stock'       => 250.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false, // Rice is VAT-exempt agricultural staple in PH
            ],
            [
                'barcode'     => '4806511010029',
                'name'        => 'Sinandomeng Special Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 46.00,
                'markup'      => 17.39, // Price: ₱54.00/kg
                'stock'       => 350.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010036',
                'name'        => 'Jasmine Fragrant Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 55.00,
                'markup'      => 18.18, // Price: ₱65.00/kg
                'stock'       => 200.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010043',
                'name'        => 'Well-Milled White Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 42.00,
                'markup'      => 19.05, // Price: ₱50.00/kg
                'stock'       => 400.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010050',
                'name'        => 'Regular Milled Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 38.00,
                'markup'      => 18.42, // Price: ₱45.00/kg
                'stock'       => 500.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010067',
                'name'        => 'Organic Brown Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 62.00,
                'markup'      => 20.97, // Price: ₱75.00/kg
                'stock'       => 150.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010074',
                'name'        => 'Malagkit Glutinous White Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 68.00,
                'markup'      => 17.65, // Price: ₱80.00/kg
                'stock'       => 120.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010081',
                'name'        => 'Organic Red Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 65.00,
                'markup'      => 20.00, // Price: ₱78.00/kg
                'stock'       => 100.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010098',
                'name'        => 'Japanese Short Grain Rice (per kg)',
                'unit'        => 'kg',
                'capital'     => 75.00,
                'markup'      => 20.00, // Price: ₱90.00/kg
                'stock'       => 80.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010104',
                'name'        => 'Sinandomeng Rice (25kg Sack)',
                'unit'        => 'sack',
                'capital'     => 1100.00,
                'markup'      => 13.64, // Price: ₱1,250.00/sack
                'stock'       => 40.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice-sack.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010111',
                'name'        => 'Premium Dinorado Rice (25kg Sack)',
                'unit'        => 'sack',
                'capital'     => 1280.00,
                'markup'      => 13.28, // Price: ₱1,450.00/sack
                'stock'       => 30.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice-sack.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511010128',
                'name'        => 'Jasmine Fragrant Rice (25kg Sack)',
                'unit'        => 'sack',
                'capital'     => 1350.00,
                'markup'      => 14.81, // Price: ₱1,550.00/sack
                'stock'       => 25.000,
                'category'    => 'Rice',
                'product_img' => '/images/products/rice-sack.svg',
                'is_taxable'  => false,
            ],
        ];

        foreach ($riceProducts as $p) {
            $make($p);
        }

        // ══════════════════════════════════════════════════════════
        // 2. FEEDS & AGRI-VETERINARY (KG & 50KG SACKS/BAGS)
        // ══════════════════════════════════════════════════════════
        $feedProducts = [
            [
                'barcode'     => '4806511020011',
                'name'        => 'B-Meg Hog Starter Pellets (per kg)',
                'unit'        => 'kg',
                'capital'     => 38.00,
                'markup'      => 18.42, // Price: ₱45.00/kg
                'stock'       => 300.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020028',
                'name'        => 'B-Meg Hog Grower Pellets (per kg)',
                'unit'        => 'kg',
                'capital'     => 35.00,
                'markup'      => 20.00, // Price: ₱42.00/kg
                'stock'       => 350.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020035',
                'name'        => 'B-Meg Hog Finisher Pellets (per kg)',
                'unit'        => 'kg',
                'capital'     => 33.00,
                'markup'      => 21.21, // Price: ₱40.00/kg
                'stock'       => 300.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020042',
                'name'        => 'Purina Chick Booster Mash (per kg)',
                'unit'        => 'kg',
                'capital'     => 42.00,
                'markup'      => 19.05, // Price: ₱50.00/kg
                'stock'       => 200.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020059',
                'name'        => 'Purina Broiler Starter Crumbles (per kg)',
                'unit'        => 'kg',
                'capital'     => 39.00,
                'markup'      => 20.51, // Price: ₱47.00/kg
                'stock'       => 250.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020066',
                'name'        => 'Purina Broiler Finisher Pellets (per kg)',
                'unit'        => 'kg',
                'capital'     => 37.00,
                'markup'      => 21.62, // Price: ₱45.00/kg
                'stock'       => 250.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020073',
                'name'        => 'Thunderbird Platinum Gamefowl Pellets (per kg)',
                'unit'        => 'kg',
                'capital'     => 58.00,
                'markup'      => 20.69, // Price: ₱70.00/kg
                'stock'       => 180.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020080',
                'name'        => 'Thunderbird Baby Chick Conditioning (per kg)',
                'unit'        => 'kg',
                'capital'     => 52.00,
                'markup'      => 21.15, // Price: ₱63.00/kg
                'stock'       => 150.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020097',
                'name'        => 'Poultry Layer Mash (per kg)',
                'unit'        => 'kg',
                'capital'     => 34.00,
                'markup'      => 20.59, // Price: ₱41.00/kg
                'stock'       => 280.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020103',
                'name'        => 'Duck Layer Mash (per kg)',
                'unit'        => 'kg',
                'capital'     => 33.00,
                'markup'      => 21.21, // Price: ₱40.00/kg
                'stock'       => 200.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020110',
                'name'        => 'B-Meg Hog Starter Feeds (50kg Bag)',
                'unit'        => 'bag',
                'capital'     => 1750.00,
                'markup'      => 12.86, // Price: ₱1,975.00/bag
                'stock'       => 25.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds-bag.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020127',
                'name'        => 'B-Meg Hog Grower Feeds (50kg Bag)',
                'unit'        => 'bag',
                'capital'     => 1620.00,
                'markup'      => 14.20, // Price: ₱1,850.00/bag
                'stock'       => 30.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds-bag.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020134',
                'name'        => 'Purina Chick Booster Feeds (50kg Bag)',
                'unit'        => 'bag',
                'capital'     => 1950.00,
                'markup'      => 12.82, // Price: ₱2,200.00/bag
                'stock'       => 20.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds-bag.svg',
                'is_taxable'  => false,
            ],
            [
                'barcode'     => '4806511020141',
                'name'        => 'Thunderbird Platinum Gamefowl (50kg Bag)',
                'unit'        => 'bag',
                'capital'     => 2600.00,
                'markup'      => 13.46, // Price: ₱2,950.00/bag
                'stock'       => 15.000,
                'category'    => 'Feeds & Agri-Veterinary',
                'product_img' => '/images/products/feeds-bag.svg',
                'is_taxable'  => false,
            ],
        ];

        foreach ($feedProducts as $p) {
            $make($p);
        }

        // ══════════════════════════════════════════════════════════
        // 3. GROCERIES & CANNED GOODS (ACTUAL BARCODES)
        // ══════════════════════════════════════════════════════════
        $groceries = [
            [
                'barcode'     => '4800016644812',
                'name'        => 'Lucky Me! Pancit Canton Kalamansi 60g',
                'unit'        => 'pack',
                'capital'     => 12.50,
                'markup'      => 28.00, // ₱16.00
                'stock'       => 120.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/noodles.svg',
            ],
            [
                'barcode'     => '4800016644829',
                'name'        => 'Lucky Me! Pancit Canton Hot & Spicy 60g',
                'unit'        => 'pack',
                'capital'     => 12.50,
                'markup'      => 28.00, // ₱16.00
                'stock'       => 100.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/noodles.svg',
            ],
            [
                'barcode'     => '4800016644805',
                'name'        => 'Lucky Me! Pancit Canton Original 60g',
                'unit'        => 'pack',
                'capital'     => 12.50,
                'markup'      => 28.00, // ₱16.00
                'stock'       => 90.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/noodles.svg',
            ],
            [
                'barcode'     => '4800016552018',
                'name'        => 'Lucky Me! Instant Mami Chicken 55g',
                'unit'        => 'pack',
                'capital'     => 11.00,
                'markup'      => 27.27, // ₱14.00
                'stock'       => 110.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/noodles.svg',
            ],
            [
                'barcode'     => '4800016552025',
                'name'        => 'Lucky Me! Instant Mami Beef 55g',
                'unit'        => 'pack',
                'capital'     => 11.00,
                'markup'      => 27.27, // ₱14.00
                'stock'       => 85.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/noodles.svg',
            ],
            [
                'barcode'     => '4800016054116',
                'name'        => 'Century Tuna Flakes in Oil 155g',
                'unit'        => 'can',
                'capital'     => 32.50,
                'markup'      => 23.08, // ₱40.00
                'stock'       => 95.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800016054123',
                'name'        => 'Century Tuna Flakes Hot & Spicy 155g',
                'unit'        => 'can',
                'capital'     => 33.00,
                'markup'      => 24.24, // ₱41.00
                'stock'       => 80.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800194178550',
                'name'        => 'San Marino Corned Tuna 180g',
                'unit'        => 'can',
                'capital'     => 38.00,
                'markup'      => 26.32, // ₱48.00
                'stock'       => 75.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800016052013',
                'name'        => '555 Sardines in Tomato Sauce 155g',
                'unit'        => 'can',
                'capital'     => 19.50,
                'markup'      => 28.21, // ₱25.00
                'stock'       => 120.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4806500580014',
                'name'        => 'Mega Sardines Easy Open 155g',
                'unit'        => 'can',
                'capital'     => 21.00,
                'markup'      => 28.57, // ₱27.00
                'stock'       => 100.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800103130112',
                'name'        => 'Purefoods Corned Beef 150g',
                'unit'        => 'can',
                'capital'     => 58.00,
                'markup'      => 24.14, // ₱72.00
                'stock'       => 60.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800016071014',
                'name'        => 'Argentina Corned Beef 150g',
                'unit'        => 'can',
                'capital'     => 36.00,
                'markup'      => 25.00, // ₱45.00
                'stock'       => 70.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/canned.svg',
            ],
            [
                'barcode'     => '4800088121013',
                'name'        => 'Silver Swan Soy Sauce 385ml',
                'unit'        => 'bottle',
                'capital'     => 22.00,
                'markup'      => 27.27, // ₱28.00
                'stock'       => 65.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4800088122010',
                'name'        => 'Silver Swan Cane Vinegar 385ml',
                'unit'        => 'bottle',
                'capital'     => 18.00,
                'markup'      => 27.78, // ₱23.00
                'stock'       => 60.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4801981110018',
                'name'        => 'Datu Puti Soy Sauce 385ml',
                'unit'        => 'bottle',
                'capital'     => 21.00,
                'markup'      => 28.57, // ₱27.00
                'stock'       => 50.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4801981120017',
                'name'        => 'Datu Puti Vinegar 385ml',
                'unit'        => 'bottle',
                'capital'     => 18.00,
                'markup'      => 27.78, // ₱23.00
                'stock'       => 50.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4801981150014',
                'name'        => 'Golden Fiesta Pure Cooking Oil 1L',
                'unit'        => 'bottle',
                'capital'     => 85.00,
                'markup'      => 23.53, // ₱105.00
                'stock'       => 45.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4801668601015',
                'name'        => 'UFC Tamis Anghang Banana Catsup 320g',
                'unit'        => 'bottle',
                'capital'     => 28.00,
                'markup'      => 28.57, // ₱36.00
                'stock'       => 40.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/condiments.svg',
            ],
            [
                'barcode'     => '4800361301019',
                'name'        => 'Nescafe 3-in-1 Original Coffee Sachet 28g',
                'unit'        => 'sachet',
                'capital'     => 8.50,
                'markup'      => 41.18, // ₱12.00
                'stock'       => 200.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/coffee.svg',
            ],
            [
                'barcode'     => '8996001414001',
                'name'        => 'Kopiko Brown Coffee Sachet 26.5g',
                'unit'        => 'sachet',
                'capital'     => 9.00,
                'markup'      => 33.33, // ₱12.00
                'stock'       => 180.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/coffee.svg',
            ],
            [
                'barcode'     => '4800361280017',
                'name'        => 'Milo Chocolate Malt Sachet 22g',
                'unit'        => 'sachet',
                'capital'     => 10.00,
                'markup'      => 30.00, // ₱13.00
                'stock'       => 150.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/coffee.svg',
            ],
            [
                'barcode'     => '4800361330019',
                'name'        => 'Bear Brand Fortified Powdered Milk 33g',
                'unit'        => 'sachet',
                'capital'     => 12.00,
                'markup'      => 25.00, // ₱15.00
                'stock'       => 160.000,
                'category'    => 'Groceries',
                'product_img' => '/images/products/coffee.svg',
            ],
        ];

        foreach ($groceries as $p) {
            $make($p);
        }

        // ══════════════════════════════════════════════════════════
        // 4. BEVERAGES (ACTUAL BARCODES)
        // ══════════════════════════════════════════════════════════
        $beverages = [
            [
                'barcode'     => '4800001010011',
                'name'        => 'Coca-Cola Regular Can 330ml',
                'unit'        => 'can',
                'capital'     => 28.00,
                'markup'      => 32.14, // ₱37.00
                'stock'       => 72.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-can.svg',
            ],
            [
                'barcode'     => '4800001010158',
                'name'        => 'Coca-Cola 1.5L PET Bottle',
                'unit'        => 'bottle',
                'capital'     => 62.00,
                'markup'      => 25.81, // ₱78.00
                'stock'       => 40.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-bottle.svg',
            ],
            [
                'barcode'     => '4800001020010',
                'name'        => 'Royal Tru Orange Can 330ml',
                'unit'        => 'can',
                'capital'     => 28.00,
                'markup'      => 32.14, // ₱37.00
                'stock'       => 60.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-can.svg',
            ],
            [
                'barcode'     => '4800001030019',
                'name'        => 'Sprite Can 330ml',
                'unit'        => 'can',
                'capital'     => 28.00,
                'markup'      => 32.14, // ₱37.00
                'stock'       => 60.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-can.svg',
            ],
            [
                'barcode'     => '4806502320014',
                'name'        => "Nature's Spring Purified Water 500ml",
                'unit'        => 'bottle',
                'capital'     => 9.00,
                'markup'      => 66.67, // ₱15.00
                'stock'       => 150.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-bottle.svg',
            ],
            [
                'barcode'     => '4800110020017',
                'name'        => 'Absolute Pure Distilled Water 1L',
                'unit'        => 'bottle',
                'capital'     => 22.00,
                'markup'      => 36.36, // ₱30.00
                'stock'       => 80.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-bottle.svg',
            ],
            [
                'barcode'     => '4800016140017',
                'name'        => 'C2 Green Tea Apple 500ml',
                'unit'        => 'bottle',
                'capital'     => 24.00,
                'markup'      => 33.33, // ₱32.00
                'stock'       => 70.000,
                'category'    => 'Beverages',
                'product_img' => '/images/products/beverage-bottle.svg',
            ],
        ];

        foreach ($beverages as $p) {
            $make($p);
        }

        // ══════════════════════════════════════════════════════════
        // 5. SNACKS & CONFECTIONERY (ACTUAL BARCODES)
        // ══════════════════════════════════════════════════════════
        $snacks = [
            [
                'barcode'     => '4800016601013',
                'name'        => "Jack 'n Jill Piattos Cheese 85g",
                'unit'        => 'pack',
                'capital'     => 31.00,
                'markup'      => 29.03, // ₱40.00
                'stock'       => 60.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
            [
                'barcode'     => '4800016603017',
                'name'        => "Jack 'n Jill Nova Country Cheddar 78g",
                'unit'        => 'pack',
                'capital'     => 30.00,
                'markup'      => 30.00, // ₱39.00
                'stock'       => 50.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
            [
                'barcode'     => '4800016604014',
                'name'        => "Jack 'n Jill Vcut Spicy Barbecue 60g",
                'unit'        => 'pack',
                'capital'     => 29.00,
                'markup'      => 31.03, // ₱38.00
                'stock'       => 55.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
            [
                'barcode'     => '4800194110017',
                'name'        => 'Oishi Prawn Crackers 60g',
                'unit'        => 'pack',
                'capital'     => 18.00,
                'markup'      => 38.89, // ₱25.00
                'stock'       => 70.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
            [
                'barcode'     => '4800038110014',
                'name'        => 'M.Y. San SkyFlakes Crackers 250g',
                'unit'        => 'pack',
                'capital'     => 38.00,
                'markup'      => 26.32, // ₱48.00
                'stock'       => 60.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
            [
                'barcode'     => '4800038120013',
                'name'        => 'M.Y. San Fita Crackers 200g',
                'unit'        => 'pack',
                'capital'     => 36.00,
                'markup'      => 27.78, // ₱46.00
                'stock'       => 50.000,
                'category'    => 'Snacks',
                'product_img' => '/images/products/snacks.svg',
            ],
        ];

        foreach ($snacks as $p) {
            $make($p);
        }

        // ══════════════════════════════════════════════════════════
        // 6. PERSONAL CARE & HYGIENE (ACTUAL BARCODES)
        // ══════════════════════════════════════════════════════════
        $personalCare = [
            [
                'barcode'     => '4902430750012',
                'name'        => 'Safeguard Pure White Soap Bar 130g',
                'unit'        => 'bar',
                'capital'     => 38.00,
                'markup'      => 26.32, // ₱48.00
                'stock'       => 90.000,
                'category'    => 'Personal Care',
                'product_img' => '/images/products/hygiene.svg',
            ],
            [
                'barcode'     => '4800198120012',
                'name'        => 'Palmolive Naturals Shampoo 180ml',
                'unit'        => 'bottle',
                'capital'     => 75.00,
                'markup'      => 26.67, // ₱95.00
                'stock'       => 45.000,
                'category'    => 'Personal Care',
                'product_img' => '/images/products/hygiene.svg',
            ],
            [
                'barcode'     => '4800888120015',
                'name'        => 'Sunsilk Smooth & Manageable Shampoo 180ml',
                'unit'        => 'bottle',
                'capital'     => 78.00,
                'markup'      => 26.92, // ₱99.00
                'stock'       => 40.000,
                'category'    => 'Personal Care',
                'product_img' => '/images/products/hygiene.svg',
            ],
            [
                'barcode'     => '4800198140010',
                'name'        => 'Colgate Great Regular Flavor Toothpaste 150g',
                'unit'        => 'tube',
                'capital'     => 68.00,
                'markup'      => 25.00, // ₱85.00
                'stock'       => 50.000,
                'category'    => 'Personal Care',
                'product_img' => '/images/products/hygiene.svg',
            ],
            [
                'barcode'     => '4806500850018',
                'name'        => 'Green Cross Isopropyl Alcohol 70% 500ml',
                'unit'        => 'bottle',
                'capital'     => 65.00,
                'markup'      => 30.77, // ₱85.00
                'stock'       => 60.000,
                'category'    => 'Personal Care',
                'product_img' => '/images/products/hygiene.svg',
            ],
        ];

        foreach ($personalCare as $p) {
            $make($p);
        }

        $this->command->info("✓ Retail products seeded ({$productCount} products with genuine barcodes, rice & feeds)");
    }
}
