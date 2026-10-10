<?php

namespace Database\Seeders;

use App\Models\Branch;
use Illuminate\Database\Eloquent\Collection;

/**
 * The same raw ingredients and recipes as Boundary Cafe, linked to the EAJ menu (EajCafeProductSeeder), so
 * made-to-order items are available while their ingredients are in stock and deduct them when sold.
 *
 * Run on its own: php artisan db:seed --class=EajCafeRecipeSeeder
 */
class EajCafeRecipeSeeder extends BoundaryCafeRecipeSeeder
{
    protected string $menuBarcodePrefix = 'EAJ';

    protected function branches(): Collection
    {
        return Branch::where('is_active', true)->get();
    }
}
