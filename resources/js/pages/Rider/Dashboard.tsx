import { Head, router, usePage } from '@inertiajs/react';
import {
    Banknote,
    Bike,
    CheckCircle2,
    ChevronDown,
    Clock,
    Crosshair,
    ExternalLink,
    Loader2,
    LocateFixed,
    LocateOff,
    LogOut,
    MapPin,
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
import { distanceKm, formatKm, googleRouteUrl, planRoute, rideMinutes, roadKm, type LatLng } from '@/lib/delivery-route';
import { cn } from '@/lib/utils';

const DeliveryMap = lazy(() => import('@/components/DeliveryMap'));

interface Delivery {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    customer_name: string;
    contact_number: string;
    barangay: string | null;
    address: string | null;
    landmark: string | null;
    notes_for_rider: string | null;
    customer_note: string | null;
    lat: number | null;
    lng: number | null;
    payment_method: string;
    total: number;
    collect: number;
    estimated_ready_at: string | null;
    created_at: string;
    items: { name: string; variant: string | null; quantity: number; note: string | null }[];
}

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

type Tab = 'mine' | 'available' | 'done';
type GpsState = 'starting' | 'on' | 'denied' | 'unavailable';

/** How often the dashboard refreshes, the fastest the phone sends its GPS, and when data counts as out of date. */
const POLL_MS = 8000;
const SEND_EVERY_MS = 5000;
const STALE_AFTER_MS = 25000;

const STATUS_TONE: Record<string, string> = {
    accepted: 'bg-muted text-muted-foreground',
    preparing: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
    ready: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    out_for_delivery: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
};

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
    const { auth } = usePage().props as unknown as { auth: { user: { fname: string; full_name: string } } };
    const businessName = useBusinessName();
    const logo = useLogoUrl();
    const [data, setData] = useState<DashboardData>(initial);
    const [busy, setBusy] = useState<number | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<Tab>(initial.mine.length > 0 || initial.available.length === 0 ? 'mine' : 'available');
    const [selected, setSelected] = useState<string | null>(null);
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
                    setTab('mine');
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

    const act = async (delivery: Delivery, url: string) => {
        setBusy(delivery.id);
        try {
            const res = await jsonRequest<{ message: string }>(url, { method: 'POST' });
            toast.success(res.message);
            navigator.vibrate?.(60);
            await refresh();
        } catch (e) {
            toast.error((e as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const markDelivered = async (d: Delivery) => {
        const confirmed = await confirmDialog({
            title: `Delivered to ${d.customer_name}?`,
            description: d.collect > 0 ? `Collect ${pesoExact(d.collect)} cash before confirming.` : 'Confirm you handed over the order.',
            confirmLabel: d.collect > 0 ? `Cash collected · ${pesoExact(d.collect)}` : 'Delivered',
        });
        if (confirmed) await act(d, deliver.url(d.id));
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
    const routeUrl = googleRouteUrl(origin, routeStops);

    const points = useMemo<MapPoint[]>(() => {
        const list: MapPoint[] = [{ id: 'store', kind: 'store', lat: store.lat, lng: store.lng, label: store.name }];
        if (tab !== 'done') {
            available.forEach(
                (d) =>
                    d.lat !== null &&
                    d.lng !== null &&
                    list.push({ id: `drop-${d.id}`, kind: 'available', lat: d.lat, lng: d.lng, label: `Available · ${d.customer_name}` }),
            );
        }
        plan.forEach(
            ({ stop: d, number }) =>
                d.lat !== null &&
                d.lng !== null &&
                list.push({ id: `drop-${d.id}`, kind: 'drop', lat: d.lat, lng: d.lng, number, label: `${number}. ${d.customer_name}` }),
        );
        if (me) list.push({ id: 'me', kind: 'rider', lat: me.lat, lng: me.lng, label: 'You' });
        return list;
    }, [store, available, plan, me, tab]);

    const lines = useMemo<[string, string][]>(() => {
        const ids = [me ? 'me' : 'store', ...routeStops.map((s) => `drop-${s.id}`)];
        return ids.slice(1).map((id, i) => [ids[i], id] as [string, string]);
    }, [me, routeStops]);

    const selectFromMap = (id: string) => {
        if (!id.startsWith('drop-')) return;
        const deliveryId = Number(id.slice(5));
        setSelected(id);
        setTab(data.mine.some((d) => d.id === deliveryId) ? 'mine' : 'available');
        window.setTimeout(() => document.getElementById(`delivery-${deliveryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    };

    const stale = now - lastSync > STALE_AFTER_MS;

    return (
        <div className="min-h-dvh bg-muted/40">
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
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
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
                        className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                        aria-label="Log out"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
                {(!online || stale) && (
                    <p className="flex items-center gap-2 bg-amber-500/15 px-4 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                        <WifiOff className="h-3.5 w-3.5 shrink-0" />
                        {!online
                            ? 'No internet. Showing the last update; your taps will work once you are back online.'
                            : `Reconnecting… last update ${manilaTime(new Date(lastSync).toISOString())}`}
                    </p>
                )}
                {gps.state === 'denied' && (
                    <p className="bg-rose-500/15 px-4 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        Location is blocked. Allow location for this site so the café and your customers can see you.
                    </p>
                )}
            </header>

            <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-4 lg:px-4 lg:pt-4">
                {/* ── Map: pinned under the header on phones, a full-height column on wide screens ── */}
                <section className="sticky top-14 z-1000 h-[38dvh] border-b border-border bg-card lg:top-18 lg:h-[calc(100dvh-5.5rem)] lg:rounded-xl lg:border">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>}>
                        <DeliveryMap
                            points={points}
                            lines={tab === 'done' ? [] : lines}
                            fitKey={`${points
                                .filter((p) => p.kind !== 'rider')
                                .map((p) => p.id)
                                .join(',')}|${fitNonce}|${me ? 1 : 0}`}
                            focusId={selected}
                            onSelect={selectFromMap}
                            className="h-full w-full lg:rounded-xl"
                        />
                    </Suspense>
                    <div className="pointer-events-none absolute bottom-5 left-2 z-1000 flex flex-wrap gap-1 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-semibold shadow">
                        <Legend color="#e11d48" label="Your stops" />
                        <Legend color="#64748b" label="Available" />
                        <Legend color="#0f172a" label="Café" />
                    </div>
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
                </section>

                <main className="space-y-3 px-3 pt-3 pb-12 lg:px-0 lg:pt-0">
                    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-card text-center">
                        <Figure icon={Banknote} label="Cash to hand over" value={pesoExact(data.cash_on_hand)} strong={data.cash_on_hand > 0} />
                        <Figure icon={Bike} label="My stops" value={String(data.mine.length)} />
                        <Figure icon={PackageCheck} label="Delivered today" value={String(data.delivered_today.length)} />
                    </div>

                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
                        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')} label="My stops" count={data.mine.length} />
                        <TabButton active={tab === 'available'} onClick={() => setTab('available')} label="Available" count={data.available.length} />
                        <TabButton active={tab === 'done'} onClick={() => setTab('done')} label="Done" count={data.delivered_today.length} />
                    </div>

                    {tab === 'mine' && (
                        <section className="space-y-2">
                            {plan.length === 0 ? (
                                <EmptyState>No deliveries yet. Take one from Available, or wait for the café to give you one.</EmptyState>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between gap-2 px-1">
                                        <p className="text-xs text-muted-foreground">
                                            Suggested order: nearest first from {me ? 'where you are' : 'the café'}.
                                        </p>
                                        {routeUrl && (
                                            <a
                                                href={routeUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"
                                            >
                                                <Navigation className="h-3.5 w-3.5" /> Navigate all
                                            </a>
                                        )}
                                    </div>
                                    {plan.map(({ stop: d, number, legKm, etaMinutes }) => (
                                        <DeliveryCard
                                            key={d.id}
                                            delivery={d}
                                            badge={<StopBadge number={number} />}
                                            meta={d.lat !== null ? `${formatKm(legKm)} · ~${etaMinutes} min` : 'No map pin: call the customer'}
                                            selected={selected === `drop-${d.id}`}
                                            onSelect={() => setSelected(`drop-${d.id}`)}
                                        >
                                            {d.status === 'ready' && (
                                                <ActionButton
                                                    busy={busy === d.id}
                                                    onClick={() => act(d, pickUp.url(d.id))}
                                                    className="bg-primary text-primary-foreground"
                                                >
                                                    <Bike className="h-4 w-4" /> Picked up · start
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
                                                <p className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                                                    <Clock className="h-4 w-4" /> Kitchen {d.status === 'accepted' ? 'starting' : 'preparing'}
                                                    {d.estimated_ready_at ? ` · ready ~${manilaTime(d.estimated_ready_at)}` : ''}
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
                                        onSelect={() => setSelected(`drop-${d.id}`)}
                                    >
                                        <ActionButton
                                            busy={busy === d.id}
                                            onClick={() => act(d, claim.url(d.id))}
                                            className="border border-primary bg-primary/10 text-primary"
                                        >
                                            Take this delivery
                                        </ActionButton>
                                    </DeliveryCard>
                                ))
                            )}
                        </section>
                    )}

                    {tab === 'done' &&
                        (data.delivered_today.length === 0 ? (
                            <EmptyState>Nothing delivered yet today.</EmptyState>
                        ) : (
                            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
                                {data.delivered_today.map((d) => (
                                    <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                                        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{d.customer_name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {d.barangay} · {d.completed_at ? manilaTime(d.completed_at) : ''}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono font-bold">{pesoExact(d.total)}</p>
                                            {d.payment_method === 'cod' && (
                                                <p
                                                    className={cn(
                                                        'text-[11px] font-bold',
                                                        d.cash_remitted
                                                            ? 'text-emerald-700 dark:text-emerald-400'
                                                            : 'text-amber-700 dark:text-amber-400',
                                                    )}
                                                >
                                                    {d.cash_remitted ? 'Handed over' : 'Cash with you'}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ))}
                </main>
            </div>
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

function Legend({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-white" style={{ background: color }} />
            {label}
        </span>
    );
}

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                'flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold',
                active ? 'bg-card shadow-sm' : 'text-muted-foreground',
            )}
        >
            {label}
            <span
                className={cn('min-w-5 rounded-full px-1.5 text-[11px] font-bold', active ? 'bg-primary text-primary-foreground' : 'bg-background')}
            >
                {count}
            </span>
        </button>
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
                'flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-bold disabled:opacity-60',
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
    onSelect,
    children,
}: {
    delivery: Delivery;
    badge: React.ReactNode;
    meta: string;
    selected: boolean;
    onSelect: () => void;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const itemCount = d.items.reduce((sum, i) => sum + i.quantity, 0);
    const directions =
        d.lat !== null && d.lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}&travelmode=driving` : null;
    const hasNotes = !!d.customer_note || d.items.some((i) => i.note);

    return (
        <article
            id={`delivery-${d.id}`}
            onClick={onSelect}
            className={cn(
                'scroll-mt-[calc(38dvh+4.5rem)] rounded-xl border bg-card p-3 transition-shadow lg:scroll-mt-24',
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
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"
                    aria-label={`Call ${d.customer_name}`}
                >
                    <Phone className="h-4 w-4" />
                </a>
                {directions && (
                    <a
                        href={directions}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"
                        aria-label="Directions in Google Maps"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                )}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen((v) => !v);
                    }}
                    aria-expanded={open}
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border"
                    aria-label="Order details"
                >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
                    {hasNotes && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-500" />}
                </button>
                {children}
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
