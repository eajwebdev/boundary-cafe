<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Riders: who carries a delivery, when it was handed to them, and when the cash they collected
     * on delivery was handed back to the cafe.
     */
    public function up(): void
    {
        Schema::table('online_orders', function (Blueprint $table) {
            $table->foreignId('rider_id')->nullable()->after('handled_by')->constrained('users')->nullOnDelete();
            $table->timestamp('rider_assigned_at')->nullable()->after('rider_id');
            $table->timestamp('cash_remitted_at')->nullable()->after('rider_assigned_at');
            $table->foreignId('cash_remitted_to')->nullable()->after('cash_remitted_at')->constrained('users')->nullOnDelete();

            $table->index(['rider_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('online_orders', function (Blueprint $table) {
            $table->dropIndex(['rider_id', 'status']);
            $table->dropConstrainedForeignId('cash_remitted_to');
            $table->dropColumn('cash_remitted_at');
            $table->dropColumn('rider_assigned_at');
            $table->dropConstrainedForeignId('rider_id');
        });
    }
};
