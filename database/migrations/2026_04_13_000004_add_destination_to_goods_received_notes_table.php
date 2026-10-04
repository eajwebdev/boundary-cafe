<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            // 'branch' or 'warehouse'
            $table->string('dest_type')->default('branch')->after('branch_id');
            // The branch_id or warehouse_id the stock should go into
            $table->unsignedBigInteger('dest_id')->nullable()->after('dest_type');
        });

        // Back-fill existing rows: dest mirrors branch_id
        \DB::statement('UPDATE goods_received_notes SET dest_id = branch_id WHERE dest_id IS NULL');
    }

    public function down(): void
    {
        Schema::table('goods_received_notes', function (Blueprint $table) {
            $table->dropColumn(['dest_type', 'dest_id']);
        });
    }
};
