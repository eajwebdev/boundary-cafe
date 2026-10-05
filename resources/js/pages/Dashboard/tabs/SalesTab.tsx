import { Ban, Percent, Receipt, ShoppingCart, TrendingUp, Truck, Wallet } from 'lucide-react';
import { useMemo } from 'react';

import { Chart, Empty, Kpi, money, num, Panel, shortDate, Skeleton, useChartTheme } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

const CHANNEL_LABEL: Record<string, string> = { counter: 'Counter', dine_in: 'Dine-in (tables)', online: 'Online' };
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', gcash: 'GCash', card: 'Card', others: 'Others' };

export default function SalesTab({ data, loading, has }: Props) {
    const t = useChartTheme();
    const k = data?.kpis;

    const trend = useMemo(() => {
        if (!data) return null;
        return {
            series: [
                { name: 'This period', data: data.trend.map((d: any) => d.revenue) },
                { name: 'Previous period', data: data.trend.map((d: any) => d.previous) },
            ],
            options: {
                ...t.base,
                colors: [t.series[0], t.dark ? '#7d7c76' : '#a3a29c'],
                stroke: { width: [2, 2], curve: 'monotoneCubic', dashArray: [0, 5] },
                fill: { type: ['gradient', 'solid'], gradient: { opacityFrom: 0.25, opacityTo: 0.02 }, opacity: [1, 0] },
                xaxis: { ...t.base.xaxis, categories: data.trend.map((d: any) => shortDate(d.date)), tickAmount: Math.min(10, data.trend.length) },
                yaxis: { ...t.base.yaxis, labels: { ...t.base.yaxis.labels, formatter: (v: number) => money(v, true) } },
                tooltip: { ...t.base.tooltip, shared: true, y: { formatter: (v: number) => money(v) } },
                markers: { size: 0, hover: { size: 5 } },
            },
        };
    }, [data, t]);

    const heat = useMemo(() => {
        if (!data) return null;
        const max = Math.max(1, ...data.heatmap.flatMap((r: any) => r.hours.map((h: any) => h.revenue)));
        return {
            series: [...data.heatmap].reverse().map((r: any) => ({
                name: r.day,
                data: r.hours.map((h: any) => ({ x: h.hour < 12 ? `${h.hour}a` : h.hour === 12 ? '12p' : `${h.hour - 12}p`, y: h.revenue, txns: h.txns })),
            })),
            options: {
                ...t.base,
                legend: { show: false },
                plotOptions: {
                    heatmap: {
                        radius: 3,
                        enableShades: false,
                        colorScale: {
                            ranges: [
                                { from: 0, to: 0, color: t.dark ? '#262624' : '#f1f0ec', name: 'none' },
                                { from: 0.01, to: max * 0.25, color: t.dark ? '#1e3a5f' : '#cfe1f7' },
                                { from: max * 0.25, to: max * 0.5, color: t.dark ? '#24589a' : '#86b5ec' },
                                { from: max * 0.5, to: max * 0.75, color: t.dark ? '#3987e5' : '#2a78d6' },
                                { from: max * 0.75, to: max + 1, color: t.dark ? '#8fbcf3' : '#174a8a' },
                            ],
                        },
                    },
                },
                stroke: { width: 2, colors: [t.dark ? '#1a1a19' : '#ffffff'] },
                tooltip: { ...t.base.tooltip, y: { formatter: (v: number, o: any) => `${money(v)} · ${o?.w?.config?.series?.[o.seriesIndex]?.data?.[o.dataPointIndex]?.txns ?? 0} txns` } },
            },
        };
    }, [data, t]);

    const channelTotal = (data?.channels ?? []).reduce((s: number, c: any) => s + c.revenue, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
                <Kpi label="Revenue" icon={TrendingUp} loading={loading} value={money(k?.revenue)} change={k?.revenue_change} hint={k?.revenue_change != null ? 'vs previous period' : undefined} href={has('19') ? '/reports/sales' : undefined} />
                <Kpi label="Transactions" icon={Receipt} loading={loading} value={num(k?.transactions)} change={k?.transactions_change} href={has('3') ? '/sales/history' : undefined} />
                <Kpi label="Average ticket" icon={ShoppingCart} loading={loading} value={money(k?.average_ticket)} change={k?.average_ticket_change} />
                <Kpi
                    label="Gross profit"
                    icon={Wallet}
                    loading={loading}
                    value={money(k?.gross_profit)}
                    change={k?.gross_profit_change}
                    hint={k?.gross_margin != null ? `${k.gross_margin}% margin` : undefined}
                />
                <Kpi label="Avg per day" icon={TrendingUp} loading={loading} value={money(k?.avg_daily)} />
                <Kpi label="Discounts & points" icon={Percent} loading={loading} value={money((k?.discounts ?? 0) + (k?.loyalty_discounts ?? 0))} hint={k ? `${money(k.loyalty_discounts, true)} from points` : undefined} />
                <Kpi label="Delivery fees · VAT" icon={Truck} loading={loading} value={money(k?.delivery_fees)} hint={k ? `VAT ${money(k.vat, true)}` : undefined} />
                <Kpi label="Voided sales" icon={Ban} loading={loading} value={num(k?.voids)} hint={k ? money(k.void_total) : undefined} invert />
            </div>

            <Panel title="Revenue trend" subtitle="Daily revenue, compared with the previous period of the same length">
                {loading || !trend ? <Skeleton className="h-72" /> : data.trend.every((d: any) => !d.revenue && !d.previous) ? <Empty height={280} /> : <Chart type="area" height={290} options={trend.options} series={trend.series} />}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Busiest hours" subtitle="Revenue by weekday and hour" className="lg:col-span-2">
                    {loading || !heat ? <Skeleton className="h-64" /> : <Chart type="heatmap" height={270} options={heat.options} series={heat.series} />}
                </Panel>
                <Panel title="Sales by channel" subtitle="Counter, dine-in tables and online">
                    {loading ? (
                        <Skeleton className="h-48" />
                    ) : data.channels.length === 0 ? (
                        <Empty />
                    ) : (
                        <ul className="space-y-3 px-1 pt-1">
                            {data.channels
                                .sort((a: any, b: any) => b.revenue - a.revenue)
                                .map((c: any, i: number) => (
                                    <li key={c.channel}>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2 font-medium">
                                                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.series[i] }} />
                                                {CHANNEL_LABEL[c.channel] ?? c.channel}
                                            </span>
                                            <span className="font-semibold tabular-nums">{money(c.revenue)}</span>
                                        </div>
                                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                                            <div className="h-full rounded-full" style={{ width: `${channelTotal ? (c.revenue / channelTotal) * 100 : 0}%`, background: t.series[i] }} />
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {c.transactions} txns · {channelTotal ? Math.round((c.revenue / channelTotal) * 100) : 0}%
                                        </p>
                                    </li>
                                ))}
                        </ul>
                    )}
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Payment methods" subtitle="Revenue by tender type">
                    {loading ? (
                        <Skeleton className="h-48" />
                    ) : data.payments.length === 0 ? (
                        <Empty />
                    ) : (
                        <Chart
                            type="bar"
                            height={Math.max(160, data.payments.length * 46)}
                            series={[{ name: 'Revenue', data: data.payments.map((p: any) => p.revenue) }]}
                            options={{
                                ...t.base,
                                colors: [t.series[0]],
                                plotOptions: { bar: { horizontal: true, barHeight: '55%', borderRadius: 4, borderRadiusApplication: 'end' } },
                                xaxis: { ...t.base.xaxis, categories: data.payments.map((p: any) => METHOD_LABEL[p.method] ?? p.method), labels: { ...t.base.xaxis.labels, formatter: (v: number) => money(v, true) } },
                                tooltip: { ...t.base.tooltip, y: { formatter: (v: number, o: any) => `${money(v)} · ${data.payments[o.dataPointIndex]?.transactions} txns` } },
                            }}
                        />
                    )}
                </Panel>
                <Panel title="Latest transactions" href={has('3') ? '/sales/history' : undefined}>
                    {loading ? (
                        <Skeleton className="h-48" />
                    ) : data.recent.length === 0 ? (
                        <Empty text="No sales yet." />
                    ) : (
                        <ul className="divide-y divide-border px-1">
                            {data.recent.map((s: any) => (
                                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                    <div className="min-w-0">
                                        <p className="truncate font-mono text-xs font-semibold">{s.receipt_number}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {CHANNEL_LABEL[s.channel] ?? s.channel} · {METHOD_LABEL[s.payment_method] ?? s.payment_method} · {s.cashier || '—'} ·{' '}
                                            {new Date(s.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        </p>
                                    </div>
                                    <span className={s.status === 'voided' ? 'text-muted-foreground line-through' : 'font-semibold tabular-nums'}>{money(s.total)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
