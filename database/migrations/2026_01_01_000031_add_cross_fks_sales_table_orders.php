<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds all deferred / circular foreign key constraints.
     *
     * This runs after ALL tables have been created.
     *
     * Includes:
     *   - sales ↔ table_orders (circular)
     *   - sale_items.product_variant_id
     *   - order_items.product_variant_id
     *   - sale_items.bundle_sale_item_id (self-referencing)
     */
    public function up(): void
    {
        // ── 1. Cross FKs between sales and table_orders ─────────────────────
        Schema::table('sales', function (Blueprint $table) {
            $table->foreign('table_order_id')
                  ->references('id')
                  ->on('table_orders')
                  ->nullOnDelete();
        });

        Schema::table('table_orders', function (Blueprint $table) {
            $table->foreign('sale_id')
                  ->references('id')
                  ->on('sales')
                  ->nullOnDelete();
        });

        // ── 2. sale_items FKs ───────────────────────────────────────────────
        Schema::table('sale_items', function (Blueprint $table) {
            $table->foreign('product_variant_id')
                  ->references('id')
                  ->on('product_variants')
                  ->nullOnDelete();

            $table->foreign('bundle_sale_item_id')
                  ->references('id')
                  ->on('sale_items')
                  ->nullOnDelete();
        });

        // ── 3. order_items FK ───────────────────────────────────────────────
        Schema::table('order_items', function (Blueprint $table) {
            $table->foreign('product_variant_id')
                  ->references('id')
                  ->on('product_variants')
                  ->nullOnDelete();
        });

        // ── 3. sessions FK ───────────────────────────────────────────────
        Schema::table('sessions', function (Blueprint $table) {
            $table->foreign('user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['product_variant_id']);
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropForeign(['product_variant_id']);
            $table->dropForeign(['bundle_sale_item_id']);
        });

        Schema::table('table_orders', function (Blueprint $table) {
            $table->dropForeign(['sale_id']);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropForeign(['table_order_id']);
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });
    }
};