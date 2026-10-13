import {
    ArrowLeft,
    ArrowUp,
    Bike,
    CheckCircle2,
    CornerUpLeft,
    CornerUpRight,
    Flag,
    Loader2,
    MapPin,
    Navigation2,
    Phone,
    RefreshCw,
    Store,
    Undo2,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { route as routeAction } from '@/actions/App/Http/Controllers/Rider/DeliveryController';
import type { MapPoint } from '@/components/DeliveryMap';
import { jsonRequest, pesoExact } from '@/lib/customer';
import { distanceKm, formatKm, type LatLng } from '@/lib/delivery-route';
import { cn } from '@/lib/utils';

import type { Delivery } from './rider-shared';

const DeliveryMap = lazy(() => import('@/components/DeliveryMap'));

interface RouteStep {
    instruction: string;
    type: string;
    modifier: string | null;
    name: string | null;
    distance_m: number;
    location: [number, number];
}

interface Route {
    distance_m: number;
    duration_s: number;
    geometry: [number, number][];
    steps: RouteStep[];
}

/** Re-route when the rider is this far from the planned line, or when the route is this old. */
const OFF_ROUTE_M = 60;
const REFRESH_EVERY_MS = 60000;
const MIN_REROUTE_GAP_MS = 12000;
/** A turn counts as done within this distance; "arrived" within ARRIVED_M of the destination. */
const STEP_DONE_M = 25;
const ARRIVED_M = 40;

const metres = (a: LatLng, b: LatLng) => distanceKm(a, b) * 1000;

/** Compass heading from a to b, in degrees (0 = north). */
function bearing(a: LatLng, b: LatLng): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

function ManeuverIcon({ step, className }: { step: RouteStep | null; className?: string }) {
    if (!step) return <Navigation2 className={className} />;
    if (step.type === 'arrive') return <Flag className={className} />;
    if (step.modifier === 'uturn') return <Undo2 className={className} />;
    if (step.modifier?.includes('left')) return <CornerUpLeft className={className} />;
    if (step.modifier?.includes('right')) return <CornerUpRight className={className} />;
    return <ArrowUp className={className} />;
}

/**
 * Full-screen, in-app navigation to one stop: the road route, the next turn, distance and time left,
 * and the stop's actions. Goes to the café first while the order still needs to be picked up.
 * Falls back to a straight-line compass guide when routing is unavailable.
 */
export default function NavigationView({
    delivery: d,
    me,
    store,
    busy,
    queued,
    onClose,
    onPickUp,
    onDelivered,
}: {
    delivery: Delivery;
    me: LatLng | null;
    store: { name: string; lat: number; lng: number };
    busy: boolean;
    queued: boolean;
    onClose: () => void;
    onPickUp: () => void;
    onDelivered: () => void;
}) {
    const toCafe = d.status !== 'out_for_delivery';
    const destination: LatLng | null = toCafe ? store : d.lat !== null && d.lng !== null ? { lat: d.lat, lng: d.lng } : null;
    const [route, setRoute] = useState<Route | null>(null);
    const [routing, setRouting] = useState(false);
    const [routeFailed, setRouteFailed] = useState(false);
    const [stepIndex, setStepIndex] = useState(1);
    const lastFetch = useRef(0);

    const fetchRoute = useCallback(async () => {
        if (!me || !destination) return;
        lastFetch.current = Date.now();
        setRouting(true);
        try {
            const res = await jsonRequest<{ route: Route | null }>(
                routeAction.url({ query: { from_lat: me.lat, from_lng: me.lng, to_lat: destination.lat, to_lng: destination.lng } }),
            );
            setRoute(res.route);
            setRouteFailed(!res.route);
            setStepIndex(1);
        } catch {
            setRouteFailed(true);
        } finally {
            setRouting(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.lat, me?.lng, destination?.lat, destination?.lng]);

    // First route as soon as GPS is known, and a new one when the destination changes (café → customer).
    useEffect(() => {
        setRoute(null);
        lastFetch.current = 0;
    }, [toCafe]);

    // Follow progress: advance through turns, and re-route when off the line or the route is old.
    useEffect(() => {
        if (!me || !destination) return;
        const since = Date.now() - lastFetch.current;
        if (!route && since > MIN_REROUTE_GAP_MS) {
            fetchRoute();
            return;
        }
        if (!route) return;
        const nearestLine = Math.min(...route.geometry.map(([lng, lat]) => metres(me, { lat, lng })));
        if ((nearestLine > OFF_ROUTE_M && since > MIN_REROUTE_GAP_MS) || since > REFRESH_EVERY_MS) {
            fetchRoute();
            return;
        }
        let next = stepIndex;
        while (next < route.steps.length - 1) {
            const [lng, lat] = route.steps[next].location;
            if (metres(me, { lat, lng }) > STEP_DONE_M) break;
            next++;
        }
        if (next !== stepIndex) setStepIndex(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [me?.lat, me?.lng, route]);

    const nextStep = route?.steps[Math.min(stepIndex, route.steps.length - 1)] ?? null;
    const thenStep = route?.steps[stepIndex + 1] ?? null;
    const toNextTurn = me && nextStep ? metres(me, { lat: nextStep.location[1], lng: nextStep.location[0] }) : null;
    const straight = me && destination ? metres(me, destination) : null;
    const remaining = route && toNextTurn !== null ? toNextTurn + route.steps.slice(stepIndex).reduce((sum, s) => sum + s.distance_m, 0) : straight;
    const speed = route && route.duration_s > 0 ? route.distance_m / route.duration_s : 7; // m/s, ~25 km/h fallback
    const minutesLeft = remaining !== null ? Math.max(1, Math.round(remaining / speed / 60)) : null;
    const arrived = straight !== null && straight <= ARRIVED_M;

    const points = useMemo<MapPoint[]>(() => {
        const list: MapPoint[] = [];
        if (destination) {
            list.push(
                toCafe
                    ? { id: 'store', kind: 'store', lat: destination.lat, lng: destination.lng, label: store.name }
                    : { id: 'dest', kind: 'drop', lat: destination.lat, lng: destination.lng, label: d.customer_name },
            );
        }
        if (me) list.push({ id: 'me', kind: 'rider', lat: me.lat, lng: me.lng, label: 'You' });
        return list;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [destination?.lat, destination?.lng, me, toCafe]);

    const banner = arrived
        ? {
              title: toCafe ? 'You are at the café' : `You have arrived at ${d.customer_name}`,
              sub: toCafe ? 'Collect the order, then tap Picked up.' : 'Hand over the order.',
          }
        : route && nextStep
          ? { title: nextStep.instruction, sub: thenStep ? `Then: ${thenStep.instruction}` : null }
          : me && destination
            ? {
                  title: `Head ${COMPASS[Math.round(bearing(me, destination) / 45) % 8]}`,
                  sub: routeFailed ? 'Road directions are unavailable: follow the line on the map.' : 'Finding the best road…',
              }
            : {
                  title: me ? 'This stop has no map pin' : 'Waiting for GPS…',
                  sub: me ? 'Call the customer for directions.' : 'Allow location to start navigation.',
              };

    return (
        <div className="fixed inset-0 z-[1200] flex flex-col bg-background">
            {/* ── Next turn ── */}
            <div className="z-10 bg-slate-900 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3 text-white shadow-lg">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"
                        aria-label="Close navigation"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                        {arrived ? (
                            <Flag className="h-8 w-8" />
                        ) : route ? (
                            <ManeuverIcon step={nextStep} className="h-8 w-8" />
                        ) : me && destination ? (
                            <ArrowUp className="h-8 w-8" style={{ transform: `rotate(${bearing(me, destination)}deg)` }} />
                        ) : (
                            <MapPin className="h-8 w-8" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        {!arrived && toNextTurn !== null && route && (
                            <p className="font-mono text-2xl leading-none font-black">{formatKm(toNextTurn / 1000)}</p>
                        )}
                        <p
                            className={cn(
                                'font-bold',
                                !arrived && toNextTurn !== null && route ? 'mt-1 text-base leading-snug' : 'text-lg leading-tight',
                            )}
                        >
                            {banner.title}
                        </p>
                        {banner.sub && <p className="mt-0.5 truncate text-xs text-white/70">{banner.sub}</p>}
                    </div>
                </div>
            </div>

            {/* ── Map ── */}
            <div className="relative min-h-0 flex-1">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>}>
                    <DeliveryMap
                        points={points}
                        routeGeometry={
                            // Start the line at the rider: the router snaps to the nearest road, which may be a short walk away.
                            (route && me ? [[me.lng, me.lat] as [number, number], ...route.geometry] : null) ??
                            (me && destination
                                ? [
                                      [me.lng, me.lat],
                                      [destination.lng, destination.lat],
                                  ]
                                : null)
                        }
                        follow={me ? { lat: me.lat, lng: me.lng, zoom: 16 } : null}
                        fitKey={`nav-${toCafe}`}
                        className="h-full w-full"
                    />
                </Suspense>
                <button
                    type="button"
                    onClick={fetchRoute}
                    disabled={routing || !me || !destination}
                    className="absolute top-3 right-3 z-10 flex h-10 items-center gap-1.5 rounded-full bg-background/95 px-3 text-xs font-bold shadow disabled:opacity-60"
                >
                    <RefreshCw className={cn('h-4 w-4', routing && 'animate-spin')} /> Re-route
                </button>
            </div>

            {/* ── Stop sheet ── */}
            <div className="z-10 space-y-3 rounded-t-2xl border-t border-border bg-card px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-semibold text-muted-foreground">
                        {remaining !== null ? `${formatKm(remaining / 1000)} · ~${minutesLeft} min` : '—'}
                        <span className="ml-1 text-xs">{toCafe ? 'to the café' : 'to the customer'}</span>
                    </p>
                    {!toCafe && <p className="font-mono text-sm font-bold">{d.collect > 0 ? `Collect ${pesoExact(d.collect)}` : 'Paid'}</p>}
                </div>
                <div className="flex items-start gap-3">
                    <span
                        className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white',
                            toCafe ? 'bg-slate-900' : 'bg-rose-600',
                        )}
                    >
                        {toCafe ? <Store className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate font-bold">{toCafe ? `Pick up at ${store.name}` : d.customer_name}</p>
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                            {toCafe ? `For ${d.customer_name} · ${d.order_number}` : (d.address ?? d.barangay)}
                            {!toCafe && d.landmark ? ` · ${d.landmark}` : ''}
                        </p>
                        {!toCafe && d.notes_for_rider && (
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Rider note: {d.notes_for_rider}</p>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <a
                        href={`tel:${d.contact_number}`}
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border"
                        aria-label={`Call ${d.customer_name}`}
                    >
                        <Phone className="h-5 w-5" />
                    </a>
                    {queued ? (
                        <p className="flex h-14 flex-1 items-center justify-center rounded-xl bg-amber-500/15 text-sm font-bold text-amber-800 dark:text-amber-200">
                            Saved · sends when online
                        </p>
                    ) : d.status === 'ready' ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onPickUp}
                            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
                        >
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bike className="h-5 w-5" />} Picked up · start delivery
                        </button>
                    ) : d.status === 'out_for_delivery' ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={onDelivered}
                            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 text-base font-bold text-white disabled:opacity-60"
                        >
                            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                            {d.collect > 0 ? `Delivered · ${pesoExact(d.collect)}` : 'Delivered'}
                        </button>
                    ) : (
                        <p className="flex h-14 flex-1 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground">
                            Kitchen is still preparing
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
