<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Member numbers become C-0001, C-0002 … in the order customers joined. Loyalty QR codes use the
     * separate loyalty token, so existing cards keep scanning; only the typed member number changes.
     */
    public function up(): void
    {
        $ids = DB::table('customers')->orderBy('id')->pluck('id');

        // Two passes so a new number never collides with an old one on the unique index.
        foreach ($ids as $id) {
            DB::table('customers')->where('id', $id)->update(['customer_number' => "TMP-{$id}"]);
        }
        foreach ($ids->values() as $position => $id) {
            DB::table('customers')->where('id', $id)->update(['customer_number' => 'C-'.str_pad((string) ($position + 1), 4, '0', STR_PAD_LEFT)]);
        }
    }

    /** The old random numbers cannot be restored; customers keep their C- numbers. */
    public function down(): void {}
};
