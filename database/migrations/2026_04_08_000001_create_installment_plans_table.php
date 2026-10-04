<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installment_plans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->constrained(); // cashier who created the plan

            // Customer info
            $table->string('customer_name', 100);
            $table->string('customer_phone', 30)->nullable();

            // Amounts
            $table->decimal('total_amount', 12, 2);           // = sale total
            $table->decimal('down_payment', 12, 2)->default(0); // paid at POS
            $table->decimal('balance', 12, 2);                 // total_amount - down_payment
            $table->decimal('installment_amount', 12, 2);      // balance / installments_count
            $table->decimal('total_paid', 12, 2)->default(0);  // cumulative from installment payments

            // Schedule
            $table->unsignedTinyInteger('installments_count'); // number of remaining payments
            $table->unsignedTinyInteger('paid_count')->default(0);
            $table->string('interval', 20)->default('monthly'); // monthly | biweekly | weekly
            $table->date('next_due_date')->nullable();

            // State
            $table->string('status', 20)->default('active'); // active | completed | cancelled
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('sale_id');
            $table->index('next_due_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('installment_plans');
    }
};
