<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * system_settings — key-value configuration store.
     *
     * Supports two scopes:
     *   global  (branch_id = null) — applies to the whole system
     *   branch  (branch_id = X)    — overrides global for that branch
     *
     * Branch-level settings take precedence over global settings.
     * Controllers read via: Setting::get('receipt.show_logo', $branchId)
     *
     * Setting groups (key prefix):
     *   general.*      — business name, address, TIN, logo
     *   pos.*          — POS behavior (open drawer, require cash session, etc.)
     *   receipt.*      — receipt layout and content
     *   tax.*          — VAT, percentage service charge
     *   inventory.*    — low stock threshold, reorder points
     *   cash.*         — petty cash limit, cash count required on close
     *   notification.* — alert thresholds, email settings (future)
     *
     * value is always stored as string. Cast to the right type on read.
     * type column tells the UI how to render the field:
     *   string | boolean | integer | decimal | json | color | image | select
     */
    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')
                ->nullable()
                ->constrained('branches')
                ->cascadeOnDelete();
            $table->string('key');
            $table->text('value')->nullable();
            $table->string('type', 20)->default('string'); // string|boolean|integer|decimal|json|color|image|select
            $table->string('group', 50)->default('general');
            $table->string('label')->nullable();           // human-readable name for the settings UI
            $table->text('description')->nullable();
            $table->text('options')->nullable();           // JSON array for select type: ["cash","gcash","card"]
            $table->boolean('is_public')->default(false);  // if true, can be read by frontend without auth
            $table->boolean('is_readonly')->default(false);// if true, shown but not editable in UI
            $table->timestamps();

            $table->unique(['branch_id', 'key']);
            $table->index(['group', 'branch_id']);
            $table->index('key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_settings');
    }
};
