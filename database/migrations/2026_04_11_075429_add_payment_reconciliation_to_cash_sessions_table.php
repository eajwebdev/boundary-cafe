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
        Schema::table('cash_sessions', function (Blueprint $table) {
            // GCash reconciliation — store system total at close + what cashier counted
            $table->decimal('gcash_system',     12, 2)->nullable()->after('over_short');
            $table->decimal('gcash_counted',    12, 2)->nullable()->after('gcash_system');
            $table->decimal('gcash_over_short', 12, 2)->nullable()->after('gcash_counted');

            // Card / bank terminal reconciliation
            $table->decimal('card_system',      12, 2)->nullable()->after('gcash_over_short');
            $table->decimal('card_counted',     12, 2)->nullable()->after('card_system');
            $table->decimal('card_over_short',  12, 2)->nullable()->after('card_counted');
        });
    }

    public function down(): void
    {
        Schema::table('cash_sessions', function (Blueprint $table) {
            $table->dropColumn([
                'gcash_system', 'gcash_counted', 'gcash_over_short',
                'card_system',  'card_counted',  'card_over_short',
            ]);
        });
    }
};
