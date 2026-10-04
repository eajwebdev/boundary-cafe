<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * sales — a completed POS transaction.
     *
     * table_order_id: null = walk-up / takeout
     *                 set  = dine-in settled from a table_order
     *
     * NOTE: The FK constraint for table_order_id is intentionally deferred
     * to migration 031 (add_cross_fks_sales_table_orders). This is because
     * sales (009) and table_orders (024) reference each other — a circular
     * FK that MySQL cannot resolve in a single pass. Both tables are created
     * without the cross-reference first, then wired together in 031.
     *
     * status: completed | voided | refunded
     */
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_number')->unique()->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_sessions')->nullOnDelete();
            $table->unsignedBigInteger('table_order_id')->nullable(); // FK added in migration 031
            $table->decimal('total', 12, 2)->default(0.00);
            $table->string('payment_method', 30)->default('cash'); // cash|gcash|card|others
            $table->decimal('payment_amount', 12, 2)->default(0.00);
            $table->decimal('change_amount', 10, 2)->default(0.00);
            $table->decimal('discount_amount', 10, 2)->default(0.00);
            $table->string('customer_name', 100)->nullable();
            $table->string('status', 20)->default('completed');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('cash_session_id');
            $table->index('table_order_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
