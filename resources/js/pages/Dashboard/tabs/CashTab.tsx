import { Coins, PiggyBank, Receipt, Scale, TrendingUp, Wallet } from 'lucide-react';
import { useMemo } from 'react';

import { Chart, Empty, Kpi, money, Panel, RankList, shortDate, Skeleton, useChartTheme } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

export default function CashTab({ data, loading, has }: Props) {
    const t = useChartTheme();
    const k = data?.kpis;
    const maxExp = Math.max(1, ...(data?.expenses_by_category ?? []).map((e: any) => e.total));

    const trend = useMemo(() => {
        if (!data) return null;
        return {
            series: [
                { name: 'Revenue', data: data.trend.map((d: any) => d.revenue) },
                { name: 'Expenses', data: data.trend.map((d: any) => d.expenses) },
            ],
            options: {
                ...t.base,
                colors: [t.series[0], t.series[1]],
                plotOptions: { bar: { columnWidth: '70%', borderRadius: 4, borderRadiusApplication: 'end' } },
                stroke: { show: true, width: 2, colors: ['transparent'] },
                xaxis: { ...t.base.xaxis, categories: data.trend.map((d: any) => shortDate(d.date)), tickAmount: Math.min(10, data.trend.length) },
                yaxis: { ...t.base.yaxis, labels: { ...t.base.yaxis.labels, formatter: (v: number) => money(v, true) } },
                tooltip: { ...t.base.tooltip, shared: true, intersect: false, y: { formatter: (v: number) => money(v) } },
            },
        };
    }, [data, t]);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Revenue" icon={TrendingUp} loading={loading} value={money(k?.revenue)} />
                <Kpi label="Expenses" icon={Receipt} loading={loading} value={money(k?.expenses)} change={k?.expenses_change} invert href={has('17') ? '/expenses' : undefined} />
                <Kpi label="Cost of goods sold" icon={Coins} loading={loading} value={money(k?.cogs)} />
                <Kpi label="Net income" icon={Wallet} loading={loading} value={money(k?.net_income)} change={k?.net_income_change} hint="revenue − COGS − expenses" />
                <Kpi label="Open cash sessions" icon={Wallet} loading={loading} value={String(k?.open_sessions ?? '—')} href={has('14') ? '/cash-sessions' : undefined} />
                <Kpi label="Cash over / short" icon={Scale} loading={loading} value={money(k?.over_short)} hint="sum of closed sessions" />
                <Kpi label="Petty cash on hand" icon={PiggyBank} loading={loading} value={money(k?.petty_cash_balance)} href={has('16') ? '/petty-cash' : undefined} />
            </div>

            <Panel title="Revenue and expenses per day">
                {loading || !trend ? (
                    <Skeleton className="h-64" />
                ) : data.trend.every((d: any) => !d.revenue && !d.expenses) ? (
                    <Empty height={240} />
                ) : (
                    <Chart type="bar" height={270} options={trend.options} series={trend.series} />
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Expenses by category" href={has('21') || has('18') ? '/reports/expenses' : undefined}>
                    {loading ? <Skeleton className="h-60" /> : <RankList valueLabel="Spent" rows={data.expenses_by_category.map((e: any) => ({ label: e.category, value: money(e.total), share: (e.total / maxExp) * 100 }))} />}
                </Panel>
                <Panel title="Cash sessions" href={has('14') ? '/cash-sessions' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : data.sessions.length === 0 ? (
                        <Empty text="No cash sessions in this period." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-[11px] text-muted-foreground uppercase">
                                    <tr>
                                        <th className="px-2 py-1.5">Cashier</th>
                                        <th className="px-2 py-1.5">Opened</th>
                                        <th className="px-2 py-1.5 text-right">Expected</th>
                                        <th className="px-2 py-1.5 text-right">Over/short</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {data.sessions.map((s: any) => (
                                        <tr key={s.id}>
                                            <td className="px-2 py-2">
                                                {s.cashier || '—'}
                                                {s.status === 'open' && <span className="ml-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">OPEN</span>}
                                            </td>
                                            <td className="px-2 py-2 text-xs text-muted-foreground">
                                                {s.opened_at ? new Date(s.opened_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                                            </td>
                                            <td className="px-2 py-2 text-right tabular-nums">{s.expected_cash != null ? money(s.expected_cash) : '—'}</td>
                                            <td className={`px-2 py-2 text-right font-semibold tabular-nums ${s.over_short != null && s.over_short < 0 ? 'text-rose-600' : ''}`}>
                                                {s.over_short != null ? money(s.over_short) : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
}
