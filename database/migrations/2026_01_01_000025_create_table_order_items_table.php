<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * table_order_items — individual items ordered at a dine-in table.
     *
     * status:  pending → preparing → served | cancelled
     * kitchen_note: per-item special instructions ("no sugar", "extra rice")
     *
     * bundle_table_order_item_id:
     *   null = standalone item or bundle header
     *   set  = this row is a component inside a bundle (hidden on kitchen display)
     *
     * is_bundle_component:
     *   false = shown on kitchen display
     *   true  = stock deduction only, kitchen sees the header row
     */
    public function up(): void
    {
        Schema::create('table_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('table_order_id')->constrained('table_orders')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->foreignId('bundle_table_order_item_id')->nullable()->constrained('table_order_items')->nullOnDelete();
            $table->boolean('is_bundle_component')->default(false);
            $table->integer('quantity')->default(1);
            $table->decimal('price', 10, 2);
            $table->decimal('total', 12, 2);
            $table->string('status', 20)->default('pending');
            $table->text('kitchen_note')->nullable();
            $table->timestamps();

            $table->index('table_order_id');
            $table->index('status');
            $table->index('bundle_table_order_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('table_order_items');
    }
};
