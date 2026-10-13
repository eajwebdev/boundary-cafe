<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\DailyMission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DailyMission>
 */
class DailyMissionFactory extends Factory
{
    /**
     * Today's "spend ₱260 → +10 points" mission for a new member.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'customer_id' => fn () => Customer::create([
                'name' => fake()->name(),
                'contact_number' => '09'.fake()->unique()->numerify('#########'),
                'loyalty_enabled' => true,
                'is_active' => true,
            ])->id,
            'mission_date' => today(),
            'type' => DailyMission::TYPE_SPEND,
            'target' => 260,
            'category_id' => null,
            'reward_points' => 10,
            'title' => 'Spend ₱260 today',
            'status' => DailyMission::STATUS_ACTIVE,
        ];
    }

    public function items(int $count = 3, int $points = 10): static
    {
        return $this->state(fn () => [
            'type' => DailyMission::TYPE_ITEMS, 'target' => $count, 'reward_points' => $points, 'title' => "Order {$count} items today",
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn () => ['status' => DailyMission::STATUS_COMPLETED, 'completed_at' => now()]);
    }
}
