import { Head } from '@inertiajs/react';
import { AlertTriangle, Clock, Package, PackageX, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BranchSelect, Chip, EmptyRow, FilterBar, Panel, Stat, StatStrip, StatusPill, controlCls, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';

import { Footnote, ReportHeader, SectionTitle, openPdf, peso, qty, useReportVisit } from './kit';
import type { ReportContext } from './kit';

type Status = 'out' | 'low' | 'expired' | 'expiring' | 'ok';

interface Row {
    key: string;
    name: string;
    variant: string | null;
    sku: string | null;
    category: string;
    unit: string;
    stock: number;
    unit_cost: number;
    price: number;
    value: number;
    retail_value: number;
    expiry_date: string | null;
    days_to_expiry: number | null;
    status: Status;
}

interface Props extends ReportContext {
    report: {
        low_stock_threshold: number;
        excluded_count: number;
        summary: { items: number; value: number; retail_value: number; out: number; low: number; expired: number; expiring: number };
        categories: string[];
        rows: Row[];
    };
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
    out: { label: 'Out of stock', tone: 'danger' },
    low: { label: 'Low', tone: 'warning' },
    expired: { label: 'Expired', tone: 'danger' },
    expiring: { label: 'Expiring soon', tone: 'warning' },
    ok: { label: 'OK', tone: 'muted' },
};

type View = 'all' | 'attention' | Status;

export default function InventoryReport(props: Props) {
    const { report, branches, filters } = props;
    const s = report.summary;
    const [branchId, setBranchId] = useState<number | undefined>(filters.branch_id ?? undefined);
    const [view, setView] = useState<View>('all');
    const [category, setCategory] = useState('');
    const [search, setSearch] = useState('');
    const { loading, visit } = useReportVisit('reports.inventory');

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        return report.rows.filter(
            (r) =>
                (view === 'all' || (view === 'attention' ? r.status !== 'ok' : r.status === view)) &&
                (!category || r.category === category) &&
                (!term || `${r.name} ${r.variant ?? ''} ${r.sku ?? ''}`.toLowerCase().includes(term)),
        );
    }, [report.rows, view, category, search]);

    const shownValue = rows.reduce((sum, r) => sum + r.value, 0);
    const attention = s.out + s.low + s.expired + s.expiring;

    return (
        <AdminLayout>
            <Head title="Inventory Report" />

            <div className="space-y-4">
                <ReportHeader
                    title="Inventory Valuation"
                    context={props}
                    scope="stock on hand right now"
                    onPdf={() =>
                        openPdf('reports.inventory.pdf', {
                            branch_id: filters.branch_id,
                            category: category || undefined,
                            status: view === 'all' ? undefined : view,
                        })
                    }
                />

                {branches && (
                    <FilterBar loading={loading} applyLabel="Show branch" onApply={() => visit({ branch_id: branchId })}>
                        <BranchSelect branches={branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
                    </FilterBar>
                )}

                <StatStrip count={5}>
                    <Stat icon={Wallet} label="Stock value at cost" value={peso(s.value)} tone="success" />
                    <Stat icon={Wallet} label="Value at selling price" value={peso(s.retail_value)} />
                    <Stat icon={PackageX} label="Out of stock" value={s.out.toLocaleString()} tone={s.out ? 'warning' : 'muted'} />
                    <Stat
                        icon={AlertTriangle}
                        label={`Low (≤ ${report.low_stock_threshold})`}
                        value={s.low.toLocaleString()}
                        tone={s.low ? 'warning' : 'muted'}
                    />
                    <Stat
                        icon={Clock}
                        label="Expired / expiring"
                        value={`${s.expired} / ${s.expiring}`}
                        tone={s.expired + s.expiring ? 'warning' : 'muted'}
                    />
                </StatStrip>

                <Panel
                    flush
                    icon={Package}
                    title={<SectionTitle no={1}>Stock on hand</SectionTitle>}
                    actions={
                        <span className="text-[11px] font-semibold text-muted-foreground">
                            {rows.length.toLocaleString()} of {s.items.toLocaleString()} items · {peso(shownValue)}
                        </span>
                    }
                >
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                            <Chip active={view === 'all'} onClick={() => setView('all')}>
                                All
                            </Chip>
                            <Chip active={view === 'attention'} onClick={() => setView('attention')}>
                                Needs attention ({attention})
                            </Chip>
                            {(['out', 'low', 'expiring', 'expired'] as const).map((k) => (
                                <Chip key={k} active={view === k} onClick={() => setView(k)}>
                                    {STATUS[k].label}
                                </Chip>
                            ))}
                        </div>
                        <div className="ml-auto flex flex-wrap gap-2">
                            <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlCls} aria-label="Category">
                                <option value="">All categories</option>
                                {report.categories.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                            <label className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Item or SKU"
                                    className={cn(controlCls, 'w-44 pl-8')}
                                    aria-label="Search items"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Item</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Category</th>
                                    <th className={cn(thCls, 'text-right')}>On hand</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Unit cost</th>
                                    <th className={cn(thCls, 'text-right')}>Value</th>
                                    <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Price</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Next expiry</th>
                                    <th className={thCls}>Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.length === 0 ? (
                                    <EmptyRow colSpan={8} icon={Package}>
                                        No items match these filters.
                                    </EmptyRow>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={r.key} className="hover:bg-muted/30">
                                            <td className="px-4 py-2">
                                                <p className="font-semibold">
                                                    {r.name}
                                                    {r.variant && <span className="font-normal text-muted-foreground"> · {r.variant}</span>}
                                                </p>
                                                {r.sku && <p className="font-mono text-[11px] text-muted-foreground">{r.sku}</p>}
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs text-muted-foreground lg:table-cell">{r.category}</td>
                                            <td className="px-4 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                                                {qty(r.stock)} <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>
                                            </td>
                                            <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                                                {peso(r.unit_cost)}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(r.value)}</td>
                                            <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums lg:table-cell">
                                                {peso(r.price)}
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs md:table-cell">
                                                {r.expiry_date ? (
                                                    <>
                                                        {fmtDate(`${r.expiry_date}T12:00:00+08:00`, 'MMM d, yyyy')}
                                                        <span className="block text-[11px] text-muted-foreground">
                                                            {r.days_to_expiry! < 0
                                                                ? `${Math.abs(r.days_to_expiry!)} day(s) ago`
                                                                : r.days_to_expiry === 0
                                                                  ? 'today'
                                                                  : `in ${r.days_to_expiry} day(s)`}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2">
                                                <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                <Footnote>
                    Value at cost uses each branch’s recorded capital per unit; negative stock is valued at zero. “Low” means{' '}
                    {report.low_stock_threshold} or fewer on hand (System Settings → Inventory). Expiry warnings use each item’s own warning days.
                    {report.excluded_count > 0 &&
                        ` ${report.excluded_count} made-to-order, bundle or service item(s) aren’t listed because they hold no stock of their own — their ingredients and components are.`}
                </Footnote>
            </div>
        </AdminLayout>
    );
}
