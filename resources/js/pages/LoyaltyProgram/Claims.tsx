import { Link, router } from '@inertiajs/react';
import { QrCode, Search, XCircle } from 'lucide-react';
import { useState } from 'react';

import type { Tone } from '@/components/AdminKit';
import { BranchSelect, Chip, EmptyRow, FilterBar, PageHeader, Pager, Panel, StatusPill, controlCls, thCls, useFlashToasts } from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import LoyaltyNav from './LoyaltyNav';

interface ClaimRow {
    id: number;
    code: string;
    status: string;
    status_label: string;
    customer: { id: number; name: string; customer_number: string } | null;
    summary: string;
    points: number;
    retail_value: number;
    cost_value: number;
    branch: string | null;
    receipt_number: string | null;
    sale_id: number | null;
    cashier: string | null;
    created_at: string;
    expires_at: string;
    redeemed_at: string | null;
}

interface Props {
    claims: { data: ClaimRow[]; links: { url: string | null; label: string; active: boolean }[]; from: number | null; to: number | null; total: number };
    counts: Record<string, number>;
    branches: { id: number; name: string }[];
    filters: { status: string; search: string; branch_id: number | null; from: string | null; to: string | null };
}

const STATUSES: { value: string; label: string; tone: Tone }[] = [
    { value: 'reserved', label: 'Waiting', tone: 'warning' },
    { value: 'redeemed', label: 'Claimed', tone: 'success' },
    { value: 'expired', label: 'Expired', tone: 'muted' },
    { value: 'cancelled', label: 'Cancelled', tone: 'muted' },
    { value: 'voided', label: 'Voided', tone: 'danger' },
    { value: 'all', label: 'All', tone: 'primary' },
];
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LoyaltyClaims({ claims, counts, branches, filters }: Props) {
    useFlashToasts();
    const [search, setSearch] = useState(filters.search ?? '');
    const [branchId, setBranchId] = useState(filters.branch_id?.toString() ?? '');
    const [from, setFrom] = useState(filters.from ?? '');
    const [to, setTo] = useState(filters.to ?? '');

    const visit = (patch: Partial<Props['filters']> = {}) =>
        router.get(
            '/loyalty-program/claims',
            { status: filters.status, search: search || undefined, branch_id: branchId || undefined, from: from || undefined, to: to || undefined, ...patch },
            { preserveScroll: true, preserveState: true },
        );

    const cancel = async (claim: ClaimRow) => {
        const ok = await confirmDialog({
            title: `Cancel claim ${claim.code}?`,
            description: `${claim.summary} — ${claim.points} points go back to ${claim.customer?.name ?? 'the customer'}.`,
            confirmLabel: 'Cancel claim',
            tone: 'danger',
        });
        if (ok) router.post(`/loyalty-program/claims/${claim.id}/cancel`, {}, { preserveScroll: true });
    };

    const waiting = counts.reserved ?? 0;

    return (
        <AdminLayout title="Reward Claims">
            <div className="space-y-4">
                <PageHeader title="Reward claims" subtitle="QR claims waiting to be scanned and those completed at every branch." />
                <LoyaltyNav pendingClaims={waiting} />

                <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                        <Chip key={s.value} active={filters.status === s.value} onClick={() => visit({ status: s.value })}>
                            {s.label}
                            {s.value !== 'all' && counts[s.value] ? ` · ${counts[s.value]}` : ''}
                        </Chip>
                    ))}
                </div>

                <FilterBar onApply={() => visit()}>
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && visit()}
                            placeholder="Code, name, member no. or mobile"
                            className={cn(controlCls, 'h-9 w-64 pl-8')}
                        />
                    </div>
                    <BranchSelect branches={branches} value={branchId} onChange={setBranchId} />
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="From" />
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="To" />
                </FilterBar>

                <Panel flush icon={QrCode} title={`${claims.total.toLocaleString()} claim${claims.total === 1 ? '' : 's'}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/40">
                                <tr>
                                    <th className={thCls}>Code</th>
                                    <th className={thCls}>Customer</th>
                                    <th className={thCls}>Rewards</th>
                                    <th className={cn(thCls, 'text-right')}>Points</th>
                                    <th className={cn(thCls, 'text-right')}>Value · cost</th>
                                    <th className={thCls}>Status</th>
                                    <th className={thCls}>Branch · receipt</th>
                                    <th className={thCls}>When</th>
                                    <th className={thCls} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {claims.data.length === 0 ? (
                                    <EmptyRow colSpan={9} icon={QrCode}>
                                        No claims match these filters.
                                    </EmptyRow>
                                ) : (
                                    claims.data.map((c) => {
                                        const tone = STATUSES.find((s) => s.value === c.status)?.tone ?? 'muted';
                                        return (
                                            <tr key={c.id}>
                                                <td className="px-4 py-2 font-mono text-xs font-bold">{c.code}</td>
                                                <td className="px-4 py-2">
                                                    {c.customer ? (
                                                        <Link href={`/customers/${c.customer.id}`} className="hover:text-primary">
                                                            <span className="block font-semibold">{c.customer.name}</span>
                                                            <span className="block font-mono text-[11px] text-muted-foreground">{c.customer.customer_number}</span>
                                                        </Link>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="max-w-56 truncate px-4 py-2" title={c.summary}>
                                                    {c.summary}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold tabular-nums">{c.points.toLocaleString()}</td>
                                                <td className="px-4 py-2 text-right text-xs whitespace-nowrap tabular-nums">
                                                    {c.status === 'redeemed' ? (
                                                        <>
                                                            {peso(c.retail_value)} <span className="text-muted-foreground">· {peso(c.cost_value)}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <StatusPill tone={tone}>{c.status_label}</StatusPill>
                                                </td>
                                                <td className="px-4 py-2 text-xs">
                                                    {c.branch ?? '—'}
                                                    {c.receipt_number && c.sale_id && (
                                                        <Link href={`/pos/${c.sale_id}`} className="block font-mono text-[11px] text-primary hover:underline">
                                                            {c.receipt_number}
                                                        </Link>
                                                    )}
                                                    {c.cashier && <span className="block text-[11px] text-muted-foreground">by {c.cashier}</span>}
                                                </td>
                                                <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">
                                                    {c.status === 'reserved'
                                                        ? `expires ${fmtDate(c.expires_at, 'MMM d, h:mm a')}`
                                                        : fmtDate(c.redeemed_at ?? c.created_at, 'MMM d, h:mm a')}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    {c.status === 'reserved' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => cancel(c)}
                                                            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-destructive hover:bg-destructive/10"
                                                        >
                                                            <XCircle className="h-3.5 w-3.5" /> Cancel
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pager from={claims.from} to={claims.to} total={claims.total} links={claims.links} onVisit={(url) => router.get(url, {}, { preserveScroll: true })} />
                </Panel>
            </div>
        </AdminLayout>
    );
}
