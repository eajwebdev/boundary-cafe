import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Banknote,
    CalendarCheck,
    CheckCircle2,
    ChevronRight,
    CircleDashed,
    ClipboardList,
    FileCheck2,
    History,
    Lock,
    Percent,
    Receipt,
    ShoppingBag,
    Wallet,
    XCircle,
} from 'lucide-react';
import { useState } from 'react';

import {
    EmptyRow,
    Line,
    PageHeader,
    Pager,
    Panel,
    Stat,
    StatStrip,
    StatusPill,
    controlCls,
    textareaCls,
    thCls,
    useFlashToasts,
} from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

import { CHANNEL_LABELS, PAYMENT_LABELS, overShortLabel, overShortTone, peso, zLabel } from './kit';
import type { ZFigures } from './kit';

interface HistoryRow {
    id: number;
    z_number: number;
    business_date: string;
    transaction_count: number;
    net_sales: number;
    over_short: number;
    generated_by: string | null;
    generated_at: string;
}

interface PageProps {
    branch_id: number;
    branches: { id: number; name: string }[] | null;
    date: string;
    today: string;
    existing: { id: number; z_number: number } | null;
    preview: ZFigures | null;
    blocker: string | null;
    open_sessions: { id: number; session_number: string; cashier: string; opened_at: string | null }[];
    pending_dates: string[];
    last_reading: { id: number; z_number: number; business_date: string; grand_total: number } | null;
    history: {
        data: HistoryRow[];
        from: number | null;
        to: number | null;
        total: number;
        last_page: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    errors: Record<string, string>;
    [key: string]: unknown;
}

const dayLabel = (date: string, pattern = 'EEE, MMM d, yyyy') => fmtDate(`${date}T12:00:00`, pattern);

export default function ZReadingsIndex() {
    const { branch_id, branches, date, today, existing, preview, blocker, open_sessions, pending_dates, last_reading, history, errors } =
        usePage<PageProps>().props;
    useFlashToasts();

    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const visit = (params: { date?: string; branch_id?: number | string }) =>
        router.get(
            routes.zReadings.index(),
            { date: params.date ?? date, ...(branches ? { branch_id: params.branch_id ?? branch_id } : {}) },
            { preserveScroll: true, preserveState: false },
        );

    const nextNumber = (last_reading?.z_number ?? 0) + 1;
    const isToday = date === today;

    const generate = async () => {
        const confirmed = await confirmDialog({
            title: `Close ${dayLabel(date, 'MMM d')} with ${zLabel(nextNumber)}?`,
            description: `Net sales ${peso(preview?.net_sales ?? 0)} from ${preview?.transaction_count ?? 0} transactions. The day is locked after this: it can be reprinted but not changed${isToday ? ', and no new cash sessions can be opened today' : ''}.`,
            confirmLabel: 'Generate Z-Reading',
        });
        if (!confirmed) {
            return;
        }
        setSaving(true);
        router.post(
            routes.zReadings.store(),
            { business_date: date, notes: notes || null, ...(branches ? { branch_id } : {}) },
            { onFinish: () => setSaving(false) },
        );
    };

    const otherPending = pending_dates.filter((d) => d !== date);

    return (
        <AdminLayout>
            <Head title="Z-Reading" />

            <div className="space-y-4">
                <PageHeader title="Z-Reading" subtitle="Close the business day. One reading per day, locked once saved.">
                    {branches && (
                        <select
                            value={branch_id}
                            onChange={(e) => visit({ branch_id: e.target.value })}
                            className={cn(controlCls, 'h-9')}
                            aria-label="Branch"
                        >
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <input
                        type="date"
                        value={date}
                        max={today}
                        onChange={(e) => e.target.value && visit({ date: e.target.value })}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Business day"
                    />
                </PageHeader>

                {otherPending.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
                        <p className="min-w-0 flex-1 text-sm">
                            <span className="font-bold">
                                {otherPending.length} day{otherPending.length > 1 ? 's' : ''} not closed yet.
                            </span>{' '}
                            <span className="text-muted-foreground">Close them oldest first.</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {otherPending.map((d) => (
                                <Button key={d} size="sm" variant="outline" className="h-8" onClick={() => visit({ date: d })}>
                                    {dayLabel(d, 'MMM d')}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {existing ? (
                    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-5">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                            <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="font-bold">{dayLabel(date)} is closed</p>
                            <p className="text-sm text-muted-foreground">
                                Locked by {zLabel(existing.z_number)}. You can view and reprint it any time.
                            </p>
                        </div>
                        <Link href={routes.zReadings.show(existing.id)}>
                            <Button className="gap-1.5">
                                <FileCheck2 className="h-4 w-4" /> View {zLabel(existing.z_number)}
                            </Button>
                        </Link>
                    </div>
                ) : (
                    preview && (
                        <>
                            <StatStrip count={4}>
                                <Stat icon={Wallet} label="Net sales" value={peso(preview.net_sales)} tone="success" />
                                <Stat icon={Receipt} label="Transactions" value={preview.transaction_count.toLocaleString()} />
                                <Stat
                                    icon={XCircle}
                                    label="Voids"
                                    value={preview.void_count > 0 ? `${preview.void_count} · ${peso(preview.void_amount)}` : 'None'}
                                    tone={preview.void_count > 0 ? 'warning' : 'muted'}
                                />
                                <Stat
                                    icon={Banknote}
                                    label="Cash over / short"
                                    value={preview.sessions.length ? overShortLabel(preview.over_short) : 'No sessions'}
                                    tone={!preview.sessions.length ? 'muted' : Math.abs(preview.over_short) < 0.005 ? 'success' : 'warning'}
                                />
                            </StatStrip>

                            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                                <div className="grid content-start gap-4 md:grid-cols-2">
                                    <Panel icon={ShoppingBag} title={`Sales · ${dayLabel(date, 'MMM d')}`}>
                                        <div>
                                            <Line label="Gross sales" value={peso(preview.gross_sales)} />
                                            <Line label="Less discounts & promos" value={`−${peso(preview.discount_total)}`} />
                                            {preview.loyalty_discount_total > 0 && (
                                                <Line label="Less loyalty points" value={`−${peso(preview.loyalty_discount_total)}`} />
                                            )}
                                            <Line strong label="Net sales" value={peso(preview.net_sales)} />
                                            {preview.delivery_fees > 0 && <Line label="Includes delivery fees" value={peso(preview.delivery_fees)} />}
                                            {preview.unpaid_total > 0 && (
                                                <Line label="Still unpaid (on credit)" value={peso(preview.unpaid_total)} tone="warning" />
                                            )}
                                            <Line label="Items sold" value={preview.items_sold.toLocaleString()} />
                                            <Line
                                                label="Receipts"
                                                value={
                                                    preview.first_receipt ? (
                                                        <span className="font-mono text-xs">
                                                            {preview.first_receipt} → {preview.last_receipt}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )
                                                }
                                            />
                                        </div>
                                    </Panel>

                                    <Panel icon={Wallet} title="Payments">
                                        {preview.payments.length === 0 ? (
                                            <p className="py-4 text-center text-sm text-muted-foreground">No sales on this day.</p>
                                        ) : (
                                            <div>
                                                {preview.payments.map((p) => (
                                                    <Line
                                                        key={p.method}
                                                        label={`${PAYMENT_LABELS[p.method] ?? p.method} (${p.count})`}
                                                        value={peso(p.amount)}
                                                    />
                                                ))}
                                                {preview.collections_count > 0 && (
                                                    <Line
                                                        label={`Collections on account (${preview.collections_count})`}
                                                        value={peso(preview.collections_total)}
                                                    />
                                                )}
                                                {preview.channels.length > 1 && (
                                                    <div className="mt-2 border-t border-border pt-2">
                                                        {preview.channels.map((c) => (
                                                            <Line
                                                                key={c.channel}
                                                                label={`${CHANNEL_LABELS[c.channel] ?? c.channel} (${c.count})`}
                                                                value={peso(c.amount)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Panel>

                                    {preview.vat_enabled && (
                                        <Panel icon={Percent} title={`VAT (${preview.vat_rate}%)`}>
                                            <div>
                                                <Line label="VATable sales" value={peso(preview.vatable_sales)} />
                                                <Line label="VAT amount" value={peso(preview.vat_amount)} />
                                                <Line label="VAT-exempt sales" value={peso(preview.vat_exempt_sales)} />
                                            </div>
                                        </Panel>
                                    )}

                                    <Panel flush icon={Banknote} title="Cash sessions" className={cn(!preview.vat_enabled && 'md:col-span-2')}>
                                        {preview.sessions.length === 0 ? (
                                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No cash sessions on this day.</p>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="border-b border-border">
                                                        <tr>
                                                            <th className={thCls}>Cashier</th>
                                                            <th className={cn(thCls, 'text-right')}>Expected</th>
                                                            <th className={cn(thCls, 'text-right')}>Counted</th>
                                                            <th className={cn(thCls, 'text-right')}>Over / short</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border">
                                                        {preview.sessions.map((s) => (
                                                            <tr key={s.id}>
                                                                <td className="px-4 py-2">
                                                                    <p className="font-semibold">{s.cashier}</p>
                                                                    <p className="font-mono text-[11px] text-muted-foreground">{s.session_number}</p>
                                                                </td>
                                                                <td className="px-4 py-2 text-right tabular-nums">{peso(s.expected_cash)}</td>
                                                                <td className="px-4 py-2 text-right tabular-nums">
                                                                    {s.status === 'open' ? (
                                                                        <StatusPill tone="warning">Still open</StatusPill>
                                                                    ) : (
                                                                        peso(s.counted_cash)
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2 text-right">
                                                                    {s.status === 'open' ? (
                                                                        <span className="text-xs text-muted-foreground">—</span>
                                                                    ) : (
                                                                        <StatusPill tone={overShortTone(s.over_short)}>
                                                                            {overShortLabel(s.over_short)}
                                                                        </StatusPill>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </Panel>
                                </div>

                                <CloseDayPanel
                                    date={date}
                                    nextNumber={nextNumber}
                                    blocker={errors?.z_reading ?? blocker}
                                    openSessions={open_sessions}
                                    pendingBefore={pending_dates.filter((d) => d < date)}
                                    hasSales={preview.transaction_count + preview.void_count > 0}
                                    notes={notes}
                                    onNotes={setNotes}
                                    saving={saving}
                                    onGenerate={generate}
                                    onPickDate={(d) => visit({ date: d })}
                                />
                            </div>
                        </>
                    )
                )}

                <Panel
                    flush
                    icon={History}
                    title="Past Z-readings"
                    actions={
                        last_reading && (
                            <span className="text-[11px] font-semibold text-muted-foreground">
                                Running grand total <span className="text-foreground tabular-nums">{peso(last_reading.grand_total)}</span>
                            </span>
                        )
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Z #</th>
                                    <th className={thCls}>Business day</th>
                                    <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Transactions</th>
                                    <th className={cn(thCls, 'text-right')}>Net sales</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Over / short</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Closed by</th>
                                    <th className="w-8" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {history.data.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={ClipboardList}>
                                        No Z-readings yet. Your first one will appear here.
                                    </EmptyRow>
                                ) : (
                                    history.data.map((r) => (
                                        <tr
                                            key={r.id}
                                            className="cursor-pointer hover:bg-muted/30"
                                            onClick={() => router.visit(routes.zReadings.show(r.id))}
                                        >
                                            <td className="px-4 py-2 font-mono text-xs font-bold">{zLabel(r.z_number)}</td>
                                            <td className="px-4 py-2">{dayLabel(r.business_date)}</td>
                                            <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">
                                                {r.transaction_count.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(r.net_sales)}</td>
                                            <td className="hidden px-4 py-2 text-right md:table-cell">
                                                <StatusPill tone={overShortTone(r.over_short)}>{overShortLabel(r.over_short)}</StatusPill>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs lg:table-cell">
                                                {r.generated_by ?? '—'}
                                                <span className="block text-[11px] text-muted-foreground">
                                                    {fmtDate(r.generated_at, 'MMM d, h:mm a')}
                                                </span>
                                            </td>
                                            <td className="px-2 py-2">
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {history.last_page > 1 && (
                        <Pager
                            from={history.from}
                            to={history.to}
                            total={history.total}
                            links={history.links}
                            onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}

// ─── Checklist + generate button ──────────────────────────────────────────────

function CloseDayPanel({
    date,
    nextNumber,
    blocker,
    openSessions,
    pendingBefore,
    hasSales,
    notes,
    onNotes,
    saving,
    onGenerate,
    onPickDate,
}: {
    date: string;
    nextNumber: number;
    blocker: string | null;
    openSessions: PageProps['open_sessions'];
    pendingBefore: string[];
    hasSales: boolean;
    notes: string;
    onNotes: (value: string) => void;
    saving: boolean;
    onGenerate: () => void;
    onPickDate: (date: string) => void;
}) {
    return (
        <Panel icon={CalendarCheck} title="Close the day" className="h-fit xl:sticky xl:top-20">
            <ol className="space-y-3">
                <Step done={openSessions.length === 0} title="All cash sessions closed">
                    {openSessions.length > 0 && (
                        <>
                            <ul className="mt-1 space-y-0.5">
                                {openSessions.map((s) => (
                                    <li key={s.id} className="text-xs text-muted-foreground">
                                        {s.cashier} · <span className="font-mono">{s.session_number}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link href={routes.cashCounts.index()} className="mt-1.5 inline-block text-xs font-semibold text-primary hover:underline">
                                Go to Cash Counts to close →
                            </Link>
                        </>
                    )}
                </Step>
                <Step done={pendingBefore.length === 0} title="Earlier days closed">
                    {pendingBefore.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onPickDate(pendingBefore[0])}
                            className="mt-1 text-xs font-semibold text-primary hover:underline"
                        >
                            Close {dayLabel(pendingBefore[0], 'MMM d')} first →
                        </button>
                    )}
                </Step>
                <Step done title="Figures reviewed">
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {hasSales ? 'Check the numbers on the left before saving.' : 'No sales on this day. You can still close it.'}
                    </p>
                </Step>
            </ol>

            <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Notes (optional)</span>
                <textarea
                    value={notes}
                    onChange={(e) => onNotes(e.target.value)}
                    rows={2}
                    maxLength={1000}
                    placeholder="e.g. Power outage 2–3 PM, short explained by…"
                    className={cn(textareaCls, 'resize-none')}
                />
            </label>

            {blocker && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {blocker}
                </p>
            )}

            <Button className="h-11 w-full gap-2 text-base font-bold" disabled={!!blocker || saving} onClick={onGenerate}>
                {saving ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                ) : (
                    <Lock className="h-4 w-4" />
                )}
                Generate {zLabel(nextNumber)}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">Closes {dayLabel(date)}. Can be reprinted, not changed.</p>
        </Panel>
    );
}

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
    return (
        <li className="flex gap-2.5">
            {done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            )}
            <div className="min-w-0">
                <p className={cn('text-sm font-semibold', !done && 'text-amber-700 dark:text-amber-400')}>{title}</p>
                {children}
            </div>
        </li>
    );
}
