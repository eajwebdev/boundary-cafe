<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Boundary Café takes online orders 8:00 AM – 5:00 PM. Only stores still on the old
     * 8:00 AM – 9:00 PM default are changed; hours an admin already set are left alone.
     * (Admins change them any time under Online Ordering → Store hours.)
     */
    public function up(): void
    {
        $this->swapClosingTime('21:00', '17:00');
    }

    public function down(): void
    {
        $this->swapClosingTime('17:00', '21:00');
    }

    private function swapClosingTime(string $from, string $to): void
    {
        DB::table('system_settings')->where('key', 'online.store_hours')->get()
            ->each(function ($row) use ($from, $to) {
                $hours = json_decode((string) $row->value, true);
                if (! is_array($hours) || ($hours['open'] ?? null) !== '08:00' || ($hours['close'] ?? null) !== $from) {
                    return;
                }
                $hours['close'] = $to;
                DB::table('system_settings')->where('id', $row->id)->update(['value' => json_encode($hours), 'updated_at' => now()]);
                SystemSetting::flushCache($row->branch_id);
            });
    }
};
