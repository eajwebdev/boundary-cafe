<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        foreach (['Signature Blends', 'Coffee', 'Non-Coffee', 'Frappes', 'Sulit Meals', 'Burgers', 'Snacks and Sides', 'Shareable Plates', 'Combos', 'Desserts', 'Add-ons', 'Raw Materials'] as $name) {
            Category::updateOrCreate(['slug' => Str::slug($name)], [
                'name' => $name, 'description' => "Boundary Cafe {$name}", 'is_active' => true,
            ]);
        }
        $this->command->info('Boundary Cafe menu categories seeded.');
    }
}
