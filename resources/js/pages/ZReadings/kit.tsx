import { Banknote, LayoutGrid, Trophy } from 'lucide-react';

import { Line, Panel, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';

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
    cash_sales?: number;
    paid_out?: number;
    expected_cash: number;
    counted_cash: number;
    over_short: number;
}

export interface PayoutLine {
    time: string | null;
    description: string;
    category: string | null;
    cashier: string | null;
    amount: number;
}

export interface ItemLine {
    name: string;
    quantity: number;
    amount: number;
}

export interface CategoryLine {
    category: string;
    quantity: number;
    amount: number;
}

export interface ZFigures {
    first_receipt: string | null;
    last_receipt: string | null;
    transaction_count: number;
    items_sold: number;
    gross_sales: number;
    discount_total: number;
    senior_pwd_discount: number;
    promo_discount: number;
    manual_discount: number;
    loyalty_discount_total: number;
    net_sales: number;
    delivery_fees: number;
    service_charge_total: number;
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
    cash_sales: number;
    cash_paid_out: number;
    expected_cash: number;
    counted_cash: number;
    over_short: number;
    payments: PaymentLine[];
    channels: ChannelLine[];
    sessions: SessionLine[];
    /** Readings saved before these were tracked have null here. */
    payouts: PayoutLine[] | null;
    top_items: ItemLine[] | null;
    categories: CategoryLine[] | null;
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

function qty(value: number): string {
    return value.toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

/** Discount lines under gross sales: each kind on its own line so the owner sees where money was given away. */
export function DiscountLines({ figures }: { figures: ZFigures }) {
    const kinds: [string, number][] = [
        ['Senior / PWD discount', figures.senior_pwd_discount],
        ['Promo discounts', figures.promo_discount],
        ['Other discounts', figures.manual_discount],
        ['Loyalty points used', figures.loyalty_discount_total],
    ];
    const shown = kinds.filter(([, amount]) => amount > 0);

    return shown.length === 0 ? (
        <Line label="Less discounts" value={peso(0)} />
    ) : (
        <>
            {shown.map(([label, amount]) => (
                <Line key={label} label={`Less ${label.toLowerCase()}`} value={`−${peso(amount)}`} />
            ))}
        </>
    );
}

/** The drawer worked out line by line: opening + cash sales − cash paid out = expected, then counted and over/short. */
export function DrawerPanel({ figures, className }: { figures: ZFigures; className?: string }) {
    const payouts = figures.payouts ?? [];
    const closed = figures.sessions.length > 0 && figures.sessions.every((s) => s.status !== 'open');

    return (
        <Panel icon={Banknote} title="Cash drawer" className={className}>
            {figures.sessions.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No cash sessions on this day.</p>
            ) : (
                <div>
                    <Line label="Opening cash" value={peso(figures.opening_cash)} />
                    <Line label="+ Cash sales" value={peso(figures.cash_sales)} />
                    <Line label="− Cash paid out" value={figures.cash_paid_out > 0 ? `−${peso(figures.cash_paid_out)}` : peso(0)} />
                    <Line strong label="= Expected in drawer" value={peso(figures.expected_cash)} />
                    {closed && (
                        <>
                            <Line label="Counted" value={peso(figures.counted_cash)} />
                            <Line
                                strong
                                label="Over / short"
                                value={overShortLabel(figures.over_short)}
                                tone={Math.abs(figures.over_short) < 0.005 ? 'success' : figures.over_short > 0 ? 'warning' : 'danger'}
                            />
                        </>
                    )}
                    {payouts.length > 0 && (
                        <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2">
                            <p className="mb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">Paid out ({payouts.length})</p>
                            {payouts.map((payout, i) => (
                                <div key={i} className="flex items-start justify-between gap-3 py-1 text-sm">
                                    <span className="min-w-0">
                                        <span className="block truncate font-medium">{payout.description}</span>
                                        <span className="block text-[11px] text-muted-foreground">
                                            {[payout.time ? fmtDate(payout.time, 'h:mm a') : null, payout.category, payout.cashier]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 tabular-nums">−{peso(payout.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </Panel>
    );
}

/** Best sellers of the day. */
export function TopItemsPanel({ items, className }: { items: ItemLine[] | null; className?: string }) {
    const rows = items ?? [];
    return (
        <Panel flush icon={Trophy} title="Top items" className={className}>
            {rows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No items sold.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead className="border-b border-border">
                        <tr>
                            <th className={thCls}>Item</th>
                            <th className={cn(thCls, 'text-right')}>Qty</th>
                            <th className={cn(thCls, 'text-right')}>Sales</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map((row, i) => (
                            <tr key={row.name}>
                                <td className="px-4 py-2">
                                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                                        {i + 1}
                                    </span>
                                    {row.name}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">{qty(row.quantity)}</td>
                                <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(row.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Panel>
    );
}

/** Sales by menu category, with each category's share of the day. */
export function CategoriesPanel({ categories, className }: { categories: CategoryLine[] | null; className?: string }) {
    const rows = categories ?? [];
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return (
        <Panel icon={LayoutGrid} title="Sales by category" className={className}>
            {rows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No items sold.</p>
            ) : (
                <div className="space-y-2.5">
                    {rows.map((row) => {
                        const share = total > 0 ? (row.amount / total) * 100 : 0;
                        return (
                            <div key={row.category}>
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="font-medium">
                                        {row.category} <span className="text-xs text-muted-foreground">· {qty(row.quantity)} sold</span>
                                    </span>
                                    <span className="tabular-nums">{peso(row.amount)}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
