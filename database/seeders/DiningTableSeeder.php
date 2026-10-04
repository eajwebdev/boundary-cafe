<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\DiningTable;
use Illuminate\Database\Seeder;

class DiningTableSeeder extends Seeder
{
    /**
     * Seeds dining tables only for branches with use_table_ordering = true.
     * Automatically skips branches that don't need table management
     * (grocery stores, takeout cafes, hardware shops, etc.).
     */
    public function run(): void
    {
        $branches = Branch::where('use_table_ordering', true)->get();

        if ($branches->isEmpty()) {
            $this->command->warn('No branches with use_table_ordering=true. Skipping.');
            return;
        }

        $total = 0;

        foreach ($branches as $branch) {
            $tables = $this->tablesForBranch($branch->code);

            foreach ($tables as $table) {
                DiningTable::firstOrCreate(
                    [
                        'branch_id'    => $branch->id,
                        'table_number' => $table['table_number'],
                    ],
                    [
                        'branch_id'    => $branch->id,
                        'table_number' => $table['table_number'],
                        'section'      => $table['section'] ?? null,
                        'capacity'     => $table['capacity'],
                        'status'       => 'available',
                        'is_active'    => true,
                    ]
                );
                $total++;
            }

            $this->command->info("  → {$branch->name}: " . count($tables) . ' tables');
        }

        $this->command->info("✓ Dining tables seeded ({$total} total)");
    }

    /**
     * Define tables per branch code.
     * Add more cases here as you add new dine-in branches.
     */
    private function tablesForBranch(string $code): array
    {
        return match ($code) {

            // COOP Main Campus — cafe with indoor, outdoor, and VIP sections
            'CMC' => [
                // Indoor (regular seating)
                ['table_number' => 'T1',  'section' => 'Indoor',  'capacity' => 2],
                ['table_number' => 'T2',  'section' => 'Indoor',  'capacity' => 2],
                ['table_number' => 'T3',  'section' => 'Indoor',  'capacity' => 4],
                ['table_number' => 'T4',  'section' => 'Indoor',  'capacity' => 4],
                ['table_number' => 'T5',  'section' => 'Indoor',  'capacity' => 4],
                ['table_number' => 'T6',  'section' => 'Indoor',  'capacity' => 4],
                ['table_number' => 'T7',  'section' => 'Indoor',  'capacity' => 6],
                ['table_number' => 'T8',  'section' => 'Indoor',  'capacity' => 6],
                // Outdoor / al fresco
                ['table_number' => 'O1',  'section' => 'Outdoor', 'capacity' => 2],
                ['table_number' => 'O2',  'section' => 'Outdoor', 'capacity' => 2],
                ['table_number' => 'O3',  'section' => 'Outdoor', 'capacity' => 4],
                ['table_number' => 'O4',  'section' => 'Outdoor', 'capacity' => 4],
                // VIP / reserved area
                ['table_number' => 'V1',  'section' => 'VIP',     'capacity' => 6],
                ['table_number' => 'V2',  'section' => 'VIP',     'capacity' => 8],
            ],

            // Default for any other branch with table ordering enabled
            default => [
                ['table_number' => 'T1', 'section' => null, 'capacity' => 4],
                ['table_number' => 'T2', 'section' => null, 'capacity' => 4],
                ['table_number' => 'T3', 'section' => null, 'capacity' => 4],
                ['table_number' => 'T4', 'section' => null, 'capacity' => 4],
                ['table_number' => 'T5', 'section' => null, 'capacity' => 6],
                ['table_number' => 'T6', 'section' => null, 'capacity' => 6],
            ],
        };
    }
}
