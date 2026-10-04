<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * petty_cash_vouchers — individual withdrawal records from the petty cash fund.
     *
     * voucher_type:
     *   withdrawal    = money taken out for a small purchase
     *   replenishment = money added back to restore the fund
     *
     * status:
     *   pending  = submitted by cashier, awaiting manager approval
     *   approved = manager approved, balance deducted from fund
     *   rejected = manager rejected, no balance change
     *
     * Approved withdrawals are also optionally linked to an Expense
     * record so they appear in the daily expense summary.
     */
    public function up(): void
    {
        Schema::create('petty_cash_vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('voucher_number')->unique();           // PCV-2026-000001
            $table->foreignId('petty_cash_fund_id')->constrained('petty_cash_funds')->cascadeOnDelete();
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('expense_id')->nullable()->constrained('expenses')->nullOnDelete();
            $table->foreignId('expense_category_id')->nullable()->constrained('expense_categories')->nullOnDelete();
            $table->string('voucher_type', 20)->default('withdrawal'); // withdrawal | replenishment
            $table->decimal('amount', 10, 2);
            $table->decimal('balance_before', 10, 2)->default(0.00); // fund balance before this tx
            $table->decimal('balance_after', 10, 2)->default(0.00);  // fund balance after this tx
            $table->string('payee', 150)->nullable();                 // who received the cash
            $table->text('purpose');                                  // what was bought/paid
            $table->string('receipt_img')->nullable();
            $table->string('status', 20)->default('pending');         // pending | approved | rejected
            $table->text('rejection_reason')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['petty_cash_fund_id', 'status']);
            $table->index('voucher_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('petty_cash_vouchers');
    }
};
