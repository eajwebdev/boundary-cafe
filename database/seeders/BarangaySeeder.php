<?php

namespace Database\Seeders;

use App\Models\Barangay;
use Illuminate\Database\Seeder;

class BarangaySeeder extends Seeder
{
    /**
     * The 32 barangays of Mabinay, Negros Oriental (delivery area).
     *
     * Verify this list against the official PSA PSGC listing before going live;
     * admins can toggle deliverability per barangay on the Delivery Zone page.
     */
    public const MABINAY = [
        'Abis', 'Arebasore', 'Bagtic', 'Banban', 'Barras', 'Bato', 'Bugnay', 'Bulibulihan',
        'Bulwang', 'Campanun-an', 'Canggohob', 'Cansal-ing', 'Dagbasan', 'Dahile', 'Hagtu',
        'Himocdongon', 'Inapoy', 'Lamdas', 'Lumbangan', 'Luyang', 'Manlingay', 'Mayaposi',
        'Napasu-an', 'New Namangka', 'Old Namangka', 'Pandanon', 'Paniabonan', 'Pantao',
        'Poblacion', 'Samac', 'Tadlong', 'Tara',
    ];

    public function run(): void
    {
        foreach (self::MABINAY as $i => $name) {
            Barangay::firstOrCreate(
                ['municipality' => 'Mabinay', 'name' => $name],
                [
                    'province' => 'Negros Oriental',
                    'is_deliverable' => true,
                    // Poblacion first — it is where most orders come from.
                    'sort_order' => $name === 'Poblacion' ? 0 : $i + 1,
                    'lat' => $name === 'Poblacion' ? 9.7355043 : null,
                    'lng' => $name === 'Poblacion' ? 122.926378 : null,
                ]
            );
        }

        $this->command?->info('Mabinay barangays seeded ('.count(self::MABINAY).').');
    }
}
