<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Adds the "Order number prefix" setting (blank = taken from the business name, e.g. EAJ Cafe → EAJ). */
    public function up(): void
    {
        $setting = collect(SystemSetting::defaults())->firstWhere('key', 'general.order_prefix');

        SystemSetting::firstOrCreate(
            ['key' => $setting['key'], 'branch_id' => null],
            [
                'value' => $setting['value'],
                'type' => $setting['type'],
                'group' => $setting['group'],
                'label' => $setting['label'],
                'description' => $setting['description'],
                'is_public' => false,
            ]
        );

        SystemSetting::flushCache();
    }

    public function down(): void
    {
        SystemSetting::where('key', 'general.order_prefix')->delete();

        SystemSetting::flushCache();
    }
};
