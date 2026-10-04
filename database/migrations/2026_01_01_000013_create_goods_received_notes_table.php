<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * GRN = Goods Received Note.
     * Created when a branch physically receives stock from a supplier.
     * Stock is added to product_stocks ONLY when GRN is confirmed.
     * Supports partial deliveries (one order → many GRNs).
     *
     * branch_id   = branch RECEIVING goods
     * supplier_id = supplier who DELIVERED
     * order_id    = linked PO (nullable for walk-in / unplanned purchases)
     */
    public function up(): void
    {
        Schema::create('goods_received_notes', function (Blueprint $table) {
            $table->id();
            $table->string('grn_number')->unique();        // GRN-2026-000001
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('received_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('draft');         // draft|confirmed|cancelled
            $table->string('delivery_type', 20)->default('full');   // full|partial
            $table->string('delivery_reference')->nullable();        // supplier DR/SI number
            $table->date('received_date');
            $table->text('notes')->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index('order_id');
            $table->index('received_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_received_notes');
    }
};
