<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable()->after('table_order_id')->constrained('customers')->nullOnDelete();
            $table->decimal('amount_paid', 12, 2)->default(0)->after('payment_amount');
            $table->decimal('balance_due', 12, 2)->default(0)->after('amount_paid');
            $table->string('payment_status', 20)->default('paid')->after('balance_due');
            $table->date('due_date')->nullable()->after('payment_status');
            $table->text('credit_notes')->nullable()->after('due_date');

            $table->index(['customer_id', 'payment_status']);
            $table->index('due_date');
        });

        DB::table('sales')->orderBy('id')->chunkById(500, function ($sales) {
            foreach ($sales as $sale) {
                $amountPaid = $sale->payment_method === 'installment'
                    ? min((float) $sale->payment_amount, (float) $sale->total)
                    : (float) $sale->total;

                $balance = max(0, round((float) $sale->total - $amountPaid, 2));

                DB::table('sales')->where('id', $sale->id)->update([
                    'amount_paid'    => $amountPaid,
                    'balance_due'    => $balance,
                    'payment_status' => $balance > 0 ? ($amountPaid > 0 ? 'partial' : 'unpaid') : 'paid',
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
            $table->dropIndex(['customer_id', 'payment_status']);
            $table->dropIndex(['due_date']);
            $table->dropColumn(['customer_id', 'amount_paid', 'balance_due', 'payment_status', 'due_date', 'credit_notes']);
        });
    }
};
