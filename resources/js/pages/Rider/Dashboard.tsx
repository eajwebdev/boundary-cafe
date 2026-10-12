import { Head, router, usePage } from '@inertiajs/react';
import {
    Banknote,
    Bike,
    CheckCircle2,
    ChevronDown,
    Clock,
    CloudUpload,
    Crosshair,
    History,
    Inbox,
    Loader2,
    LocateFixed,
    LocateOff,
    LogOut,
    MapPin,
    MapPinned,
    MessageSquareText,
    Navigation,
    PackageCheck,
    Phone,
    Plus,
    RefreshCw,
    WifiOff,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { claim, deliver, feed, pickUp, position as positionRoute } from '@/actions/App/Http/Controllers/Rider/DeliveryController';
import { confirmDialog } from '@/components/ConfirmDialog';
import type { MapPoint } from '@/components/DeliveryMap';
import { useBusinessName } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';
import { jsonRequest, manilaTime, pesoExact } from '@/lib/customer';
import { distanceKm, formatKm, planRoute, rideMinutes, roadKm, type LatLng } from '@/lib/delivery-route';
import { cn } from '@/lib/utils';

import HistoryView from './HistoryView';
import NavigationView from './NavigationView';
import { STATUS_TONE, useActionQueue, type Delivery, type RiderAction } from './rider-shared';

const DeliveryMap = lazy(() => import('@/components/DeliveryMap'));

interface Position {
    lat: number;
    lng: number;
    accuracy_m: number | null;
    recorded_at: string | null;
    is_live: boolean;
}

interface DashboardData {
    mine: Delivery[];
    available: Delivery[];
    delivered_today: {
        id: number;
        order_number: string;
        customer_name: string;
        barangay: string | null;
        total: number;
        payment_method: string;
        completed_at: string | null;
        cash_remitted: boolean;
    }[];
    cash_on_hand: number;
    position: Position | null;
}

interface Props extends DashboardData {
    store: { name: string; lat: number; lng: number };
}

type Tab = 'stops' | 'available' | 'history';
type GpsState = 'starting' | 'on' | 'denied' | 'unavailable';

/** How often the dashboard refreshes, the fastest the phone sends its GPS, and when data counts as out of date. */
const POLL_MS = 8000;
const SEND_EVERY_MS = 5000;
const STALE_AFTER_MS = 25000;

/**
 * Shares the phone's GPS while this page is open. A fix that fails to upload (weak signal) is kept and
 * re-sent on the next fix, when the connection returns, or on the next refresh, so staff and the
 * customer never lose the rider for long.
 */
function useLiveLocation(onFix: (p: LatLng) => void) {
    const [state, setState] = useState<GpsState>('starting');
    const [uploadFailing, setUploadFailing] = useState(false);
    const lastSent = useRef(0);
    const pending = useRef<{ lat: number; lng: number; accuracy: number; heading: number | null } | null>(null);
    const inFlight = useRef(false);
    const fixRef = useRef(onFix);
    fixRef.current = onFix;

    const flush = useCallback(async () => {
        if (!pending.current || inFlight.current) return;
        const fix = pending.current;
        inFlight.current = true;
        try {
            await jsonRequest(positionRoute.url(), { method: 'POST', body: fix });
            if (pending.current === fix) pending.current = null;
            lastSent.current = Date.now();
            setUploadFailing(false);
        } catch {
            setUploadFailing(true);
        } finally {
            inFlight.current = false;
        }
    }, []);

    useEffect(() => {
        if (!('geolocation' in navigator)) {
            setState('unavailable');
            return;
        }
        const id = navigator.geolocation.watchPosition(
            (pos) => {
                setState('on');
                const { latitude: lat, longitude: lng, accuracy, heading } = pos.coords;
                fixRef.current({ lat, lng });
                pending.current = { lat, lng, accuracy, heading: heading ?? null };
                if (Date.now() - lastSent.current >= SEND_EVERY_MS) flush();
            },
            (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        );
        window.addEventListener('online', flush);
        return () => {
            navigator.geolocation.clearWatch(id);
            window.removeEventListener('online', flush);
        };
    }, [flush]);

    return { state, uploadFailing, flush };
}

/** Keeps the screen on while the dashboard is open, so the phone keeps sharing its location. */
function useWakeLock() {
    useEffect(() => {
        let lock: WakeLockSentinel | null = null;
        const request = async () => {
            try {
                if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
            } catch {
                /* battery saver or unsupported: the page still works, the screen may just dim */
            }
        };
        request();
        const onVisible = () => document.visibilityState === 'visible' && request();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            lock?.release().catch(() => {});
        };
    }, []);
}

function useOnline() {
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    useEffect(() => {
        const up = () => setOnline(true);
        const down = () => setOnline(false);
        window.addEventListener('online', up);
        window.addEventListener('offline', down);
        return () => {
            window.removeEventListener('online', up);
            window.removeEventListener('offline', down);
        };
    }, []);
    return online;
}

export default function RiderDashboard({ store, ...initial }: Props) {
    const { auth } = usePage().props as unknown as { auth: { user: { id: number; fname: string; full_name: string } } };
    const businessName = useBusinessName();
    const logo = useLogoUrl();
    const [data, setData] = useState<DashboardData>(initial);
    const [busy, setBusy] = useState<number | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<Tab>(initial.mine.length > 0 || initial.available.length === 0 ? 'stops' : 'available');
    const [selected, setSelected] = useState<string | null>(null);
    const [navigatingId, setNavigatingId] = useState<number | null>(null);
    const [fitNonce, setFitNonce] = useState(0);
    const [lastSync, setLastSync] = useState(() => Date.now());
    const [now, setNow] = useState(() => Date.now());
    const [me, setMe] = useState<LatLng | null>(initial.position ? { lat: initial.position.lat, lng: initial.position.lng } : null);
    const gps = useLiveLocation(setMe);
    const online = useOnline();
    const knownMine = useRef(new Set(initial.mine.map((d) => d.id)));
    useWakeLock();

    const refresh = useCallback(
        async (manual = false) => {
            setRefreshing(true);
            try {
                const next = await jsonRequest<DashboardData>(feed.url());
                const newlyMine = next.mine.filter((d) => !knownMine.current.has(d.id));
                if (newlyMine.length) {
                    toast.success(`New delivery for you: ${newlyMine.map((d) => d.customer_name).join(', ')}`);
                    navigator.vibrate?.([180, 90, 180]);
                    setTab('stops');
                }
                knownMine.current = new Set(next.mine.map((d) => d.id));
                setData(next);
                setLastSync(Date.now());
                gps.flush();
            } catch (e) {
                if (manual) toast.error((e as Error).message);
            } finally {
                setRefreshing(false);
            }
        },
        [gps],
    );
    const queue = useActionQueue(auth.user.id, () => refresh());

    useEffect(() => {
        const poll = window.setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS);
        const clock = window.setInterval(() => setNow(Date.now()), 5000);
        const onVisible = () => document.visibilityState === 'visible' && refresh();
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onVisible);
        return () => {
            window.clearInterval(poll);
            window.clearInterval(clock);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onVisible);
        };
    }, [refresh]);

    const act = async (d: Delivery, action: RiderAction, url: string, label: string) => {
        setBusy(d.id);
        try {
            if (await queue.run(d.id, action, url, label)) await refresh();
        } finally {
            setBusy(null);
        }
    };

    const pickUpOrder = (d: Delivery) => act(d, 'picked-up', pickUp.url(d.id), `Picked up ${d.order_number}`);
    const markDelivered = async (d: Delivery) => {
        const confirmed = await confirmDialog({
            title: `Delivered to ${d.customer_name}?`,
            description: d.collect > 0 ? `Collect ${pesoExact(d.collect)} cash before confirming.` : 'Confirm you handed over the order.',
            confirmLabel: d.collect > 0 ? `Cash collected · ${pesoExact(d.collect)}` : 'Delivered',
        });
        if (!confirmed) return;
        await act(d, 'delivered', deliver.url(d.id), `Delivered ${d.order_number}`);
        setNavigatingId((id) => (id === d.id ? null : id));
    };

    // ── Route: nearest-first from where the rider is (or the café when GPS is off) ──
    const origin: LatLng = me ?? store;
    const plan = useMemo(() => planRoute(origin, data.mine), [origin, data.mine]);
    const available = useMemo(
        () =>
            [...data.available].sort(
                (a, b) =>
                    (a.lat !== null && a.lng !== null ? distanceKm(origin, a as LatLng) : Infinity) -
                    (b.lat !== null && b.lng !== null ? distanceKm(origin, b as LatLng) : Infinity),
            ),
        [data.available, origin],
    );
    const routeStops = plan.filter((p) => p.stop.lat !== null && p.stop.lng !== null).map((p) => p.stop as Delivery & LatLng);
    const nextStop = plan.find((p) => p.stop.status === 'out_for_delivery' || p.stop.status === 'ready')?.stop ?? plan[0]?.stop ?? null;
    const navigating = navigatingId !== null ? (data.mine.find((d) => d.id === navigatingId) ?? null) : null;

    // Close navigation when its delivery is finished or taken away.
    useEffect(() => {
        if (navigatingId !== null && !data.mine.some((d) => d.id === navigatingId)) setNavigatingId(null);
    }, [data.mine, navigatingId]);

    const points = useMemo<MapPoint[]>(() => {
        const list: MapPoint[] = [{ id: 'store', kind: 'store', lat: store.lat, lng: store.lng, label: store.name }];
        available.forEach(
            (d) =>
                d.lat !== null &&
                d.lng !== null &&
                list.push({ id: `drop-${d.id}`, kind: 'available', lat: d.lat, lng: d.lng, label: `Available · ${d.customer_name}` }),
        );
        plan.forEach(
            ({ stop: d, number }) =>
                d.lat !== null &&
                d.lng !== null &&
                list.push({ id: `drop-${d.id}`, kind: 'drop', lat: d.lat, lng: d.lng, number, label: `${number}. ${d.customer_name}` }),
        );
        if (me) list.push({ id: 'me', kind: 'rider', lat: me.lat, lng: me.lng, label: 'You' });
        return list;
    }, [store, available, plan, me]);

    const lines = useMemo<[string, string][]>(() => {
        const ids = [me ? 'me' : 'store', ...routeStops.map((s) => `drop-${s.id}`)];
        return ids.slice(1).map((id, i) => [ids[i], id] as [string, string]);
    }, [me, routeStops]);

    const selectFromMap = (id: string) => {
        if (!id.startsWith('drop-')) return;
        const deliveryId = Number(id.slice(5));
        setSelected(id);
        setTab(data.mine.some((d) => d.id === deliveryId) ? 'stops' : 'available');
        window.setTimeout(() => document.getElementById(`delivery-${deliveryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    };

    const stale = now - lastSync > STALE_AFTER_MS;
    const queuedCount = queue.queue.length;

    if (navigating) {
        return (
            <>
                <Head title={`Navigate · ${navigating.customer_name}`} />
                <NavigationView
                    delivery={navigating}
                    me={me}
                    store={store}
                    busy={busy === navigating.id}
                    queued={!!queue.pendingFor(navigating.id)}
                    onClose={() => setNavigatingId(null)}
                    onPickUp={() => pickUpOrder(navigating)}
                    onDelivered={() => markDelivered(navigating)}
                />
            </>
        );
    }

    return (
        <div className="min-h-dvh bg-muted/40 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
            <Head title="My deliveries" />

            <header className="sticky top-0 z-[1100] border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3">
                    {logo ? <img src={logo} alt="" className="h-8 w-8 rounded-full object-cover" /> : <Bike className="h-6 w-6 text-primary" />}
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{auth.user.full_name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{businessName} · Rider</p>
                    </div>
                    <GpsBadge state={gps.state} failing={gps.uploadFailing || !online} />
                    <button
                        type="button"
                        onClick={() => refresh(true)}
                        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                        aria-label="Refresh"
                    >
                        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            if (await confirmDialog({ title: 'Log out?', description: 'You stop sharing your location.', confirmLabel: 'Log out' })) {
                                router.post('/logout');
                            }
                        }}
                        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
                        aria-label="Log out"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
                {(!online || stale) && (
                    <p className="flex items-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                        <WifiOff className="h-3.5 w-3.5 shrink-0" />
                        {!online
                            ? 'No internet. Your taps are saved and sent when you are back online.'
                            : `Reconnecting… last update ${manilaTime(new Date(lastSync).toISOString())}`}
                    </p>
                )}
                {queuedCount > 0 && (
                    <button
                        type="button"
                        onClick={() => queue.flush()}
                        className="flex w-full items-center gap-2 bg-blue-500/15 px-4 py-1.5 text-left text-xs font-semibold text-blue-800 dark:text-blue-200"
                    >
                        <CloudUpload className="h-3.5 w-3.5 shrink-0" />
                        {queuedCount} update{queuedCount === 1 ? '' : 's'} waiting to send · tap to retry now
                    </button>
                )}
                {gps.state === 'denied' && (
                    <p className="bg-rose-500/15 px-4 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        Location is blocked. Allow location for this site so you can navigate and the café can see you.
                    </p>
                )}
            </header>

            {tab === 'history' ? (
                <main className="mx-auto max-w-2xl px-3 pt-3">
                    <HistoryView />
                </main>
            ) : (
                <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-4 lg:px-4 lg:pt-4">
                    {/* ── Overview map: pinned under the header on phones, a full-height column on wide screens ── */}
                    <section className="sticky top-14 z-1000 h-[34dvh] border-b border-border bg-card lg:top-18 lg:h-[calc(100dvh-10rem)] lg:rounded-xl lg:border">
                        <Suspense
                            fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>}
                        >
                            <DeliveryMap
                                points={points}
                                lines={lines}
                                fitKey={`${points
                                    .filter((p) => p.kind !== 'rider')
                                    .map((p) => p.id)
                                    .join(',')}|${fitNonce}|${me ? 1 : 0}`}
                                focusId={selected}
                                onSelect={selectFromMap}
                                fitPadding={{ top: 56, right: 112, bottom: 40, left: 52 }}
                                className="h-full w-full lg:rounded-xl"
                            />
                        </Suspense>
                        <button
                            type="button"
                            onClick={() => {
                                setSelected(null);
                                setFitNonce((n) => n + 1);
                            }}
                            className="absolute top-2 right-2 z-1000 flex h-10 items-center gap-1.5 rounded-lg bg-background/95 px-3 text-xs font-bold shadow"
                            aria-label="Show all pins"
                        >
                            <Crosshair className="h-4 w-4" /> Show all
                        </button>
                        <div className="pointer-events-none absolute top-14 right-2 z-1000 flex flex-col gap-0.5 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-semibold shadow">
                            <Legend color="#e11d48" label="Your stops" />
                            <Legend color="#64748b" label="Available" />
                            <Legend color="#0f172a" label="Café" />
                        </div>
                    </section>

                    <main className="space-y-3 px-3 pt-3 lg:px-0 lg:pt-0">
                        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-card text-center">
                            <Figure icon={Banknote} label="Cash with you" value={pesoExact(data.cash_on_hand)} strong={data.cash_on_hand > 0} />
                            <Figure icon={Bike} label="My stops" value={String(data.mine.length)} />
                            <Figure icon={PackageCheck} label="Delivered today" value={String(data.delivered_today.length)} />
                        </div>

                        {tab === 'stops' && (
                            <section className="space-y-2">
                                {plan.length === 0 ? (
                                    <EmptyState>No deliveries yet. Take one from Available, or wait for the café to give you one.</EmptyState>
                                ) : (
                                    <>
                                        {nextStop && (
                                            <button
                                                type="button"
                                                onClick={() => setNavigatingId(nextStop.id)}
                                                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-bold text-white shadow-sm"
                                            >
                                                <Navigation className="h-5 w-5" /> Start navigation · {nextStop.customer_name}
                                            </button>
                                        )}
                                        <p className="px-1 text-xs text-muted-foreground">
                                            Suggested order: nearest first from {me ? 'where you are' : 'the café'}.
                                        </p>
                                        {plan.map(({ stop: d, number, legKm, etaMinutes }) => (
                                            <DeliveryCard
                                                key={d.id}
                                                delivery={d}
                                                badge={<StopBadge number={number} />}
                                                meta={d.lat !== null ? `${formatKm(legKm)} · ~${etaMinutes} min` : 'No map pin: call the customer'}
                                                selected={selected === `drop-${d.id}`}
                                                queued={!!queue.pendingFor(d.id)}
                                                onSelect={() => setSelected(`drop-${d.id}`)}
                                                onNavigate={() => setNavigatingId(d.id)}
                                            >
                                                {d.status === 'ready' && (
                                                    <ActionButton
                                                        busy={busy === d.id}
                                                        onClick={() => pickUpOrder(d)}
                                                        className="bg-primary text-primary-foreground"
                                                    >
                                                        <Bike className="h-4 w-4" /> Picked up
                                                    </ActionButton>
                                                )}
                                                {d.status === 'out_for_delivery' && (
                                                    <ActionButton
                                                        busy={busy === d.id}
                                                        onClick={() => markDelivered(d)}
                                                        className="bg-emerald-700 text-white"
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />{' '}
                                                        {d.collect > 0 ? `Delivered · ${pesoExact(d.collect)}` : 'Delivered'}
                                                    </ActionButton>
                                                )}
                                                {(d.status === 'accepted' || d.status === 'preparing') && (
                                                    <p className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-2 text-xs font-semibold text-muted-foreground">
                                                        <Clock className="h-4 w-4 shrink-0" />
                                                        <span className="truncate">
                                                            Kitchen {d.status === 'accepted' ? 'starting' : 'preparing'}
                                                            {d.estimated_ready_at ? ` · ~${manilaTime(d.estimated_ready_at)}` : ''}
                                                        </span>
                                                    </p>
                                                )}
                                            </DeliveryCard>
                                        ))}
                                    </>
                                )}
                            </section>
                        )}

                        {tab === 'available' && (
                            <section className="space-y-2">
                                {available.length === 0 ? (
                                    <EmptyState>Nothing to take right now. New deliveries appear here automatically.</EmptyState>
                                ) : (
                                    available.map((d) => (
                                        <DeliveryCard
                                            key={d.id}
                                            delivery={d}
                                            badge={
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white">
                                                    <Plus className="h-4 w-4" />
                                                </span>
                                            }
                                            meta={
                                                d.lat !== null && d.lng !== null
                                                    ? `${formatKm(roadKm(origin, d as LatLng))} away · ~${rideMinutes(roadKm(origin, d as LatLng))} min`
                                                    : 'No map pin'
                                            }
                                            selected={selected === `drop-${d.id}`}
                                            queued={!!queue.pendingFor(d.id)}
                                            onSelect={() => setSelected(`drop-${d.id}`)}
                                        >
                                            <ActionButton
                                                busy={busy === d.id}
                                                onClick={() => act(d, 'claim', claim.url(d.id), `Took ${d.order_number}`)}
                                                className="border border-primary bg-primary/10 text-primary"
                                            >
                                                Take this delivery
                                            </ActionButton>
                                        </DeliveryCard>
                                    ))
                                )}
                            </section>
                        )}
                    </main>
                </div>
            )}

            {/* ── Bottom tabs: within thumb reach ── */}
            <nav
                className="fixed inset-x-0 bottom-0 z-[1100] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
                aria-label="Rider sections"
            >
                <div className="mx-auto grid h-16 max-w-2xl grid-cols-3">
                    <BottomTab active={tab === 'stops'} onClick={() => setTab('stops')} icon={MapPinned} label="My stops" count={data.mine.length} />
                    <BottomTab
                        active={tab === 'available'}
                        onClick={() => setTab('available')}
                        icon={Inbox}
                        label="Available"
                        count={data.available.length}
                    />
                    <BottomTab active={tab === 'history'} onClick={() => setTab('history')} icon={History} label="History" />
                </div>
            </nav>
        </div>
    );
}

function GpsBadge({ state, failing }: { state: GpsState; failing: boolean }) {
    const on = state === 'on' && !failing;
    const label = state === 'on' ? (failing ? 'Retrying' : 'Live') : state === 'starting' ? 'GPS…' : 'No GPS';
    return (
        <span
            className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold',
                on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
                (state === 'denied' || state === 'unavailable') && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
            )}
            title={on ? 'Your location is shared while this page is open' : 'Your location is not reaching the café right now'}
        >
            {state === 'on' ? <LocateFixed className="h-3.5 w-3.5" /> : <LocateOff className="h-3.5 w-3.5" />}
            {label}
        </span>
    );
}

function BottomTab({
    active,
    onClick,
    icon: Icon,
    label,
    count,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
    count?: number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold',
                active ? 'text-primary' : 'text-muted-foreground',
            )}
        >
            <span className={cn('flex h-8 w-14 items-center justify-center rounded-full', active && 'bg-primary/12')}>
                <Icon className="h-5 w-5" />
            </span>
            {label}
            {count !== undefined && count > 0 && (
                <span className="absolute top-1.5 left-1/2 ml-3 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] leading-5 font-bold text-primary-foreground">
                    {count}
                </span>
            )}
        </button>
    );
}

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ background: color }} />
            {label}
        </span>
    );
}

function StopBadge({ number }: { number: number }) {
    return (
        <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-sm font-black text-white"
            aria-label={`Stop ${number}`}
        >
            {number}
        </span>
    );
}

function EmptyState({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function Figure({ icon: Icon, label, value, strong }: { icon: React.ElementType; label: string; value: string; strong?: boolean }) {
    return (
        <div className={cn('border-l border-border px-1 py-2.5 first:border-l-0', strong && 'bg-amber-500/10')}>
            <Icon className="mx-auto mb-0.5 h-4 w-4 text-muted-foreground" />
            <p className={cn('font-mono text-[15px] font-black', strong && 'text-amber-800 dark:text-amber-200')}>{value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{label}</p>
        </div>
    );
}

function ActionButton({ busy, onClick, className, children }: { busy: boolean; onClick: () => void; className: string; children: React.ReactNode }) {
    return (
        <button
            type="button"
            disabled={busy}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={cn(
                'flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-bold disabled:opacity-60',
                className,
            )}
        >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <span className="flex min-w-0 items-center gap-2 truncate">{children}</span>
        </button>
    );
}

/** One delivery: who, where, how far, and the next action. Details (address, items, notes) open on tap. */
function DeliveryCard({
    delivery: d,
    badge,
    meta,
    selected,
    queued,
    onSelect,
    onNavigate,
    children,
}: {
    delivery: Delivery;
    badge: React.ReactNode;
    meta: string;
    selected: boolean;
    queued: boolean;
    onSelect: () => void;
    onNavigate?: () => void;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const itemCount = d.items.reduce((sum, i) => sum + i.quantity, 0);
    const hasNotes = !!d.customer_note || d.items.some((i) => i.note);

    return (
        <article
            id={`delivery-${d.id}`}
            onClick={onSelect}
            className={cn(
                'scroll-mt-[calc(34dvh+4.5rem)] rounded-xl border bg-card p-3 transition-shadow lg:scroll-mt-24',
                selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
            )}
        >
            <div className="flex items-start gap-3">
                {badge}
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-bold">{d.customer_name}</p>
                        <span className="shrink-0 font-mono text-sm font-bold">{d.collect > 0 ? pesoExact(d.collect) : 'Paid'}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                        {d.barangay ?? 'No barangay'} · {meta}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', STATUS_TONE[d.status] ?? 'bg-muted')}>
                            {d.status_label}
                        </span>
                        {queued && (
                            <span className="flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-bold text-blue-800 dark:text-blue-200">
                                <CloudUpload className="h-3 w-3" /> Saved · sends when online
                            </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                            {itemCount} item{itemCount === 1 ? '' : 's'} · <span className="font-mono">{d.order_number}</span>
                        </span>
                    </div>
                    {d.notes_for_rider && (
                        <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Rider note: {d.notes_for_rider}</p>
                    )}
                </div>
            </div>

            <div className="mt-2.5 flex gap-1.5">
                <a
                    href={`tel:${d.contact_number}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border"
                    aria-label={`Call ${d.customer_name}`}
                >
                    <Phone className="h-4 w-4" />
                </a>
                {onNavigate && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onNavigate();
                        }}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-600/40 bg-blue-600/10 text-blue-700 dark:text-blue-300"
                        aria-label={`Navigate to ${d.customer_name}`}
                    >
                        <Navigation className="h-4 w-4" />
                    </button>
                )}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }}
                    aria-expanded={open}
                    className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border"
                    aria-label="Order details"
                >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                    {hasNotes && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />}
                </button>
                {queued ? (
                    <p className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg bg-blue-500/10 px-2 text-xs font-bold text-blue-800 dark:text-blue-200">
                        Waiting for signal…
                    </p>
                ) : (
                    children
                )}
            </div>

            {open && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                    <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <span>
                            <span className="font-semibold">{d.address ?? d.barangay}</span>
                            {d.landmark && <span className="block text-muted-foreground">Landmark: {d.landmark}</span>}
                        </span>
                    </p>
                    <ul className="space-y-0.5">
                        {d.items.map((i, idx) => (
                            <li key={idx}>
                                <b className="font-mono">{i.quantity}×</b> {i.name}
                                {i.variant && <span className="text-muted-foreground"> ({i.variant})</span>}
                                {i.note && <span className="block pl-6 text-xs italic">“{i.note}”</span>}
                            </li>
                        ))}
                    </ul>
                    {d.customer_note && (
                        <p className="flex items-start gap-2 rounded bg-amber-500/10 px-2 py-1 text-xs">
                            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.customer_note}
                        </p>
                    )}
                </div>
            )}
        </article>
    );
}
