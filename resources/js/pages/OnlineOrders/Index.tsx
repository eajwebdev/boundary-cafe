import {
    Banknote,
    Bell,
    BellOff,
    Bike,
    ChefHat,
    ChevronDown,
    Clock,
    ExternalLink,
    Loader2,
    MapPin,
    MessageSquareText,
    PackageCheck,
    Phone,
    Printer,
    RefreshCw,
    Store,
    UtensilsCrossed,
    X,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { assignRider, remitRiderCash } from '@/actions/App/Http/Controllers/OnlineOrderController';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { MapPoint } from '@/components/DeliveryMap';
import AdminLayout from '@/layouts/AdminLayout';
import type { Fulfillment } from '@/lib/customer';
import { jsonRequest, manilaTime, paymentLabel, pesoExact, STATUS_TONE } from '@/lib/customer';
import { cn } from '@/lib/utils';

const DeliveryMap = lazy(() => import('@/components/DeliveryMap'));

interface Card {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    fulfillment_type: Fulfillment;
    fulfillment_label: string;
    table_number: string | null;
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
    branch_id: number;
    rider: { id: number; name: string } | null;
    can_assign_rider: boolean;
    items: { name: string; variant: string | null; quantity: number; price: number; total: number; note: string | null }[];
}

interface Rider {
    id: number;
    name: string;
    branch_id: number;
    active_deliveries: number;
    cash_on_hand: number;
    position: { lat: number; lng: number; recorded_at: string | null; is_live: boolean } | null;
}

interface Board {
    active: Card[];
    finished: Card[];
    counts: Record<string, number>;
    riders: Rider[];
    generated_at: string;
}

/**
 * One color per stage. Each card is tinted in its stage color, and every text, chip and button class is
 * the same hue in a much darker (light mode) or much lighter (dark mode) shade so it stays readable.
 * Tailwind needs the full class names written out, so each stage lists them all.
 */
interface StageTone {
    /** Column heading: colored text over a thick colored underline. */
    header: string;
    /** Solid count badge and selected mobile tab. */
    solid: string;
    dot: string;
    /** Card surface, border and main text color. */
    card: string;
    /** Perforated line between the ticket head and body. */
    divider: string;
    /** Secondary text on the card. */
    muted: string;
    chip: string;
    /** Main action button. */
    button: string;
    /** Hover wash for the small text buttons. */
    hover: string;
}

const STAGE_TONE: Record<string, StageTone> = {
    new: {
        header: 'border-amber-500 text-amber-800 dark:text-amber-300',
        solid: 'border-amber-700 bg-amber-700 text-white',
        dot: 'bg-amber-500',
        card: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-50',
        divider: 'border-amber-300 dark:border-amber-800',
        muted: 'text-amber-800 dark:text-amber-200/80',
        chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100',
        button: 'bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300',
        hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/60',
    },
    kitchen: {
        header: 'border-sky-500 text-sky-800 dark:text-sky-300',
        solid: 'border-sky-700 bg-sky-700 text-white',
        dot: 'bg-sky-500',
        card: 'border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-50',
        divider: 'border-sky-300 dark:border-sky-800',
        muted: 'text-sky-800 dark:text-sky-200/80',
        chip: 'bg-sky-100 text-sky-900 dark:bg-sky-900/70 dark:text-sky-100',
        button: 'bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-400 dark:text-sky-950 dark:hover:bg-sky-300',
        hover: 'hover:bg-sky-100 dark:hover:bg-sky-900/60',
    },
    ready: {
        header: 'border-emerald-500 text-emerald-800 dark:text-emerald-300',
        solid: 'border-emerald-700 bg-emerald-700 text-white',
        dot: 'bg-emerald-500',
        card: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-50',
        divider: 'border-emerald-300 dark:border-emerald-800',
        muted: 'text-emerald-800 dark:text-emerald-200/80',
        chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-100',
        button: 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300',
        hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/60',
    },
    road: {
        header: 'border-violet-500 text-violet-800 dark:text-violet-300',
        solid: 'border-violet-700 bg-violet-700 text-white',
        dot: 'bg-violet-500',
        card: 'border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-50',
        divider: 'border-violet-300 dark:border-violet-800',
        muted: 'text-violet-800 dark:text-violet-200/80',
        chip: 'bg-violet-100 text-violet-900 dark:bg-violet-900/70 dark:text-violet-100',
        button: 'bg-violet-700 text-white hover:bg-violet-800 dark:bg-violet-400 dark:text-violet-950 dark:hover:bg-violet-300',
        hover: 'hover:bg-violet-100 dark:hover:bg-violet-900/60',
    },
};

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

export default function OnlineOrdersBoard({
    board: initial,
    store,
}: {
    board: Board;
    store: { status: { is_open: boolean; message: string | null; opens_at: string; closes_at: string } };
}) {
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
        const t = window.setInterval(() => document.visibilityState === 'visible' && refresh(), 10000);
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

    const giveToRider = async (card: Card, riderId: number | null) => {
        setBusy(card.id);
        try {
            await jsonRequest(assignRider.url(card.id), { method: 'POST', body: { rider_id: riderId } });
            const rider = board.riders.find((r) => r.id === riderId);
            toast.success(rider ? `${card.order_number} given to ${rider.name}` : `${card.order_number}: rider removed`);
            await refresh();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const columns = useMemo(
        () => COLUMNS.map((c) => ({ ...c, cards: board.active.filter((o) => (c.statuses as readonly string[]).includes(o.status)) })),
        [board],
    );

    return (
        <AdminLayout title="Online Orders">
            <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                    <span
                        className={cn(
                            'flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold',
                            store.status.is_open
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                        )}
                    >
                        <span className={cn('h-2 w-2 rounded-full', store.status.is_open ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {store.status.is_open
                            ? `Accepting orders until ${store.status.closes_at}`
                            : (store.status.message ?? 'Closed for online orders')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={chime.toggle}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold"
                            title="New order sound"
                        >
                            {chime.enabled ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
                            Sound {chime.enabled ? 'on' : 'off'}
                        </button>
                        <button
                            type="button"
                            onClick={refresh}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold"
                        >
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
                                mobileCol === c.key ? STAGE_TONE[c.key].solid : 'border-border',
                            )}
                        >
                            {mobileCol !== c.key && <span className={cn('h-2.5 w-2.5 rounded-full', STAGE_TONE[c.key].dot)} />}
                            {c.title}
                            <span className={cn('rounded-full px-1.5 text-xs', mobileCol === c.key ? 'bg-white/25' : 'bg-muted')}>
                                {c.cards.length}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Kanban */}
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                    {columns.map((c) => (
                        <section key={c.key} className={cn('min-w-0 space-y-3', mobileCol !== c.key && 'hidden lg:block')}>
                            <h2
                                className={cn(
                                    'hidden items-center gap-2 border-b-4 pb-2 text-sm font-black tracking-wide uppercase lg:flex',
                                    STAGE_TONE[c.key].header,
                                )}
                            >
                                <c.icon className="h-4 w-4" /> {c.title}
                                <span className={cn('ml-auto min-w-7 rounded px-1.5 text-center font-mono text-xs', STAGE_TONE[c.key].solid)}>
                                    {c.cards.length}
                                </span>
                            </h2>
                            {c.cards.length === 0 && (
                                <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                                    Nothing here
                                </p>
                            )}
                            {c.cards.map((o) => (
                                <OrderCard
                                    key={o.id}
                                    order={o}
                                    tone={STAGE_TONE[c.key]}
                                    showStatus={c.statuses.length > 1}
                                    riders={board.riders.filter((r) => r.branch_id === o.branch_id)}
                                    onAssign={(riderId) => giveToRider(o, riderId)}
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

                {board.riders.length > 0 && <RidersPanel riders={board.riders} active={board.active} onChanged={refresh} />}

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
                                            <td className="px-4 py-2">{o.fulfillment_label}</td>
                                            <td className="px-4 py-2">
                                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_TONE[o.status])}>
                                                    {o.status_label}
                                                </span>
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
                                <h3 className="text-lg font-bold">
                                    {reasonFor.status === 'rejected' ? 'Decline' : 'Cancel'} {reasonFor.card.order_number}?
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    The customer will see this reason. Any points they used are returned automatically.
                                </p>
                            </div>
                            <button type="button" onClick={() => setReasonFor(null)} aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {['Item sold out', 'Outside delivery area', 'Kitchen too busy', 'Could not reach customer'].map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(r)}
                                    className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted"
                                >
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

function OrderCard({
    order: o,
    tone,
    showStatus,
    riders,
    onAssign,
    busy,
    onNext,
    onCancel,
}: {
    order: Card;
    tone: StageTone;
    showStatus: boolean;
    riders: Rider[];
    onAssign: (riderId: number | null) => void;
    busy: boolean;
    onNext: () => void;
    onCancel: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const ageMin = Math.round((Date.now() - new Date(o.created_at).getTime()) / 60000);
    const late = o.status === 'pending' ? ageMin >= 5 : o.estimated_ready_at ? Date.now() > new Date(o.estimated_ready_at).getTime() : false;
    const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
    const itemSummary = o.items.map((i) => `${i.quantity}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ');
    const hasNotes = !!o.customer_note || o.items.some((i) => i.note);
    const FulfillmentIcon = o.fulfillment_type === 'delivery' ? Bike : o.fulfillment_type === 'dine_in' ? UtensilsCrossed : Store;
    const fulfillment =
        o.fulfillment_type === 'delivery'
            ? (o.barangay ?? 'Delivery')
            : o.fulfillment_type === 'dine_in'
              ? `Dine-in${o.table_number ? ` · Table ${o.table_number}` : ''}`
              : 'Takeout';

    return (
        <article className={cn('flex flex-col rounded-lg border p-3', tone.card, !expanded && 'h-64')}>
            {/* Ticket head */}
            <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-base font-black tracking-tight">{o.order_number}</p>
                <span
                    className={cn(
                        'flex shrink-0 items-center gap-1 font-mono text-xs font-bold',
                        late ? 'text-rose-700 dark:text-rose-300' : tone.muted,
                    )}
                >
                    <Clock className="h-3 w-3" />
                    {ageMin < 1 ? 'just now' : `${ageMin} min`}
                    {late && ' · late'}
                </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-semibold">{o.customer_name}</p>
                <span className="shrink-0 font-mono font-bold">{pesoExact(o.total)}</span>
            </div>

            <div className={cn('my-2 border-t-2 border-dashed', tone.divider)} />

            {/* Ticket body */}
            <div className="flex items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap">
                <span className={cn('flex min-w-0 items-center gap-1 rounded px-1.5 py-0.5 font-bold', tone.chip)}>
                    <FulfillmentIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{fulfillment}</span>
                </span>
                {showStatus && <span className={cn('rounded px-1.5 py-0.5 font-bold', tone.chip)}>{o.status_label}</span>}
                {hasNotes && (
                    <span
                        className="flex items-center gap-1 font-bold underline decoration-dotted underline-offset-2"
                        title="This order has notes. Open Details to read them."
                    >
                        <MessageSquareText className="h-3 w-3" /> Note
                    </span>
                )}
            </div>

            {o.fulfillment_type === 'delivery' && (o.can_assign_rider || o.rider) && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <Bike className="h-3.5 w-3.5 shrink-0" />
                    {o.can_assign_rider ? (
                        <select
                            value={o.rider?.id ?? ''}
                            disabled={busy}
                            onChange={(e) => onAssign(e.target.value ? Number(e.target.value) : null)}
                            className={cn('h-7 min-w-0 flex-1 rounded border-0 px-1.5 text-xs font-bold', tone.chip)}
                            aria-label="Rider"
                        >
                            <option value="">{riders.length ? 'Choose a rider…' : 'No riders at this branch'}</option>
                            {riders.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                    {r.active_deliveries ? ` · ${r.active_deliveries} active` : ' · free'}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="truncate font-bold">With {o.rider?.name}</span>
                    )}
                </div>
            )}

            {expanded ? (
                <div className="mt-2 space-y-2 text-sm">
                    <ul className="space-y-0.5">
                        {o.items.map((i, idx) => (
                            <li key={idx}>
                                <b className="font-mono">{i.quantity}×</b> {i.name}
                                {i.variant && <span className={tone.muted}> ({i.variant})</span>}
                                {i.note && <span className="block pl-6 text-xs font-semibold italic">“{i.note}”</span>}
                            </li>
                        ))}
                    </ul>
                    {o.customer_note && (
                        <p className="rounded bg-white/70 px-2 py-1 text-xs font-medium dark:bg-black/25">
                            <b>Note:</b> {o.customer_note}
                        </p>
                    )}
                    <a
                        href={`tel:${o.contact_number}`}
                        className={cn('flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold', tone.chip)}
                    >
                        <Phone className="h-3 w-3" /> {o.contact_number}
                    </a>
                    {o.fulfillment_type === 'delivery' && (
                        <p className={cn('flex items-start gap-1 text-xs', tone.muted)}>
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                                {o.address}
                                {o.landmark ? ` · ${o.landmark}` : ''}
                                {o.notes_for_rider ? ` · Rider: ${o.notes_for_rider}` : ''}
                                {o.lat && o.lng && (
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="ml-1 inline-flex items-center gap-0.5 font-bold underline underline-offset-2"
                                    >
                                        Directions <ExternalLink className="h-3 w-3" />
                                    </a>
                                )}
                            </span>
                        </p>
                    )}
                    <p className={cn('text-xs', tone.muted)}>
                        {paymentLabel(o.payment_method)}
                        {o.loyalty_points_redeemed ? ` · ${o.loyalty_points_redeemed} pts used` : ''}
                    </p>
                </div>
            ) : (
                <p className={cn('mt-2 line-clamp-2 text-sm', tone.muted)}>
                    <span className="font-bold">
                        {itemCount} item{itemCount === 1 ? '' : 's'}:
                    </span>{' '}
                    {itemSummary}
                </p>
            )}

            <div className="mt-auto space-y-1 pt-2">
                {o.next_status && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onNext}
                        className={cn(
                            'flex h-9 w-full items-center justify-center gap-1.5 rounded-md px-2 text-sm font-bold disabled:opacity-60',
                            tone.button,
                        )}
                    >
                        {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                        <span className="truncate">{NEXT_LABEL[o.next_status] ?? o.next_label}</span>
                    </button>
                )}
                <div className="flex items-center gap-1 text-xs font-bold">
                    {(o.can_cancel || o.can_reject) && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex h-7 items-center gap-1 rounded px-1.5 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-950/60"
                        >
                            <X className="h-3.5 w-3.5" /> {o.can_reject ? 'Decline' : 'Cancel'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => printTicket(o)}
                        className={cn('flex h-7 items-center gap-1 rounded px-1.5', tone.hover)}
                        title="Print kitchen ticket"
                    >
                        <Printer className="h-3.5 w-3.5" /> Print
                    </button>
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-expanded={expanded}
                        className={cn('ml-auto flex h-7 items-center gap-1 rounded px-1.5', tone.hover)}
                    >
                        {expanded ? 'Less' : 'Details'} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                    </button>
                </div>
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
        .map(
            (i) =>
                `<tr><td><b>${i.quantity}×</b> ${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''}${i.note ? `<br><i>“${escapeHtml(i.note)}”</i>` : ''}</td><td style="text-align:right">${pesoExact(i.total)}</td></tr>`,
        )
        .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.order_number)}</title>
<style>body{font-family:ui-monospace,monospace;font-size:13px;margin:12px;width:280px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}hr{border:0;border-top:1px dashed #000}</style></head><body>
<h1>${o.fulfillment_type === 'delivery' ? 'DELIVERY' : o.fulfillment_type === 'dine_in' ? `DINE-IN${o.table_number ? ` · TABLE ${escapeHtml(o.table_number)}` : ''}` : 'TAKEOUT'}</h1>
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
<tr><td><b>TOTAL (${o.payment_method === 'cod' ? 'COD' : paymentLabel(o.payment_method)})</b></td><td style="text-align:right"><b>${pesoExact(o.total)}</b></td></tr></table>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
    w.document.close();
}

/** Riders on a live map, with the cash each one holds from cash-on-delivery orders. */
function RidersPanel({ riders, active, onChanged }: { riders: Rider[]; active: Card[]; onChanged: () => Promise<void> }) {
    const [remitting, setRemitting] = useState<number | null>(null);
    const onTheRoad = active.filter((o) => o.status === 'out_for_delivery' && o.rider && o.lat && o.lng);

    const points = useMemo<MapPoint[]>(() => {
        const list: MapPoint[] = [];
        riders.forEach(
            (r) =>
                r.position &&
                list.push({
                    id: `rider-${r.id}`,
                    kind: 'rider',
                    lat: r.position.lat,
                    lng: r.position.lng,
                    label: r.name,
                    stale: !r.position.is_live,
                }),
        );
        onTheRoad.forEach((o) =>
            list.push({ id: `drop-${o.id}`, kind: 'drop', lat: o.lat!, lng: o.lng!, label: `${o.order_number} · ${o.customer_name}` }),
        );
        return list;
    }, [riders, onTheRoad]);

    const remit = async (rider: Rider) => {
        const confirmed = await confirmDialog({
            title: `Receive ${pesoExact(rider.cash_on_hand)} from ${rider.name}?`,
            description: 'Count the cash first. Every delivered cash-on-delivery order they hold is marked as handed over.',
            confirmLabel: 'Cash received',
        });
        if (!confirmed) return;
        setRemitting(rider.id);
        try {
            const res = await jsonRequest<{ message: string }>(remitRiderCash.url(rider.id), { method: 'POST' });
            toast.success(res.message);
            await onChanged();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setRemitting(null);
        }
    };

    return (
        <section className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[1fr_360px]">
            <div className="h-72 border-b border-border lg:h-auto lg:min-h-80 lg:border-r lg:border-b-0">
                {points.length > 0 ? (
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>}>
                        <DeliveryMap
                            points={points}
                            lines={onTheRoad.map((o) => [`rider-${o.rider!.id}`, `drop-${o.id}`] as [string, string])}
                            fitKey={points.map((p) => p.id).join('|')}
                            className="h-full min-h-72 w-full"
                        />
                    </Suspense>
                ) : (
                    <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        Riders appear here once they open their Rider Dashboard and allow location.
                    </p>
                )}
            </div>
            <div>
                <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-black tracking-wide uppercase">
                    <Bike className="h-4 w-4" /> Riders
                </h2>
                <ul className="divide-y divide-border">
                    {riders.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                            <span
                                className={cn('h-2.5 w-2.5 shrink-0 rounded-full', r.position?.is_live ? 'bg-emerald-500' : 'bg-muted-foreground/40')}
                                title={r.position?.is_live ? 'Sharing location now' : 'Not sharing location'}
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold">{r.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {r.active_deliveries ? `${r.active_deliveries} active` : 'Free'}
                                    {r.position?.recorded_at && !r.position.is_live ? ` · last seen ${manilaTime(r.position.recorded_at)}` : ''}
                                </p>
                            </div>
                            {r.cash_on_hand > 0 ? (
                                <button
                                    type="button"
                                    disabled={remitting === r.id}
                                    onClick={() => remit(r)}
                                    className="flex h-8 items-center gap-1.5 rounded-md bg-amber-500/15 px-2.5 text-xs font-bold text-amber-800 hover:bg-amber-500/25 disabled:opacity-60 dark:text-amber-200"
                                    title="Mark this rider's cash as handed over"
                                >
                                    {remitting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
                                    {pesoExact(r.cash_on_hand)}
                                </button>
                            ) : (
                                <span className="text-xs text-muted-foreground">No cash held</span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
