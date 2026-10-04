<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('installment_plans', function (Blueprint $table) {
            // Financing provider: Home Credit, Skyro, or Other
            $table->enum('provider', ['home_credit', 'skyro', 'other'])
                  ->default('other')
                  ->after('user_id');

            // Application / reference number from the financing company (optional)
            $table->string('reference_number')->nullable()->after('provider');

            // Make down_payment default to 0 (no-DP is valid for financing)
            $table->decimal('down_payment', 12, 2)->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('installment_plans', function (Blueprint $table) {
            $table->dropColumn(['provider', 'reference_number']);
            $table->decimal('down_payment', 12, 2)->change();
        });
    }
};
