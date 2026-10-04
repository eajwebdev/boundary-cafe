'use client';

import { Head, Link, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import {
    Calculator,
    CheckCircle2,
    AlertTriangle,
    Banknote,
    Smartphone,
    CreditCard,
    CalendarClock,
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Denomination {
    id: number;
    denomination: number;
    quantity: number;
    subtotal: number;
    type: 'bill' | 'coin';
}

interface CashCount {
    id: number;
    count_type: 'closing' | 'midshift';
    status: 'pending' | 'verified';
    opening_cash: number;
    pure_cash_sales: number;
    installment_dp: number;
    petty_cash_paid: number;
    system_total: number;
    expected_cash: number;
    counted_total: number;
    over_short: number;
    gcash_system: number | null;
    gcash_counted: number | null;
    gcash_over_short: number | null;
    card_system: number | null;
    card_counted: number | null;
    card_over_short: number | null;
    notes: string | null;
    counted_at: string;
    created_at: string;
    cashSession: {
        id: number;
        session_number: string;
        opened_at: string;
    } | null;
    denominations: Denomination[];
}

interface PageProps {
    cashCount: CashCount;
    counter_name?: string | null;
    app?: { currency: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, c = '₱') => {
    if (n === null || n === undefined) return '—';
    return c + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const overShortColor = (n: number) => (n === 0 ? 'text-emerald-600 dark:text-emerald-400' : n > 0 ? 'text-amber-500' : 'text-destructive');

const overShortLabel = (n: number) => (n === 0 ? 'Balanced' : n > 0 ? `Over ${fmt(Math.abs(n))}` : `Short ${fmt(Math.abs(n))}`);

function OverShortBadge({ amount, size = 'md' }: { amount: number; size?: 'sm' | 'md' | 'lg' }) {
    const Icon = amount === 0 ? CheckCircle2 : AlertTriangle;
    const color = overShortColor(amount);
    const bg = amount === 0 ? 'bg-emerald-500/10' : amount > 0 ? 'bg-amber-500/10' : 'bg-destructive/10';
    const sizeClass = size === 'lg' ? 'text-base px-4 py-2.5' : size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1.5';
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-lg font-bold', color, bg, sizeClass)}>
            <Icon className={cn(size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5')} />
            {overShortLabel(amount)}
        </span>
    );
}

function ReconcileRow({
    label,
    system,
    counted,
    overShort,
    color,
}: {
    label: string;
    system: number | null;
    counted: number | null;
    overShort: number | null;
    color: 'blue' | 'purple';
}) {
    const colorCls =
        color === 'blue'
            ? 'bg-blue-500/5 border-blue-500/20 text-blue-600 dark:text-blue-400'
            : 'bg-purple-500/5 border-purple-500/20 text-purple-600 dark:text-purple-400';
    const Icon = color === 'blue' ? Smartphone : CreditCard;

    return (
        <div className={cn('space-y-3 rounded-2xl border p-5', colorCls)}>
            <p className={cn('flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase', colorCls.split(' ').slice(2).join(' '))}>
                <Icon className="h-3.5 w-3.5" /> {label}
            </p>
            <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                    <p className="mb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">System</p>
                    <p className="font-bold text-foreground tabular-nums">{fmt(system)}</p>
                </div>
                <div>
                    <p className="mb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">Counted</p>
                    <p className="font-bold text-foreground tabular-nums">
                        {counted !== null ? fmt(counted) : <span className="text-muted-foreground">Not entered</span>}
                    </p>
                </div>
                <div>
                    <p className="mb-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">Difference</p>
                    {overShort !== null ? (
                        <p className={cn('font-bold tabular-nums', overShortColor(overShort))}>{overShortLabel(overShort)}</p>
                    ) : (
                        <p className="text-xs text-muted-foreground">—</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CashCountShow() {
    const { cashCount: c, counter_name, app } = usePage<PageProps>().props;
    const currency = app?.currency ?? '₱';

    const bills = c.denominations.filter((d) => d.type === 'bill').sort((a, b) => b.denomination - a.denomination);
    const coins = c.denominations.filter((d) => d.type === 'coin').sort((a, b) => b.denomination - a.denomination);
    const billsTotal = bills.reduce((s, d) => s + d.subtotal, 0);
    const coinsTotal = coins.reduce((s, d) => s + d.subtotal, 0);

    const hasGcash = c.gcash_system !== null && (c.gcash_system > 0 || c.gcash_counted !== null);
    const hasCard = c.card_system !== null && (c.card_system > 0 || c.card_counted !== null);

    const countedAt = new Date(c.counted_at ?? c.created_at).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return (
        <AdminLayout>
            <Head title={`Cash Count #${c.id}`} />

            {/* Print-only styles */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #cash-count-printable,
                    #cash-count-printable * { visibility: visible; }
                    #cash-count-printable { position: absolute; inset: 0; padding: 24px; }
                    .print\\:hidden { display: none !important; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <div id="cash-count-printable" className="mx-auto max-w-3xl space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <Link href="/cash-counts" className="no-print">
                            <Button variant="ghost" size="sm" className="mb-1 -ml-2 gap-1.5 text-muted-foreground hover:text-foreground">
                                <ArrowLeft className="h-3.5 w-3.5" /> Back to Cash Counts
                            </Button>
                        </Link>
                        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
                            <Calculator className="h-5 w-5 text-primary" />
                            Cash Count — {c.cashSession?.session_number ?? `#${c.id}`}
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground capitalize">
                            {c.count_type} count · {countedAt}
                        </p>
                    </div>
                    <div className="flex items-start gap-2">
                        <Button variant="outline" size="sm" className="no-print gap-1.5" onClick={() => window.print()}>
                            <Printer className="h-3.5 w-3.5" /> Print / PDF
                        </Button>
                        <OverShortBadge amount={c.over_short} size="lg" />
                    </div>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                        { label: 'Expected', value: c.expected_cash, color: 'text-foreground' },
                        {
                            label: 'Counted',
                            value: c.counted_total,
                            color: c.counted_total >= c.expected_cash ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                        },
                        {
                            label: 'Over / Short',
                            value: Math.abs(c.over_short),
                            color: overShortColor(c.over_short),
                            prefix: c.over_short > 0 ? '+' : c.over_short < 0 ? '−' : '',
                        },
                        { label: 'Status', value: null, status: c.status },
                    ].map((card, i) => (
                        <div key={i} className="rounded-2xl border border-border bg-card p-4">
                            <p className="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">{card.label}</p>
                            {card.value !== null && card.value !== undefined ? (
                                <p className={cn('text-xl font-black tabular-nums', card.color)}>{(card.prefix ?? '') + fmt(card.value, currency)}</p>
                            ) : (
                                <p
                                    className={cn(
                                        'text-xl font-black capitalize',
                                        card.status === 'verified' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500',
                                    )}
                                >
                                    {card.status}
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Expected cash breakdown */}
                <div className="space-y-2 rounded-2xl border border-border bg-card p-5">
                    <p className="mb-3 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Expected Cash Breakdown</p>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Banknote className="h-3 w-3" />
                                Opening cash
                            </span>
                            <span className="font-medium text-foreground tabular-nums">{fmt(c.opening_cash, currency)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <TrendingUp className="h-3 w-3" />
                                Cash sales
                            </span>
                            <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                +{fmt(c.pure_cash_sales, currency)}
                            </span>
                        </div>
                        {(c.installment_dp ?? 0) > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <CalendarClock className="h-3 w-3" />
                                    Installment DP
                                    <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-500">cash at POS</span>
                                </span>
                                <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                    +{fmt(c.installment_dp, currency)}
                                </span>
                            </div>
                        )}
                        {(c.petty_cash_paid ?? 0) > 0 && (
                            <div className="flex justify-between text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <TrendingDown className="h-3 w-3" />
                                    Petty cash paid out
                                </span>
                                <span className="font-medium text-destructive tabular-nums">−{fmt(c.petty_cash_paid, currency)}</span>
                            </div>
                        )}
                        <div className="mt-1 flex justify-between border-t border-border pt-2">
                            <span className="font-bold text-foreground">Expected in drawer</span>
                            <span className="font-black text-primary tabular-nums">{fmt(c.expected_cash, currency)}</span>
                        </div>
                    </div>
                </div>

                {/* Denomination breakdown */}
                {c.denominations.length > 0 ? (
                    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                        <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Denomination Breakdown</p>

                        {bills.length > 0 && (
                            <>
                                <p className="-mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                    <Banknote className="h-3.5 w-3.5" /> Bills
                                </p>
                                <div className="space-y-1">
                                    {bills.map((d) => (
                                        <div key={d.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                                            <span className="w-20 shrink-0 font-bold text-foreground">₱{d.denomination}</span>
                                            <span className="flex-1 text-center text-muted-foreground">× {d.quantity}</span>
                                            <span className="w-28 text-right font-mono font-bold text-foreground tabular-nums">
                                                {fmt(d.subtotal, currency)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                                    <span>Bills subtotal</span>
                                    <span className="font-bold text-foreground tabular-nums">{fmt(billsTotal, currency)}</span>
                                </div>
                            </>
                        )}

                        {coins.length > 0 && (
                            <>
                                <p className="-mb-1 flex items-center gap-1.5 pt-2 text-xs font-semibold text-muted-foreground">
                                    <Banknote className="h-3.5 w-3.5" /> Coins
                                </p>
                                <div className="space-y-1">
                                    {coins.map((d) => (
                                        <div key={d.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm">
                                            <span className="w-20 shrink-0 font-bold text-foreground">₱{d.denomination}</span>
                                            <span className="flex-1 text-center text-muted-foreground">× {d.quantity}</span>
                                            <span className="w-28 text-right font-mono font-bold text-foreground tabular-nums">
                                                {fmt(d.subtotal, currency)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                                    <span>Coins subtotal</span>
                                    <span className="font-bold text-foreground tabular-nums">{fmt(coinsTotal, currency)}</span>
                                </div>
                            </>
                        )}

                        {/* Grand total */}
                        <div
                            className={cn(
                                'flex items-center justify-between rounded-xl border-2 px-4 py-3',
                                c.over_short === 0
                                    ? 'border-emerald-500/40 bg-emerald-500/5'
                                    : Math.abs(c.over_short) > 100
                                      ? 'border-destructive/40 bg-destructive/5'
                                      : 'border-amber-500/40 bg-amber-500/5',
                            )}
                        >
                            <div>
                                <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Total Counted</p>
                                <p className="mt-0.5 text-2xl font-black text-foreground tabular-nums">{fmt(c.counted_total, currency)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] tracking-widest text-muted-foreground uppercase">vs Expected</p>
                                <p className="mt-0.5 text-base font-bold text-muted-foreground tabular-nums">{fmt(c.expected_cash, currency)}</p>
                                <OverShortBadge amount={c.over_short} size="sm" />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <p className="py-4 text-center text-sm text-muted-foreground">No denominations recorded for this count.</p>
                    </div>
                )}

                {/* GCash reconciliation */}
                {hasGcash && (
                    <ReconcileRow
                        label="GCash Reconciliation"
                        system={c.gcash_system}
                        counted={c.gcash_counted}
                        overShort={c.gcash_over_short}
                        color="blue"
                    />
                )}

                {/* Card / Bank reconciliation */}
                {hasCard && (
                    <ReconcileRow
                        label="Card / Bank Reconciliation"
                        system={c.card_system}
                        counted={c.card_counted}
                        overShort={c.card_over_short}
                        color="purple"
                    />
                )}

                {/* Notes */}
                {c.notes && (
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <p className="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Notes</p>
                        <p className="text-sm whitespace-pre-wrap text-foreground">{c.notes}</p>
                    </div>
                )}

                {/* Signature block */}
                <div className="mt-4 border-t border-border pt-8">
                    <p className="mb-6 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Certification</p>
                    <div className="grid grid-cols-2 gap-12">
                        {/* Counted by */}
                        <div className="text-center">
                            <div className="mb-2 h-14 border-b-2 border-foreground/40" />
                            <p className="text-sm font-bold text-foreground">{counter_name ?? '—'}</p>
                            <p className="mt-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                                Cash Count Officer / Signature over Printed Name
                            </p>
                        </div>
                        {/* Verified by */}
                        <div className="text-center">
                            <div className="mb-2 h-14 border-b-2 border-foreground/40" />
                            <p className="text-sm font-bold text-foreground">&nbsp;</p>
                            <p className="mt-0.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                                Verified by / Signature over Printed Name
                            </p>
                        </div>
                    </div>
                    <p className="mt-6 text-center text-[10px] text-muted-foreground">
                        Printed:{' '}
                        {new Date().toLocaleString('en-PH', {
                            timeZone: 'Asia/Manila',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                        {' · '}Session: {c.cashSession?.session_number ?? `#${c.id}`}
                        {' · '}
                        {c.count_type === 'closing' ? 'Closing Count' : 'Mid-shift Count'}
                    </p>
                </div>
            </div>
        </AdminLayout>
    );
}
