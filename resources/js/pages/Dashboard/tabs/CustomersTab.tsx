import { Coins, Gift, Smartphone, Tag, UserPlus, Users } from 'lucide-react';

import { Empty, Kpi, money, num, Panel, RankList, Skeleton } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

export default function CustomersTab({ data, loading, has }: Props) {
    const k = data?.kpis;
    const maxSpent = Math.max(1, ...(data?.top_customers ?? []).map((c: any) => c.spent));
    const tierTotal = Math.max(1, (data?.tier_distribution ?? []).reduce((s: number, t: any) => s + t.members, 0));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Members who bought" icon={Users} loading={loading} value={num(k?.customers_buying)} hint={k?.member_sales_share != null ? `${k.member_sales_share}% of revenue` : undefined} href={has('39') ? '/customers' : undefined} />
                <Kpi label="New vs returning" icon={UserPlus} loading={loading} value={k ? `${k.new_customers} / ${k.returning_customers}` : '—'} />
                <Kpi label="Online accounts" icon={Smartphone} loading={loading} value={num(k?.online_accounts)} hint={k ? `+${k.new_signups} this period` : undefined} />
                <Kpi label="Points liability" icon={Coins} loading={loading} value={money(k?.points_liability)} hint={k ? `${num(k.outstanding_points)} pts outstanding` : undefined} href={has('44') ? '/loyalty-program' : undefined} />
                <Kpi label="Points issued" icon={Gift} loading={loading} value={num(k?.points_issued)} />
                <Kpi label="Points redeemed" icon={Gift} loading={loading} value={num(k?.points_redeemed)} />
                <Kpi label="Sales with a promo" icon={Tag} loading={loading} value={num(k?.promo_uses)} hint={k ? `${money(k.promo_revenue, true)} revenue` : undefined} href={has('29') ? '/promos' : undefined} />
                <Kpi label="Promo discounts given" icon={Tag} loading={loading} value={money(k?.promo_discount)} invert />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Top customers" subtitle="By spend this period" className="lg:col-span-2" href={has('39') ? '/customers' : undefined}>
                    {loading ? (
                        <Skeleton className="h-72" />
                    ) : (
                        <RankList valueLabel="Spent" rows={data.top_customers.map((c: any) => ({ label: c.name, sub: `${c.visits} visit${c.visits !== 1 ? 's' : ''}`, value: money(c.spent), share: (c.spent / maxSpent) * 100 }))} />
                    )}
                </Panel>
                <Panel title="Membership tiers" subtitle="Members by lifetime points" href={has('44') ? '/loyalty-program' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : data.tier_distribution.length === 0 ? (
                        <Empty />
                    ) : (
                        <ul className="space-y-3 px-1 pt-1">
                            {data.tier_distribution.map((tier: any) => (
                                <li key={tier.tier}>
                                    <div className="flex justify-between text-sm">
                                        <span className="font-semibold">{tier.tier}</span>
                                        <span className="tabular-nums">{tier.members}</span>
                                    </div>
                                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${(tier.members / tierTotal) * 100}%` }} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            <Panel title="Promos" subtitle="Most used promos (all time)" href={has('29') ? '/promos' : undefined}>
                {loading ? (
                    <Skeleton className="h-40" />
                ) : data.promos.length === 0 ? (
                    <Empty text="No promos yet." />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-[11px] text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-2 py-1.5">Promo</th>
                                    <th className="px-2 py-1.5">Channel</th>
                                    <th className="px-2 py-1.5">Status</th>
                                    <th className="px-2 py-1.5 text-right">Uses</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {data.promos.map((p: any) => (
                                    <tr key={p.id}>
                                        <td className="px-2 py-2">
                                            <span className="font-medium">{p.name}</span>
                                            {p.code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{p.code}</span>}
                                            {p.storefront && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Storefront</span>}
                                        </td>
                                        <td className="px-2 py-2 capitalize">{p.channels === 'both' ? 'POS + online' : p.channels}</td>
                                        <td className="px-2 py-2 capitalize">{p.status}</td>
                                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{p.uses}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    );
}
