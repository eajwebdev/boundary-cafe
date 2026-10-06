import { Head, router } from '@inertiajs/react';
import { AlertTriangle, TrendingDown, Clock, ShieldAlert, RefreshCw, MoreHorizontal, PackageX, Download } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
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

const TYPE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    damage: { label: 'Damage', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: AlertTriangle },
    loss: { label: 'Loss', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20', icon: TrendingDown },
    expired: { label: 'Expired', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: Clock },
    theft: { label: 'Theft', color: 'text-purple-500 bg-purple-500/10 border-purple-500/20', icon: ShieldAlert },
    correction: { label: 'Correction', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: RefreshCw },
    other: { label: 'Other', color: 'text-muted-foreground bg-muted border-border', icon: MoreHorizontal },
};

function fmtMoney(n: number, currency: string) {
    return `${currency}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TypeBadge({ type, label }: { type: string; label: string }) {
    const meta = TYPE_META[type] ?? TYPE_META.other;
    const Icon = meta.icon;
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', meta.color)}>
            <Icon className="h-3 w-3" />
            {label}
        </span>
    );
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

    const allTypes = ['damage', 'loss', 'expired', 'theft', 'correction', 'other'];

    return (
        <AdminLayout>
            <Head title="Stock Loss Report" />
            <div className="mx-auto max-w-7xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Stock Loss Report</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            {filters.from} — {filters.to}
                            {filters.type && ` · ${TYPE_META[filters.type]?.label ?? filters.type} only`}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <a
                            href={routes.stockAdjustments.index()}
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                        >
                            <PackageX className="h-3.5 w-3.5" />
                            Manage
                        </a>
                        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
                            <Download className="h-3.5 w-3.5" />
                            Print / Export
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Date Range</label>
                        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-muted-foreground">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        >
                            <option value="">All types</option>
                            {allTypes.map((t) => (
                                <option key={t} value={t}>
                                    {TYPE_META[t]?.label ?? t}
                                </option>
                            ))}
                        </select>
                    </div>
                    {branches && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-muted-foreground">Branch</label>
                            <select
                                value={branchId}
                                onChange={(e) => setBranchId(e.target.value)}
                                className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                                <option value="">All branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <Button onClick={applyFilters} size="sm" className="h-9 self-end">
                        Apply
                    </Button>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {allTypes.map((t) => {
                        const meta = TYPE_META[t] ?? TYPE_META.other;
                        const Icon = meta.icon;
                        const s = summary[t];
                        return (
                            <div key={t} className="space-y-1 rounded-xl border border-border bg-card p-3">
                                <div className={cn('inline-flex items-center gap-1 text-xs font-semibold', meta.color.split(' ')[0])}>
                                    <Icon className="h-3.5 w-3.5" />
                                    {meta.label}
                                </div>
                                <p className="text-xl font-black tabular-nums">{s ? Number(s.total_qty).toLocaleString() : 0}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">{fmtMoney(s ? Number(s.total_cost) : 0, currency)}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Total */}
                <div className="flex flex-wrap gap-6 rounded-xl border border-destructive/20 bg-destructive/8 px-5 py-4">
                    <div>
                        <p className="text-xs text-muted-foreground">Total Units</p>
                        <p className="text-2xl font-black tabular-nums">{total_units.toLocaleString()}</p>
                    </div>
                    <div className="w-px self-stretch bg-border" />
                    <div>
                        <p className="text-xs text-muted-foreground">Total Loss Value</p>
                        <p className="text-2xl font-black text-destructive tabular-nums">{fmtMoney(total_loss, currency)}</p>
                    </div>
                    <div className="w-px self-stretch bg-border" />
                    <div>
                        <p className="text-xs text-muted-foreground">Records</p>
                        <p className="text-2xl font-black tabular-nums">{adjustments.length.toLocaleString()}</p>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Product</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Type</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Qty</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Unit Cost</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Loss Value</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Note</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Recorded By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {adjustments.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                            <PackageX className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                            No stock adjustments in this period
                                        </td>
                                    </tr>
                                ) : (
                                    adjustments.map((adj) => (
                                        <tr key={adj.id} className="transition-colors hover:bg-muted/20">
                                            <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                                                {fmtDate(adj.date + 'T00:00:00+08:00', 'MMM d, yyyy')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-foreground">{adj.product_name}</p>
                                                {adj.barcode && <p className="text-[11px] text-muted-foreground">{adj.barcode}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <TypeBadge type={adj.type} label={adj.type_label} />
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold tabular-nums">{adj.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                                                {fmtMoney(adj.unit_cost, currency)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-destructive tabular-nums">
                                                {fmtMoney(adj.total_cost, currency)}
                                            </td>
                                            <td className="max-w-[200px] truncate px-4 py-3 text-xs text-muted-foreground">{adj.note ?? '—'}</td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">{adj.recorded_by || '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {adjustments.length > 0 && (
                                <tfoot>
                                    <tr className="border-t border-border bg-muted/30">
                                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-foreground">
                                            TOTAL
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-foreground tabular-nums">
                                            {total_units.toLocaleString()}
                                        </td>
                                        <td />
                                        <td className="px-4 py-3 text-right font-black text-destructive tabular-nums">
                                            {fmtMoney(total_loss, currency)}
                                        </td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
