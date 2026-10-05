import { Bell, BellOff, Bike, ChefHat, Clock, ExternalLink, Loader2, MapPin, PackageCheck, Phone, Printer, RefreshCw, Store, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import AdminLayout from '@/layouts/AdminLayout';
import { jsonRequest, manilaTime, pesoExact, STATUS_TONE } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface Card {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    fulfillment_type: 'delivery' | 'pickup';
    payment_method: string;
    customer_name: string;
    contact_number: string;
    barangay: string | null;
    address: string | null;
    landmark: string | null;
    notes_for_rider: string | null;
    lat: number | null;
    lng: number | null;
    customer_note: string | null;
    subtotal: number;
    promo_label: string | null;
    promo_discount: number;
    vat_amount: number;
    loyalty_discount: number;
    loyalty_points_redeemed: number;
    delivery_fee: number;
    total: number;
    cancel_reason: string | null;
    handled_by: string | null;
    sale_id: number | null;
    created_at: string;
    updated_at: string;
    estimated_ready_at: string | null;
    next_status: string | null;
    next_label: string | null;
    can_cancel: boolean;
    can_reject: boolean;
    items: { name: string; variant: string | null; quantity: number; price: number; total: number; note: string | null }[];
}

interface Board {
    active: Card[];
    finished: Card[];
    counts: Record<string, number>;
    generated_at: string;
}

const COLUMNS = [
    { key: 'new', title: 'New', statuses: ['pending'], icon: Bell },
    { key: 'kitchen', title: 'In the kitchen', statuses: ['accepted', 'preparing'], icon: ChefHat },
    { key: 'ready', title: 'Ready', statuses: ['ready'], icon: PackageCheck },
    { key: 'road', title: 'On the way', statuses: ['out_for_delivery'], icon: Bike },
] as const;

const NEXT_LABEL: Record<string, string> = {
    accepted: 'Accept order',
    preparing: 'Start preparing',
    ready: 'Mark ready',
    out_for_delivery: 'Hand to rider',
    completed: 'Complete & record sale',
};

function useChime() {
    const ctxRef = useRef<AudioContext | null>(null);
    const [enabled, setEnabled] = useState(() => {
        try {
            return window.localStorage.getItem('bc-online-chime') !== 'off';
        } catch {
            return true;
        }
    });
    const toggle = () => {
        const next = !enabled;
        setEnabled(next);
        try {
            window.localStorage.setItem('bc-online-chime', next ? 'on' : 'off');
        } catch {
            /* ignore */
        }
        if (next) play();
    };
    const play = useCallback(() => {
        try {
            ctxRef.current ??= new AudioContext();
            const ctx = ctxRef.current;
            [880, 1320].forEach((freq, i) => {
                const o = ctx.createOscillator();
                const g = ctx.createGain();
                o.frequency.value = freq;
                o.type = 'sine';
                g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
                g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
                o.connect(g).connect(ctx.destination);
                o.start(ctx.currentTime + i * 0.18);
                o.stop(ctx.currentTime + i * 0.18 + 0.32);
            });
        } catch {
            /* audio unavailable */
        }
    }, []);
    return { enabled, toggle, play };
}

export default function OnlineOrdersBoard({ board: initial, store }: { board: Board; store: { status: { is_open: boolean; message: string | null; opens_at: string; closes_at: string } } }) {
    const [board, setBoard] = useState(initial);
    const [refreshing, setRefreshing] = useState(false);
    const [mobileCol, setMobileCol] = useState<string>('new');
    const [busy, setBusy] = useState<number | null>(null);
    const [reasonFor, setReasonFor] = useState<{ card: Card; status: 'cancelled' | 'rejected' } | null>(null);
    const [reason, setReason] = useState('');
    const knownPending = useRef(new Set(initial.active.filter((c) => c.status === 'pending').map((c) => c.id)));
    const chime = useChime();

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            const next = await jsonRequest<Board>('/online-orders/feed');
            const fresh = next.active.filter((c) => c.status === 'pending' && !knownPending.current.has(c.id));
            if (fresh.length) {
                fresh.forEach((c) => knownPending.current.add(c.id));
                toast.info(`New online order${fresh.length > 1 ? 's' : ''}: ${fresh.map((c) => c.order_number).join(', ')}`);
                if (chime.enabled) chime.play();
            }
            setBoard(next);
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setRefreshing(false);
        }
    }, [chime]);

    useEffect(() => {
        const t = window.setInterval(() => document.visibilityState === 'visible' && refresh(), 15000);
        return () => window.clearInterval(t);
    }, [refresh]);

    const move = async (card: Card, status: string, why?: string) => {
        setBusy(card.id);
        try {
            await jsonRequest(`/online-orders/${card.id}/transition`, { method: 'POST', body: { status, reason: why ?? null } });
            toast.success(`${card.order_number}: ${NEXT_LABEL[status] ?? status.replace(/_/g, ' ')}`);
            await refresh();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const columns = useMemo(() => COLUMNS.map((c) => ({ ...c, cards: board.active.filter((o) => (c.statuses as readonly string[]).includes(o.status)) })), [board]);

    return (
        <AdminLayout title="Online Orders">
            <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold',
                            store.status.is_open ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                        )}
                    >
                        <span className={cn('h-2 w-2 rounded-full', store.status.is_open ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {store.status.is_open ? `Accepting orders until ${store.status.closes_at}` : (store.status.message ?? 'Closed for online orders')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={chime.toggle} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold" title="New order sound">
                            {chime.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
                            Sound {chime.enabled ? 'on' : 'off'}
                        </button>
                        <button type="button" onClick={refresh} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold">
                            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} /> Refresh
                        </button>
                    </div>
                </div>

                {/* Mobile column tabs */}
                <div className="flex gap-2 overflow-x-auto lg:hidden">
                    {columns.map((c) => (
                        <button
                            key={c.key}
                            type="button"
                            onClick={() => setMobileCol(c.key)}
                            className={cn(
                                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                                mobileCol === c.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                            )}
                        >
                            {c.title}
                            <span className={cn('rounded-full px-1.5 text-xs', mobileCol === c.key ? 'bg-white/25' : 'bg-muted')}>{c.cards.length}</span>
                        </button>
                    ))}
                </div>

                {/* Kanban */}
                <div className="grid gap-4 lg:grid-cols-4">
                    {columns.map((c) => (
                        <section key={c.key} className={cn('min-w-0 space-y-3', mobileCol !== c.key && 'hidden lg:block')}>
                            <h2 className="hidden items-center gap-2 text-sm font-bold tracking-wide text-muted-foreground uppercase lg:flex">
                                <c.icon className="h-4 w-4" /> {c.title}
                                <span className="rounded-full bg-muted px-2 text-xs">{c.cards.length}</span>
                            </h2>
                            {c.cards.length === 0 && <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">Nothing here</p>}
                            {c.cards.map((o) => (
                                <OrderCard
                                    key={o.id}
                                    order={o}
                                    busy={busy === o.id}
                                    onNext={() => o.next_status && move(o, o.next_status)}
                                    onCancel={() => {
                                        setReason('');
                                        setReasonFor({ card: o, status: o.can_reject ? 'rejected' : 'cancelled' });
                                    }}
                                />
                            ))}
                        </section>
                    ))}
                </div>

                {/* Finished today */}
                <section className="rounded-xl border border-border bg-card">
                    <h2 className="border-b border-border px-4 py-3 text-sm font-bold">Finished today ({board.finished.length})</h2>
                    {board.finished.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No completed or cancelled orders yet today.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs text-muted-foreground uppercase">
                                    <tr>
                                        <th className="px-4 py-2">Order</th>
                                        <th className="px-4 py-2">Customer</th>
                                        <th className="px-4 py-2">Type</th>
                                        <th className="px-4 py-2">Status</th>
                                        <th className="px-4 py-2 text-right">Total</th>
                                        <th className="px-4 py-2">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {board.finished.map((o) => (
                                        <tr key={o.id}>
                                            <td className="px-4 py-2 font-mono text-xs">{o.order_number}</td>
                                            <td className="px-4 py-2">{o.customer_name}</td>
                                            <td className="px-4 py-2 capitalize">{o.fulfillment_type}</td>
                                            <td className="px-4 py-2">
                                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_TONE[o.status])}>{o.status_label}</span>
                                                {o.cancel_reason && <span className="ml-2 text-xs text-muted-foreground">{o.cancel_reason}</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right font-semibold">{pesoExact(o.total)}</td>
                                            <td className="px-4 py-2 text-xs text-muted-foreground">{manilaTime(o.updated_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {/* Reason dialog */}
            {reasonFor && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setReasonFor(null)}>
                    <div className="w-full max-w-md space-y-3 rounded-2xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-bold">{reasonFor.status === 'rejected' ? 'Decline' : 'Cancel'} {reasonFor.card.order_number}?</h3>
                                <p className="text-sm text-muted-foreground">The customer will see this reason. Any points they used are returned automatically.</p>
                            </div>
                            <button type="button" onClick={() => setReasonFor(null)} aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {['Item sold out', 'Outside delivery area', 'Kitchen too busy', 'Could not reach customer'].map((r) => (
                                <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted">
                                    {r}
                                </button>
                            ))}
                        </div>
                        <textarea
                            autoFocus
                            value={reason}
                            onChange={(e) => setReason(e.target.value.slice(0, 255))}
                            placeholder="Reason (required)"
                            className="h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                        <button
                            type="button"
                            disabled={reason.trim().length < 3 || busy === reasonFor.card.id}
                            onClick={async () => {
                                await move(reasonFor.card, reasonFor.status, reason.trim());
                                setReasonFor(null);
                            }}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-destructive font-bold text-white disabled:opacity-50"
                        >
                            {busy === reasonFor.card.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            {reasonFor.status === 'rejected' ? 'Decline order' : 'Cancel order'}
                        </button>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}

function OrderCard({ order: o, busy, onNext, onCancel }: { order: Card; busy: boolean; onNext: () => void; onCancel: () => void }) {
    const ageMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    const late = o.status === 'pending' ? ageMin >= 5 : o.estimated_ready_at ? Date.now() > new Date(o.estimated_ready_at).getTime() : false;

    return (
        <article className={cn('rounded-xl border bg-card p-3 shadow-xs', o.status === 'pending' ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-border')}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-mono text-xs font-bold">{o.order_number}</p>
                    <p className="truncate font-bold">{o.customer_name}</p>
                </div>
                <span className={cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', late ? 'bg-rose-500/15 text-rose-600' : 'bg-muted text-muted-foreground')}>
                    <Clock className="h-3 w-3" /> {ageMin < 1 ? 'now' : `${ageMin}m`}
                </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', o.fulfillment_type === 'delivery' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-sky-500/10 text-sky-700 dark:text-sky-300')}>
                    {o.fulfillment_type === 'delivery' ? <Bike className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                    {o.fulfillment_type === 'delivery' ? o.barangay : 'Pickup'}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 font-semibold', STATUS_TONE[o.status])}>{o.status_label}</span>
                <a href={`tel:${o.contact_number}`} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold">
                    <Phone className="h-3 w-3" /> {o.contact_number}
                </a>
            </div>

            <ul className="mt-2 space-y-0.5 text-sm">
                {o.items.map((i, idx) => (
                    <li key={idx}>
                        <b>{i.quantity}×</b> {i.name}
                        {i.variant && <span className="text-muted-foreground"> ({i.variant})</span>}
                        {i.note && <span className="block pl-5 text-xs text-amber-700 italic dark:text-amber-300">“{i.note}”</span>}
                    </li>
                ))}
            </ul>
            {o.customer_note && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Note: {o.customer_note}</p>}
            {o.fulfillment_type === 'delivery' && (
                <p className="mt-2 flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                        {o.address}
                        {o.landmark ? ` · ${o.landmark}` : ''}
                        {o.lat && o.lng && (
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-primary">
                                Directions <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </span>
                </p>
            )}

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-xs text-muted-foreground">{o.payment_method === 'cod' ? 'Cash on delivery' : 'Pay at pickup'}{o.loyalty_points_redeemed ? ` · ${o.loyalty_points_redeemed} pts used` : ''}</span>
                <span className="font-extrabold">{pesoExact(o.total)}</span>
            </div>

            <div className="mt-2 flex gap-2">
                {(o.can_cancel || o.can_reject) && (
                    <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-border px-3 text-sm font-semibold text-destructive">
                        {o.can_reject ? 'Decline' : 'Cancel'}
                    </button>
                )}
                <button type="button" onClick={() => printTicket(o)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border" aria-label="Print ticket" title="Print kitchen ticket">
                    <Printer className="h-4 w-4" />
                </button>
                {o.next_status && (
                    <button type="button" disabled={busy} onClick={onNext} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-60">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        {NEXT_LABEL[o.next_status] ?? o.next_label}
                    </button>
                )}
            </div>
        </article>
    );
}

function escapeHtml(s: string | null | undefined) {
    return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function printTicket(o: Card) {
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) return;
    const rows = o.items
        .map((i) => `<tr><td><b>${i.quantity}×</b> ${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''}${i.note ? `<br><i>“${escapeHtml(i.note)}”</i>` : ''}</td><td style="text-align:right">${pesoExact(i.total)}</td></tr>`)
        .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.order_number)}</title>
<style>body{font-family:ui-monospace,monospace;font-size:13px;margin:12px;width:280px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000}</style></head><body>
<h1>${o.fulfillment_type === 'delivery' ? 'DELIVERY' : 'PICKUP'}</h1>
<div>${escapeHtml(o.order_number)} · ${manilaTime(o.created_at, true)}</div><hr>
<div><b>${escapeHtml(o.customer_name)}</b> · ${escapeHtml(o.contact_number)}</div>
${o.fulfillment_type === 'delivery' ? `<div>${escapeHtml(o.address)}</div>${o.landmark ? `<div>Landmark: ${escapeHtml(o.landmark)}</div>` : ''}${o.notes_for_rider ? `<div>Rider: ${escapeHtml(o.notes_for_rider)}</div>` : ''}` : ''}
<hr><table>${rows}</table><hr>
${o.customer_note ? `<div>Note: ${escapeHtml(o.customer_note)}</div><hr>` : ''}
<table><tr><td>Subtotal</td><td style="text-align:right">${pesoExact(o.subtotal)}</td></tr>
${o.promo_discount ? `<tr><td>Promo</td><td style="text-align:right">-${pesoExact(o.promo_discount)}</td></tr>` : ''}
${o.vat_amount ? `<tr><td>VAT</td><td style="text-align:right">${pesoExact(o.vat_amount)}</td></tr>` : ''}
${o.loyalty_discount ? `<tr><td>Points</td><td style="text-align:right">-${pesoExact(o.loyalty_discount)}</td></tr>` : ''}
${o.delivery_fee ? `<tr><td>Delivery</td><td style="text-align:right">${pesoExact(o.delivery_fee)}</td></tr>` : ''}
<tr><td><b>TOTAL (${o.payment_method === 'cod' ? 'COD' : 'Pay at pickup'})</b></td><td style="text-align:right"><b>${pesoExact(o.total)}</b></td></tr></table>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
    w.document.close();
}
