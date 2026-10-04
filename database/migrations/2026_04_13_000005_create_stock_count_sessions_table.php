<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_count_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->foreignId('counted_by')->constrained('users')->cascadeOnDelete();
            $table->text('note')->nullable();
            $table->unsignedInteger('items_counted')->default(0);    // total items on the sheet
            $table->unsignedInteger('items_adjusted')->default(0);   // items where variance != 0
            $table->json('snapshot');   // [{product_id, product_name, system_qty, counted_qty, delta}]
            $table->timestamp('committed_at')->nullable();
            $table->timestamps();

            $table->index(['branch_id', 'committed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_count_sessions');
    }
};
