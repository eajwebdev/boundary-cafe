<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The town online orders are delivered in becomes a setting (it was written "Mabinay" into the
     * customer app), so moving online ordering to another branch — e.g. Tagukon — needs no code change.
     */
    public function up(): void
    {
        $settings = [
            ['key' => 'online.service_area', 'value' => 'Mabinay', 'label' => 'Delivery town / city', 'description' => 'Shown to customers, e.g. "Delivering across Mabinay"'],
            ['key' => 'online.service_province', 'value' => 'Negros Oriental', 'label' => 'Delivery province', 'description' => null],
        ];
        foreach ($settings as $setting) {
            if (DB::table('system_settings')->whereNull('branch_id')->where('key', $setting['key'])->exists()) {
                continue;
            }
            DB::table('system_settings')->insert([
                ...$setting,
                'branch_id' => null,
                'type' => 'string',
                'group' => 'online',
                'is_public' => false,
                'is_readonly' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->whereIn('key', ['online.service_area', 'online.service_province'])->delete();
    }
};
