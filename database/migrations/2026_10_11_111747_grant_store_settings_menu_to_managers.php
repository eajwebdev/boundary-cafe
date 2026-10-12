<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Managers with a saved access list get the new Store Settings menu (48) so they can close the
     * store for the day. Managers without one already get it from the role defaults.
     */
    public function up(): void
    {
        DB::table('users')->where('role', 'manager')->whereNotNull('access')->get(['id', 'access'])
            ->each(function (object $user): void {
                $access = json_decode((string) $user->access, true) ?: [];

                if ($access === [] || in_array('48', $access, true)) {
                    return;
                }

                $access[] = '48';
                DB::table('users')->where('id', $user->id)->update(['access' => json_encode(array_values($access))]);
            });
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'manager')->whereNotNull('access')->get(['id', 'access'])
            ->each(function (object $user): void {
                $access = json_decode((string) $user->access, true) ?: [];

                DB::table('users')->where('id', $user->id)->update(['access' => json_encode(array_values(array_diff($access, ['48'])))]);
            });
    }
};
