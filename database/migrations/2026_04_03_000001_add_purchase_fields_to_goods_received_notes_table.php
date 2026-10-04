<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->string('or_number')->nullable()->after('notes');
            $table->string('payment_method', 30)->nullable()->after('or_number'); // cash|credit|postdated_check
            $table->date('check_date')->nullable()->after('payment_method');
            $table->string('check_number')->nullable()->after('check_date');
            $table->timestamp('paid_at')->nullable()->after('check_number');
            $table->string('source', 20)->default('grn')->after('paid_at'); // grn|purchase

            $table->index('source');
            $table->index(['source', 'payment_method']);
        });
    }

    public function down(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->dropIndex(['source', 'payment_method']);
            $table->dropIndex(['source']);
            $table->dropColumn(['or_number', 'payment_method', 'check_date', 'check_number', 'paid_at', 'source']);
        });
    }
};
