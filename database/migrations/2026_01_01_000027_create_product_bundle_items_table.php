<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * product_bundle_items — each component product inside a bundle.
     *
     * Example: "Gaming PC Build" bundle has:
     *   component_product_id = Intel Core i5-14400F,  quantity = 1, is_required = true
     *   component_product_id = RTX 4060 8GB,          quantity = 1, is_required = true
     *   component_product_id = 16GB DDR5 RAM,         quantity = 2, is_required = true
     *   component_product_id = 1TB NVMe SSD,          quantity = 1, is_required = true
     *   component_product_id = ATX Mid Tower Case,    quantity = 1, is_required = true
     *   component_product_id = 650W PSU Bronze,       quantity = 1, is_required = true
     *   component_product_id = Thermal Paste,         quantity = 1, is_required = false (optional add-on)
     *
     * is_required:
     *   true  = always included in the bundle, stock always deducted
     *   false = optional component, customer can include or exclude
     *
     * override_price:
     *   If set, use this price for this component instead of its current stock price.
     *   Useful for locking in a price when the bundle was configured.
     *   null = always use the component's current branch stock price.
     */
    public function up(): void
    {
        Schema::create('product_bundle_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_bundle_id')
                ->constrained('product_bundles')
                ->cascadeOnDelete();
            $table->foreignId('component_product_id')
                ->constrained('products')
                ->cascadeOnDelete();
            $table->foreignId('component_variant_id')
                ->nullable()
                ->constrained('product_variants')
                ->nullOnDelete();
            $table->integer('quantity')->default(1);
            $table->decimal('override_price', 10, 2)->nullable(); // null = use live stock price
            $table->boolean('is_required')->default(true);
            $table->text('notes')->nullable(); // e.g. "Slot 1 & 2 for dual channel"
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('product_bundle_id');
            $table->index('component_product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_bundle_items');
    }
};
