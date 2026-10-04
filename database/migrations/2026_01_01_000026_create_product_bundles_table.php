<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * product_bundles — a named product that is assembled from
     * existing component products, each deducted from stock on sale.
     *
     * Difference from recipe_ingredients:
     *   recipe_ingredients = consumable ingredients (flour, milk, g/ml/pcs)
     *                        for made_to_order food/drinks
     *   product_bundles    = discrete component products, each retaining
     *                        its own identity, price, and stock
     *                        e.g. PC Build = CPU + GPU + RAM + SSD + Case
     *                             Gift Set  = Mug + Coffee + Cookies
     *                             Uniform Set = Polo + ID Lace + Pin
     *
     * The bundle product itself is product_type = 'bundle'.
     * Its selling price can be:
     *   'computed'  → sum of all component prices (± adjustment)
     *   'fixed'     → a set price regardless of components
     *
     * price_adjustment = flat amount added/subtracted from computed total
     *   positive = markup on top of sum  (e.g. bundling fee +₱500)
     *   negative = discount off the sum  (e.g. bundle discount -₱1000)
     */
    public function up(): void
    {
        Schema::create('product_bundles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')
                ->unique()
                ->constrained('products')
                ->cascadeOnDelete();
            $table->string('pricing_mode', 20)->default('computed'); // computed | fixed
            $table->decimal('price_adjustment', 10, 2)->default(0.00);
            $table->text('build_notes')->nullable(); // e.g. "Assemble before releasing"
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_bundles');
    }
};
