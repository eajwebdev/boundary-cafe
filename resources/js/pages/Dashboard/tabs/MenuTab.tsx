import {
    ArrowDownRight,
    ArrowUpRight,
    Award,
    Coins,
    Layers,
    PackageX,
    Percent,
    ShoppingBasket,
    Sparkles,
    TrendingUp,
    UtensilsCrossed,
    Wallet,
} from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import { Chart, Empty, Kpi, money, num, Panel, RankList, Skeleton, shortDate, useChartTheme, useVizPalette } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

const CHANNELS = [
    { key: 'counter', label: 'Counter' },
    { key: 'dine_in', label: 'Dine-in tables' },
    { key: 'online', label: 'Online' },
] as const;

const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num(Math.abs(n))}`;

export default function MenuTab({ data, loading, has }: Props) {
    const t = useChartTheme();
    const viz = useVizPalette();
    const k = data?.kpis;
    const maxQty = Math.max(1, ...(data?.top_by_qty ?? []).map((r: any) => r.qty));
    const maxRev = Math.max(1, ...(data?.top_by_revenue ?? []).map((r: any) => r.revenue));
    const cats = (data?.category_mix ?? []).slice(0, 10);

    // Solid hairline grid and text-token labels for every chart on this tab.
    const base = useMemo(
        () => ({
            ...t.base,
            grid: { borderColor: viz.grid, strokeDashArray: 0, padding: { left: 6, right: 16, top: -8 } },
            xaxis: { ...t.base.xaxis, labels: { style: { colors: viz.muted, fontSize: '11px' } } },
            yaxis: { labels: { style: { colors: viz.muted, fontSize: '11px' } } },
        }),
        [t, viz],
    );

    /** Horizontal single-color bars with the value at the tip. */
    const hBar = (labels: string[], format: (v: number) => string, tooltip: (i: number) => string) => ({
        ...base,
        colors: [viz.blue],
        plotOptions: {
            bar: { horizontal: true, barHeight: '60%', borderRadius: 4, borderRadiusApplication: 'end', dataLabels: { position: 'top' } },
        },
        dataLabels: { enabled: true, offsetX: 26, formatter: format, style: { colors: [viz.ink], fontSize: '11px', fontWeight: 600 } },
        xaxis: {
            ...base.xaxis,
            categories: labels,
            labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: string) => format(Number(v)) },
        },
        yaxis: { labels: { style: { colors: viz.ink, fontSize: '12px' }, maxWidth: 170 } },
        tooltip: { ...base.tooltip, y: { formatter: (_v: number, o: any) => tooltip(o.dataPointIndex), title: { formatter: () => '' } } },
        legend: { show: false },
    });
    const barHeight = (n: number) => Math.max(160, n * 34 + 40);

    const movers = useMemo(() => {
        if (!data) return [];
        return [...data.movers.up, ...[...data.movers.down].reverse()];
    }, [data]);

    const heat = useMemo(() => {
        const rows = data?.category_hours ?? [];
        if (!rows.length) return null;
        const active = Array.from({ length: 24 }, (_, h) => h).filter((h) => rows.some((r: any) => r.hours[h] > 0));
        const from = Math.max(0, Math.min(...active) - 1);
        const to = Math.min(23, Math.max(...active) + 1);
        const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
        const max = Math.max(1, ...rows.flatMap((r: any) => r.hours));
        return {
            height: Math.max(180, rows.length * 34 + 60),
            series: [...rows].reverse().map((r: any) => ({ name: r.category, data: hours.map((h) => ({ x: hourLabel(h), y: r.hours[h] })) })),
            options: {
                ...base,
                legend: { show: false },
                plotOptions: {
                    heatmap: {
                        radius: 3,
                        enableShades: false,
                        colorScale: {
                            ranges: [
                                { from: 0, to: 0, color: t.heatmap[0], name: 'none' },
                                { from: 0.01, to: max * 0.25, color: t.heatmap[1] },
                                { from: max * 0.25, to: max * 0.5, color: t.heatmap[2] },
                                { from: max * 0.5, to: max * 0.75, color: t.heatmap[3] },
                                { from: max * 0.75, to: max + 1, color: t.heatmap[4] },
                            ],
                        },
                    },
                },
                stroke: { width: 2, colors: [t.surface] },
                yaxis: { labels: { style: { colors: viz.ink, fontSize: '12px' }, maxWidth: 150 } },
                tooltip: { ...base.tooltip, y: { formatter: (v: number) => `${num(v)} sold` } },
            },
        };
    }, [data, base, t, viz]);

    const channelRows = data?.category_channels ?? [];
    const channelsUsed = CHANNELS.filter((c) => channelRows.some((r: any) => r[c.key] > 0));

    return (
        <div className="space-y-4">
            {/* ── Headline numbers ───────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi
                    label="Items sold"
                    icon={UtensilsCrossed}
                    loading={loading}
                    value={num(k?.items_sold)}
                    change={k?.items_sold_change}
                    hint={k?.items_sold_change != null ? 'vs previous period' : undefined}
                />
                <Kpi
                    label="Item sales"
                    icon={Wallet}
                    loading={loading}
                    value={money(k?.item_sales)}
                    change={k?.item_sales_change}
                    hint="before order discounts"
                />
                <Kpi
                    label="Gross profit from menu"
                    icon={TrendingUp}
                    loading={loading}
                    value={money(k?.gross_profit)}
                    href={has('50') ? '/reports/profit' : undefined}
                />
                <Kpi
                    label="Menu margin"
                    icon={Percent}
                    loading={loading}
                    value={k?.margin == null ? '—' : `${k.margin}%`}
                    hint="gross profit ÷ net revenue"
                />
                <Kpi label="Items per order" icon={ShoppingBasket} loading={loading} value={num(k?.items_per_order)} />
                <Kpi label="Best seller" icon={Award} loading={loading} value={k?.top_item ?? '—'} />
                <Kpi label="Most profitable item" icon={Coins} loading={loading} value={k?.top_profit_item ?? '—'} />
                <Kpi
                    label="Not sold this period"
                    icon={PackageX}
                    loading={loading}
                    value={`${num(k?.never_sold)} of ${num((k?.never_sold ?? 0) + (k?.distinct_items ?? 0))}`}
                    href={has('6') ? '/products' : undefined}
                />
            </div>

            {/* ── Best sellers, day by day ───────────────────── */}
            <Panel title="Best sellers, day by day" subtitle="Units sold per day for your top items, and the change vs the previous period">
                {loading ? (
                    <Skeleton className="h-48" />
                ) : !data.item_trends.length ? (
                    <Empty />
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {data.item_trends.map((item: any) => (
                            <div key={item.id} className="rounded-lg border border-border p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{item.name}</p>
                                        <p className="text-lg leading-tight font-extrabold tabular-nums">{num(item.qty)} sold</p>
                                    </div>
                                    {item.change != null && (
                                        <span
                                            className={cn(
                                                'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                                                item.change >= 0
                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                                            )}
                                        >
                                            {item.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                            {Math.abs(item.change)}%
                                        </span>
                                    )}
                                </div>
                                <Chart
                                    type="area"
                                    height={64}
                                    series={[{ name: item.name, data: item.series }]}
                                    options={{
                                        chart: { sparkline: { enabled: true }, animations: { enabled: false } },
                                        colors: [viz.blue],
                                        stroke: { width: 2, curve: 'straight' },
                                        fill: { type: 'solid', opacity: 0.1 },
                                        xaxis: { categories: item.days.map(shortDate) },
                                        tooltip: {
                                            theme: t.dark ? 'dark' : 'light',
                                            y: { formatter: (v: number) => `${num(v)} sold` },
                                            x: { show: true },
                                        },
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Top 10 by quantity" href={has('6') ? '/products' : undefined}>
                    {loading ? (
                        <Skeleton className="h-72" />
                    ) : (
                        <RankList
                            valueLabel="Qty"
                            rows={data.top_by_qty.map((r: any) => ({
                                label: r.name,
                                sub: r.category,
                                value: num(r.qty),
                                share: (r.qty / maxQty) * 100,
                            }))}
                        />
                    )}
                </Panel>
                <Panel title="Top 10 by revenue">
                    {loading ? (
                        <Skeleton className="h-72" />
                    ) : (
                        <RankList
                            valueLabel="Revenue"
                            rows={data.top_by_revenue.map((r: any) => ({
                                label: r.name,
                                sub: r.category,
                                value: money(r.revenue),
                                share: (r.revenue / maxRev) * 100,
                            }))}
                        />
                    )}
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel
                    title="Most profitable items"
                    subtitle="Gross profit (net revenue − ingredient / product cost)"
                    href={has('50') ? '/reports/profit' : undefined}
                >
                    {loading ? (
                        <Skeleton className="h-72" />
                    ) : !data.top_by_profit.length ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={barHeight(data.top_by_profit.length)}
                            series={[{ name: 'Gross profit', data: data.top_by_profit.map((p: any) => p.profit) }]}
                            options={hBar(
                                data.top_by_profit.map((p: any) => p.name),
                                (v) => money(v, true),
                                (i) => {
                                    const p = data.top_by_profit[i];
                                    return `${money(p.profit)} profit · ${p.margin ?? '—'}% margin · ${num(p.qty)} sold`;
                                },
                            )}
                        />
                    )}
                </Panel>

                <Panel title="Rising and falling items" subtitle="Change in units sold vs the previous period of the same length">
                    {loading ? (
                        <Skeleton className="h-72" />
                    ) : !movers.length ? (
                        <Empty text="No change against the previous period." />
                    ) : (
                        <>
                            <div className="mb-1 flex flex-wrap gap-3 px-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: viz.up }} /> Selling more
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: viz.down }} /> Selling less
                                </span>
                            </div>
                            <Chart
                                type="bar"
                                height={barHeight(movers.length)}
                                series={[{ name: 'Change in units', data: movers.map((m: any) => m.change) }]}
                                options={{
                                    ...hBar(
                                        movers.map((m: any) => m.name),
                                        signed,
                                        (i) => `${signed(movers[i].change)} · ${num(movers[i].qty)} now, ${num(movers[i].previous)} before`,
                                    ),
                                    plotOptions: {
                                        bar: {
                                            horizontal: true,
                                            barHeight: '60%',
                                            borderRadius: 4,
                                            borderRadiusApplication: 'end',
                                            dataLabels: { position: 'top' },
                                            colors: {
                                                ranges: [
                                                    { from: -1_000_000, to: -0.0001, color: viz.down },
                                                    { from: 0, to: 1_000_000, color: viz.up },
                                                ],
                                            },
                                        },
                                    },
                                }}
                            />
                        </>
                    )}
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Category mix" subtitle="Revenue by menu category">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : cats.length === 0 ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={barHeight(cats.length)}
                            series={[{ name: 'Revenue', data: cats.map((c: any) => c.revenue) }]}
                            options={hBar(
                                cats.map((c: any) => c.category),
                                (v) => money(v, true),
                                (i) => `${money(cats[i].revenue)} · ${num(cats[i].qty)} sold`,
                            )}
                        />
                    )}
                </Panel>

                <Panel title="Margin by category" subtitle="How much of each peso the category keeps after cost">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : !data.category_margin.length ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={barHeight(data.category_margin.length)}
                            series={[{ name: 'Margin', data: data.category_margin.map((c: any) => c.margin ?? 0) }]}
                            options={{
                                ...hBar(
                                    data.category_margin.map((c: any) => c.category),
                                    (v) => `${Math.round(v)}%`,
                                    (i) => {
                                        const c = data.category_margin[i];
                                        return `${c.margin ?? '—'}% margin · ${money(c.profit)} profit on ${money(c.revenue)}`;
                                    },
                                ),
                                xaxis: {
                                    ...base.xaxis,
                                    categories: data.category_margin.map((c: any) => c.category),
                                    max: 100,
                                    min: 0,
                                    labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: string) => `${Math.round(Number(v))}%` },
                                },
                            }}
                        />
                    )}
                </Panel>
            </div>

            <Panel title="When each category sells" subtitle="Units sold by hour of day: darker means busier">
                {loading || !heat ? (
                    loading ? (
                        <Skeleton className="h-64" />
                    ) : (
                        <Empty />
                    )
                ) : (
                    <Chart type="heatmap" height={heat.height} options={heat.options} series={heat.series} />
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Where each category sells" subtitle="Item revenue by channel">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : !channelRows.length ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={barHeight(channelRows.length) + 30}
                            series={channelsUsed.map((c) => ({ name: c.label, data: channelRows.map((r: any) => r[c.key]) }))}
                            options={{
                                ...base,
                                chart: { ...base.chart, stacked: true },
                                colors: channelsUsed.map((c) => viz.channels[c.key]),
                                plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 4, borderRadiusApplication: 'end' } },
                                stroke: { width: 2, colors: [t.surface] },
                                xaxis: {
                                    ...base.xaxis,
                                    categories: channelRows.map((r: any) => r.category),
                                    labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: string) => money(Number(v), true) },
                                },
                                yaxis: { labels: { style: { colors: viz.ink, fontSize: '12px' }, maxWidth: 150 } },
                                legend: { ...base.legend, show: true, labels: { colors: viz.ink }, showForSingleSeries: true },
                                tooltip: { ...base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
                            }}
                        />
                    )}
                </Panel>

                <Panel title="Order size" subtitle="How many items people buy in one order">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : data.order_sizes.every((s: any) => !s.orders) ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={260}
                            series={[{ name: 'Orders', data: data.order_sizes.map((s: any) => s.orders) }]}
                            options={{
                                ...base,
                                colors: [viz.blue],
                                plotOptions: {
                                    bar: { columnWidth: '45%', borderRadius: 4, borderRadiusApplication: 'end', dataLabels: { position: 'top' } },
                                },
                                dataLabels: { enabled: true, offsetY: -18, style: { colors: [viz.ink], fontSize: '11px', fontWeight: 600 } },
                                xaxis: {
                                    ...base.xaxis,
                                    categories: data.order_sizes.map((s: any) => (s.size === '1' ? '1 item' : `${s.size} items`)),
                                },
                                yaxis: { labels: { style: { colors: viz.muted, fontSize: '11px' }, formatter: (v: number) => num(Math.round(v)) } },
                                tooltip: { ...base.tooltip, y: { formatter: (v: number) => `${num(v)} orders` } },
                                legend: { show: false },
                            }}
                        />
                    )}
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Frequently bought together" subtitle="Combo ideas: items that often share an order">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : !data.pairs.length ? (
                        <Empty text="Not enough multi-item orders yet." />
                    ) : (
                        <ul className="divide-y divide-border px-1">
                            {data.pairs.map((p: any, i: number) => (
                                <li key={i} className="flex items-center gap-3 py-2">
                                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold">
                                            {p.a} <span className="text-muted-foreground">+</span> {p.b}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {p.attach_rate}% of orders with {p.a} also had {p.b}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-bold tabular-nums">{num(p.orders)} orders</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>

                <Panel title="Slowest sellers" subtitle="Items that sold, but the least">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : (
                        <RankList valueLabel="Qty" rows={data.bottom.map((r: any) => ({ label: r.name, sub: r.category, value: num(r.qty) }))} />
                    )}
                </Panel>
            </div>

            <Panel title="Not sold in this period" subtitle="Consider promoting or removing these">
                {loading ? (
                    <Skeleton className="h-32" />
                ) : data.never_sold.length === 0 ? (
                    <Empty text="Every menu item sold at least once." />
                ) : (
                    <ul className="flex flex-wrap gap-1.5 px-1">
                        {data.never_sold.map((p: any) => (
                            <li key={p.id} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                                <Sparkles className="h-3 w-3 text-muted-foreground" />
                                {p.name}
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}
