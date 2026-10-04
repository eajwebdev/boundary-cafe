<?php

namespace Database\Seeders;

use App\Models\Supplier;
use Illuminate\Database\Seeder;

class SupplierSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['name' => 'Boundary Cafe Commissary', 'contact_person' => 'Operations Team', 'address' => 'Negros Island'],
            ['name' => 'Negros Coffee Roasters', 'contact_person' => 'Wholesale Desk', 'address' => 'Negros Occidental'],
            ['name' => 'Boundary Fresh Produce', 'contact_person' => 'Purchasing Desk', 'address' => 'Negros Island'],
        ] as $supplier) {
            Supplier::updateOrCreate(['name' => $supplier['name']], $supplier);
        }
        $this->command->info('Boundary Cafe suppliers seeded.');
    }
}
