<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Physical cash count performed at end of shift (or spot-check mid-shift).
     * One record per count event. Denomination rows live in cash_count_denominations.
     *
     * count_type: closing | midshift | opening
     * over_short  = counted_total - expected_cash  (+ over, - short)
     */
    public function up(): void
    {
        Schema::create('cash_counts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_session_id')->constrained('cash_sessions')->cascadeOnDelete();
            $table->foreignId('counted_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('count_type', 20)->default('closing');  // closing|midshift|opening
            $table->decimal('system_total', 12, 2)->default(0.00); // sum of cash sales in session
            $table->decimal('opening_cash', 10, 2)->default(0.00);
            $table->decimal('expected_cash', 10, 2)->default(0.00);
            $table->decimal('counted_total', 10, 2)->default(0.00); // sum of denomination rows
            $table->decimal('over_short', 10, 2)->default(0.00);
            $table->string('status', 20)->default('pending');       // pending|verified|disputed
            $table->text('notes')->nullable();
            $table->timestamp('counted_at')->useCurrent();
            $table->timestamps();

            $table->index('cash_session_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_counts');
    }
};
