import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, Clock, MoreHorizontal, PackageX, Printer, RefreshCw, ShieldAlert, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { BranchSelect, controlCls, EmptyRow, FilterBar, PageHeader, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate, toDateStr } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Adjustment {
    id: number;
    date: string;
    product_name: string;
    barcode: string | null;
    type: string;
    type_label: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    note: string | null;
    recorded_by: string;
}
interface SummaryRow {
    count: number;
    total_qty: number;
    total_cost: number;
}
interface Props {
    adjustments: Adjustment[];
    summary: Record<string, SummaryRow>;
    total_loss: number;
    total_units: number;
    filters: { from: string; to: string; type: string | null };
    branches: { id: number; name: string }[] | null;
    currentBranchId: number | null;
    app: { currency: string };
    [key: string]: unknown;
}

const TYPE_META: Record<string, { label: string; tone: Tone; icon: React.ElementType }> = {
    damage: { label: 'Damage', tone: 'danger', icon: AlertTriangle },
    loss: { label: 'Loss', tone: 'warning', icon: TrendingDown },
    expired: { label: 'Expired', tone: 'warning', icon: Clock },
    theft: { label: 'Theft', tone: 'danger', icon: ShieldAlert },
    correction: { label: 'Correction', tone: 'info', icon: RefreshCw },
    other: { label: 'Other', tone: 'muted', icon: MoreHorizontal },
};

const ALL_TYPES = ['damage', 'loss', 'expired', 'theft', 'correction', 'other'];

function fmtMoney(n: number, currency: string) {
    return `${currency}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StockLossReport({ adjustments, summary, total_loss, total_units, filters, branches, currentBranchId, app }: Props) {
    const currency = app?.currency ?? '₱';

    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        filters.from
            ? {
                  from: new Date(filters.from + 'T00:00:00+08:00'),
                  to: filters.to ? new Date(filters.to + 'T00:00:00+08:00') : new Date(filters.from + 'T00:00:00+08:00'),
              }
            : undefined,
    );
    const [type, setType] = useState(filters.type ?? '');
    const [branchId, setBranchId] = useState<string>(currentBranchId?.toString() ?? '');

    const applyFilters = () => {
        router.get(routes.reports.stockLoss(), {
            from: dateRange?.from ? toDateStr(dateRange.from) : undefined,
            to: dateRange?.to ? toDateStr(dateRange.to) : undefined,
            type: type || undefined,
            branch_id: branchId || undefined,
        });
    };

    const biggest = Object.entries(summary).sort(([, a], [, b]) => Number(b.total_cost) - Number(a.total_cost))[0];

    return (
        <AdminLayout>
            <Head title="Stock Loss Report" />
            <div className="space-y-4">
                <PageHeader
                    title="Stock Loss Report"
                    subtitle={`${filters.from} — ${filters.to}${filters.type ? ` · ${TYPE_META[filters.type]?.label ?? filters.type} only` : ''}`}
                >
                    <Link
                        href={routes.stockAdjustments.index()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <PackageX className="h-4 w-4" /> Record losses
                    </Link>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> Print
                    </Button>
                </PageHeader>

                <FilterBar onApply={applyFilters} applyLabel="Show losses">
                    <BranchSelect branches={branches} value={branchId} onChange={setBranchId} />
                    <div className="min-w-60">
                        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                    </div>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="Type">
                        <option value="">All types</option>
                        {ALL_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {TYPE_META[t]?.label ?? t}
                            </option>
                        ))}
                    </select>
                </FilterBar>

                <StatStrip count={4}>
                    <Stat icon={PackageX} label="Records" value={adjustments.length.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Units written off" value={total_units.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Loss value"
                        value={fmtMoney(total_loss, currency)}
                        tone={total_loss > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={ShieldAlert}
                        label="Biggest cause"
                        value={biggest ? (TYPE_META[biggest[0]]?.label ?? biggest[0]) : '—'}
                        tone={biggest ? undefined : 'muted'}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                    <Panel flush icon={PackageX} title="Adjustments">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className={thCls}>Date</th>
                                        <th className={thCls}>Product</th>
                                        <th className={thCls}>Type</th>
                                        <th className={cn(thCls, 'text-right')}>Qty</th>
                                        <th className={cn(thCls, 'hidden text-right md:table-cell')}>Unit cost</th>
                                        <th className={cn(thCls, 'text-right')}>Loss</th>
                                        <th className={cn(thCls, 'hidden lg:table-cell')}>Note · by</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {adjustments.length === 0 ? (
                                        <EmptyRow colSpan={7} icon={PackageX}>
                                            No stock adjustments in this period.
                                        </EmptyRow>
                                    ) : (
                                        adjustments.map((adj) => {
                                            const meta = TYPE_META[adj.type] ?? TYPE_META.other;
                                            return (
                                                <tr key={adj.id} className="hover:bg-muted/30">
                                                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                        {fmtDate(adj.date + 'T00:00:00+08:00', 'MMM d, yyyy')}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <p className="font-semibold">{adj.product_name}</p>
                                                        {adj.barcode && <p className="font-mono text-[11px] text-muted-foreground">{adj.barcode}</p>}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <StatusPill tone={meta.tone}>
                                                            <meta.icon className="h-3 w-3" /> {adj.type_label}
                                                        </StatusPill>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-bold tabular-nums">{adj.quantity.toLocaleString()}</td>
                                                    <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                                                        {fmtMoney(adj.unit_cost, currency)}
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-bold text-red-700 tabular-nums dark:text-red-400">
                                                        {fmtMoney(adj.total_cost, currency)}
                                                    </td>
                                                    <td className="hidden max-w-56 px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                        <p className="truncate">{adj.note ?? '—'}</p>
                                                        <p className="text-[11px]">{adj.recorded_by || '—'}</p>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                {adjustments.length > 0 && (
                                    <tfoot className="border-t border-border bg-muted/20 font-bold">
                                        <tr>
                                            <td colSpan={3} className="px-4 py-2 text-xs">
                                                Total
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">{total_units.toLocaleString()}</td>
                                            <td className="hidden md:table-cell" />
                                            <td className="px-4 py-2 text-right text-red-700 tabular-nums dark:text-red-400">
                                                {fmtMoney(total_loss, currency)}
                                            </td>
                                            <td className="hidden lg:table-cell" />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={TrendingDown} title="By type" className="self-start">
                        <ul className="divide-y divide-border">
                            {ALL_TYPES.map((t) => {
                                const meta = TYPE_META[t];
                                const row = summary[t];
                                const value = row ? Number(row.total_cost) : 0;
                                const share = total_loss > 0 ? (value / total_loss) * 100 : 0;
                                return (
                                    <li key={t} className="px-4 py-2 text-sm">
                                        <span className="flex items-center gap-2">
                                            <meta.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                            <span className="flex-1 font-semibold">{meta.label}</span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {row ? Number(row.total_qty).toLocaleString() : 0} u
                                            </span>
                                            <span className="w-24 text-right font-bold tabular-nums">{fmtMoney(value, currency)}</span>
                                        </span>
                                        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                                            <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}
