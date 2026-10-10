<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An adjustment never takes stock below zero, so it can remove less than its quantity.
     * Keep what it really removed, so deleting it gives back exactly that.
     */
    public function up(): void
    {
        Schema::table('stock_adjustments', function (Blueprint $table) {
            $table->decimal('stock_deducted', 12, 3)->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('stock_adjustments', function (Blueprint $table) {
            $table->dropColumn('stock_deducted');
        });
    }
};
