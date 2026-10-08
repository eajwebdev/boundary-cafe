<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * End-of-day Z-readings: one locked snapshot per branch per business day.
     */
    public function up(): void
    {
        Schema::create('z_readings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('z_number');
            $table->date('business_date');

            $table->string('first_receipt')->nullable();
            $table->string('last_receipt')->nullable();
            $table->unsignedInteger('transaction_count')->default(0);
            $table->decimal('items_sold', 12, 2)->default(0);

            $table->decimal('gross_sales', 14, 2)->default(0);
            $table->decimal('discount_total', 14, 2)->default(0);
            $table->decimal('loyalty_discount_total', 14, 2)->default(0);
            $table->decimal('net_sales', 14, 2)->default(0);
            $table->decimal('delivery_fees', 14, 2)->default(0);
            $table->decimal('unpaid_total', 14, 2)->default(0);

            $table->unsignedInteger('void_count')->default(0);
            $table->decimal('void_amount', 14, 2)->default(0);

            $table->boolean('vat_enabled')->default(false);
            $table->decimal('vat_rate', 5, 2)->default(0);
            $table->decimal('vatable_sales', 14, 2)->default(0);
            $table->decimal('vat_amount', 14, 2)->default(0);
            $table->decimal('vat_exempt_sales', 14, 2)->default(0);

            $table->decimal('collections_total', 14, 2)->default(0);
            $table->unsignedInteger('collections_count')->default(0);

            $table->decimal('opening_cash', 14, 2)->default(0);
            $table->decimal('expected_cash', 14, 2)->default(0);
            $table->decimal('counted_cash', 14, 2)->default(0);
            $table->decimal('over_short', 14, 2)->default(0);

            $table->json('payments');
            $table->json('channels');
            $table->json('sessions');

            $table->decimal('previous_grand_total', 16, 2)->default(0);
            $table->decimal('grand_total', 16, 2)->default(0);

            $table->foreignId('generated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('generated_at');
            $table->unsignedInteger('reprint_count')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['branch_id', 'business_date']);
            $table->unique(['branch_id', 'z_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('z_readings');
    }
};
