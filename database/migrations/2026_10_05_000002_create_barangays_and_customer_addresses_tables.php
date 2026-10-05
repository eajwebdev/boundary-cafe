<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Barangays the online store can deliver to. Admins toggle is_deliverable
        // from the Delivery Zone page (menu 43).
        Schema::create('barangays', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80);
            $table->string('municipality', 80)->default('Mabinay');
            $table->string('province', 80)->default('Negros Oriental');
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->boolean('is_deliverable')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['municipality', 'name']);
        });

        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('label', 30)->default('Home');           // Home | Work | Other
            $table->string('barangay', 80);
            $table->string('street', 191)->nullable();              // street / purok / sitio
            $table->string('landmark', 191)->nullable();
            $table->string('notes_for_rider', 255)->nullable();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->string('formatted_address', 255)->nullable();   // reverse-geocoded text
            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->index(['customer_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_addresses');
        Schema::dropIfExists('barangays');
    }
};
