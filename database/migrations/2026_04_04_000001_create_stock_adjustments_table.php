<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('recorded_by')->constrained('users')->cascadeOnDelete();
            $table->enum('type', ['damage', 'loss', 'expired', 'theft', 'correction', 'other']);
            $table->decimal('quantity', 12, 3);         // units removed/adjusted
            $table->decimal('unit_cost', 10, 2)->default(0); // capital at time of adjustment
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'created_at']);
            $table->index(['product_id', 'branch_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_adjustments');
    }
};
