<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('customer_number', 24)->nullable()->unique()->after('id');
            $table->uuid('loyalty_token')->nullable()->unique()->after('customer_number');
            $table->boolean('loyalty_enabled')->default(true)->after('loyalty_token');
            $table->unsignedBigInteger('loyalty_points')->default(0)->after('loyalty_enabled');
            $table->unsignedBigInteger('lifetime_points_earned')->default(0)->after('loyalty_points');
            $table->unsignedBigInteger('lifetime_points_redeemed')->default(0)->after('lifetime_points_earned');
            $table->date('joined_at')->nullable()->after('lifetime_points_redeemed');
            $table->date('birthday')->nullable()->after('joined_at');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->unsignedBigInteger('loyalty_points_earned')->default(0)->after('discount_amount');
            $table->unsignedBigInteger('loyalty_points_redeemed')->default(0)->after('loyalty_points_earned');
            $table->decimal('loyalty_discount', 12, 2)->default(0)->after('loyalty_points_redeemed');
        });

        Schema::create('loyalty_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 30);
            $table->bigInteger('points');
            $table->unsignedBigInteger('balance_after');
            $table->string('reason')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'created_at']);
            $table->index(['branch_id', 'created_at']);
            $table->unique(['sale_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_transactions');
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['loyalty_points_earned', 'loyalty_points_redeemed', 'loyalty_discount']);
        });
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'customer_number', 'loyalty_token', 'loyalty_enabled', 'loyalty_points',
                'lifetime_points_earned', 'lifetime_points_redeemed', 'joined_at', 'birthday',
            ]);
        });
    }
};
