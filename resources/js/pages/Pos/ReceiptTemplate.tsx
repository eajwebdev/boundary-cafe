'use client';

import { usePage } from '@inertiajs/react';
import { Printer, Download } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useLogoUrl } from '@/hooks/use-logo';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ReceiptSaleItem {
    product_name: string;
    variant_name: string | null;
    quantity: number;
    price: number;
    unit?: string;
    total?: number;
}

export interface ReceiptData {
    receipt_number: string;
    status: string;
    payment_method: string;
    payment_amount: number;
    amount_paid?: number;
    balance_due?: number;
    payment_status?: string;
    due_date?: string | null;
    change_amount: number;
    discount_amount: number;
    total: number;
    customer_name: string | null;
    notes: string | null;
    created_at: string;
    cashier: string;
    items: ReceiptSaleItem[];
    branch_name?: string;
    branch_code?: string;
    // Business-type & dine-in info
    table_label?: string | null;
    business_type?: string;
}

interface Props {
    sale: ReceiptData;
    currency?: string;
    showActions?: boolean;
    compact?: boolean;
    className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmtMoney = (n: number, symbol = '₱') => symbol + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtQty = (q: number) => {
    const num = Number(q);
    if (isNaN(num)) return '0';
    if (num % 1 === 0) return String(num);
    return parseFloat(num.toFixed(3)).toString();
};

const methodLabel: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    card: 'Card',
    others: 'Others',
    credit: 'Customer Credit',
    mixed: 'Partial Payment',
};

const businessFooter: Record<string, string> = {
    restaurant: 'Thank you for dining with us!',
    cafe: 'Thanks for visiting! See you again ☕',
    bar: 'Thanks for dropping by! Drink responsibly.',
    food_stall: 'Thank you! Come back soon 😊',
    bakery: 'Thanks for your order! Enjoy every bite 🥐',
    salon: 'Thank you! You look amazing ✨',
    laundry: 'Thank you! Your order is appreciated.',
    pharmacy: 'Thank you! Stay healthy 💊',
    retail: 'Thank you for shopping with us!',
    grocery: 'Thank you for shopping with us!',
    hardware: 'Thank you! Build something great 🔧',
    school: 'Thank you! Keep learning 🎓',
    warehouse: 'Thank you for your order!',
    mixed: 'Thank you for your purchase!',
};

