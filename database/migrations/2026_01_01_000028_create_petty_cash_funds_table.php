<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * petty_cash_funds — the imprest petty cash fund per branch.
     *
     * How it works (Imprest System):
     *   1. Management sets a fixed fund amount (e.g. ₱5,000)
     *   2. Cashier/staff withdraws for small purchases → petty_cash_vouchers
     *   3. When fund is low, manager replenishes it back to the fixed amount
     *   4. Replenishment = sum of approved vouchers since last replenishment
     *
     * Each branch can have ONE active petty cash fund at a time.
     * Inactive ones are closed (archived) when a new fund period starts.
     *
     * current_balance = fund_amount - (sum of approved vouchers since last replenishment)
     */
    public function up(): void
    {
        Schema::create('petty_cash_funds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('managed_by')->constrained('users')->cascadeOnDelete();
            $table->string('fund_name')->default('Petty Cash Fund');
            $table->decimal('fund_amount', 10, 2);          // fixed imprest amount e.g. 5000
            $table->decimal('current_balance', 10, 2);      // real-time remaining cash
            $table->string('status', 20)->default('active'); // active | closed
            $table->date('started_at');
            $table->date('closed_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('petty_cash_funds');
    }
};
