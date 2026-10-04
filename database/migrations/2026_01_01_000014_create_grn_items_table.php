<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * grn_items — individual product lines within a Goods Received Note.
     *
     * accepted_qty = received_qty - rejected_qty (auto-computed in GrnItem::booted())
     * line_total   = received_qty × unit_cost    (auto-computed in GrnItem::booted())
     *
     * Stock is incremented by accepted_qty when the GRN is confirmed.
     *
     * expiry_date and batch_number are recorded at delivery time.
     * Used by pharmacy and food businesses (use_expiry_tracking = true).
     */
    public function up(): void
    {
        Schema::create('grn_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('goods_received_note_id')->constrained('goods_received_notes')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('ordered_qty', 12, 3)->default(0.000);
            $table->decimal('received_qty', 12, 3)->default(0.000);
            $table->decimal('rejected_qty', 12, 3)->default(0.000);
            $table->decimal('accepted_qty', 12, 3)->default(0.000);
            $table->decimal('unit_cost', 10, 2)->default(0.00);
            $table->decimal('line_total', 12, 2)->default(0.00);
            $table->string('rejection_reason')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('batch_number', 100)->nullable();
            $table->timestamps();

            $table->index('goods_received_note_id');
            $table->index('product_id');
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('grn_items');
    }
};
