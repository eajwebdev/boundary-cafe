<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cash sessions track each cashier shift (open → close).
     * All sales and petty cash expenses during a shift link to a session.
     * Reconciliation is computed when the session is closed.
     */
    public function up(): void
    {
        Schema::create('cash_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('session_number')->unique(); // SES-2026-000001
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->decimal('opening_cash', 10, 2)->default(0.00);
            $table->decimal('expected_cash', 10, 2)->default(0.00); // opening + cash sales
            $table->decimal('counted_cash', 10, 2)->nullable();     // physically counted
            $table->decimal('over_short', 10, 2)->nullable();       // counted - expected
            $table->string('status', 20)->default('open');          // open | closed
            $table->text('notes')->nullable();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_sessions');
    }
};
