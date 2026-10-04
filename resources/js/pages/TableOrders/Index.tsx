'use client';

import { useMemo } from 'react';
import { Head, usePage, router } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import { Table2, Clock, CheckCircle2, XCircle, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableOrderRow {
    id: number;
    order_number: string;
    table_id: number | null;
    table_number: number | string | null;
    section: string | null;
    label: string;
    status: string;
    total: number;
    covers: number;
    customer_name: string | null;
    opened_at: string | null;
    closed_at: string | null;
}

interface PageProps {
    orders: TableOrderRow[];
    app: { currency: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number, currency: string) {
    return currency + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTime(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
}

const STATUS_BADGE: Record<string, string> = {
    open: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
    billed: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    closed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    cancelled: 'bg-red-500/15 text-red-600 border-red-500/30',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
    open: Clock,
    billed: Receipt,
    closed: CheckCircle2,
    cancelled: XCircle,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TableOrdersIndex() {
    const { orders, app } = usePage<PageProps>().props;
    const currency = app?.currency ?? '₱';

    const summary = useMemo(
        () => ({
            open: orders.filter((o) => o.status === 'open').length,
            billed: orders.filter((o) => o.status === 'billed').length,
            closed: orders.filter((o) => o.status === 'closed').length,
            cancelled: orders.filter((o) => o.status === 'cancelled').length,
            totalRevenue: orders.filter((o) => o.status === 'closed').reduce((s, o) => s + o.total, 0),
        }),
        [orders],
    );

    return (
        <AdminLayout>
            <Head title="Table Orders" />

            <div className="mx-auto max-w-7xl space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <Table2 className="h-6 w-6 text-primary" />
                            Table Orders
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Today's dine-in orders</p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {orders.length} order{orders.length !== 1 ? 's' : ''}
                    </Badge>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[
                        { label: 'Open', value: summary.open, color: 'text-sky-600', bg: 'bg-sky-500/10' },
                        { label: 'Billed', value: summary.billed, color: 'text-amber-600', bg: 'bg-amber-500/10' },
                        { label: 'Closed', value: summary.closed, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
                        { label: 'Cancelled', value: summary.cancelled, color: 'text-red-600', bg: 'bg-red-500/10' },
                    ].map((card) => (
                        <div key={card.label} className={cn('rounded-2xl border border-border p-4', card.bg)}>
                            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{card.label}</p>
                            <p className={cn('mt-1 text-3xl font-black', card.color)}>{card.value}</p>
                        </div>
                    ))}
                </div>

                {/* Orders table */}
                {orders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-16 text-center">
                        <Table2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm font-medium text-muted-foreground">No table orders today</p>
                        <p className="mt-1 text-xs text-muted-foreground/60">Orders started from the POS will appear here</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-3 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">Order #</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">Table</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">Customer</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold tracking-wide text-muted-foreground uppercase">Covers</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold tracking-wide text-muted-foreground uppercase">Total</th>
                                    <th className="px-4 py-3 text-center text-xs font-bold tracking-wide text-muted-foreground uppercase">Status</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold tracking-wide text-muted-foreground uppercase">Opened</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold tracking-wide text-muted-foreground uppercase">Closed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {orders.map((o) => {
                                    const Icon = STATUS_ICONS[o.status] ?? Clock;
                                    return (
                                        <tr key={o.id} className="transition-colors hover:bg-muted/30">
                                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{o.order_number}</td>
                                            <td className="px-4 py-3 font-medium">{o.label}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{o.customer_name ?? '—'}</td>
                                            <td className="px-4 py-3 text-center text-muted-foreground">{o.covers}</td>
                                            <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtMoney(o.total, currency)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                                        STATUS_BADGE[o.status] ?? 'border-border bg-muted text-muted-foreground',
                                                    )}
                                                >
                                                    <Icon className="h-3 w-3" />
                                                    {o.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{fmtTime(o.opened_at)}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{fmtTime(o.closed_at)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {summary.totalRevenue > 0 && (
                                <tfoot>
                                    <tr className="border-t border-border bg-muted/30">
                                        <td colSpan={4} className="px-4 py-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                                            Revenue (closed orders)
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-foreground tabular-nums">
                                            {fmtMoney(summary.totalRevenue, currency)}
                                        </td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
