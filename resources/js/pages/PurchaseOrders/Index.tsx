'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Search, ChevronDown, ChevronRight, PackageCheck, AlertCircle, CheckCircle2, Eye, Wallet } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { controlCls, EmptyRow, PageHeader, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PurchaseItem {
    product_name: string;
    quantity: number;
    unit_cost: number;
    line_total: number;
}

interface Purchase {
    id: number;
    grn_number: string;
    supplier: { id: number; name: string; phone: string | null; contact_person: string | null } | null;
    or_number: string | null;
    payment_method: string | null;
    check_date: string | null;
    check_number: string | null;
    paid_at: string | null;
    is_paid: boolean;
    total: number;
    items_count: number;
    items: PurchaseItem[];
    received_date: string | null;
    created_at: string;
}

interface Payable {
    supplier_id: number;
    supplier_name: string;
    total_owed: number;
    purchase_count: number;
}

interface PageProps {
    purchases: Purchase[];
    payables: Payable[];
    flash?: { message?: { type: string; text: string } };
    errors?: Record<string, string>;
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PaymentPill({ method, isPaid }: { method: string | null; isPaid: boolean }) {
    if (method === 'cash') {
        return <StatusPill tone="info">Cash</StatusPill>;
    }
    if (isPaid) {
        return <StatusPill tone="success">Paid</StatusPill>;
    }
    if (method === 'credit') {
        return <StatusPill tone="warning">Credit · unpaid</StatusPill>;
    }
    if (method === 'postdated_check') {
        return <StatusPill tone="warning">PDC · unpaid</StatusPill>;
    }
    return <StatusPill tone="muted">—</StatusPill>;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchaseOrdersIndex() {
    const { props } = usePage<PageProps>();
    const { purchases, payables, flash, errors } = props;

    const [search, setSearch] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [markPaidId, setMarkPaidId] = useState<number | null>(null);
    const [markPaidName, setMarkPaidName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const message = flash?.message;
        if (message?.type === 'success') toast.success(message.text);
        if (message?.type === 'error') toast.error(message.text);
    }, [flash]);

    useEffect(() => {
        if (errors?.error) toast.error(errors.error);
    }, [errors]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return purchases;
        return purchases.filter(
            (p) => p.grn_number.toLowerCase().includes(q) || p.or_number?.toLowerCase().includes(q) || p.supplier?.name.toLowerCase().includes(q),
        );
    }, [search, purchases]);

