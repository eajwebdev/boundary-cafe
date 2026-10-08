<?php

namespace Database\Factories;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\ZReading;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ZReading>
 */
class ZReadingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $netSales = fake()->randomFloat(2, 1000, 20000);

        return [
            'branch_id' => fn () => Branch::create([
                'supplier_id' => Supplier::create(['name' => fake()->company()])->id,
                'name' => fake()->city().' Branch',
                'code' => strtoupper(fake()->unique()->lexify('???')),
            ])->id,
            'z_number' => fake()->unique()->numberBetween(1, 9999),
            'business_date' => fake()->unique()->dateTimeBetween('-1 year', '-1 day')->format('Y-m-d'),
            'transaction_count' => fake()->numberBetween(10, 200),
            'gross_sales' => $netSales,
            'net_sales' => $netSales,
            'payments' => [['method' => 'cash', 'count' => 10, 'amount' => $netSales]],
            'channels' => [],
            'sessions' => [],
            'previous_grand_total' => 0,
            'grand_total' => $netSales,
            'generated_at' => now(),
        ];
    }
}
