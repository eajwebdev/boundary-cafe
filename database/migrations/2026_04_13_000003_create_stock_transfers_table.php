<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_transfers', function (Blueprint $table) {
            $table->id();
            $table->string('transfer_number')->unique();
            // from location
            $table->string('from_type');          // 'branch' | 'warehouse'
            $table->unsignedBigInteger('from_id');
            // to location
            $table->string('to_type');            // 'branch' | 'warehouse'
            $table->unsignedBigInteger('to_id');
            // what & how much
            $table->foreignId('product_id')->constrained();
            $table->decimal('quantity', 12, 3);
            // status workflow: pending → completed | cancelled
            $table->string('status')->default('pending');
            $table->text('notes')->nullable();
            // tracking
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['from_type', 'from_id']);
            $table->index(['to_type',   'to_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_transfers');
    }
};
