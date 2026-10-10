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

            // ── 6. Cafe products (MENU_SEEDER in .env: boundary | eaj) ──
            ...$this->menuSeeders(),
            DiningTableSeeder::class,

            // ── 7. Customer ordering app demo data ────────────────
            //    Registered customers, storefront promos, online orders
            OnlineOrderingDemoSeeder::class,
        ]);
    }

    /**
     * Which menu to seed. "eaj" is the EAJ Restaurant / Cafe Management System catalog (same items as Boundary Cafe,
     * EAJ branding and product images). "boundary" (the default) is the Boundary Cafe menu. Most of either menu is
     * made to order, so a recipe seeder adds the raw ingredients and a recipe for each made-to-order item.
     *
     * @return array<int, class-string<Seeder>>
     */
    private function menuSeeders(): array
    {
        return config('app.menu_seeder') === 'eaj'
            ? [EajCafeProductSeeder::class, EajCafeRecipeSeeder::class]
            : [BoundaryCafeProductSeeder::class, BoundaryCafeRecipeSeeder::class];
    }
}