    const toggleRow = (id: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const confirmMarkPaid = () => {
        if (!markPaidId) return;
        setSubmitting(true);
        router.post(
            routes.purchaseOrders.markPaid(markPaidId),
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setSubmitting(false);
                    setMarkPaidId(null);
                },
            },
        );
    };

    const totalPayables = payables.reduce((sum, p) => sum + p.total_owed, 0);
    const totalSpent = purchases.reduce((sum, p) => sum + p.total, 0);
    const unpaidCount = payables.reduce((sum, p) => sum + p.purchase_count, 0);
    // Dates arrive as "Oct 07, 2026" (received) or "Oct 07, 2026 01:30 PM" (created).
    const now = new Date();
    const thisMonth = `${now.toLocaleString('en-US', { month: 'short' })} ${now.getFullYear()}`;
    const monthOf = (date: string) => date.replace(/^(\w{3}) \d{1,2}, (\d{4}).*$/, '$1 $2');
    const spentThisMonth = purchases.filter((p) => monthOf(p.received_date ?? p.created_at) === thisMonth).reduce((sum, p) => sum + p.total, 0);

    return (
        <AdminLayout>
            <Head title="Purchase Orders" />
            <div className="space-y-4">
                <PageHeader title="Purchase Orders" subtitle="Goods received from suppliers, and what is still owed.">
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => router.visit(routes.purchaseOrders.create())}>
                        <Plus className="h-4 w-4" /> New purchase
                    </Button>
                </PageHeader>

                <StatStrip count={5}>
                    <Stat icon={PackageCheck} label="Purchases" value={purchases.length.toLocaleString()} />
                    <Stat icon={Wallet} label="Spent · this month" value={peso(spentThisMonth)} />
                    <Stat icon={Wallet} label="Spent · all time" value={peso(totalSpent)} />
                    <Stat
                        icon={AlertCircle}
                        label="Unpaid purchases"
                        value={unpaidCount.toLocaleString()}
                        tone={unpaidCount > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={AlertCircle} label="Owed to suppliers" value={peso(totalPayables)} tone={totalPayables > 0 ? 'warning' : undefined} />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                    <Panel
                        flush
                        icon={PackageCheck}
                        title="Purchases"
                        actions={
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="GRN, OR number or supplier"
                                    className={cn(controlCls, 'w-full pl-8')}
                                />
                            </div>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className="w-8" />
                                        <th className={thCls}>GRN</th>
                                        <th className={thCls}>Supplier</th>
                                        <th className={cn(thCls, 'hidden md:table-cell')}>Received</th>
                                        <th className={thCls}>Payment</th>
                                        <th className={cn(thCls, 'text-right')}>Total</th>
                                        <th className="w-10" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filtered.length === 0 ? (
                                        <EmptyRow colSpan={7} icon={PackageCheck}>
                                            {purchases.length === 0 ? (
                                                <>
                                                    No purchases yet.{' '}
                                                    <button
                                                        className="font-semibold text-primary hover:underline"
                                                        onClick={() => router.visit(routes.purchaseOrders.create())}
                                                    >
                                                        Record the first one
                                                    </button>
                                                </>
                                            ) : (
                                                'No purchases match your search.'
                                            )}
                                        </EmptyRow>
                                    ) : (
                                        filtered.map((purchase) => {
                                            const open = expandedRows.has(purchase.id);
                                            return (
                                                <Fragment key={purchase.id}>
                                                    <tr className="cursor-pointer hover:bg-muted/30" onClick={() => toggleRow(purchase.id)}>
                                                        <td className="py-2 pl-4">
                                                            {open ? (
                                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <p className="font-mono text-xs font-bold">{purchase.grn_number}</p>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {purchase.or_number ? `OR ${purchase.or_number}` : 'No OR'} · {purchase.items_count}{' '}
                                                                item
                                                                {purchase.items_count !== 1 ? 's' : ''}
                                                            </p>
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <p className="font-semibold">{purchase.supplier?.name ?? '—'}</p>
                                                            {purchase.supplier?.contact_person && (
                                                                <p className="text-[11px] text-muted-foreground">
                                                                    {purchase.supplier.contact_person}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="hidden px-4 py-2 text-xs text-muted-foreground md:table-cell">
                                                            {purchase.received_date ?? purchase.created_at}
                                                        </td>
                                                        <td className="px-4 py-2">
                                                            <PaymentPill method={purchase.payment_method} isPaid={purchase.is_paid} />
                                                            {purchase.payment_method === 'postdated_check' && purchase.check_date && (
                                                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                                    {purchase.check_number} · {purchase.check_date}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2 text-right font-bold tabular-nums">{peso(purchase.total)}</td>
                                                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => router.visit(routes.purchaseOrders.show(purchase.id))}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                aria-label={`Open ${purchase.grn_number}`}
                                                            >
                                                                <Eye className="h-3.5 w-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {open && (
                                                        <tr className="bg-muted/20">
                                                            <td colSpan={7} className="px-4 pt-1 pb-3 sm:pl-12">
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="text-muted-foreground">
                                                                            <th className="py-1 text-left font-semibold">Product</th>
                                                                            <th className="w-20 py-1 text-right font-semibold">Qty</th>
                                                                            <th className="w-28 py-1 text-right font-semibold">Unit cost</th>
                                                                            <th className="w-28 py-1 text-right font-semibold">Line total</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-border/60">
                                                                        {purchase.items.map((item, idx) => (
                                                                            <tr key={idx}>
                                                                                <td className="py-1.5">{item.product_name}</td>
                                                                                <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                                                                                <td className="py-1.5 text-right tabular-nums">
                                                                                    {peso(item.unit_cost)}
                                                                                </td>
                                                                                <td className="py-1.5 text-right font-semibold tabular-nums">
                                                                                    {peso(item.line_total)}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                                {!purchase.is_paid && purchase.payment_method !== 'cash' && (
                                                                    <div className="mt-2 flex justify-end">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-7 gap-1 text-xs"
                                                                            onClick={() => {
                                                                                setMarkPaidId(purchase.id);
                                                                                setMarkPaidName(purchase.grn_number);
                                                                            }}
                                                                        >
                                                                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark as paid
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel
                        flush
                        icon={AlertCircle}
                        title="Payables by supplier"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">owed</span>}
                        className="self-start"
                    >
                        {payables.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">All suppliers are paid up.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {payables.map((payable) => (
                                    <li key={payable.supplier_id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                        <button
                                            onClick={() => setSearch(payable.supplier_name)}
                                            className="min-w-0 flex-1 text-left hover:text-primary"
                                            title="Show this supplier's purchases"
                                        >
                                            <span className="block truncate font-semibold">{payable.supplier_name}</span>
                                            <span className="block text-[11px] text-muted-foreground">
                                                {payable.purchase_count} unpaid purchase{payable.purchase_count !== 1 ? 's' : ''}
                                            </span>
                                        </button>
                                        <span className="font-bold text-amber-700 tabular-nums dark:text-amber-400">{peso(payable.total_owed)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>

            {/* Confirm Mark Paid Dialog */}
            <Dialog open={markPaidId !== null} onOpenChange={(open) => !open && setMarkPaidId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark as Paid</DialogTitle>
                        <DialogDescription>
                            Confirm that <strong>{markPaidName}</strong> has been settled. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMarkPaidId(null)}>
                            Cancel
                        </Button>
                        <Button onClick={confirmMarkPaid} disabled={submitting}>
                            {submitting ? 'Saving...' : 'Confirm Payment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
