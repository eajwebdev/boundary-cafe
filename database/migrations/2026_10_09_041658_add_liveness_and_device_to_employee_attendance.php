<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each employee clocks in from one registered phone (set on their first accepted punch).
        Schema::table('employees', function (Blueprint $table) {
            $table->string('device_token_hash', 64)->nullable()->after('face_enrolled_at');   // sha256 of the phone's cookie
            $table->timestamp('device_registered_at')->nullable()->after('device_token_hash');
        });

        // What the live face check measured on each punch (challenge steps, head turn, mouth, camera).
        Schema::table('employee_attendances', function (Blueprint $table) {
            $table->json('liveness')->nullable()->after('face_distance');
        });
    }

    public function down(): void
    {
        Schema::table('employee_attendances', function (Blueprint $table) {
            $table->dropColumn('liveness');
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['device_token_hash', 'device_registered_at']);
        });
    }
};
