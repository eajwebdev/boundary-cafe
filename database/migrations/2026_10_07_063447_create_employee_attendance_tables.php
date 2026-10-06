<?php

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Where a branch is, and how far from that point staff may clock in.
        Schema::table('branches', function (Blueprint $table) {
            $table->decimal('latitude', 10, 7)->nullable()->after('address');
            $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            $table->unsignedInteger('geofence_radius_m')->default(100)->after('longitude');
        });

        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('employee_code', 20)->unique();
            $table->string('first_name', 80);
            $table->string('last_name', 80)->nullable();
            $table->string('position', 80)->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('pin')->nullable();                       // hashed
            $table->mediumText('face_photo')->nullable();            // small JPEG data URL (≈10–30 KB)
            $table->json('face_descriptor')->nullable();             // 4–8 face samples, 128 numbers each
            $table->timestamp('face_enrolled_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['branch_id', 'is_active']);
        });

        Schema::create('employee_attendances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->string('type', 10);                              // in | out
            $table->string('status', 10);                            // accepted | rejected
            $table->string('reason')->nullable();                    // why a punch was rejected
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->unsignedInteger('accuracy_m')->nullable();
            $table->unsignedInteger('distance_m')->nullable();
            $table->decimal('face_distance', 5, 4)->nullable();     // 0 = identical face, lower is better
            $table->mediumText('photo')->nullable();                 // small JPEG data URL taken at the punch
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'created_at']);
            $table->index(['branch_id', 'created_at']);
        });

        // Existing staff (other than administrators) become employees too.
        User::whereNotIn('role', Employee::NON_EMPLOYEE_ROLES)->each(fn (User $user) => Employee::syncFromUser($user));
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_attendances');
        Schema::dropIfExists('employees');

        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn(['latitude', 'longitude', 'geofence_radius_m']);
        });
    }
};
