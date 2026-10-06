import { Bike, CheckCircle2, ClipboardList, Loader2, RefreshCw, ShoppingBag, Utensils, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { jsonRequest } from '@/lib/customer';
import { useFloorUpdates } from '@/lib/realtime';
import { cn } from '@/lib/utils';

import { fmtMoney } from './ReceiptTemplate';

export interface PendingTicketItem {
    product_id: number;
    variant_id: number | null;
    name: string;
    variant_name: string | null;
    quantity: number;
    price: number;
    note: string | null;
    product_img: string | null;
    unit: string;
}

export interface PendingTicket {
    id: number;
    order_number: string;
    table_number: string | null;
    table_label: string | null;
    taken_by: string | null;
    customer: { id: number; name: string; loyalty_points: number } | null;
    customer_name: string | null;
    covers: number;
    notes: string | null;
    total: number;
    item_count: number;
    opened_at: string | null;
    sent_at: string | null;
    items: PendingTicketItem[];
}

export interface PendingPickup {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    customer_name: string;
    contact_number: string;
    total: number;
    item_count: number;
    items: string[];
    created_at: string;
}

interface PendingData {
    table_orders: PendingTicket[];
    online_pickups: PendingPickup[];
    count: number;
}

/**
 * The cashier's pending queue. Table tickets arrive the moment a waiter sends them (Pusher);
 * a 10s poll (paused while the tab is hidden) covers online pickups and realtime being off.
 */
export function usePendingOrders(enabled = true) {
    const [data, setData] = useState<PendingData>({ table_orders: [], online_pickups: [], count: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<number | undefined>(undefined);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setData(await jsonRequest<PendingData>('/pos/pending-orders'));
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const loop = async () => {
            if (document.visibilityState === 'visible') await refresh();
            timer.current = window.setTimeout(loop, 10000);
        };
        loop();
        return () => window.clearTimeout(timer.current);
    }, [enabled, refresh]);

    useFloorUpdates(() => {
        if (enabled) refresh();
    });

    return { data, loading, error, refresh };
}

function minutesSince(iso: string | null) {
    if (!iso) return '';
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

interface Props {
    open: boolean;
    onClose: () => void;
    currency: string;
    pending: ReturnType<typeof usePendingOrders>;
    activeTicketId: number | null;
    onLoad: (ticket: PendingTicket) => void;
}

export default function PendingOrdersPanel({ open, onClose, currency, pending, activeTicketId, onLoad }: Props) {
    const [voiding, setVoiding] = useState<PendingTicket | null>(null);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState<number | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const { data, loading, error, refresh } = pending;

    if (!open) return null;

    const voidTicket = async () => {
        if (!voiding || reason.trim().length < 3) return;
        setBusy(voiding.id);
        try {
            await jsonRequest(`/pos/table-orders/${voiding.id}/void`, { method: 'POST', body: { reason } });
            setMessage(`Table ${voiding.table_number} ticket voided.`);
            setVoiding(null);
            setReason('');
            await refresh();
        } catch (e) {
            setMessage((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const completePickup = async (p: PendingPickup) => {
        if (!confirm(`Hand over ${p.order_number} to ${p.customer_name} and collect ${fmtMoney(p.total, currency)}?`)) return;
        setBusy(p.id);
        try {
            await jsonRequest(`/online-orders/${p.id}/transition`, { method: 'POST', body: { status: 'completed' } });
            setMessage(`${p.order_number} completed — payment recorded.`);
            await refresh();
        } catch (e) {
            setMessage((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={onClose}>
            <aside className="flex h-full w-full max-w-md flex-col bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <header className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                        <h2 className="text-base font-extrabold">Pending orders</h2>
                        <p className="text-xs text-muted-foreground">Dine-in tickets from servers · online pickups</p>
                    </div>
                    <button type="button" onClick={refresh} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Refresh">
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    </button>
                    <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                    {message && (
                        <p className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                            {message}
                            <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss">
                                <X className="h-4 w-4" />
                            </button>
                        </p>
                    )}
                    {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                    <section>
                        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            <Utensils className="h-3.5 w-3.5" /> Dine-in tables ({data.table_orders.length})
                        </h3>
                        {data.table_orders.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No table tickets waiting.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.table_orders.map((t) => (
                                    <li key={t.id} className={cn('rounded-xl border bg-card p-3', activeTicketId === t.id ? 'border-primary ring-2 ring-primary/20' : 'border-border')}>
                                        <div className="flex items-start gap-3">
                                            <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                                <span className="text-[9px] leading-none font-bold uppercase opacity-80">Table</span>
                                                <span className="text-lg leading-none font-black">{t.table_number}</span>
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold">
                                                    {t.item_count} item{t.item_count !== 1 ? 's' : ''} · {fmtMoney(t.total, currency)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {minutesSince(t.sent_at)} ago{t.taken_by ? ` · by ${t.taken_by}` : ''}
                                                    {t.customer ? ` · ★ ${t.customer.name}` : t.customer_name ? ` · ${t.customer_name}` : ''}
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                    {t.items.map((i) => `${i.quantity}× ${i.name}${i.variant_name ? ` (${i.variant_name})` : ''}`).join(', ')}
                                                </p>
                                            </div>
                                        </div>
                                        {voiding?.id === t.id ? (
                                            <div className="mt-3 space-y-2">
                                                <input
                                                    autoFocus
                                                    value={reason}
                                                    onChange={(e) => setReason(e.target.value)}
                                                    placeholder="Reason for voiding (required)"
                                                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                                                />
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => setVoiding(null)} className="h-9 flex-1 rounded-lg border border-border text-sm font-semibold">
                                                        Keep
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={reason.trim().length < 3 || busy === t.id}
                                                        onClick={voidTicket}
                                                        className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-destructive text-sm font-bold text-white disabled:opacity-50"
                                                    >
                                                        {busy === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Void ticket
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-3 flex gap-2">
                                                <button type="button" onClick={() => setVoiding(t)} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">
                                                    Void
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        onLoad(t);
                                                        onClose();
                                                    }}
                                                    className="h-9 flex-1 rounded-lg bg-primary text-sm font-bold text-primary-foreground"
                                                >
                                                    {activeTicketId === t.id ? 'Loaded in cart' : 'Load & charge'}
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section>
                        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            <ShoppingBag className="h-3.5 w-3.5" /> Online pickups ({data.online_pickups.length})
                        </h3>
                        {data.online_pickups.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No pickup orders right now.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.online_pickups.map((p) => (
                                    <li key={p.id} className="rounded-xl border border-border bg-card p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-bold">{p.order_number}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {p.customer_name} · {p.contact_number}
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.items.join(', ')}</p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
                                                    p.status === 'ready' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
                                                )}
                                            >
                                                {p.status_label}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="font-mono font-bold">{fmtMoney(p.total, currency)}</span>
                                            {p.status === 'ready' ? (
                                                <button
                                                    type="button"
                                                    disabled={busy === p.id}
                                                    onClick={() => completePickup(p)}
                                                    className="flex h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50"
                                                >
                                                    {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Hand over & collect
                                                </button>
                                            ) : (
                                                <a href="/online-orders" className="flex items-center gap-1 text-sm font-semibold text-primary">
                                                    <Bike className="h-4 w-4" /> Open board
                                                </a>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </aside>
        </div>
    );
}
