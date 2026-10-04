<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Bill of Materials / Recipe table for made_to_order products.
     * Links a finished product to its raw ingredient products + quantities.
     *
     * Example: "1 Cup of Coffee" needs:
     *   ingredient_id = ground_coffee.id, quantity = 18, unit = g
     *   ingredient_id = water.id,          quantity = 200, unit = ml
     *   ingredient_id = sugar.id,           quantity = 5,  unit = g
     *
     * When sold, the system deducts each ingredient from the branch's stock.
     */
    public function up(): void
    {
        Schema::create('recipe_ingredients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('ingredient_id')->constrained('products')->cascadeOnDelete();
            $table->decimal('quantity', 10, 4);
            $table->string('unit', 20)->default('pcs'); // g,kg,ml,l,pcs,tsp,tbsp,cup,oz,lb,pinch
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'ingredient_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recipe_ingredients');
    }
};
