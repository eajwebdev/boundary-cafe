<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Daily missions: each day a random share of members gets one task valid only that day
     * (e.g. "Spend ₱260 today → +10 points"). The mission is copied onto the row when it is
     * handed out, so editing the mission list later never changes a mission already given.
     */
    public function up(): void
    {
        Schema::create('daily_missions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->date('mission_date');
            $table->string('type', 20);
            $table->decimal('target', 10, 2);
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('reward_points');
            $table->string('title');
            $table->string('status', 20)->default('active');
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->unique(['customer_id', 'mission_date']);
            $table->index(['mission_date', 'status']);
        });

        $settings = [
            [
                'key' => 'loyalty.missions_enabled', 'value' => 'true', 'type' => 'boolean',
                'label' => 'Daily missions', 'description' => 'Each day a random share of members gets one task valid only that day',
            ],
            [
                'key' => 'loyalty.missions_share', 'value' => '50', 'type' => 'integer',
                'label' => 'Members who get a mission each day (%)', 'description' => 'Picked at random every day',
            ],
            [
                'key' => 'loyalty.missions', 'value' => json_encode(self::DEFAULT_MISSIONS), 'type' => 'json',
                'label' => 'Mission list', 'description' => 'One is picked at random for each chosen member',
            ],
        ];
        foreach ($settings as $setting) {
            if (DB::table('system_settings')->whereNull('branch_id')->where('key', $setting['key'])->exists()) {
                continue;
            }
            DB::table('system_settings')->insert([
                ...$setting,
                'branch_id' => null,
                'group' => 'loyalty',
                'is_public' => false,
                'is_readonly' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('system_settings')->whereIn('key', ['loyalty.missions_enabled', 'loyalty.missions_share', 'loyalty.missions'])->delete();
        Schema::dropIfExists('daily_missions');
    }

    private const DEFAULT_MISSIONS = [
        ['type' => 'spend', 'target' => 260, 'points' => 10, 'category_id' => null],
        ['type' => 'spend', 'target' => 350, 'points' => 15, 'category_id' => null],
        ['type' => 'spend', 'target' => 500, 'points' => 25, 'category_id' => null],
        ['type' => 'items', 'target' => 3, 'points' => 10, 'category_id' => null],
        ['type' => 'items', 'target' => 5, 'points' => 20, 'category_id' => null],
    ];
};
