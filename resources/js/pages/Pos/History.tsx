'use client';

import { usePage, router, Link } from '@inertiajs/react';
import {
    Search,
    X,
    Filter,
    ChevronRight,
    Eye,
    TrendingUp,
    Banknote,
    Smartphone,
    CreditCard,
    Tag,
    ArrowLeft,
    Table2,
    Calendar,
    Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate, toDateStr, manilaRange } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import ReceiptTemplate, { fmtMoney } from './ReceiptTemplate';
import type { ReceiptData } from './ReceiptTemplate';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SaleRow extends ReceiptData {
    id: number;
    item_count: number;
    table_label?: string | null;
    amount_paid: number;
    balance_due: number;
    payment_status: string;
    due_date?: string | null;
    customer?: { id: number; name: string } | null;
}
interface PaginatedSales {
    data: SaleRow[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number;
    to: number;
    links: { url: string | null; label: string; active: boolean }[];
}
interface Summary {
    total_sales: number;
    total_count: number;
    cash_total: number;
    gcash_total: number;
    card_total: number;
    installment_dp: number;
    remittance_total: number;
    discount_total: number;
    credit_paid: number;
    credit_balance: number;
}
interface Branch {
    id: number;
    name: string;
    business_type: string;
}
interface PageProps {
    sales: PaginatedSales;
    summary: Summary;
    filters: { search?: string; status?: string; payment_method?: string; from?: string; to?: string };
    app: { currency: string };
    branch: Branch | null;
    is_admin: boolean;
    [key: string]: unknown;
}

// ─── Date preset helpers ──────────────────────────────────────────────────────
const presets = [
    { label: 'Today', ...{ from: toDateStr(manilaRange.today().from), to: toDateStr(manilaRange.today().to) } },
    { label: 'Yesterday', ...{ from: toDateStr(manilaRange.yesterday().from), to: toDateStr(manilaRange.yesterday().to) } },
    { label: 'This Week', ...{ from: toDateStr(manilaRange.thisWeek().from), to: toDateStr(manilaRange.thisWeek().to) } },
    { label: 'Last Week', ...{ from: toDateStr(manilaRange.lastWeek().from), to: toDateStr(manilaRange.lastWeek().to) } },
    { label: 'This Month', ...{ from: toDateStr(manilaRange.thisMonth().from), to: toDateStr(manilaRange.thisMonth().to) } },
    { label: 'Last Month', ...{ from: toDateStr(manilaRange.lastMonth().from), to: toDateStr(manilaRange.lastMonth().to) } },
];

// Business types that use dine-in / table ordering
const TABLE_TYPES = ['restaurant', 'bar', 'mixed'];
const SALON_TYPES = ['salon'];

// ─── Method chip ──────────────────────────────────────────────────────────────
function MethodChip({ method }: { method: string }) {
    const map: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        cash: { label: 'Cash', color: 'bg-green-50  text-green-700  dark:bg-green-900/20  dark:text-green-400', icon: Banknote },
        gcash: { label: 'GCash', color: 'bg-blue-50   text-blue-700   dark:bg-blue-900/20   dark:text-blue-400', icon: Smartphone },
        card: { label: 'Card', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400', icon: CreditCard },
        credit: { label: 'Credit', color: 'bg-amber-50  text-amber-700  dark:bg-amber-900/20  dark:text-amber-400', icon: Wallet },
        mixed: { label: 'Partial', color: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400', icon: Banknote },
        others: { label: 'Others', color: 'bg-muted     text-muted-foreground', icon: Tag },
    };
    const m = map[method] ?? map.others;
    const Icon = m.icon;
    return (
        <span className={cn('flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', m.color)}>
            <Icon className="h-2.5 w-2.5" />
            {m.label}
        </span>
    );
}

// ─── Receipt drawer ───────────────────────────────────────────────────────────
function ReceiptDrawer({ sale, currency, businessType, onClose }: { sale: SaleRow; currency: string; businessType?: string; onClose: () => void }) {
    // Augment with business_type for the receipt template
    const saleWithMeta = { ...sale, business_type: businessType };
    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-96">
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="font-mono text-sm font-bold text-foreground">{sale.receipt_number}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{fmtDate(sale.created_at, 'MMMM d, yyyy · h:mm a')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Link href={routes.pos.show(sale.id)}>
                            <button
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="View full page"
                            >
                                <Eye className="h-3.5 w-3.5" />
                            </button>
                        </Link>
                        <button
                            onClick={onClose}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Status + chips */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-5 py-3">
                    <span className={cn('badge text-[10px] font-bold capitalize', sale.status === 'completed' ? 'badge-completed' : 'badge-voided')}>
                        {sale.status}
                    </span>
                    <MethodChip method={sale.payment_method} />
                    {sale.customer_name && <span className="text-xs text-muted-foreground">👤 {sale.customer_name}</span>}
                    {sale.table_label && (
                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Table2 className="h-3 w-3" />
                            {sale.table_label}
                        </span>
                    )}
                </div>

                {/* Receipt */}
                <div className="flex-1 overflow-y-auto p-5">
                    <ReceiptTemplate sale={saleWithMeta} currency={currency} showActions={true} />
                </div>
            </div>
        </div>
    );
}

// ─── History page ─────────────────────────────────────────────────────────────
export default function PosHistory() {
    const { props } = usePage<PageProps>();
    const { sales, summary, filters, app, branch, is_admin } = props;
    const currency = app?.currency ?? '₱';
    const bizType = branch?.business_type ?? '';

    const showTableCol = TABLE_TYPES.includes(bizType);
    const showCustomerCol = !SALON_TYPES.includes(bizType); // salon always has customer; others = walk-in

    const [search, setSearch] = useState(filters.search ?? '');
    const [status, setStatus] = useState(filters.status ?? '');
    const [method, setMethod] = useState(filters.payment_method ?? '');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        filters.from
            ? {
                  from: new Date(filters.from + 'T00:00:00+08:00'),
                  to: filters.to ? new Date(filters.to + 'T00:00:00+08:00') : new Date(filters.from + 'T00:00:00+08:00'),
              }
            : undefined,
    );
    const [selected, setSelected] = useState<SaleRow | null>(null);

    const applyFilters = (overrideRange?: DateRange) => {
        const range = overrideRange ?? dateRange;
        router.get(
            routes.sales.history(),
            {
                search: search || undefined,
                status: status || undefined,
                payment_method: method || undefined,
                from: range?.from ? toDateStr(range.from) : undefined,
                to: range?.to ? toDateStr(range.to) : undefined,
            },
            { preserveState: true, replace: true },
        );
    };

    const applyPreset = (p: { from: string; to: string }) => {
        const range: DateRange = {
            from: new Date(p.from + 'T00:00:00+08:00'),
            to: new Date(p.to + 'T00:00:00+08:00'),
        };
        setDateRange(range);
        applyFilters(range);
    };

    const todayRange: DateRange = {
        from: new Date(toDateStr(manilaRange.today().from) + 'T00:00:00+08:00'),
        to: new Date(toDateStr(manilaRange.today().to) + 'T00:00:00+08:00'),
    };

    const clearFilters = () => {
        setSearch('');
        setStatus('');
        setMethod('');
        setDateRange(is_admin ? todayRange : dateRange);
        router.get(
            routes.sales.history(),
            {
                from: toDateStr(manilaRange.today().from),
                to: toDateStr(manilaRange.today().to),
            },
            { preserveState: true, replace: true },
        );
    };

    const hasFilters = !!(filters.search || filters.status || filters.payment_method || filters.from || filters.to);
    const activePreset = presets.find((p) => p.from === (filters.from ?? '') && p.to === (filters.to ?? ''));

    const summaryCards = [
        {
            label: 'Revenue',
            value: fmtMoney(summary.total_sales, currency),
            icon: TrendingUp,
            color: 'bg-indigo-50  text-indigo-600  dark:bg-indigo-950/30  dark:text-indigo-400',
        },
        {
            label: 'Cash',
            value: fmtMoney(summary.cash_total, currency),
            icon: Banknote,
            color: 'bg-green-50   text-green-600   dark:bg-green-950/30   dark:text-green-400',
        },
        {
            label: 'GCash',
            value: fmtMoney(summary.gcash_total, currency),
            icon: Smartphone,
            color: 'bg-blue-50    text-blue-600    dark:bg-blue-950/30    dark:text-blue-400',
        },
        {
            label: 'Card',
            value: fmtMoney(summary.card_total, currency),
            icon: CreditCard,
            color: 'bg-purple-50  text-purple-600  dark:bg-purple-950/30  dark:text-purple-400',
        },
        ...((summary.credit_paid ?? 0) > 0 || (summary.credit_balance ?? 0) > 0
            ? [
                  {
                      label: 'Credit Collected',
                      value: fmtMoney(summary.credit_paid ?? 0, currency),
                      icon: Banknote,
                      color: 'bg-emerald-50  text-emerald-600  dark:bg-emerald-950/30  dark:text-emerald-400',
                  },
                  {
                      label: 'Credit Balance',
                      value: fmtMoney(summary.credit_balance ?? 0, currency),
                      icon: Wallet,
                      color: 'bg-amber-50  text-amber-600  dark:bg-amber-950/30  dark:text-amber-400',
                  },
              ]
            : []),
        {
            label: 'Discounts',
            value: fmtMoney(summary.discount_total, currency),
            icon: Tag,
            color: 'bg-amber-50   text-amber-600   dark:bg-amber-950/30   dark:text-amber-400',
        },
    ];

    // Build table columns
    const baseCols = ['Receipt', 'Date'];
    if (showTableCol) baseCols.push('Table');
    if (showCustomerCol) baseCols.push('Customer');
    baseCols.push('Method', 'Items', 'Total', 'Collected', 'Balance', 'Status', '');

    return (
        <AdminLayout>
            <div className="mx-auto max-w-[1400px] space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Link href={routes.pos.index()}>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Sales History</h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">{sales.total.toLocaleString()} total transactions</p>
                    </div>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {summaryCards.map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="rounded-xl border border-border bg-card p-3.5">
                            <div className={cn('mb-2 inline-flex rounded-lg p-1.5', color.split(' ').slice(1).join(' '))}>
                                <Icon className={cn('h-3.5 w-3.5', color.split(' ')[0])} />
                            </div>
                            <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</p>
                            <p className="mt-0.5 text-base font-bold text-foreground tabular-nums">{value}</p>
                        </div>
                    ))}
                </div>

