<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Supplier;
use Illuminate\Database\Seeder;

class BranchSeeder extends Seeder
{
    public function run(): void
    {
        $supplier = Supplier::updateOrCreate(
            ['name' => 'Boundary Cafe Commissary'],
            ['contact_person' => 'Boundary Cafe Operations']
        );

        $branches = [
            ['code' => 'BC-TAG', 'name' => 'Boundary Cafe – Tagukon', 'address' => 'Tagukon, Negros Occidental'],
            ['code' => 'BC-MAB', 'name' => 'Boundary Cafe – Mabinay', 'address' => 'Mabinay, Negros Oriental'],
            ['code' => 'BC-MAIN', 'name' => 'Boundary Cafe – Main', 'address' => 'Negros Island'],
        ];

        foreach ($branches as $data) {
            Branch::updateOrCreate(['code' => $data['code']], array_merge($data, [
                'supplier_id' => $supplier->id, 'contact_person' => 'Branch Manager', 'is_active' => true,
                'business_type' => Branch::TYPE_RESTAURANT, 'use_table_ordering' => true,
                'use_variants' => true, 'use_expiry_tracking' => true,
                'use_recipe_system' => true, 'use_bundles' => true,
            ]));
        }
        $this->command->info('Boundary Cafe branches seeded (3).');
    }
}
