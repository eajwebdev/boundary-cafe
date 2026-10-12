import { Link, router } from '@inertiajs/react';
import { BookOpen, Building2, Clock, Coins, Gift, Package, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';

import { BranchSelect, EmptyRow, FilterBar, PageHeader, Panel, Stat, StatStrip, StatusPill, controlCls, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import LoyaltyNav from './LoyaltyNav';

interface Props {
    filters: { from: string; to: string; branch_id: number | null };
    branches: { id: number; name: string }[];
    points: {
        issued: number;
        adjusted: number;
        redeemed_rewards: number;
        redeemed_discount: number;
        expired: number;
        reserved_now: number;
        outstanding_now: number;
    };
    rewards: { claims: number; retail_value: number; cost_value: number; expired_claims: number };
    by_branch: { branch: string; points_issued: number; claims: number; points_redeemed: number; retail_value: number; cost_value: number }[];
    top_items: { product: string; quantity: number; points: number; retail_value: number; cost_value: number }[];
    ledger: {
        id: number;
        type: string;
        points: number;
        balance_after: number;
        reason: string | null;
        customer: { id: number; name: string; customer_number: string } | null;
        branch: string | null;
        created_at: string;
    }[];
    wallets: { id: number; name: string; customer_number: string; points: number; reserved: number; earned: number; redeemed: number }[];
}

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPE_LABEL: Record<string, string> = {
    earn: 'Earned',
    bonus: 'Birthday',
    redeem: 'Redeemed',
    reserve: 'Held',
    release: 'Returned',
    reversal: 'Reversed',
    adjustment: 'Adjusted',
    expire: 'Expired',
};

export default function LoyaltyReports({ filters, branches, points, rewards, by_branch, top_items, ledger, wallets }: Props) {
    const [from, setFrom] = useState(filters.from);
    const [to, setTo] = useState(filters.to);
    const [branchId, setBranchId] = useState(filters.branch_id?.toString() ?? '');

    const apply = () => router.get('/loyalty-program/reports', { from, to, branch_id: branchId || undefined }, { preserveScroll: true, preserveState: true });

    return (
        <AdminLayout title="Loyalty Reports">
            <div className="space-y-4">
                <PageHeader
                    title="Loyalty reports"
                    subtitle="Reward sales are recorded at ₱0, so they never count as paid sales or cash. Their menu value and cost are shown here for accounting."
                />
                <LoyaltyNav />

                <FilterBar onApply={apply}>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="From" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="To" />
                    <BranchSelect branches={branches} value={branchId} onChange={setBranchId} />
                </FilterBar>

                <StatStrip count={8}>
                    <Stat icon={TrendingUp} label="Points issued" value={points.issued.toLocaleString()} tone="success" />
                    <Stat icon={TrendingDown} label="Redeemed · rewards" value={points.redeemed_rewards.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Redeemed · discounts" value={points.redeemed_discount.toLocaleString()} tone="muted" />
                    <Stat icon={Clock} label="Expired" value={points.expired.toLocaleString()} tone="muted" />
                    <Stat icon={Coins} label="Adjusted" value={points.adjusted.toLocaleString()} tone="muted" />
                    <Stat icon={Clock} label="Held now" value={points.reserved_now.toLocaleString()} tone="warning" />
                    <Stat icon={Wallet} label="Outstanding now" value={points.outstanding_now.toLocaleString()} />
                    <Stat icon={Gift} label="Rewards claimed" value={rewards.claims.toLocaleString()} />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-3">
                    <Panel icon={Gift} title="Rewards given">
                        <div className="divide-y divide-border text-sm">
                            <Row label="Claims completed" value={rewards.claims.toLocaleString()} />
                            <Row label="Menu (retail) value" value={peso(rewards.retail_value)} />
                            <Row label="Cost of goods" value={peso(rewards.cost_value)} />
                            <Row label="Claims expired unused" value={rewards.expired_claims.toLocaleString()} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Retail value is the menu price at the time of the claim. Cost uses the item&apos;s capital, or its recipe cost for made-to-order
                            items. How these are booked (loyalty liability, marketing, deferred revenue) is up to your accountant.
                        </p>
                    </Panel>

                    <Panel flush icon={Building2} title="By branch" className="xl:col-span-2">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/40">
                                    <tr>
                                        <th className={thCls}>Branch</th>
                                        <th className={cn(thCls, 'text-right')}>Pts issued</th>
                                        <th className={cn(thCls, 'text-right')}>Claims</th>
                                        <th className={cn(thCls, 'text-right')}>Pts redeemed</th>
                                        <th className={cn(thCls, 'text-right')}>Retail value</th>
                                        <th className={cn(thCls, 'text-right')}>Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {by_branch.map((b) => (
                                        <tr key={b.branch}>
                                            <td className="px-4 py-2 font-semibold">{b.branch}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{b.points_issued.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{b.claims.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{b.points_redeemed.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(b.retail_value)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(b.cost_value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={Package} title="Most redeemed items" className="xl:col-span-2">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/40">
                                    <tr>
                                        <th className={thCls}>Item</th>
                                        <th className={cn(thCls, 'text-right')}>Qty</th>
                                        <th className={cn(thCls, 'text-right')}>Points</th>
                                        <th className={cn(thCls, 'text-right')}>Retail value</th>
                                        <th className={cn(thCls, 'text-right')}>Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {top_items.length === 0 ? (
                                        <EmptyRow colSpan={5} icon={Package}>
                                            No rewards claimed in this period.
                                        </EmptyRow>
                                    ) : (
                                        top_items.map((item) => (
                                            <tr key={item.product}>
                                                <td className="px-4 py-2 font-semibold">{item.product}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{item.quantity.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{item.points.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{peso(item.retail_value)}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{peso(item.cost_value)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={Wallet} title="Wallet balances">
                        <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                            {wallets.length === 0 ? (
                                <li className="px-4 py-8 text-center text-sm text-muted-foreground">No balances yet.</li>
                            ) : (
                                wallets.map((w) => (
                                    <li key={w.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                                        <Link href={`/customers/${w.id}`} className="min-w-0 flex-1 hover:text-primary">
                                            <span className="block truncate font-semibold">{w.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{w.customer_number}</span>
                                        </Link>
                                        <span className="text-right tabular-nums">
                                            <span className="block font-bold">{w.points.toLocaleString()}</span>
                                            {w.reserved > 0 && <span className="block text-[11px] text-amber-600">+{w.reserved} held</span>}
                                        </span>
                                    </li>
                                ))
                            )}
                        </ul>
                    </Panel>

                    <Panel flush icon={BookOpen} title="Points ledger" className="xl:col-span-3">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/40">
                                    <tr>
                                        <th className={thCls}>When</th>
                                        <th className={thCls}>Customer</th>
                                        <th className={thCls}>Type</th>
                                        <th className={thCls}>Details</th>
                                        <th className={thCls}>Branch</th>
                                        <th className={cn(thCls, 'text-right')}>Points</th>
                                        <th className={cn(thCls, 'text-right')}>Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {ledger.length === 0 ? (
                                        <EmptyRow colSpan={7} icon={BookOpen}>
                                            No points activity in this period.
                                        </EmptyRow>
                                    ) : (
                                        ledger.map((t) => (
                                            <tr key={t.id}>
                                                <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">{fmtDate(t.created_at, 'MMM d, h:mm a')}</td>
                                                <td className="px-4 py-2">
                                                    {t.customer ? (
                                                        <Link href={`/customers/${t.customer.id}`} className="font-semibold hover:text-primary">
                                                            {t.customer.name}
                                                        </Link>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <StatusPill tone={t.points > 0 ? 'success' : t.points < 0 ? 'warning' : 'muted'}>{TYPE_LABEL[t.type] ?? t.type}</StatusPill>
                                                </td>
                                                <td className="max-w-80 truncate px-4 py-2 text-xs text-muted-foreground" title={t.reason ?? ''}>
                                                    {t.reason}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-muted-foreground">{t.branch ?? '—'}</td>
                                                <td className={cn('px-4 py-2 text-right font-bold tabular-nums', t.points > 0 ? 'text-emerald-600' : 'text-foreground')}>
                                                    {t.points > 0 ? '+' : ''}
                                                    {t.points.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{t.balance_after.toLocaleString()}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
        </div>
    );
}
