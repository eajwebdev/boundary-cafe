<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A promo can be limited to N uses per customer (null = unlimited).
        Schema::table('promos', function (Blueprint $table) {
            $table->unsignedInteger('max_uses_per_customer')->nullable()->after('max_uses');
        });

        // Sales remember the promo they used so counter and dine-in uses count against a customer.
        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('promo_id')->nullable()->after('customer_id')->constrained('promos')->nullOnDelete();
            $table->index(['customer_id', 'promo_id']);
        });

        // The welcome code is meant to be a one-time treat for each customer.
        DB::table('promos')->where('code', 'WELCOME50')->update(['max_uses_per_customer' => 1]);
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['customer_id', 'promo_id']);
            $table->dropConstrainedForeignId('promo_id');
        });

        Schema::table('promos', function (Blueprint $table) {
            $table->dropColumn('max_uses_per_customer');
        });
    }
};
