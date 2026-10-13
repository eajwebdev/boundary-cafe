<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ingredient calculations become a setting, off by default (the owner asked to remove them):
     * made-to-order items then no longer deduct recipe ingredients. Each sale line records whether
     * its ingredients were deducted, so voiding a sale restores exactly what was taken.
     */
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            // null = sold before this setting existed (ingredients were always deducted then).
            $table->boolean('ingredients_deducted')->nullable()->after('unit_cost');
        });

        if (! DB::table('system_settings')->whereNull('branch_id')->where('key', 'inventory.ingredient_tracking')->exists()) {
            DB::table('system_settings')->insert([
                'branch_id' => null,
                'key' => 'inventory.ingredient_tracking',
                'value' => 'false',
                'type' => 'boolean',
                'group' => 'inventory',
                'label' => 'Ingredient calculations (recipes)',
                'description' => 'On: made-to-order items deduct their recipe ingredients and show as sold out when an ingredient runs out. Off: they are always available; only counted items (e.g. cakes) track stock.',
                'is_public' => false,
                'is_readonly' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // The online ordering master switches are now also shown in System Settings.
        DB::table('system_settings')->whereNull('branch_id')->where('key', 'online.enabled')->update([
            'label' => 'Accept online orders',
            'description' => 'Off: customers can still browse the menu online but cannot place orders.',
        ]);
        DB::table('system_settings')->whereNull('branch_id')->where('key', 'online.delivery_enabled')->update([
            'label' => 'Offer delivery',
            'description' => 'Off: online customers can only order takeout or dine-in.',
        ]);
    }

    public function down(): void
    {
        DB::table('system_settings')->whereNull('branch_id')->where('key', 'online.enabled')->update(['description' => null]);
        DB::table('system_settings')->whereNull('branch_id')->where('key', 'online.delivery_enabled')->update(['description' => null]);

        DB::table('system_settings')->where('key', 'inventory.ingredient_tracking')->delete();

        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('ingredients_deducted');
        });
    }
};
