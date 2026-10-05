import { AlertTriangle, Boxes, CheckCircle2, Coins, PackageCheck, PackageX, Trash2 } from 'lucide-react';

import { Empty, Kpi, money, num, Panel, RankList, Skeleton } from '../kit';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
    data: any;
    loading: boolean;
    has: (id: string) => boolean;
}

const LOSS_LABEL: Record<string, string> = { damage: 'Damaged', damaged: 'Damaged', expired: 'Expired', loss: 'Lost', lost: 'Lost', spoilage: 'Spoiled', theft: 'Theft' };

export default function InventoryTab({ data, loading, has }: Props) {
    const k = data?.kpis;
    const tracked = Math.max(1, k?.tracked_items ?? 1);
    const maxUsage = Math.max(1, ...(data?.ingredient_usage ?? []).map((u: any) => u.used));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Stock value (at cost)" icon={Coins} loading={loading} value={money(k?.stock_value)} href={has('33') ? '/inventory' : undefined} />
                <Kpi label="In stock" icon={CheckCircle2} loading={loading} value={num(k?.in_stock)} hint={k ? `of ${k.tracked_items} tracked items` : undefined} />
                <Kpi label={`Low stock (≤ ${k?.threshold ?? '…'})`} icon={AlertTriangle} loading={loading} value={num(k?.low_stock)} invert href={has('33') ? '/inventory' : undefined} />
                <Kpi label="Out of stock" icon={PackageX} loading={loading} value={num(k?.out_of_stock)} invert />
                <Kpi label="Losses this period" icon={Trash2} loading={loading} value={money(k?.loss_value)} invert href={has('31') ? '/stock-adjustments' : undefined} />
                <Kpi label="Open purchase orders" icon={PackageCheck} loading={loading} value={num(k?.pending_purchase_orders)} href={has('12') ? '/purchase-orders' : undefined} />
            </div>

            {/* Stock health bar */}
            <Panel title="Stock health" subtitle="Tracked items by availability">
                {loading ? (
                    <Skeleton className="h-12" />
                ) : (
                    <div className="px-1">
                        <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label="Stock health">
                            <div className="h-full bg-emerald-500" style={{ width: `${(k.in_stock / tracked) * 100}%` }} />
                            <div className="h-full border-l-2 border-card bg-amber-500" style={{ width: `${(k.low_stock / tracked) * 100}%` }} />
                            <div className="h-full border-l-2 border-card bg-rose-500" style={{ width: `${(k.out_of_stock / tracked) * 100}%` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs">
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Healthy {k.in_stock}</span>
                            <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Low {k.low_stock}</span>
                            <span className="flex items-center gap-1.5"><PackageX className="h-3.5 w-3.5 text-rose-600" /> Out {k.out_of_stock}</span>
                        </div>
                    </div>
                )}
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Running low" subtitle="Reorder soon" href={has('33') ? '/inventory' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : (
                        <RankList valueLabel="Left" rows={data.low_stock.map((s: any) => ({ label: s.name, sub: s.is_ingredient ? 'ingredient' : null, value: `${num(s.stock)} ${s.unit ?? ''}` }))} />
                    )}
                </Panel>
                <Panel title="Out of stock" subtitle="Hidden or sold out on the storefront">
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : data.out_of_stock.length === 0 ? (
                        <Empty text="Nothing is out of stock." />
                    ) : (
                        <RankList rows={data.out_of_stock.map((s: any) => ({ label: s.name, sub: s.is_ingredient ? 'ingredient' : null, value: '0' }))} />
                    )}
                </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Ingredient usage" subtitle="Used by recipes for items sold" className="lg:col-span-1" href={has('18') ? '/reports/ingredient-usage' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : (
                        <RankList
                            valueLabel="Used"
                            rows={data.ingredient_usage.map((u: any) => ({ label: u.name, value: `${num(u.used)} ${u.unit ?? ''}`, share: (u.used / maxUsage) * 100 }))}
                        />
                    )}
                </Panel>
                <Panel title="Losses by type" href={has('31') ? '/reports/stock-loss' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : (
                        <RankList valueLabel="Value" rows={data.losses.map((l: any) => ({ label: LOSS_LABEL[l.type] ?? l.type, sub: `${num(l.qty)} units · ${l.entries} entries`, value: money(l.value) }))} />
                    )}
                </Panel>
                <Panel title="Open purchase orders" href={has('12') ? '/purchase-orders' : undefined}>
                    {loading ? (
                        <Skeleton className="h-60" />
                    ) : data.pending_purchase_orders.length === 0 ? (
                        <Empty text="No open purchase orders." />
                    ) : (
                        <ul className="divide-y divide-border px-1">
                            {data.pending_purchase_orders.map((o: any) => (
                                <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                                    <span className="min-w-0 truncate">
                                        <span className="font-mono text-xs">{o.order_number}</span> · {o.supplier ?? '—'}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">{o.status}</span>
                                        <span className="font-semibold tabular-nums">{money(o.total)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Boxes className="h-3.5 w-3.5" /> Made-to-order items are tracked through their recipe ingredients.
            </p>
        </div>
    );
}
