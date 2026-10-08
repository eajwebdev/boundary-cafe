<?php

namespace App\Services\Reports;

/**
 * Human-readable names for stored codes, so screens and PDFs say the same thing.
 */
class ReportLabels
{
    private const PAYMENT_METHODS = [
        'cash' => 'Cash',
        'gcash' => 'GCash',
        'card' => 'Card',
        'bank' => 'Bank transfer',
        'others' => 'Others',
        'credit' => 'Charge / credit',
        'mixed' => 'Mixed',
        'installment' => 'Installment',
    ];

    private const CHANNELS = [
        'counter' => 'Counter / takeout',
        'dine_in' => 'Dine-in',
        'online' => 'Online orders',
    ];

    public static function paymentMethod(?string $code): string
    {
        return self::PAYMENT_METHODS[$code] ?? ucfirst(str_replace('_', ' ', (string) $code));
    }

    public static function channel(?string $code): string
    {
        return self::CHANNELS[$code ?: 'counter'] ?? ucfirst(str_replace('_', ' ', (string) $code));
    }

    /** "+₱20.00 over", "−₱15.00 short" or "Balanced". */
    public static function overShort(float $amount): string
    {
        if (abs($amount) < 0.005) {
            return 'Balanced';
        }

        return $amount > 0
            ? '+₱'.number_format($amount, 2).' over'
            : '−₱'.number_format(abs($amount), 2).' short';
    }

    /** "₱1,234.50", with a true minus sign for negatives. */
    public static function money(float $amount): string
    {
        return ($amount < 0 ? '−' : '').'₱'.number_format(abs($amount), 2);
    }

    /** Quantities without trailing zeros: 3, 2.5, 0.125. */
    public static function quantity(float $value): string
    {
        return rtrim(rtrim(number_format($value, 3), '0'), '.');
    }
}
