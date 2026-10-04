<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cash_counts', function (Blueprint $table) {
            $table->decimal('pure_cash_sales',  12, 2)->nullable()->after('system_total');
            $table->decimal('installment_dp',   12, 2)->nullable()->after('pure_cash_sales');
            $table->decimal('petty_cash_paid',  12, 2)->nullable()->after('installment_dp');
            $table->decimal('gcash_system',     12, 2)->nullable()->after('petty_cash_paid');
            $table->decimal('gcash_counted',    12, 2)->nullable()->after('gcash_system');
            $table->decimal('gcash_over_short', 12, 2)->nullable()->after('gcash_counted');
            $table->decimal('card_system',      12, 2)->nullable()->after('gcash_over_short');
            $table->decimal('card_counted',     12, 2)->nullable()->after('card_system');
            $table->decimal('card_over_short',  12, 2)->nullable()->after('card_counted');
        });
    }

    public function down(): void
    {
        Schema::table('cash_counts', function (Blueprint $table) {
            $table->dropColumn([
                'pure_cash_sales', 'installment_dp', 'petty_cash_paid',
                'gcash_system', 'gcash_counted', 'gcash_over_short',
                'card_system', 'card_counted', 'card_over_short',
            ]);
        });
    }
};
