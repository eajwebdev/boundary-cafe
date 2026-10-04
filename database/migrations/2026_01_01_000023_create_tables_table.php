<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * tables — physical tables in a dine-in restaurant or cafeteria.
     *
     * Each table belongs to a branch. Status tracks real-time availability.
     *
     * status:
     *   available  — empty, ready to seat
     *   occupied   — currently has an active table_order
     *   reserved   — booked ahead
     *   cleaning   — just vacated, being cleaned
     */
    public function up(): void
    {
        Schema::create('tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained('branches')->cascadeOnDelete();
            $table->string('table_number', 20);   // e.g. "T1", "T2", "VIP-1"
            $table->string('section')->nullable(); // e.g. "Indoor", "Outdoor", "VIP"
            $table->integer('capacity')->default(4);
            $table->string('status', 20)->default('available'); // available|occupied|reserved|cleaning
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['branch_id', 'table_number']);
            $table->index(['branch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tables');
    }
};
