<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Product rewards: customers spend points on menu items (e.g. Boundary Burger = 50 pts)
     * and claim them in-store with a single-use QR.
     *
     * loyalty_rewards              — the catalog (a POS product + its points cost)
     * loyalty_reward_claims        — a customer's claim; points are held while it is "reserved"
     *                                status: reserved | redeemed | cancelled | expired | voided
     * loyalty_reward_claim_items   — snapshot of what was claimed
     *
     * Earning switches from "₱X per point" to "every ₱X spent = N points"; the old
     * spend_per_point setting is carried over as ₱X = 1 point so nothing changes until
     * the owners update it.
     */
    public function up(): void
    {
        Schema::create('loyalty_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->unsignedInteger('points_cost');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('max_per_claim')->nullable();
            $table->json('branch_ids')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('loyalty_reward_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('code', 12)->unique();
            $table->string('token_hash', 64)->unique();
            $table->text('token');
            $table->string('status', 20)->default('reserved');
            $table->unsignedInteger('points');
            $table->decimal('retail_value', 12, 2)->default(0);
            $table->decimal('cost_value', 12, 2)->default(0);
            $table->timestamp('expires_at');
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('redeemed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->index(['customer_id', 'status']);
            $table->index(['branch_id', 'redeemed_at']);
        });

        Schema::create('loyalty_reward_claim_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loyalty_reward_claim_id')->constrained()->cascadeOnDelete();
            $table->foreignId('loyalty_reward_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('product_name');
            $table->unsignedInteger('quantity');
            $table->unsignedInteger('points_each');
            $table->unsignedInteger('points_total');
            $table->timestamps();
        });

        Schema::table('loyalty_transactions', function (Blueprint $table) {
            $table->foreignId('reward_claim_id')->nullable()->after('sale_id')->constrained('loyalty_reward_claims')->nullOnDelete();
            $table->json('meta')->nullable()->after('reason');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->boolean('is_reward')->default(false)->after('is_bundle_component');
            $table->unsignedInteger('reward_points')->default(0)->after('is_reward');
            $table->decimal('retail_price', 10, 2)->nullable()->after('reward_points');
            $table->decimal('unit_cost', 10, 2)->nullable()->after('retail_price');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('reward_retail_value', 12, 2)->default(0)->after('loyalty_discount');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->unsignedBigInteger('reserved_points')->default(0)->after('loyalty_points');
            $table->date('rewards_popup_seen_on')->nullable()->after('last_login_at');
        });

        $this->carryOverEarningRule();
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['reserved_points', 'rewards_popup_seen_on']);
        });
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('reward_retail_value');
        });
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn(['is_reward', 'reward_points', 'retail_price', 'unit_cost']);
        });
        Schema::table('loyalty_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reward_claim_id');
            $table->dropColumn('meta');
        });
        Schema::dropIfExists('loyalty_reward_claim_items');
        Schema::dropIfExists('loyalty_reward_claims');
        Schema::dropIfExists('loyalty_rewards');
    }

    /** Existing installs keep earning exactly as before: "₱X per point" becomes "every ₱X = 1 point". */
    private function carryOverEarningRule(): void
    {
        DB::table('system_settings')->where('key', 'loyalty.spend_per_point')->get()
            ->each(function ($row) {
                $exists = DB::table('system_settings')->where('key', 'loyalty.spend_increment')->where('branch_id', $row->branch_id)->exists();
                if ($exists) {
                    return;
                }
                $now = now();
                DB::table('system_settings')->insert([
                    ['key' => 'loyalty.spend_increment', 'branch_id' => $row->branch_id, 'value' => $row->value, 'type' => 'decimal', 'group' => 'loyalty', 'label' => 'Spend increment', 'created_at' => $now, 'updated_at' => $now],
                    ['key' => 'loyalty.points_per_increment', 'branch_id' => $row->branch_id, 'value' => '1', 'type' => 'integer', 'group' => 'loyalty', 'label' => 'Points per increment', 'created_at' => $now, 'updated_at' => $now],
                ]);
            });
    }
};