                {/* Filters */}
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                    {/* Quick date presets — admin only */}
                    {is_admin && (
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                Quick range:
                            </span>
                            {presets.map((p) => (
                                <button
                                    key={p.label}
                                    onClick={() => applyPreset(p)}
                                    className={cn(
                                        'h-7 rounded-lg border px-3 text-xs font-medium transition-colors',
                                        activePreset?.label === p.label
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                            {hasFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="ml-auto flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                    Clear all
                                </button>
                            )}
                        </div>
                    )}

                    {/* Filter inputs */}
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="relative min-w-[180px] flex-1">
                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') applyFilters();
                                }}
                                placeholder="Receipt no. or customer…"
                                className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                            <option value="">All status</option>
                            <option value="completed">Completed</option>
                            <option value="voided">Voided</option>
                        </select>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                            <option value="">All methods</option>
                            <option value="cash">Cash</option>
                            <option value="gcash">GCash</option>
                            <option value="card">Card</option>
                            <option value="others">Others</option>
                            <option value="credit">Credit</option>
                            <option value="mixed">Partial</option>
                        </select>
                        {is_admin ? (
                            <div className="min-w-[240px]">
                                <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                            </div>
                        ) : (
                            <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted px-3 text-xs font-medium text-muted-foreground">
                                <Calendar className="h-3.5 w-3.5" />
                                Today only
                            </div>
                        )}
                        <Button size="sm" className="h-9 gap-2" onClick={() => applyFilters()}>
                            <Filter className="h-3.5 w-3.5" />
                            Apply
                        </Button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    {baseCols.map((h) => (
                                        <th
                                            key={h}
                                            className={cn(
                                                'px-4 py-3 text-[10px] font-bold tracking-widest text-muted-foreground uppercase',
                                                h === 'Total' || h === 'Collected' || h === 'Balance' || h === '' ? 'text-right' : 'text-left',
                                                h === 'Date' ? 'hidden sm:table-cell' : '',
                                                h === 'Customer' ? 'hidden md:table-cell' : '',
                                                h === 'Items' ? 'hidden lg:table-cell' : '',
                                                h === 'Table' ? 'hidden sm:table-cell' : '',
                                            )}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sales.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={baseCols.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                            No sales found
                                        </td>
                                    </tr>
                                ) : (
                                    sales.data.map((sale) => (
                                        <tr
                                            key={sale.id}
                                            className="cursor-pointer transition-colors hover:bg-muted/20"
                                            onClick={() => setSelected(sale)}
                                        >
                                            <td className="px-4 py-3">
                                                <p className="font-mono text-xs font-bold text-foreground">{sale.receipt_number}</p>
                                                <p className="mt-0.5 text-[10px] text-muted-foreground sm:hidden">
                                                    {fmtDate(sale.created_at, 'MMM d, h:mm a')}
                                                </p>
                                            </td>
                                            <td className="hidden px-4 py-3 sm:table-cell">
                                                <p className="text-sm text-foreground">{fmtDate(sale.created_at, 'MMM d, yyyy')}</p>
                                                <p className="text-[11px] text-muted-foreground">{fmtDate(sale.created_at, 'h:mm a')}</p>
                                            </td>
                                            {showTableCol && (
                                                <td className="hidden px-4 py-3 sm:table-cell">
                                                    {sale.table_label ? (
                                                        <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                            <Table2 className="h-3 w-3 shrink-0" />
                                                            {sale.table_label}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Takeout</span>
                                                    )}
                                                </td>
                                            )}
                                            {showCustomerCol && (
                                                <td className="hidden px-4 py-3 md:table-cell">
                                                    <p className="text-sm text-foreground">
                                                        {sale.customer?.name ?? sale.customer_name ?? 'Walk-in'}
                                                    </p>
                                                </td>
                                            )}
                                            <td className="px-4 py-3">
                                                <MethodChip method={sale.payment_method} />
                                            </td>
                                            <td className="hidden px-4 py-3 lg:table-cell">
                                                <p className="text-sm text-muted-foreground">
                                                    {sale.item_count} item{sale.item_count !== 1 ? 's' : ''}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <p className="font-bold text-foreground tabular-nums">{fmtMoney(sale.total, currency)}</p>
                                                {sale.discount_amount > 0 && (
                                                    <p className="text-[10px] text-green-600 tabular-nums dark:text-green-400">
                                                        −{fmtMoney(sale.discount_amount, currency)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <p className="font-semibold text-foreground tabular-nums">
                                                    {fmtMoney(sale.amount_paid ?? sale.payment_amount, currency)}
                                                </p>
                                                {sale.payment_status && sale.payment_status !== 'paid' && (
                                                    <p className="text-[10px] text-muted-foreground capitalize">{sale.payment_status}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <p
                                                    className={cn(
                                                        'font-semibold tabular-nums',
                                                        (sale.balance_due ?? 0) > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {fmtMoney(sale.balance_due ?? 0, currency)}
                                                </p>
                                                {sale.due_date && <p className="text-[10px] text-muted-foreground">Due {sale.due_date}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span
                                                    className={cn(
                                                        'badge text-[10px] font-bold capitalize',
                                                        sale.status === 'completed' ? 'badge-completed' : 'badge-voided',
                                                    )}
                                                >
                                                    {sale.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/40" />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {sales.last_page > 1 && (
                        <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
                            <p className="text-xs text-muted-foreground">
                                {sales.from}–{sales.to} of {sales.total.toLocaleString()}
                            </p>
                            <div className="flex items-center gap-1">
                                {sales.links.map((link, i) => (
                                    <button
                                        key={i}
                                        disabled={!link.url}
                                        onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                        className={cn(
                                            'h-7 min-w-[28px] rounded-md border px-2 text-xs font-medium transition-all',
                                            link.active
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30',
                                        )}
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selected && <ReceiptDrawer sale={selected} currency={currency} businessType={bizType} onClose={() => setSelected(null)} />}
        </AdminLayout>
    );
}
