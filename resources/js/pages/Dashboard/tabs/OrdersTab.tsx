import { Link } from '@inertiajs/react';
import { Bike, CheckCircle2, Clock, Hourglass, ShoppingBag, Utensils, XCircle } from 'lucide-react';

import { Chart, Empty, Kpi, money, num, Panel, RankList, shortDate, Skeleton, useChartTheme } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

const LIVE = [
    { key: 'pending', label: 'New' },
    { key: 'accepted', label: 'Confirmed' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready', label: 'Ready' },
    { key: 'out_for_delivery', label: 'On the way' },
];

const mins = (v: number | null | undefined) => (v == null ? '—' : `${v} min`);

export default function OrdersTab({ data, loading, has }: Props) {
    const t = useChartTheme();
    const k = data?.kpis;
    const maxBarangay = Math.max(1, ...(data?.by_barangay ?? []).map((b: any) => b.orders));

    return (
        <div className="space-y-4">
            {/* Live board */}
            <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-bold">Right now</h3>
                    {has('40') && (
                        <Link href="/online-orders" className="text-sm font-semibold text-primary">
                            Open online orders board →
                        </Link>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {LIVE.map((s) => (
                        <div key={s.key} className={`rounded-lg border p-3 ${s.key === 'pending' && (data?.live?.[s.key] ?? 0) > 0 ? 'border-amber-400 bg-amber-500/10' : 'border-border'}`}>
                            <p className="text-[11px] font-semibold text-muted-foreground">{s.label}</p>
                            {loading ? <Skeleton className="mt-1 h-6 w-8" /> : <p className="text-2xl font-extrabold tabular-nums">{data.live?.[s.key] ?? 0}</p>}
                        </div>
                    ))}
                    <div className="rounded-lg border border-border p-3">
                        <p className="text-[11px] font-semibold text-muted-foreground">Tables waiting</p>
                        {loading ? <Skeleton className="mt-1 h-6 w-8" /> : <p className="text-2xl font-extrabold tabular-nums">{k.pending_tables}</p>}
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Online orders placed" icon={ShoppingBag} loading={loading} value={num(k?.placed)} hint={k?.delivery_share != null ? `${k.delivery_share}% delivery` : undefined} />
                <Kpi label="Completed" icon={CheckCircle2} loading={loading} value={num(k?.completed)} hint={k ? money(k.online_revenue) : undefined} />
                <Kpi label="Cancelled / declined" icon={XCircle} loading={loading} value={num(k?.cancelled)} hint={k?.cancellation_rate != null ? `${k.cancellation_rate}% of finished` : undefined} invert />
                <Kpi label="Avg time to confirm" icon={Hourglass} loading={loading} value={mins(k?.avg_accept_minutes)} />
                <Kpi label="Avg preparation" icon={Clock} loading={loading} value={mins(k?.avg_prep_minutes)} />
                <Kpi label="Avg delivery leg" icon={Bike} loading={loading} value={mins(k?.avg_delivery_minutes)} />
                <Kpi label="Open table tickets" icon={Utensils} loading={loading} value={num(k?.pending_tables)} href={has('2') ? '/pos' : undefined} />
            </div>

            <Panel title="Online orders per day">
                {loading ? (
                    <Skeleton className="h-60" />
                ) : data.trend.every((d: any) => !d.orders) ? (
                    <Empty height={220} text="No online orders in this period." />
                ) : (
                    <Chart
                        type="bar"
                        height={240}
                        series={[{ name: 'Orders', data: data.trend.map((d: any) => d.orders) }]}
                        options={{
                            ...t.base,
                            colors: [t.series[1]],
                            plotOptions: { bar: { columnWidth: '60%', borderRadius: 4, borderRadiusApplication: 'end' } },
                            xaxis: { ...t.base.xaxis, categories: data.trend.map((d: any) => shortDate(d.date)), tickAmount: Math.min(10, data.trend.length) },
                            yaxis: { ...t.base.yaxis, forceNiceScale: true, labels: { ...t.base.yaxis.labels, formatter: (v: number) => String(Math.round(v)) } },
                        }}
                    />
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Orders by barangay" subtitle="Delivery orders this period">
                    {loading ? (
                        <Skeleton className="h-48" />
                    ) : (
                        <RankList
                            valueLabel="Orders"
                            rows={data.by_barangay.map((b: any) => ({ label: b.barangay, sub: money(b.revenue, true), value: String(b.orders), share: (b.orders / maxBarangay) * 100 }))}
                        />
                    )}
                </Panel>
                <Panel title="Why orders were lost" subtitle="Cancellation & decline reasons">
                    {loading ? <Skeleton className="h-48" /> : <RankList valueLabel="Count" rows={data.cancel_reasons.map((r: any) => ({ label: r.reason, value: String(r.count) }))} />}
                </Panel>
                <Panel title="Table tickets at the cashier" href={has('2') ? '/pos' : undefined}>
                    {loading ? (
                        <Skeleton className="h-48" />
                    ) : data.pending_tables.length === 0 ? (
                        <Empty text="No tables waiting to pay." />
                    ) : (
                        <ul className="divide-y divide-border px-1">
                            {data.pending_tables.map((p: any) => (
                                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                                    <span className="font-semibold">Table {p.table_number}</span>
                                    <span className="text-xs text-muted-foreground">{p.opened_at ? new Date(p.opened_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : ''}</span>
                                    <span className="font-semibold tabular-nums">{money(p.total)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
