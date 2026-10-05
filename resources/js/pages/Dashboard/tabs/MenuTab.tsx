import { Award, PackageX, Sparkles, UtensilsCrossed } from 'lucide-react';

import { Chart, Empty, Kpi, money, num, Panel, RankList, Skeleton, useChartTheme } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

export default function MenuTab({ data, loading, has }: Props) {
    const t = useChartTheme();
    const k = data?.kpis;
    const maxQty = Math.max(1, ...(data?.top_by_qty ?? []).map((r: any) => r.qty));
    const maxRev = Math.max(1, ...(data?.top_by_revenue ?? []).map((r: any) => r.revenue));
    const cats = (data?.category_mix ?? []).slice(0, 10);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Items sold" icon={UtensilsCrossed} loading={loading} value={num(k?.items_sold)} />
                <Kpi label="Menu items that sold" icon={Sparkles} loading={loading} value={num(k?.distinct_items)} />
                <Kpi label="Best seller" icon={Award} loading={loading} value={k?.top_item ?? '—'} />
                <Kpi label="Not sold this period" icon={PackageX} loading={loading} value={num(k?.never_sold)} invert href={has('6') ? '/products' : undefined} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Top 10 by quantity" href={has('6') ? '/products' : undefined}>
                    {loading ? <Skeleton className="h-72" /> : <RankList valueLabel="Qty" rows={data.top_by_qty.map((r: any) => ({ label: r.name, sub: r.category, value: num(r.qty), share: (r.qty / maxQty) * 100 }))} />}
                </Panel>
                <Panel title="Top 10 by revenue">
                    {loading ? <Skeleton className="h-72" /> : <RankList valueLabel="Revenue" rows={data.top_by_revenue.map((r: any) => ({ label: r.name, sub: r.category, value: money(r.revenue), share: (r.revenue / maxRev) * 100 }))} />}
                </Panel>
            </div>

            <Panel title="Category mix" subtitle="Revenue by menu category">
                {loading ? (
                    <Skeleton className="h-64" />
                ) : cats.length === 0 ? (
                    <Empty />
                ) : (
                    <Chart
                        type="bar"
                        height={Math.max(180, cats.length * 38)}
                        series={[{ name: 'Revenue', data: cats.map((c: any) => c.revenue) }]}
                        options={{
                            ...t.base,
                            colors: [t.series[0]],
                            plotOptions: { bar: { horizontal: true, barHeight: '60%', borderRadius: 4, borderRadiusApplication: 'end' } },
                            xaxis: { ...t.base.xaxis, categories: cats.map((c: any) => c.category), labels: { ...t.base.xaxis.labels, formatter: (v: number) => money(v, true) } },
                            tooltip: { ...t.base.tooltip, y: { formatter: (v: number, o: any) => `${money(v)} · ${num(cats[o.dataPointIndex]?.qty)} sold` } },
                        }}
                    />
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Slowest sellers" subtitle="Items that sold, but the least">
                    {loading ? <Skeleton className="h-64" /> : <RankList valueLabel="Qty" rows={data.bottom.map((r: any) => ({ label: r.name, sub: r.category, value: num(r.qty) }))} />}
                </Panel>
                <Panel title="Not sold in this period" subtitle="Consider promoting or removing these">
                    {loading ? (
                        <Skeleton className="h-64" />
                    ) : data.never_sold.length === 0 ? (
                        <Empty text="Every menu item sold at least once. 🎉" />
                    ) : (
                        <ul className="flex flex-wrap gap-1.5 px-1">
                            {data.never_sold.map((p: any) => (
                                <li key={p.id} className="rounded-full border border-border px-2.5 py-1 text-xs">
                                    {p.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
