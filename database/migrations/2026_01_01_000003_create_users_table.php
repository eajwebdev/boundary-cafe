<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Roles:
     *   'super_admin'   — full system access, manages everything including suppliers/branches
     *   'administrator' — manages a specific branch: products, users, reports
     *   'manager'       — branch manager: approves expenses, verifies cash counts, views reports
     *   'cashier'       — POS only: sales, cash sessions, cash counts
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('fname');
            $table->string('lname');
            $table->string('username')->unique();
            $table->string('password');
            $table->string('role', 30)->default('cashier'); // super_admin|administrator|manager|cashier
            $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
            $table->json('access')->nullable(); // ["1","3","7"] menu IDs
            $table->string('pos_layout', 20)->default('grid');
            $table->rememberToken();
            $table->timestamps();

            $table->index('branch_id');
            $table->index('role');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
