import { CalendarDays, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { history as historyAction } from '@/actions/App/Http/Controllers/Rider/DeliveryController';
import { jsonRequest, manilaTime, pesoExact } from '@/lib/customer';
import { cn } from '@/lib/utils';

import { STATUS_TONE } from './rider-shared';

type Status = 'all' | 'delivered' | 'active' | 'cancelled';
type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'custom' | 'any';

interface Row {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    customer_name: string;
    barangay: string | null;
    total: number;
    payment_method: string;
    cash_remitted: boolean;
    item_count: number;
    cancel_reason: string | null;
    assigned_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
}

interface Result {
    summary: { deliveries: number; delivered: number; sales: number; cash_collected: number; cash_handed_over: number };
    rows: Row[];
    page: number;
    has_more: boolean;
}

const STATUSES: { key: Status; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'active', label: 'In progress' },
    { key: 'cancelled', label: 'Cancelled' },
];

const PRESETS: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'any', label: 'All time' },
    { key: 'custom', label: 'Custom' },
];

/** Today's date in Manila as YYYY-MM-DD, shifted by `days`. */
function manilaDate(days = 0): string {
    const now = new Date(Date.now() + days * 86_400_000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function presetRange(preset: Preset): { from?: string; to?: string } {
    switch (preset) {
        case 'today':
            return { from: manilaDate(), to: manilaDate() };
        case 'yesterday':
            return { from: manilaDate(-1), to: manilaDate(-1) };
        case '7d':
            return { from: manilaDate(-6), to: manilaDate() };
        case '30d':
            return { from: manilaDate(-29), to: manilaDate() };
        default:
            return {};
    }
}

/** Everything the rider has handled, filtered by status and by the day it was completed. */
export default function HistoryView() {
    const [status, setStatus] = useState<Status>('all');
    const [preset, setPreset] = useState<Preset>('today');
    const [custom, setCustom] = useState({ from: manilaDate(-6), to: manilaDate() });
    const [data, setData] = useState<Result | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const range = preset === 'custom' ? custom : presetRange(preset);

    const load = useCallback(
        async (page = 1) => {
            setLoading(true);
            setError(null);
            try {
                const query: Record<string, string | number> = { status, page };
                if (range.from) query.from = range.from;
                if (range.to) query.to = range.to;
                const next = await jsonRequest<Result>(historyAction.url({ query }));
                setData((prev) => (page > 1 && prev ? { ...next, rows: [...prev.rows, ...next.rows] } : next));
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setLoading(false);
            }
        },
         
        [status, range.from, range.to],
    );

    useEffect(() => {
        load(1);
    }, [load]);

    const s = data?.summary;
    const stillWithYou = s ? Math.max(0, s.cash_collected - s.cash_handed_over) : 0;

    return (
        <section className="space-y-3">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                {STATUSES.map((st) => (
                    <button
                        key={st.key}
                        type="button"
                        onClick={() => setStatus(st.key)}
                        className={cn('h-9 rounded-lg text-[13px] font-semibold', status === st.key ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                    >
                        {st.label}
                    </button>
                ))}
            </div>

            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
                {PRESETS.map((p) => (
                    <button
                        key={p.key}
                        type="button"
                        onClick={() => setPreset(p.key)}
                        className={cn(
                            'flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold',
                            preset === p.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
                        )}
                    >
                        {p.key === 'custom' && <CalendarDays className="h-3.5 w-3.5" />}
                        {p.label}
                    </button>
                ))}
            </div>

            {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        From
                        <input
                            type="date"
                            value={custom.from}
                            max={custom.to}
                            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
                            className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                        />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        To
                        <input
                            type="date"
                            value={custom.to}
                            min={custom.from}
                            max={manilaDate()}
                            onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                            className="h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                        />
                    </label>
                </div>
            )}

            {s && (
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
                    <SummaryCell label="Delivered" value={`${s.delivered} of ${s.deliveries}`} />
                    <SummaryCell label="Sales delivered" value={pesoExact(s.sales)} />
                    <SummaryCell label="Cash collected" value={pesoExact(s.cash_collected)} />
                    <SummaryCell
                        label={stillWithYou > 0 ? 'Cash still with you' : 'Cash handed over'}
                        value={pesoExact(stillWithYou > 0 ? stillWithYou : s.cash_handed_over)}
                        strong={stillWithYou > 0}
                    />
                </div>
            )}

            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

            {data && data.rows.length === 0 && !loading && (
                <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    No deliveries for this filter.
                </p>
            )}

            {data && data.rows.length > 0 && (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {data.rows.map((r) => {
                        const Icon = r.status === 'completed' ? CheckCircle2 : r.status === 'cancelled' || r.status === 'rejected' ? XCircle : Clock;
                        const when = r.completed_at ?? r.cancelled_at ?? r.assigned_at;
                        return (
                            <li key={r.id} className="flex items-start gap-3 px-3 py-3">
                                <Icon
                                    className={cn(
                                        'mt-0.5 h-5 w-5 shrink-0',
                                        r.status === 'completed'
                                            ? 'text-emerald-600'
                                            : r.status === 'cancelled' || r.status === 'rejected'
                                              ? 'text-rose-600'
                                              : 'text-amber-600',
                                    )}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="truncate font-semibold">{r.customer_name}</p>
                                        <p className="shrink-0 font-mono text-sm font-bold">{pesoExact(r.total)}</p>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {r.barangay ?? '—'} · {r.item_count} item{r.item_count === 1 ? '' : 's'} ·{' '}
                                        {when ? manilaTime(when, true) : ''}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', STATUS_TONE[r.status] ?? 'bg-muted')}>
                                            {r.status_label}
                                        </span>
                                        {r.status === 'completed' && r.payment_method === 'cod' && (
                                            <span
                                                className={cn(
                                                    'rounded px-1.5 py-0.5 text-[11px] font-bold',
                                                    r.cash_remitted
                                                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                                                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                                                )}
                                            >
                                                {r.cash_remitted ? 'Cash handed over' : 'Cash with you'}
                                            </span>
                                        )}
                                        <span className="font-mono text-[11px] text-muted-foreground">{r.order_number}</span>
                                    </div>
                                    {r.cancel_reason && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{r.cancel_reason}</p>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {(loading || data?.has_more) && (
                <button
                    type="button"
                    disabled={loading}
                    onClick={() => data && load(data.page + 1)}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold disabled:opacity-60"
                >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />} {loading ? 'Loading…' : 'Load more'}
                </button>
            )}
        </section>
    );
}

function SummaryCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className={cn('bg-card px-3 py-2.5', strong && 'bg-amber-500/10')}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn('font-mono text-base font-black', strong && 'text-amber-800 dark:text-amber-200')}>{value}</p>
        </div>
    );
}
