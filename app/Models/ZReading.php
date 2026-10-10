<?php

namespace App\Models;

use Database\Factories\ZReadingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * End-of-day Z-reading: a locked snapshot of one branch's sales for one
 * business day. Numbered sequentially per branch and never regenerated.
 */
class ZReading extends Model
{
    /** @use HasFactory<ZReadingFactory> */
    use HasFactory;

    protected $fillable = [
        'branch_id',
        'z_number',
        'business_date',
        'first_receipt',
        'last_receipt',
        'transaction_count',
        'items_sold',
        'gross_sales',
        'discount_total',
        'senior_pwd_discount',
        'promo_discount',
        'manual_discount',
        'loyalty_discount_total',
        'net_sales',
        'delivery_fees',
        'service_charge_total',
        'unpaid_total',
        'void_count',
        'void_amount',
        'vat_enabled',
        'vat_rate',
        'vatable_sales',
        'vat_amount',
        'vat_exempt_sales',
        'collections_total',
        'collections_count',
        'opening_cash',
        'cash_sales',
        'cash_paid_out',
        'expected_cash',
        'counted_cash',
        'over_short',
        'payments',
        'channels',
        'sessions',
        'payouts',
        'top_items',
        'categories',
        'previous_grand_total',
        'grand_total',
        'generated_by',
        'generated_at',
        'reprint_count',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'business_date' => 'date',
            'generated_at' => 'datetime',
            'z_number' => 'integer',
            'transaction_count' => 'integer',
            'void_count' => 'integer',
            'collections_count' => 'integer',
            'reprint_count' => 'integer',
            'vat_enabled' => 'boolean',
            'items_sold' => 'float',
            'gross_sales' => 'float',
            'discount_total' => 'float',
            'loyalty_discount_total' => 'float',
            'net_sales' => 'float',
            'delivery_fees' => 'float',
            'unpaid_total' => 'float',
            'void_amount' => 'float',
            'vat_rate' => 'float',
            'vatable_sales' => 'float',
            'vat_amount' => 'float',
            'vat_exempt_sales' => 'float',
            'collections_total' => 'float',
            'opening_cash' => 'float',
            'cash_sales' => 'float',
            'cash_paid_out' => 'float',
            'senior_pwd_discount' => 'float',
            'promo_discount' => 'float',
            'manual_discount' => 'float',
            'service_charge_total' => 'float',
            'expected_cash' => 'float',
            'counted_cash' => 'float',
            'over_short' => 'float',
            'previous_grand_total' => 'float',
            'grand_total' => 'float',
            'payments' => 'array',
            'channels' => 'array',
            'sessions' => 'array',
            'payouts' => 'array',
            'top_items' => 'array',
            'categories' => 'array',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    /** Whether the branch's business day has already been closed by a Z-reading. */
    public static function closesDay(int $branchId, Carbon|string $date): bool
    {
        return static::where('branch_id', $branchId)
            ->whereDate('business_date', Carbon::parse($date)->toDateString())
            ->exists();
    }
}
