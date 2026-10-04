<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Each bill/coin denomination row in a physical cash count.
     * subtotal = denomination × quantity  (auto-computed in model boot)
     *
     * Philippine peso denominations:
     *   Bills: 1000, 500, 200, 100, 50, 20
     *   Coins: 20, 10, 5, 1, 0.25, 0.10, 0.05
     */
    public function up(): void
    {
        Schema::create('cash_count_denominations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cash_count_id')->constrained('cash_counts')->cascadeOnDelete();
            $table->decimal('denomination', 10, 2);       // face value e.g. 1000, 0.25
            $table->string('type', 10)->default('bill');  // bill|coin
            $table->integer('quantity')->default(0);
            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->timestamps();

            $table->unique(['cash_count_id', 'denomination']);
            $table->index('cash_count_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_count_denominations');
    }
};
