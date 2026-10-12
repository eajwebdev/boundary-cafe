<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Online orders can now be Dine-in (customer orders from their phone inside the café,
     * optionally with a table number) besides Takeout (pickup) and Delivery.
     *
     * Addresses carry the full locality — "Dahile, Mabinay, Negros Oriental 6207" —
     * filled in from the phone's location, plus the ZIP code per barangay.
     */
    public function up(): void
    {
        Schema::table('barangays', function (Blueprint $table) {
            $table->string('zip_code', 10)->nullable()->after('province');
        });
        DB::table('barangays')->where('municipality', 'Mabinay')->update(['zip_code' => '6207']);

        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->string('municipality', 80)->default('Mabinay')->after('barangay');
            $table->string('province', 80)->default('Negros Oriental')->after('municipality');
            $table->string('zip_code', 10)->nullable()->after('province');
        });
        DB::table('customer_addresses')->whereNull('zip_code')->update(['zip_code' => '6207']);

        Schema::table('online_orders', function (Blueprint $table) {
            $table->string('table_number', 20)->nullable()->after('fulfillment_type');
            $table->string('municipality', 80)->nullable()->after('barangay');
            $table->string('province', 80)->nullable()->after('municipality');
            $table->string('zip_code', 10)->nullable()->after('province');
        });
    }

    public function down(): void
    {
        Schema::table('online_orders', function (Blueprint $table) {
            $table->dropColumn(['table_number', 'municipality', 'province', 'zip_code']);
        });
        Schema::table('customer_addresses', function (Blueprint $table) {
            $table->dropColumn(['municipality', 'province', 'zip_code']);
        });
        Schema::table('barangays', function (Blueprint $table) {
            $table->dropColumn('zip_code');
        });
    }
};
