<?php

use App\Models\SystemSetting;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    private const OLD_RECEIPT_HEADER = 'Boundary Cafe — Taste of Negros';

    /**
     * Takes the hard-coded brand name out of setting labels, and blanks the receipt header
     * when it is still the old default so it follows the business name and tagline.
     */
    public function up(): void
    {
        SystemSetting::where('key', 'receipt.header_text')
            ->where('value', self::OLD_RECEIPT_HEADER)
            ->update(['value' => '', 'description' => 'Leave blank to print the business name and tagline']);

        SystemSetting::where('key', 'loyalty.enabled')->update(['label' => 'Enable rewards programme']);
        SystemSetting::where('key', 'pos.item_mode')->update(['description' => 'The cashier sells menu products']);

        SystemSetting::flushCache();
    }

    public function down(): void
    {
        SystemSetting::where('key', 'receipt.header_text')
            ->whereNull('branch_id')
            ->where('value', '')
            ->update(['value' => self::OLD_RECEIPT_HEADER, 'description' => null]);

        SystemSetting::where('key', 'loyalty.enabled')->update(['label' => 'Enable Boundary Rewards']);
        SystemSetting::where('key', 'pos.item_mode')->update(['description' => 'Boundary Cafe sells menu products']);

        SystemSetting::flushCache();
    }
};
