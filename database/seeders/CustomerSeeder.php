<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $branches = Branch::whereIn('code', ['BC-TAG', 'BC-MAB', 'BC-MAIN'])->get()->keyBy('code');
        foreach ([
            ['BC-TAG', 'Ana Villanueva', '09170000001', 'ana@example.test'],
            ['BC-MAB', 'Marco Reyes', '09170000002', 'marco@example.test'],
            ['BC-MAIN', 'Liza Santos', '09170000003', 'liza@example.test'],
        ] as [$code, $name, $phone, $email]) {
            Customer::updateOrCreate(['contact_number' => $phone], [
                'branch_id' => $branches[$code]?->id, 'name' => $name, 'email' => $email,
                'notes' => 'Boundary Rewards member', 'is_active' => true, 'loyalty_enabled' => true,
            ]);
        }
        $this->command->info('Boundary Rewards customers seeded.');
    }
}
