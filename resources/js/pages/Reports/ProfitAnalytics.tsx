import { Head } from '@inertiajs/react';
import { Building2, Coins, Gift, Info, LayoutGrid, Package, Percent, ShoppingBag, Tags, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Chip, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { Chart, money, shortDate, useChartTheme, useVizPalette } from '@/pages/Dashboard/kit';

import { Footnote, PeriodFilterBar, RankedList, ReportHeader, SectionTitle, peso, pct, qty, useReportVisit } from './kit';
import type { ReportContext } from './kit';

type MenuClass = 'star' | 'workhorse' | 'puzzle' | 'dog';

interface Figures {
    units: number;
    orders: number;
    revenue: number;
    cost: number;
    profit: number;
    margin: number | null;
    avg_price: number;
    profit_per_unit: number;
}

interface ProductRow extends Figures {
    id: number;
    name: string;
    category: string;
    profit_share: number;
    class: MenuClass;
}

interface BranchRow extends Figures {
    id: number;
    name: string;
    products_sold: number;
    profit_share: number;
    top_product: { name: string; profit: number } | null;
}

interface Props extends ReportContext {
    report: {
        totals: {
            revenue: number;
            cost: number;
            profit: number;
            margin: number | null;
            units: number;
            orders: number;
            estimated_cost_share: number;
            reward_cost: number;
        };
        branches: BranchRow[];
        products: ProductRow[];
        thresholds: { popularity: number; profit_per_unit: number };
        categories: (Figures & { name: string })[];
        best_by_branch: { id: number; name: string; products: (Figures & { name: string })[] }[];
        trend: { date: string; revenue: number; profit: number }[];
    };
}

const CLASS_INFO: Record<MenuClass, { label: string; tone: 'success' | 'warning' | 'info' | 'danger'; advice: string }> = {
    star: { label: 'Star', tone: 'success', advice: 'Sells a lot and earns well. Keep it visible and never run out.' },
    workhorse: { label: 'Workhorse', tone: 'warning', advice: 'Sells a lot but earns little per piece. Review its price or recipe cost.' },
    puzzle: { label: 'Puzzle', tone: 'info', advice: 'Earns well but sells little. Promote it, feature it, or bundle it.' },
    dog: { label: 'Dog', tone: 'danger', advice: 'Sells little and earns little. Consider reworking or removing it.' },
};

type SortKey = 'profit' | 'units' | 'revenue' | 'margin';
const SORTS: { key: SortKey; label: string }[] = [
    { key: 'profit', label: 'Most profitable' },
    { key: 'units', label: 'Top selling' },
    { key: 'revenue', label: 'Highest revenue' },
    { key: 'margin', label: 'Best margin' },
];

export default function ProfitAnalytics(props: Props) {
    const { report } = props;
    const t = report.totals;
    const { loading, visit } = useReportVisit('reports.profit');
    const theme = useChartTheme();
    const viz = useVizPalette();
    const [sort, setSort] = useState<SortKey>('profit');
    const [classFilter, setClassFilter] = useState<MenuClass | null>(null);

    const products = useMemo(() => {
        const rows = classFilter ? report.products.filter((p) => p.class === classFilter) : report.products;
        return [...rows].sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
    }, [report.products, sort, classFilter]);
    const classCounts = useMemo(
        () => report.products.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.class]: (acc[p.class] ?? 0) + 1 }), {}),
        [report.products],
    );
    const topByUnits = useMemo(() => [...report.products].sort((a, b) => b.units - a.units).slice(0, 10), [report.products]);
    const topByProfit = report.products.slice(0, 10);
    const showBranches = report.branches.length > 1;

    // Shared chart chrome: solid hairline grid, muted axis text, text tokens for labels.
    const base = useMemo(
        () => ({
            ...theme.base,
            grid: { borderColor: viz.grid, strokeDashArray: 0, padding: { left: 8, right: 16, top: -8 } },
            xaxis: { ...theme.base.xaxis, labels: { style: { colors: viz.muted, fontSize: '11px' } } },
            yaxis: { labels: { style: { colors: viz.muted, fontSize: '11px' } } },
        }),
        [theme, viz],
    );

    const barOptions = (labels: string[]) => ({
        ...base,
        chart: { ...base.chart, type: 'bar' },
        colors: [viz.blue],
        plotOptions: {
            bar: { horizontal: true, barHeight: '60%', borderRadius: 4, borderRadiusApplication: 'end', dataLabels: { position: 'top' } },
        },
        dataLabels: {
            enabled: true,
            offsetX: 28,
            formatter: (v: number) => money(v, true),
            style: { colors: [viz.ink], fontSize: '11px', fontWeight: 600 },
        },
        xaxis: {
            ...base.xaxis,
            categories: labels,
            labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: string) => money(Number(v), true) },
        },
        yaxis: { labels: { style: { colors: viz.ink, fontSize: '12px' }, maxWidth: 180 } },
        tooltip: { ...base.tooltip, y: { formatter: (v: number) => peso(v), title: { formatter: () => 'Gross profit' } } },
        states: { hover: { filter: { type: 'lighten', value: 0.1 } } },
        legend: { show: false },
    });

    const chartHeight = (rows: number) => Math.max(140, rows * 34 + 50);

    return (
        <AdminLayout>
            <Head title="Profit Analytics" />

            <div className="space-y-4">
                <ReportHeader title="Profit Analytics" context={props} />
                <PeriodFilterBar context={props} loading={loading} onApply={(p) => visit(p)} />

                <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
                    <StatStrip count={t.reward_cost > 0 ? 6 : 5}>
                        <Stat icon={Wallet} label="Net revenue" value={peso(t.revenue)} />
                        <Stat icon={Coins} label="Cost of goods" value={peso(t.cost)} />
                        <Stat icon={TrendingUp} label="Gross profit" value={peso(t.profit)} tone={t.profit >= 0 ? 'success' : 'warning'} />
                        <Stat icon={Percent} label="Gross margin" value={t.margin === null ? '—' : pct(t.margin)} />
                        <Stat icon={ShoppingBag} label={`Units sold · ${t.orders.toLocaleString()} orders`} value={qty(t.units)} />
                        {t.reward_cost > 0 && <Stat icon={Gift} label="Rewards given away (cost)" value={peso(t.reward_cost)} tone="muted" />}
                    </StatStrip>

                    {t.estimated_cost_share > 0 && (
                        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                {pct(t.estimated_cost_share)} of the cost shown is estimated from today&apos;s ingredient and product costs, because
                                those sales were made before costs were recorded on each sale. New sales record their exact cost.
                            </span>
                        </p>
                    )}

                    {report.products.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                            No completed sales in this period.
                        </p>
                    ) : (
                        <>
                            {showBranches && (
                                <Panel flush icon={Building2} title={<SectionTitle no={1}>Most profitable branch</SectionTitle>}>
                                    <div className="px-2 pt-2">
                                        <Chart
                                            type="bar"
                                            height={chartHeight(report.branches.length)}
                                            options={barOptions(report.branches.map((b) => b.name))}
                                            series={[{ name: 'Gross profit', data: report.branches.map((b) => b.profit) }]}
                                        />
                                    </div>
                                    <div className="overflow-x-auto border-t border-border">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-border">
                                                    <th className={thCls}>Branch</th>
                                                    <th className={cn(thCls, 'text-right')}>Revenue</th>
                                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Cost</th>
                                                    <th className={cn(thCls, 'text-right')}>Gross profit</th>
                                                    <th className={cn(thCls, 'text-right')}>Margin</th>
                                                    <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Share of profit</th>
                                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Most profitable item</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {report.branches.map((b, i) => (
                                                    <tr key={b.id}>
                                                        <td className="px-4 py-2 font-semibold">
                                                            {i === 0 && <Trophy className="mr-1 inline h-3.5 w-3.5 text-amber-600" />}
                                                            {b.name}
                                                        </td>
                                                        <td className="px-4 py-2 text-right tabular-nums">{peso(b.revenue)}</td>
                                                        <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{peso(b.cost)}</td>
                                                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(b.profit)}</td>
                                                        <td className="px-4 py-2 text-right tabular-nums">
                                                            {b.margin === null ? '—' : pct(b.margin)}
                                                        </td>
                                                        <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">
                                                            {pct(b.profit_share)}
                                                        </td>
                                                        <td className="hidden px-4 py-2 lg:table-cell">
                                                            {b.top_product ? `${b.top_product.name} · ${peso(b.top_product.profit)}` : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            )}

                            <Panel
                                flush
                                icon={TrendingUp}
                                title={<SectionTitle no={showBranches ? 2 : 1}>Revenue and gross profit per day</SectionTitle>}
                            >
                                <div className="px-2 pt-2">
                                    <Chart
                                        type="line"
                                        height={260}
                                        series={[
                                            { name: 'Net revenue', data: report.trend.map((d) => d.revenue) },
                                            { name: 'Gross profit', data: report.trend.map((d) => d.profit) },
                                        ]}
                                        options={{
                                            ...base,
                                            chart: { ...base.chart, type: 'line' },
                                            colors: [viz.blue, viz.orange],
                                            stroke: { width: 2, curve: 'straight', lineCap: 'round' },
                                            markers: { size: 0, hover: { size: 5 }, strokeColors: viz.surface, strokeWidth: 2 },
                                            xaxis: {
                                                ...base.xaxis,
                                                categories: report.trend.map((d) => shortDate(d.date)),
                                                tickAmount: Math.min(10, report.trend.length),
                                                crosshairs: { show: true, stroke: { color: viz.muted, width: 1, dashArray: 0 } },
                                                tooltip: { enabled: false },
                                            },
                                            yaxis: {
                                                labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: number) => money(v, true) },
                                            },
                                            tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => peso(v) } },
                                            legend: { ...base.legend, labels: { colors: viz.ink }, markers: { size: 5 } },
                                        }}
                                    />
                                </div>
                                <Footnote className="px-4 pb-3">
                                    Gross profit = net revenue − cost of goods. The gap between the two lines is what the products cost you.
                                </Footnote>
                            </Panel>

                            <div className="grid gap-4 lg:grid-cols-2">
                                <Panel flush icon={Trophy} title={<SectionTitle no={showBranches ? 3 : 2}>Most profitable products</SectionTitle>}>
                                    <div className="px-2 pt-2">
                                        <Chart
                                            type="bar"
                                            height={chartHeight(topByProfit.length)}
                                            options={barOptions(topByProfit.map((p) => p.name))}
                                            series={[{ name: 'Gross profit', data: topByProfit.map((p) => p.profit) }]}
                                        />
                                    </div>
                                </Panel>
                                <Panel flush icon={ShoppingBag} title={<SectionTitle no={showBranches ? 4 : 3}>Top selling products</SectionTitle>}>
                                    <RankedList
                                        empty="No products sold."
                                        rows={topByUnits.map((p) => ({
                                            key: String(p.id),
                                            label: p.name,
                                            sub: `${peso(p.revenue)} revenue · ${p.margin === null ? '—' : pct(p.margin)} margin`,
                                            value: `${qty(p.units)} sold`,
                                            share: t.units > 0 ? (p.units / t.units) * 100 : 0,
                                        }))}
                                    />
                                </Panel>
                            </div>

                            <Panel
                                flush
                                icon={LayoutGrid}
                                title={<SectionTitle no={showBranches ? 5 : 4}>Menu matrix: popularity × profit per item</SectionTitle>}
                            >
                                <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
                                    <div className="px-2 pt-2">
                                        <Chart
                                            type="scatter"
                                            height={340}
                                            series={[
                                                {
                                                    name: 'Products',
                                                    data: report.products.map((p) => ({ x: p.units, y: p.profit_per_unit, name: p.name })),
                                                },
                                            ]}
                                            options={{
                                                ...base,
                                                chart: { ...base.chart, type: 'scatter', zoom: { enabled: false } },
                                                colors: [viz.blue],
                                                markers: { size: 6, strokeColors: viz.surface, strokeWidth: 2, hover: { sizeOffset: 2 } },
                                                xaxis: {
                                                    ...base.xaxis,
                                                    type: 'numeric',
                                                    tickAmount: 6,
                                                    title: { text: 'Units sold', style: { color: viz.muted, fontSize: '11px', fontWeight: 500 } },
                                                    labels: {
                                                        style: { colors: viz.muted, fontSize: '11px' },
                                                        formatter: (v: string) => qty(Math.round(Number(v))),
                                                    },
                                                },
                                                yaxis: {
                                                    title: {
                                                        text: 'Profit per item',
                                                        style: { color: viz.muted, fontSize: '11px', fontWeight: 500 },
                                                    },
                                                    labels: {
                                                        style: { colors: viz.muted, fontSize: '11px' },
                                                        formatter: (v: number) => money(v, true),
                                                    },
                                                },
                                                annotations: {
                                                    xaxis: [
                                                        { x: report.thresholds.popularity, borderColor: viz.muted, strokeDashArray: 0, opacity: 0.6 },
                                                    ],
                                                    yaxis: [
                                                        {
                                                            y: report.thresholds.profit_per_unit,
                                                            borderColor: viz.muted,
                                                            strokeDashArray: 0,
                                                            opacity: 0.6,
                                                        },
                                                    ],
                                                },
                                                tooltip: {
                                                    ...base.tooltip,
                                                    custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                                                        const p = report.products[dataPointIndex];
                                                        const box = document.createElement('div');
                                                        box.style.padding = '8px 10px';
                                                        box.style.fontSize = '12px';
                                                        const strong = document.createElement('div');
                                                        strong.style.fontWeight = '700';
                                                        strong.textContent = p.name;
                                                        const line = document.createElement('div');
                                                        line.textContent = `${qty(p.units)} sold · ${peso(p.profit_per_unit)} profit each · ${CLASS_INFO[p.class].label}`;
                                                        box.append(strong, line);
                                                        return box.outerHTML;
                                                    },
                                                },
                                                legend: { show: false },
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2 border-t border-border p-4 lg:border-t-0 lg:border-l">
                                        <p className="text-xs text-muted-foreground">
                                            Lines mark the average profit per item ({peso(report.thresholds.profit_per_unit)}) and the popularity bar
                                            ({qty(report.thresholds.popularity)} sold, 70% of an average item). Tap a group to list its items below.
                                        </p>
                                        {(['star', 'workhorse', 'puzzle', 'dog'] as MenuClass[]).map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setClassFilter(classFilter === c ? null : c)}
                                                className={cn(
                                                    'w-full rounded-lg border p-2.5 text-left text-sm transition-colors',
                                                    classFilter === c ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                                                )}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <StatusPill tone={CLASS_INFO[c].tone}>{CLASS_INFO[c].label}</StatusPill>
                                                    <span className="text-xs font-semibold tabular-nums">{classCounts[c] ?? 0} items</span>
                                                </span>
                                                <span className="mt-1 block text-xs text-muted-foreground">{CLASS_INFO[c].advice}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </Panel>

                            {showBranches && (
                                <div className="space-y-2">
                                    <h2 className="text-sm font-bold">
                                        <SectionTitle no={6}>Most profitable items at each branch</SectionTitle>
                                    </h2>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {report.best_by_branch.map((b) => (
                                            <Panel key={b.id} flush icon={Building2} title={b.name}>
                                                <RankedList
                                                    empty="No sales."
                                                    rows={b.products.map((p, i) => ({
                                                        key: `${b.id}-${i}`,
                                                        label: `${i + 1}. ${p.name}`,
                                                        sub: `${qty(p.units)} sold · ${p.margin === null ? '—' : pct(p.margin)} margin`,
                                                        value: peso(p.profit),
                                                    }))}
                                                />
                                            </Panel>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <Panel flush icon={Tags} title={<SectionTitle no={showBranches ? 7 : 5}>By category</SectionTitle>}>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className={thCls}>Category</th>
                                                <th className={cn(thCls, 'text-right')}>Units</th>
                                                <th className={cn(thCls, 'text-right')}>Revenue</th>
                                                <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Cost</th>
                                                <th className={cn(thCls, 'text-right')}>Gross profit</th>
                                                <th className={cn(thCls, 'text-right')}>Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {report.categories.map((c) => (
                                                <tr key={c.name}>
                                                    <td className="px-4 py-2 font-medium">{c.name}</td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{qty(c.units)}</td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{peso(c.revenue)}</td>
                                                    <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{peso(c.cost)}</td>
                                                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(c.profit)}</td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{c.margin === null ? '—' : pct(c.margin)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>

                            <Panel
                                flush
                                icon={Package}
                                title={
                                    <SectionTitle no={showBranches ? 8 : 6}>
                                        All products{classFilter ? ` · ${CLASS_INFO[classFilter].label}s` : ''} ({products.length})
                                    </SectionTitle>
                                }
                                actions={
                                    <div className="flex flex-wrap gap-1">
                                        {SORTS.map((s) => (
                                            <Chip key={s.key} active={sort === s.key} onClick={() => setSort(s.key)}>
                                                {s.label}
                                            </Chip>
                                        ))}
                                        {classFilter && (
                                            <Chip active={false} onClick={() => setClassFilter(null)}>
                                                Show all
                                            </Chip>
                                        )}
                                    </div>
                                }
                            >
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border">
                                                <th className={thCls}>#</th>
                                                <th className={thCls}>Product</th>
                                                <th className={cn(thCls, 'text-right')}>Sold</th>
                                                <th className={cn(thCls, 'hidden text-right md:table-cell')}>Avg price</th>
                                                <th className={cn(thCls, 'hidden text-right md:table-cell')}>Cost each</th>
                                                <th className={cn(thCls, 'text-right')}>Revenue</th>
                                                <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Cost</th>
                                                <th className={cn(thCls, 'text-right')}>Gross profit</th>
                                                <th className={cn(thCls, 'text-right')}>Margin</th>
                                                <th className={cn(thCls, 'hidden sm:table-cell')}>Menu matrix</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {products.map((p, i) => (
                                                <tr key={p.id}>
                                                    <td className="px-4 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
                                                    <td className="px-4 py-2">
                                                        <span className="font-medium">{p.name}</span>
                                                        <span className="block text-[11px] text-muted-foreground">{p.category}</span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{qty(p.units)}</td>
                                                    <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{peso(p.avg_price)}</td>
                                                    <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">
                                                        {peso(p.units > 0 ? p.cost / p.units : 0)}
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{peso(p.revenue)}</td>
                                                    <td className="hidden px-4 py-2 text-right tabular-nums lg:table-cell">{peso(p.cost)}</td>
                                                    <td
                                                        className={cn(
                                                            'px-4 py-2 text-right font-semibold tabular-nums',
                                                            p.profit < 0 && 'text-rose-700 dark:text-rose-300',
                                                        )}
                                                    >
                                                        {peso(p.profit)}
                                                    </td>
                                                    <td className="px-4 py-2 text-right tabular-nums">{p.margin === null ? '—' : pct(p.margin)}</td>
                                                    <td className="hidden px-4 py-2 sm:table-cell">
                                                        <StatusPill tone={CLASS_INFO[p.class].tone}>{CLASS_INFO[p.class].label}</StatusPill>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>

                            <Footnote>
                                Net revenue is what customers paid after discounts, excluding delivery fees, shared across the items in each sale by
                                their value. Cost is each item&apos;s ingredient (recipe) cost or capital when it was sold. Gross margin = gross
                                profit ÷ net revenue. Free loyalty rewards are not counted as sales; their cost is shown separately.
                            </Footnote>
                        </>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
