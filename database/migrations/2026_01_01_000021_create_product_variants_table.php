<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * product_variants — size/color/flavor variations of a product.
     *
     * Examples:
     *   Product: "T-Shirt"
     *     Variant: size=S,  color=Red,   barcode=3000001, extra_price=0
     *     Variant: size=M,  color=Red,   barcode=3000002, extra_price=0
     *     Variant: size=L,  color=Blue,  barcode=3000003, extra_price=0
     *     Variant: size=XL, color=Blue,  barcode=3000004, extra_price=20
     *
     *   Product: "Milk Tea"
     *     Variant: size=Small  (12oz), extra_price=0
     *     Variant: size=Medium (16oz), extra_price=15
     *     Variant: size=Large  (22oz), extra_price=30
     *
     * extra_price = additional cost ON TOP of the base product price.
     * stock and pricing are tracked per variant per branch in product_variant_stocks.
     *
     * is_available = soft on/off toggle without deleting the variant.
     */
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('name');               // e.g. "Large / Blue" or "XL"
            $table->string('sku', 100)->nullable()->unique(); // optional internal SKU
            $table->string('barcode', 100)->nullable()->unique();
            $table->json('attributes')->nullable(); // {"size":"L","color":"Blue","flavor":"Matcha"}
            $table->decimal('extra_price', 8, 2)->default(0.00); // added on top of base price
            $table->boolean('is_available')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('product_id');
            $table->index('is_available');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
