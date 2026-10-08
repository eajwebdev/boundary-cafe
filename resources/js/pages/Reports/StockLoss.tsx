import { Head, Link } from '@inertiajs/react';
import { AlertTriangle, Clock, MoreHorizontal, Package, PackageX, RefreshCw, ShieldAlert, TrendingDown } from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, Panel, Stat, StatStrip, StatusPill, controlCls, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

import { Footnote, PeriodFilterBar, RankedList, ReportHeader, SectionTitle, openPdf, peso, qty, useReportVisit } from './kit';
import type { ReportContext } from './kit';

interface Props extends ReportContext {
    type: string | null;
    report: {
        summary: { records: number; items: number; value: number; top_cause: string | null };
        by_type: { key: string; label: string; count: number; value: number; share: number }[];
        by_product: { name: string; unit: string; count: number; quantity: number; value: number }[];
        rows: {
            id: number;
            date: string;
            product: string;
            barcode: string | null;
            unit: string;
            type: string;
            type_label: string;
            quantity: number;
            unit_cost: number;
            value: number;
            note: string | null;
            recorded_by: string;
        }[];
    };
}

const TYPE_META: Record<string, { tone: Tone; icon: React.ElementType }> = {
    damage: { tone: 'danger', icon: AlertTriangle },
    loss: { tone: 'warning', icon: TrendingDown },
    expired: { tone: 'warning', icon: Clock },
    theft: { tone: 'danger', icon: ShieldAlert },
    correction: { tone: 'info', icon: RefreshCw },
    other: { tone: 'muted', icon: MoreHorizontal },
};

export default function StockLossReport(props: Props) {
    const { report, filters } = props;
    const s = report.summary;
    const [type, setType] = useState(props.type ?? '');
    const { loading, visit } = useReportVisit('reports.stock-loss');

    return (
        <AdminLayout>
            <Head title="Stock Loss Report" />

            <div className="space-y-4">
                <ReportHeader
                    title="Stock Loss Report"
                    context={props}
                    onPdf={() =>
                        openPdf('reports.stock-loss.pdf', { branch_id: filters.branch_id, from: filters.from, to: filters.to, type: props.type })
                    }
                >
                    <Link
                        href={routes.stockAdjustments.index()}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <PackageX className="h-4 w-4" /> Record a write-off
                    </Link>
                </ReportHeader>

                <PeriodFilterBar context={props} loading={loading} onApply={(p) => visit({ ...p, type })}>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="Cause">
                        <option value="">All causes</option>
                        {report.by_type.map((t) => (
                            <option key={t.key} value={t.key}>
                                {t.label}
                            </option>
                        ))}
                    </select>
                </PeriodFilterBar>

                <StatStrip count={3}>
                    <Stat
                        icon={TrendingDown}
                        label={`Loss value at cost · ${s.records} record(s)`}
                        value={peso(s.value)}
                        tone={s.value > 0 ? 'warning' : 'muted'}
                    />
                    <Stat icon={Package} label="Items affected" value={s.items.toLocaleString()} />
                    <Stat icon={ShieldAlert} label="Biggest cause" value={s.top_cause ?? '—'} tone={s.top_cause ? undefined : 'muted'} />
                </StatStrip>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel flush icon={TrendingDown} title={<SectionTitle no={1}>By cause</SectionTitle>}>
                        <RankedList
                            empty="No write-offs in this period."
                            rows={report.by_type
                                .filter((t) => t.count > 0)
                                .map((t) => ({
                                    key: t.key,
                                    label: t.label,
                                    sub: `${t.count} record${t.count === 1 ? '' : 's'}`,
                                    value: peso(t.value),
                                    share: t.share,
                                }))}
                            total={s.records ? peso(s.value) : undefined}
                        />
                    </Panel>
                    <Panel flush icon={Package} title={<SectionTitle no={2}>Most affected items</SectionTitle>} className="self-start">
                        <RankedList
                            empty="No write-offs in this period."
                            rows={report.by_product.map((p) => ({
                                key: p.name,
                                label: p.name,
                                sub: `${qty(p.quantity)} ${p.unit} · ${p.count} record${p.count === 1 ? '' : 's'}`,
                                value: peso(p.value),
                                share: s.value > 0 ? (p.value / s.value) * 100 : 0,
                            }))}
                        />
                    </Panel>
                </div>

                <Panel flush icon={PackageX} title={<SectionTitle no={3}>Write-off register</SectionTitle>}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Date</th>
                                    <th className={thCls}>Item</th>
                                    <th className={thCls}>Cause</th>
                                    <th className={cn(thCls, 'text-right')}>Qty</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Unit cost</th>
                                    <th className={cn(thCls, 'text-right')}>Value</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Note · recorded by</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {report.rows.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={PackageX}>
                                        No write-offs in this period.
                                    </EmptyRow>
                                ) : (
                                    report.rows.map((row) => {
                                        const meta = TYPE_META[row.type] ?? TYPE_META.other;
                                        return (
                                            <tr key={row.id} className="hover:bg-muted/30">
                                                <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(row.date, 'MMM d, yyyy h:mm a')}</td>
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{row.product}</p>
                                                    {row.barcode && <p className="font-mono text-[11px] text-muted-foreground">{row.barcode}</p>}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <StatusPill tone={meta.tone}>
                                                        <meta.icon className="h-3 w-3" /> {row.type_label}
                                                    </StatusPill>
                                                </td>
                                                <td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
                                                    {qty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit}</span>
                                                </td>
                                                <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                                                    {peso(row.unit_cost)}
                                                </td>
                                                <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(row.value)}</td>
                                                <td className="hidden max-w-60 px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                    <p className="truncate">{row.note || '—'}</p>
                                                    <p className="text-[11px]">{row.recorded_by}</p>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                            {report.rows.length > 0 && (
                                <tfoot className="border-t border-border bg-muted/20 font-bold">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2">
                                            {s.records} record(s)
                                        </td>
                                        <td />
                                        <td className="hidden md:table-cell" />
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(s.value)}</td>
                                        <td className="hidden lg:table-cell" />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </Panel>

                <Footnote>
                    Values use the unit cost recorded with each write-off. Quantities are only totalled per item, because different items are counted
                    in different units.
                </Footnote>
            </div>
        </AdminLayout>
    );
}
