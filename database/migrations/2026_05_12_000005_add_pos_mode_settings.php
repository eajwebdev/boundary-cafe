<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        foreach (SystemSetting::defaults() as $setting) {
            $row = SystemSetting::firstOrCreate(
                ['key' => $setting['key'], 'branch_id' => null],
                [
                    'value'       => $setting['value'],
                    'type'        => $setting['type'] ?? 'string',
                    'group'       => $setting['group'] ?? explode('.', $setting['key'])[0],
                    'label'       => $setting['label'] ?? $setting['key'],
                    'description' => $setting['description'] ?? null,
                    'options'     => $setting['options'] ?? null,
                    'is_public'   => $setting['is_public'] ?? false,
                    'is_readonly' => $setting['is_readonly'] ?? false,
                ]
            );

            if (! $row->wasRecentlyCreated) {
                $row->forceFill([
                    'type'        => $row->type ?: ($setting['type'] ?? 'string'),
                    'group'       => $row->group ?: ($setting['group'] ?? explode('.', $setting['key'])[0]),
                    'label'       => $row->label ?: ($setting['label'] ?? $setting['key']),
                    'description' => $row->description ?: ($setting['description'] ?? null),
                    'options'     => $row->options ?: ($setting['options'] ?? null),
                ])->save();
            }
        }

        SystemSetting::where('key', 'pos.default_payment')
            ->whereNull('branch_id')
            ->update(['options' => '["cash","gcash","card","others","credit","mixed","installment"]']);

        SystemSetting::flushCache();
    }

    public function down(): void
    {
        SystemSetting::whereIn('key', [
            'pos.item_mode',
            'pos.laundry_mode',
            'pos.require_customer_name',
            'pos.default_due_days',
        ])->delete();

        SystemSetting::flushCache();
    }
};
