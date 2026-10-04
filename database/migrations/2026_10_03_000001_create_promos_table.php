<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promos', function (Blueprint $table) {
            $table->id();

            $table->string('name');                             // "Summer Sale", "Promo Set A"
            $table->string('code')->unique()->nullable();       // optional promo code e.g. "SUMMER20"
            $table->text('description')->nullable();

            // Discount type
            $table->enum('discount_type', ['percent', 'fixed'])->default('percent');
            $table->decimal('discount_value', 10, 2)->default(0); // % or ₱ amount

            // Scope — which products this promo applies to
            $table->enum('applies_to', ['all', 'specific_products', 'specific_categories'])
                  ->default('all');

            // Min purchase to qualify
            $table->decimal('minimum_purchase', 10, 2)->nullable();

            // Usage limits
            $table->unsignedInteger('max_uses')->nullable();       // null = unlimited
            $table->unsignedInteger('uses_count')->default(0);     // how many times used

            // Validity window
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();

            $table->boolean('is_active')->default(true);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // Pivot: promo ↔ products (when applies_to = specific_products)
        Schema::create('promo_products', function (Blueprint $table) {
            $table->foreignId('promo_id')->constrained('promos')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->primary(['promo_id', 'product_id']);
        });

        // Pivot: promo ↔ categories (when applies_to = specific_categories)
        Schema::create('promo_categories', function (Blueprint $table) {
            $table->foreignId('promo_id')->constrained('promos')->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->primary(['promo_id', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promo_categories');
        Schema::dropIfExists('promo_products');
        Schema::dropIfExists('promos');
    }
};
