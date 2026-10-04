<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Products are global (shared across all branches).
     * Stock, price, and capital are per-branch in product_stocks.
     *
     * product_type:
     *   standard      = regular product, deducts its own stock on sale
     *   made_to_order = assembled/cooked from ingredients (recipe system)
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('barcode')->unique()->nullable();
            $table->string('name');
            $table->string('unit', 20)->default('pc');
            $table->foreignId('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('product_img')->nullable();
            $table->string('product_type', 30)->default('standard'); // standard | made_to_order
            $table->timestamps();

            $table->index('category_id');
            $table->index('product_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
