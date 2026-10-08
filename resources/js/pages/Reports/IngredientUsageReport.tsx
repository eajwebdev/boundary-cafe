import { Head } from '@inertiajs/react';
import { AlertTriangle, ChevronDown, ChevronRight, FlaskConical, Package } from 'lucide-react';
import { Fragment, useState } from 'react';

import { EmptyRow, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

import { Footnote, PeriodFilterBar, ReportHeader, SectionTitle, openPdf, qty, useReportVisit } from './kit';
import type { ReportContext } from './kit';

interface Row {
    key: string;
    ingredient: string;
    unit: string;
    used: number;
    per_day: number;
    on_hand: number | null;
    days_left: number | null;
    products: { name: string; per_unit: number; sold: number; used: number }[];
}

interface Props extends ReportContext {
    report: {
        days: number;
        summary: { ingredients: number; products: number; running_low: number };
        rows: Row[];
    };
}

export default function IngredientUsageReport(props: Props) {
    const { report, filters } = props;
    const { loading, visit } = useReportVisit('reports.ingredient-usage');
    const [open, setOpen] = useState<Set<string>>(new Set());

    const toggle = (key: string) =>
        setOpen((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });

    return (
        <AdminLayout>
            <Head title="Ingredient Usage" />

            <div className="space-y-4">
                <ReportHeader
                    title="Ingredient Usage"
                    context={props}
                    onPdf={() => openPdf('reports.ingredient-usage.pdf', { branch_id: filters.branch_id, from: filters.from, to: filters.to })}
                />

                <PeriodFilterBar context={props} loading={loading} onApply={visit} />

                <StatStrip count={3}>
                    <Stat
                        icon={FlaskConical}
                        label={`Ingredients used · ${report.days} day(s)`}
                        value={report.summary.ingredients.toLocaleString()}
                    />
                    <Stat icon={Package} label="Made-to-order items sold" value={report.summary.products.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Running low (under 3 days)"
                        value={report.summary.running_low.toLocaleString()}
                        tone={report.summary.running_low ? 'warning' : 'muted'}
                    />
                </StatStrip>

                <Panel
                    flush
                    icon={FlaskConical}
                    title={<SectionTitle no={1}>Ingredient consumption</SectionTitle>}
                    actions={
                        <span className="text-[11px] font-semibold text-muted-foreground">
                            Soonest to run out first · tap a row for the menu items
                        </span>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className="w-8" />
                                    <th className={thCls}>Ingredient</th>
                                    <th className={cn(thCls, 'text-right')}>Used</th>
                                    <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Avg / day</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>On hand</th>
                                    <th className={cn(thCls, 'text-right')}>Days left</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {report.rows.length === 0 ? (
                                    <EmptyRow colSpan={6} icon={FlaskConical}>
                                        No made-to-order items were sold in this period.
                                    </EmptyRow>
                                ) : (
                                    report.rows.map((row) => {
                                        const isOpen = open.has(row.key);
                                        return (
                                            <Fragment key={row.key}>
                                                <tr className="cursor-pointer hover:bg-muted/30" onClick={() => toggle(row.key)}>
                                                    <td className="py-2 pl-4 text-muted-foreground">
                                                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <p className="font-semibold">{row.ingredient}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            in {row.products.length} menu item{row.products.length === 1 ? '' : 's'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                                                        {qty(row.used)} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                                                    </td>
                                                    <td className="hidden px-4 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">
                                                        {qty(row.per_day)} {row.unit}
                                                    </td>
                                                    <td className="hidden px-4 py-2 text-right whitespace-nowrap tabular-nums md:table-cell">
                                                        {row.on_hand === null ? '—' : `${qty(row.on_hand)} ${row.unit}`}
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        {row.days_left === null ? (
                                                            <span className="text-muted-foreground">—</span>
                                                        ) : (
                                                            <StatusPill tone={row.days_left < 3 ? 'danger' : row.days_left < 7 ? 'warning' : 'muted'}>
                                                                {row.days_left.toFixed(1)} days
                                                            </StatusPill>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isOpen &&
                                                    row.products.map((p) => (
                                                        <tr key={p.name} className="bg-muted/20 text-xs text-muted-foreground">
                                                            <td />
                                                            <td className="px-4 py-1.5 pl-8">{p.name}</td>
                                                            <td className="px-4 py-1.5 text-right whitespace-nowrap tabular-nums">
                                                                {qty(p.used)} {row.unit}
                                                            </td>
                                                            <td colSpan={3} className="px-4 py-1.5 text-right tabular-nums">
                                                                {qty(p.sold)} sold × {qty(p.per_unit)} {row.unit} each
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                <Footnote>
                    Worked out the same way the POS deducts stock: made-to-order items sold without a variant, using today’s recipes, with voided
                    sales left out. Quantities are in each recipe’s unit. Days left = stock on hand ÷ average daily use over this period.
                </Footnote>
            </div>
        </AdminLayout>
    );
}
