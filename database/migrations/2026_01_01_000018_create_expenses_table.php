<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Branch expenses: utilities, petty cash, salary, rent, supplies, etc.
     * These are deducted from gross sales in daily_summaries to compute net income.
     *
     * cash_session_id is optional — set it when petty cash is taken from the drawer.
     */
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expense_category_id')->constrained('expense_categories')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_sessions')->nullOnDelete();
            $table->decimal('amount', 10, 2);
            $table->date('expense_date');
            $table->string('payment_method', 30)->default('cash'); // cash|gcash|card|bank_transfer|charge
            $table->string('reference_number', 100)->nullable();   // OR#, invoice#
            $table->string('receipt_img')->nullable();
            $table->text('description')->nullable();
            $table->string('status', 20)->default('approved');     // pending|approved|rejected
            $table->timestamps();

            $table->index(['branch_id', 'expense_date']);
            $table->index('expense_category_id');
            $table->index('cash_session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
