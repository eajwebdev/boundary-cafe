<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Owner-friendly Z-reading: discounts by kind, service charge, the cash drawer worked out line by line
     * (cash sales, cash paid out and each payout), and what sold (top items, categories).
     */
    public function up(): void
    {
        Schema::table('z_readings', function (Blueprint $table) {
            $table->decimal('senior_pwd_discount', 12, 2)->default(0)->after('discount_total');
            $table->decimal('promo_discount', 12, 2)->default(0)->after('senior_pwd_discount');
            $table->decimal('manual_discount', 12, 2)->default(0)->after('promo_discount');
            $table->decimal('service_charge_total', 12, 2)->default(0)->after('delivery_fees');
            $table->decimal('cash_sales', 12, 2)->default(0)->after('opening_cash');
            $table->decimal('cash_paid_out', 12, 2)->default(0)->after('cash_sales');
            $table->json('payouts')->nullable()->after('sessions');
            $table->json('top_items')->nullable()->after('payouts');
            $table->json('categories')->nullable()->after('top_items');
        });
    }

    public function down(): void
    {
        Schema::table('z_readings', function (Blueprint $table) {
            $table->dropColumn([
                'senior_pwd_discount', 'promo_discount', 'manual_discount', 'service_charge_total',
                'cash_sales', 'cash_paid_out', 'payouts', 'top_items', 'categories',
            ]);
        });
    }
};
