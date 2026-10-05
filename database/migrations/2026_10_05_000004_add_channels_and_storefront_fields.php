<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Promos can now be shown on the customer storefront and limited to a channel.
        Schema::table('promos', function (Blueprint $table) {
            $table->boolean('show_on_storefront')->default(false)->after('is_active');
            $table->string('banner_image')->nullable()->after('show_on_storefront');
            $table->string('channels', 10)->default('both')->after('banner_image'); // pos | online | both
        });

        // Every sale records the channel it came from so reports can split them.
        Schema::table('sales', function (Blueprint $table) {
            $table->string('channel', 20)->default('counter')->after('branch_id'); // counter | dine_in | online
            $table->decimal('delivery_fee', 10, 2)->default(0)->after('discount_amount');
            $table->decimal('vat_amount', 12, 2)->default(0)->after('delivery_fee');
            $table->index(['channel', 'created_at']);
        });

        DB::table('sales')->whereNotNull('table_order_id')->update(['channel' => 'dine_in']);

        // Waiters can attach a loyalty member to a table order.
        Schema::table('table_orders', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
            $table->timestamp('sent_to_cashier_at')->nullable()->after('opened_at');
            $table->string('void_reason', 255)->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('table_orders', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
            $table->dropColumn(['customer_id', 'sent_to_cashier_at', 'void_reason']);
        });
        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['channel', 'created_at']);
            $table->dropColumn(['channel', 'delivery_fee', 'vat_amount']);
        });
        Schema::table('promos', function (Blueprint $table) {
            $table->dropColumn(['show_on_storefront', 'banner_image', 'channels']);
        });
    }
};
