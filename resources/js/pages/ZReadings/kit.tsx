import type { Tone } from '@/components/AdminKit';

/** Shared types and formatting for the Z-reading pages. */

export interface PaymentLine {
    method: string;
    count: number;
    amount: number;
}

export interface ChannelLine {
    channel: string;
    count: number;
    amount: number;
}

export interface SessionLine {
    id: number;
    session_number: string;
    cashier: string;
    status: 'open' | 'closed';
    opened_at: string | null;
    closed_at: string | null;
    opening_cash: number;
    expected_cash: number;
    counted_cash: number;
    over_short: number;
}

export interface ZFigures {
    first_receipt: string | null;
    last_receipt: string | null;
    transaction_count: number;
    items_sold: number;
    gross_sales: number;
    discount_total: number;
    loyalty_discount_total: number;
    net_sales: number;
    delivery_fees: number;
    unpaid_total: number;
    void_count: number;
    void_amount: number;
    vat_enabled: boolean;
    vat_rate: number;
    vatable_sales: number;
    vat_amount: number;
    vat_exempt_sales: number;
    collections_total: number;
    collections_count: number;
    opening_cash: number;
    expected_cash: number;
    counted_cash: number;
    over_short: number;
    payments: PaymentLine[];
    channels: ChannelLine[];
    sessions: SessionLine[];
}

export const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    card: 'Card',
    others: 'Others',
    credit: 'Charge / credit',
    mixed: 'Mixed',
    installment: 'Installment',
};

export const CHANNEL_LABELS: Record<string, string> = {
    counter: 'Counter / takeout',
    dine_in: 'Dine-in',
    online: 'Online orders',
};

export function peso(value: number): string {
    const sign = value < 0 ? '−' : '';
    return `${sign}₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "+₱20.00 over", "−₱15.00 short" or "Balanced". */
export function overShortLabel(value: number): string {
    if (Math.abs(value) < 0.005) {
        return 'Balanced';
    }
    return value > 0 ? `+${peso(value)} over` : `${peso(value)} short`;
}

export function overShortTone(value: number): Tone {
    if (Math.abs(value) < 0.005) {
        return 'success';
    }
    return value > 0 ? 'warning' : 'danger';
}

export function zLabel(zNumber: number): string {
    return `Z-${String(zNumber).padStart(4, '0')}`;
}
