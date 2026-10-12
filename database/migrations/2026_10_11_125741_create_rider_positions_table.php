<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** The last GPS fix each rider's phone sent: one row per rider, overwritten every few seconds. */
    public function up(): void
    {
        Schema::create('rider_positions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->unsignedSmallInteger('accuracy_m')->nullable();
            $table->unsignedSmallInteger('heading')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rider_positions');
    }
};
