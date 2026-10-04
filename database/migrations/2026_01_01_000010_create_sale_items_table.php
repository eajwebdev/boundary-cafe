<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * sale_items — individual product lines within a sale.
     *
     * product_variant_id: null if the product has no variants.
     *
     * bundle_sale_item_id: null for standalone items.
     *   Set to the parent sale_item.id when this row is a bundle component.
     *
     * is_bundle_component:
     *   false = visible line (standalone or bundle header)
     *   true  = hidden component row (stock deduction only)
     */
    public function up(): void
    {
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();

            // Parent sale
            $table->foreignId('sale_id')
                  ->constrained('sales')
                  ->cascadeOnDelete();

            // Product (nullable so we can keep history)
            $table->foreignId('product_id')
                  ->nullable()
                  ->constrained('products')
                  ->nullOnDelete();

            // Variant - DEFERRED FK (product_variants table is created later)
            $table->unsignedBigInteger('product_variant_id')->nullable();
            // Self-referencing bundle parent
            $table->unsignedBigInteger('bundle_sale_item_id')->nullable();

            $table->boolean('is_bundle_component')->default(false);

            $table->decimal('quantity', 12, 3)->default(1.000);
            $table->decimal('price', 10, 2);
            $table->decimal('total', 12, 2);

            $table->timestamps();

            // Indexes
            $table->index('sale_id');
            $table->index('product_id');
            $table->index('product_variant_id');
            $table->index('bundle_sale_item_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_items');
    }
};