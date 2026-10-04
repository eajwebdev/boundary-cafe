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

            // ── 5. Customers — depends on branches ────────────────
            CustomerSeeder::class,

            // ── 6. Cafe products — COOP Main Campus (CMC) ─────────
            //    Ingredients must exist before products (no FK dep,
            //    but recipes reference both)
            BoundaryCafeProductSeeder::class,
            DiningTableSeeder::class,

            // ── 7. Retail products — ABC Main Store (ABC1) ────────
        ]);
    }
}
