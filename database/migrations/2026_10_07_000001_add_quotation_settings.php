<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        foreach (SystemSetting::defaults() as $setting) {
            if (! str_starts_with($setting['key'], 'quotation.')) {
                continue;
            }

            SystemSetting::firstOrCreate(
                ['key' => $setting['key'], 'branch_id' => null],
                [
                    'value'       => $setting['value'],
                    'type'        => $setting['type'],
                    'group'       => $setting['group'],
                    'label'       => $setting['label'],
                    'description' => $setting['description'] ?? null,
                    'is_public'   => true,
                ]
            );
        }

        SystemSetting::flushCache();
    }

    public function down(): void
    {
        SystemSetting::where('key', 'like', 'quotation.%')->delete();

        SystemSetting::flushCache();
    }
};
