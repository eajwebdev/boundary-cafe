<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Google / Facebook logins linked to a customer. One customer can link each provider once,
     * and a provider account can belong to only one customer — so no duplicate accounts.
     */
    public function up(): void
    {
        Schema::create('customer_social_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 20);
            $table->string('provider_user_id', 191);
            $table->string('email')->nullable();
            $table->string('name')->nullable();
            $table->string('avatar', 500)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'provider_user_id']);
            $table->unique(['customer_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_social_accounts');
    }
};
