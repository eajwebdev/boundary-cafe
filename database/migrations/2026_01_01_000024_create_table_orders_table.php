<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * table_orders — a dine-in order session tied to a specific table.
     *
     * A table_order is OPEN when customers are seated and ordering.
     * It is CLOSED when the bill is settled and a Sale is created.
     *
     * Flow:
     *   1. Cashier/waiter opens a table_order (table status → occupied)
     *   2. Items are added to table_order_items as the meal progresses
     *   3. Customer asks for the bill
     *   4. Cashier closes the table_order → creates a Sale record
     *   5. Table status → cleaning / available
     *
     * table_id links to the physical table.
     * sale_id is filled once payment is collected.
     */
    public function up(): void
    {
        Schema::create('table_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();         // TO-2026-000001
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('table_id')->constrained('tables')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete(); // waiter/cashier
            $table->unsignedBigInteger('sale_id')->nullable(); // FK added in migration 031
            $table->integer('covers')->default(1);            // number of guests
            $table->string('customer_name', 100)->nullable();
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('discount_amount', 10, 2)->default(0.00);
            $table->decimal('total', 12, 2)->default(0.00);
            $table->string('status', 20)->default('open');   // open|billed|closed|cancelled
            $table->text('notes')->nullable();
            $table->timestamp('opened_at')->useCurrent();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('table_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_orders');
    }
};
