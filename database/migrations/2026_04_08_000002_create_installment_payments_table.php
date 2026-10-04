<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installment_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('installment_plan_id')->constrained()->cascadeOnDelete();
            $table->foreignId('received_by_user_id')->constrained('users');

            $table->unsignedSmallInteger('sequence'); // 1st, 2nd, 3rd payment…
            $table->decimal('amount', 12, 2);
            $table->date('payment_date');
            $table->string('payment_method', 20)->default('cash'); // cash | gcash | card
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index('installment_plan_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('installment_payments');
    }
};
