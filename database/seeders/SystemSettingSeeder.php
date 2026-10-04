<?php

namespace Database\Seeders;

use App\Models\SystemSetting;
use Illuminate\Database\Seeder;

class SystemSettingSeeder extends Seeder
{
    /**
     * Seeds all global system setting defaults (branch_id = null).
     *
     * Branch-specific overrides are NOT seeded here — they are set
     * programmatically via SystemSetting::set($key, $value, $branchId)
     * in the admin settings UI.
     *
     * Full list of keys:
     *   general.*      — business info, currency, timezone
     *   tax.*          — VAT rate, service charge
     *   pos.*          — POS behavior, discounts
     *   receipt.*      — receipt layout and content
     *   inventory.*    — low stock threshold, expiry warnings
     *   cash.*         — petty cash limits, cash count requirements
     *   notification.* — alert toggles
     */
    public function run(): void
    {
        $settings = SystemSetting::defaults();

        foreach ($settings as $setting) {
            SystemSetting::firstOrCreate(
                ['key' => $setting['key'], 'branch_id' => null],
                [
                    'value'       => $setting['value'],
                    'type'        => $setting['type']        ?? 'string',
                    'group'       => $setting['group']       ?? 'general',
                    'label'       => $setting['label']       ?? null,
                    'description' => $setting['description'] ?? null,
                    'options'     => $setting['options']     ?? null,
                    'is_public'   => $setting['is_public']   ?? false,
                    'is_readonly' => $setting['is_readonly'] ?? false,
                ]
            );
        }

        $this->command->info('✓ System settings seeded (' . count($settings) . ' settings)');
    }
}
