<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * product_variant_stocks — stock, pricing and expiry per variant per branch.
     *
     * Mirrors product_stocks but for specific product variants.
     * When a product has variants, stock is tracked here rather than product_stocks.
     *
     * price = capital × (1 + markup/100) + variant.extra_price
     * Auto-computed in ProductVariantStock::booted() saving hook.
     */
    public function up(): void
    {
        Schema::create('product_variant_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->decimal('stock', 12, 3)->default(0.000);
            $table->decimal('capital', 10, 2)->default(0.00);
            $table->decimal('markup', 8, 2)->default(0.00);
            $table->decimal('price', 10, 2)->default(0.00);
            $table->date('expiry_date')->nullable();
            $table->string('batch_number', 100)->nullable();
            $table->integer('days_before_expiry_warning')->default(30);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['product_variant_id', 'branch_id']);
            $table->index('branch_id');
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variant_stocks');
    }
};
