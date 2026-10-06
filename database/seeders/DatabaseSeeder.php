<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([

            // ── 1. Foundation — no foreign key dependencies ────────
            SupplierSeeder::class,
            CategorySeeder::class,
            ExpenseCategorySeeder::class,

            // ── 2. Branches — depends on suppliers ────────────────
            BranchSeeder::class,

            // ── 3. Users — depends on branches ────────────────────
            UserSeeder::class,

            // ── 4. System settings — global defaults ──────────────
            SystemSettingSeeder::class,

            // ── 5. Mabinay barangays (delivery area) + customers ───
            BarangaySeeder::class,
            CustomerSeeder::class,

            // ── 6. Cafe products — COOP Main Campus (CMC) ─────────
            //    Most of the menu is made to order: the recipe seeder adds
            //    raw ingredients and the recipe for each made-to-order item.
            BoundaryCafeProductSeeder::class,
            BoundaryCafeRecipeSeeder::class,
            DiningTableSeeder::class,

            // ── 7. Customer ordering app demo data ────────────────
            //    Registered customers, storefront promos, online orders
            OnlineOrderingDemoSeeder::class,
        ]);
    }
}
