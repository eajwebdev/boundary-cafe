<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /** Adds the "Tagline" setting shown under the business name on the staff login page. */
    public function up(): void
    {
        $setting = collect(SystemSetting::defaults())->firstWhere('key', 'general.tagline');

        SystemSetting::firstOrCreate(
            ['key' => $setting['key'], 'branch_id' => null],
            [
                'value' => $setting['value'],
                'type' => $setting['type'],
                'group' => $setting['group'],
                'label' => $setting['label'],
                'description' => $setting['description'],
                'is_public' => true,
            ]
        );

        SystemSetting::flushCache();
    }

    public function down(): void
    {
        SystemSetting::where('key', 'general.tagline')->delete();

        SystemSetting::flushCache();
    }
};
