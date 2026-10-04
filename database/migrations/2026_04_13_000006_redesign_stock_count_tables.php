<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop old simple table
        Schema::dropIfExists('stock_count_sessions');

        // Proper session table — snapshot taken at START, committed at end
        Schema::create('stock_count_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('name');                              // "Weekly Count – Apr 13"
            $table->enum('type', ['full', 'partial']);           // full = all products
            $table->enum('status', ['draft', 'committed', 'cancelled'])->default('draft');
            $table->text('note')->nullable();
            $table->foreignId('counted_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('committed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('items_total')->default(0);    // items on the sheet
            $table->unsignedInteger('items_counted')->default(0);  // items with a qty entered
            $table->unsignedInteger('items_adjusted')->default(0); // items where delta != 0
            $table->timestamp('committed_at')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index(['branch_id', 'committed_at']);
        });

        // Per-item rows — one row per product per session
        Schema::create('stock_count_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')
                  ->constrained('stock_count_sessions')
                  ->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('product_name');         // denormalised for audit
            $table->string('category_name')->nullable();
            $table->decimal('snapshot_qty', 12, 3)->default(0.000);    // qty at session start — FROZEN
            $table->decimal('unit_cost', 10, 2)->default(0); // capital at start
            $table->decimal('counted_qty', 12, 3)->nullable(); // null = not yet counted
            $table->timestamps();

            $table->unique(['session_id', 'product_id']);
            $table->index('session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_count_items');
        Schema::dropIfExists('stock_count_sessions');
    }
};
