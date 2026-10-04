<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_count_items', function (Blueprint $table) {
            // 'product' or 'ingredient'
            $table->string('item_type', 20)->default('product')->after('category_name');
            $table->index(['session_id', 'item_type']);
        });
    }

    public function down(): void
    {
        Schema::table('stock_count_items', function (Blueprint $table) {
            $table->dropIndex(['session_id', 'item_type']);
            $table->dropColumn('item_type');
        });
    }
};
