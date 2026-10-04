<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = ExpenseCategory::defaults();

        foreach ($categories as $cat) {
            ExpenseCategory::firstOrCreate(
                ['name' => $cat['name']],
                $cat
            );
        }

        $this->command->info('✓ Expense categories seeded (' . count($categories) . ')');
    }
}
