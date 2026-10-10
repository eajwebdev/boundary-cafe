<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Keep each sale's discounts apart (manual % vs promo, and whether the manual one was Senior/PWD)
     * and its service charge, so the Z-reading can show them on their own lines.
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('manual_discount', 12, 2)->default(0)->after('discount_amount');
            $table->decimal('promo_discount', 12, 2)->default(0)->after('manual_discount');
            $table->string('discount_type', 20)->nullable()->after('promo_discount');
            $table->decimal('service_charge', 12, 2)->default(0)->after('vat_amount');
        });

        // Older sales: read the split back from the notes the POS wrote ("Discount 20% (−₱40.00) | Promo X: −₱72.50 | Service charge: ₱25.00").
        DB::table('sales')
            ->where(fn ($query) => $query->where('discount_amount', '>', 0)->orWhere('notes', 'like', '%Service charge:%'))
            ->orderBy('id')
            ->chunkById(500, function ($sales) {
                foreach ($sales as $sale) {
                    $notes = (string) $sale->notes;
                    $discount = (float) $sale->discount_amount;
                    $amount = fn (string $pattern) => preg_match($pattern, $notes, $m) ? (float) str_replace(',', '', $m[1]) : null;

                    $promo = $sale->channel === 'online'
                        ? $discount
                        : ($amount('/Promo [^|]*?: −₱([\d,.]+)/u') ?? ($sale->promo_id ? $discount : 0.0));
                    $promo = min($promo, $discount);

                    DB::table('sales')->where('id', $sale->id)->update([
                        'promo_discount' => $promo,
                        'manual_discount' => round($discount - $promo, 2),
                        'discount_type' => $discount - $promo > 0 ? 'manual' : null,
                        'service_charge' => $amount('/Service charge: ₱([\d,.]+)/u') ?? 0,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['manual_discount', 'promo_discount', 'discount_type', 'service_charge']);
        });
    }
};