// ─── ReceiptTemplate ─────────────────────────────────────────────────────────
export default function ReceiptTemplate({ sale, currency = '₱', showActions = true, compact = false, className }: Props) {
    const printRef = useRef<HTMLDivElement>(null);
    const settings =
        usePage<{
            settings?: { receipt_footer?: string; receipt_header?: string; show_cashier_on_receipt?: boolean; show_logo_on_receipt?: boolean } | null;
        }>().props.settings ?? {};
    const logoUrl = useLogoUrl();
    const showLogo = settings.show_logo_on_receipt ?? true;

    const subtotal = sale.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const isVoided = sale.status === 'voided';
    const isDineIn = !!sale.table_label;
    const footer = settings.receipt_footer || businessFooter[sale.business_type ?? ''] || 'Thank you for your purchase!';
    const header = settings.receipt_header || '';
    const paid = sale.amount_paid ?? sale.payment_amount;
    const balance = sale.balance_due ?? Math.max(0, sale.total - paid);
    /** What the customer handed over: the amount applied to the sale plus any change given back. */
    const tendered = paid + Math.max(0, sale.change_amount ?? 0);

    // ── Print ──────────────────────────────────────────────────────
    const handlePrint = () => {
        const content = printRef.current?.innerHTML;
        if (!content) return;
        const w = window.open('', '_blank', 'width=380,height=700,scrollbars=yes');
        if (!w) return;
        w.document.write(`<!DOCTYPE html><html><head>
            <title>Receipt — ${sale.receipt_number}</title>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 11px;
                    width: 300px;
                    margin: 0 auto;
                    padding: 12px 8px;
                    color: #000;
                }
                .center  { text-align: center; }
                .right   { text-align: right; }
                .bold    { font-weight: bold; }
                .large   { font-size: 14px; }
                .small   { font-size: 10px; }
                .muted   { color: #555; }
                .divider { border-top: 1px dashed #888; margin: 6px 0; }
                .logo    { display: block; width: 56px; height: 56px; object-fit: contain; margin: 0 auto 4px; }
                .row     { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
                .row .label { flex: 1; min-width: 0; }
                .row .val   { flex-shrink: 0; text-align: right; }
                .item-name  { margin-bottom: 1px; }
                .item-detail{ color: #555; padding-left: 8px; }
                .void-stamp {
                    border: 3px solid #000; color: #000;
                    text-align: center; font-size: 16px; font-weight: bold;
                    letter-spacing: 4px; padding: 4px 0; margin: 8px 0;
                }
                @media print {
                    body { width: 100%; }
                    .no-print { display: none; }
                }
            </style>
        </head><body>${content}</body></html>`);
        w.document.close();
        setTimeout(() => w.print(), 300);
    };

    // ── Download as text ───────────────────────────────────────────
    const handleDownload = () => {
        const lines: string[] = [];
        const pad = (l: string, r: string, width = 32) => {
            const space = width - l.length - r.length;
            return l + ' '.repeat(Math.max(1, space)) + r;
        };
        lines.push('================================');
        lines.push(sale.branch_name?.toUpperCase() ?? 'RECEIPT');
        if (sale.branch_code) lines.push(sale.branch_code);
        if (header) lines.push(header);
        lines.push('================================');
        lines.push(fmtDate(sale.created_at, 'MMM d, yyyy  h:mm a'));
        lines.push(`Receipt: ${sale.receipt_number}`);
        if (settings.show_cashier_on_receipt !== false) lines.push(`Cashier: ${sale.cashier}`);
        if (sale.customer_name) lines.push(`Customer: ${sale.customer_name}`);
        if (isDineIn) lines.push(`Table: ${sale.table_label}`);
        lines.push('--------------------------------');
        sale.items.forEach((i) => {
            lines.push(`${i.product_name}${i.variant_name ? ` (${i.variant_name})` : ''}`);
            const unitLabel = i.unit ? ` ${i.unit}` : '';
            lines.push(pad(`  ${fmtQty(i.quantity)}${unitLabel} x ${fmtMoney(i.price, currency)}`, fmtMoney(i.price * i.quantity, currency)));
        });
        lines.push('--------------------------------');
        if (sale.discount_amount > 0) {
            lines.push(pad('Subtotal', fmtMoney(subtotal, currency)));
            lines.push(pad('Discount', `-${fmtMoney(sale.discount_amount, currency)}`));
        }
        lines.push(pad('TOTAL', fmtMoney(sale.total, currency)));
        lines.push(pad(`Payment (${methodLabel[sale.payment_method] ?? sale.payment_method})`, fmtMoney(tendered, currency)));
        if (balance > 0) lines.push(pad('Balance', fmtMoney(balance, currency)));
        if (sale.due_date) lines.push(`Due: ${sale.due_date}`);
        if (sale.change_amount > 0) lines.push(pad('Change', fmtMoney(sale.change_amount, currency)));
        lines.push('================================');
        lines.push('  ' + footer + '  ');
        lines.push('================================');

        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `receipt-${sale.receipt_number}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className={cn('flex flex-col', className)}>
            {/* Print content */}
            <div ref={printRef} className={cn('space-y-0 font-mono text-xs', compact ? 'text-[11px]' : '')}>
                {/* Store header */}
                <div className="center space-y-0.5 pb-3 text-center">
                    {showLogo && <img src={logoUrl} alt="" className="logo mx-auto mb-1 h-14 w-14 object-contain" />}
                    {sale.branch_name && <p className="bold text-sm font-bold text-foreground">{sale.branch_name}</p>}
                    {sale.branch_code && <p className="small text-[10px] text-muted-foreground">{sale.branch_code}</p>}
                    {header && <p className="small text-[10px] text-muted-foreground">{header}</p>}
                    <p className="text-[11px] text-muted-foreground">{fmtDate(sale.created_at, 'MMMM d, yyyy  h:mm a')}</p>
                </div>

                {/* Void stamp */}
                {isVoided && (
                    <div className="my-2 rounded border-2 border-destructive py-1 text-center text-sm font-bold tracking-[4px] text-destructive">
                        VOIDED
                    </div>
                )}

                {/* Receipt meta */}
                <div className="space-y-0.5 border-t border-dashed border-border/70 pt-2">
                    <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Receipt</span>
                        <span className="font-mono font-semibold text-foreground">{sale.receipt_number}</span>
                    </div>
                    {settings.show_cashier_on_receipt !== false && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Cashier</span>
                            <span className="text-foreground">{sale.cashier}</span>
                        </div>
                    )}
                    {sale.customer_name && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Customer</span>
                            <span className="text-foreground">{sale.customer_name}</span>
                        </div>
                    )}
                    {isDineIn && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Table</span>
                            <span className="font-semibold text-foreground">{sale.table_label}</span>
                        </div>
                    )}
                    {isDineIn && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Order type</span>
                            <span className="text-foreground">Dine-in</span>
                        </div>
                    )}
                </div>

                {/* Items */}
                <div className="mt-2 space-y-2 border-t border-dashed border-border/70 pt-2">
                    {sale.items.map((item, i) => (
                        <div key={i}>
                            <p className="item-name leading-snug font-medium text-foreground">
                                {item.product_name}
                                {item.variant_name && <span className="font-normal text-muted-foreground"> ({item.variant_name})</span>}
                            </p>
                            <div className="item-detail flex justify-between pl-2 text-[11px]">
                                <span className="text-muted-foreground">
                                    {fmtQty(item.quantity)}{' '}
                                    {item.unit ??
                                        (item.product_name.toLowerCase().includes('rice') || item.product_name.toLowerCase().includes('feed')
                                            ? 'kg'
                                            : 'pc')}{' '}
                                    × {fmtMoney(item.price, currency)}
                                </span>
                                <span className="font-semibold text-foreground">{fmtMoney(item.price * item.quantity, currency)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Totals */}
                <div className="mt-2 space-y-1 border-t border-dashed border-border/70 pt-2">
                    {sale.discount_amount > 0 && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="text-foreground">{fmtMoney(subtotal, currency)}</span>
                        </div>
                    )}
                    {sale.discount_amount > 0 && (
                        <div className="flex justify-between text-[11px] text-green-600 dark:text-green-400">
                            <span>Discount</span>
                            <span>−{fmtMoney(sale.discount_amount, currency)}</span>
                        </div>
                    )}
                    <div className="flex justify-between border-t border-dashed border-border/70 pt-1.5 text-sm font-bold text-foreground">
                        <span>TOTAL</span>
                        <span className="tabular-nums">{fmtMoney(sale.total, currency)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">Payment ({methodLabel[sale.payment_method] ?? sale.payment_method})</span>
                        <span className="text-foreground tabular-nums">{fmtMoney(tendered, currency)}</span>
                    </div>
                    {balance > 0 && (
                        <div className="flex justify-between text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            <span>Balance</span>
                            <span className="tabular-nums">{fmtMoney(balance, currency)}</span>
                        </div>
                    )}
                    {sale.payment_status && sale.payment_status !== 'paid' && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Credit status</span>
                            <span className="text-foreground capitalize">{sale.payment_status}</span>
                        </div>
                    )}
                    {sale.due_date && (
                        <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Due date</span>
                            <span className="text-foreground">{sale.due_date}</span>
                        </div>
                    )}
                    {sale.change_amount > 0 && (
                        <div className="flex justify-between text-[11px] font-semibold text-green-600 dark:text-green-400">
                            <span>Change</span>
                            <span className="tabular-nums">{fmtMoney(sale.change_amount, currency)}</span>
                        </div>
                    )}
                </div>

                {/* Notes */}
                {sale.notes && <p className="mt-2 border-t border-dashed border-border/70 pt-2 text-[10px] text-muted-foreground">{sale.notes}</p>}

                {/* Footer */}
                <div className="mt-2 border-t border-dashed border-border/70 pt-2 text-center text-[10px] text-muted-foreground">{footer}</div>
            </div>

            {/* Actions */}
            {showActions && (
                <div className="no-print mt-4 flex gap-2">
                    <Button variant="outline" size="sm" className="h-9 flex-1 gap-2" onClick={handlePrint}>
                        <Printer className="h-3.5 w-3.5" />
                        Print
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 flex-1 gap-2" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5" />
                        Download
                    </Button>
                </div>
            )}
        </div>
    );
}
