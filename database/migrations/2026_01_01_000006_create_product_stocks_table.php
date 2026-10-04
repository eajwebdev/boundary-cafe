<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * product_stocks — stock, pricing and expiry per product per branch.
     *
     * Each branch has its OWN stock, capital, markup, price, and expiry
     * for every product. Unique constraint [product_id, branch_id] enforces
     * one record per branch per product.
     *
     * price is auto-computed: capital × (1 + markup / 100)
     * Enforced in ProductStock::booted() saving hook.
     *
     * expiry_date and batch_number are used by pharmacy and food businesses
     * when use_expiry_tracking = true on the branch.
     * days_before_expiry_warning controls when "Near Expiry" status appears.
     */
    public function up(): void
    {
        Schema::create('product_stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
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

            $table->unique(['product_id', 'branch_id']);
            $table->index('branch_id');
            $table->index('expiry_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_stocks');
    }
};
