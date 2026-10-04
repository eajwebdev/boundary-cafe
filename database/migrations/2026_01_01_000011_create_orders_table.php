<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Purchase orders: a branch buys from a supplier.
     *
     * branch_id   = the branch placing / receiving the order (buyer)
     * supplier_id = the external supplier being ordered from (seller)
     *
     * received_status tracks GRN fulfilment:
     *   pending  = nothing received yet
     *   partial  = some items received
     *   complete = all items received
     */
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number')->unique();               // ORD-26-000001
            $table->string('pr_number', 50)->nullable();            // Purchase Request #
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->string('order_type', 30)->nullable();           // pickup|delivery
            $table->string('payment_method', 30)->nullable();       // cod|consignment|cash
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('total', 12, 2)->default(0.00);
            $table->string('status', 30)->default('pending');       // pending|confirmed|shipped|delivered|cancelled
            $table->string('received_status', 20)->default('pending'); // pending|partial|complete
            $table->timestamp('fully_received_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('supplier_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
