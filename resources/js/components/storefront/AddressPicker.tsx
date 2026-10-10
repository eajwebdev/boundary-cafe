import 'leaflet/dist/leaflet.css';

import { router } from '@inertiajs/react';
import type { LatLngExpression, Map as LeafletMap } from 'leaflet';
import { ArrowLeft, Crosshair, Loader2, LocateFixed, MapPin, Navigation } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet';

import type { DeliveryZone, SavedAddress } from '@/lib/customer';
import { jsonRequest } from '@/lib/customer';
import { cn, themeAccent } from '@/lib/utils';

// ─── Zone geometry (mirrors DeliveryZoneService on the server) ────────────────

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function pointInPolygon(lat: number, lng: number, poly: [number, number][]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [yi, xi] = poly[i];
        const [yj, xj] = poly[j];
        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
    }
    return inside;
}

export function inDeliveryZone(zone: DeliveryZone, lat: number, lng: number) {
    return zone.uses_polygon && zone.polygon.length >= 3
        ? pointInPolygon(lat, lng, zone.polygon)
        : distanceKm(zone.center, { lat, lng }) <= zone.radius_km;
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

function CenterTracker({ onMove, onMoving }: { onMove: (lat: number, lng: number) => void; onMoving: (moving: boolean) => void }) {
    useMapEvents({
        movestart: () => onMoving(true),
        moveend: (e) => {
            const c = (e.target as LeafletMap).getCenter();
            onMoving(false);
            onMove(c.lat, c.lng);
        },
    });
    return null;
}

const inputCls =
    'h-12 w-full rounded-2xl border border-shop-line bg-shop-surface px-4 text-base text-shop-ink outline-none placeholder:text-shop-muted/80 focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15';

interface Props {
    zone: DeliveryZone;
    barangays: string[];
    initial?: SavedAddress | null;
    onClose: () => void;
    onSaved?: () => void;
}

export default function AddressPicker({ zone, barangays, initial, onClose, onSaved }: Props) {
    const accent = themeAccent();
    const start = initial ? { lat: initial.lat, lng: initial.lng } : zone.center;
    const mapRef = useRef<LeafletMap | null>(null);
    const [step, setStep] = useState<'map' | 'details'>('map');
    const [pos, setPos] = useState(start);
    const [moving, setMoving] = useState(false);
    const [geo, setGeo] = useState<{ label: string | null; barangay: string | null; loading: boolean }>({
        label: initial?.formatted_address ?? null,
        barangay: initial?.barangay ?? null,
        loading: false,
    });
    const [locating, setLocating] = useState(false);
    const [locError, setLocError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [form, setForm] = useState({
        label: initial?.label ?? 'Home',
        barangay: initial?.barangay ?? '',
        street: initial?.street ?? '',
        landmark: initial?.landmark ?? '',
        notes_for_rider: initial?.notes_for_rider ?? '',
        is_default: initial?.is_default ?? false,
    });

    const inZone = useMemo(() => inDeliveryZone(zone, pos.lat, pos.lng), [zone, pos]);
    const abortRef = useRef<AbortController | null>(null);
    const timerRef = useRef<number | null>(null);

    // Reverse-geocode the pin (debounced) through our own rate-limited endpoint.
    const lookup = useCallback(
        (lat: number, lng: number) => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(async () => {
                abortRef.current?.abort();
                const ctrl = new AbortController();
                abortRef.current = ctrl;
                setGeo((g) => ({ ...g, loading: true }));
                try {
                    const res = await jsonRequest<{ label: string | null; barangay: string | null }>(
                        `/geocode/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`,
                        { signal: ctrl.signal },
                    );
                    setGeo({ label: res.label, barangay: res.barangay, loading: false });
                    if (res.barangay && barangays.includes(res.barangay)) {
                        setForm((f) => (f.barangay ? f : { ...f, barangay: res.barangay! }));
                    }
                } catch (e) {
                    if ((e as Error).name !== 'AbortError') setGeo((g) => ({ ...g, loading: false }));
                }
            }, 450);
        },
        [barangays],
    );

    useEffect(() => {
        if (!initial) lookup(start.lat, start.lng);
        return () => {
            abortRef.current?.abort();
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const flyTo = (lat: number, lng: number, zoom = 17) => mapRef.current?.flyTo([lat, lng], zoom, { duration: 0.8 });

    const useMyLocation = () => {
        setLocError(null);
        if (!('geolocation' in navigator)) {
            setLocError('Location is not available on this device. Drag the map to your place instead.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (p) => {
                setLocating(false);
                flyTo(p.coords.latitude, p.coords.longitude);
            },
            (err) => {
                setLocating(false);
                setLocError(
                    err.code === err.PERMISSION_DENIED
                        ? 'Location permission was denied. Drag the map to place the pin on your house.'
                        : 'We could not get your location. Drag the map to place the pin instead.',
                );
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
        );
    };

    const save = () => {
        setSaving(true);
        setErrors({});
        const payload = { ...form, lat: Number(pos.lat.toFixed(7)), lng: Number(pos.lng.toFixed(7)), formatted_address: geo.label };
        const opts = {
            preserveScroll: true,
            preserveState: true,
            onError: (errs: Record<string, string>) => {
                setErrors(errs);
                if (errs.lat) setStep('map');
            },
            onSuccess: () => onSaved?.(),
            onFinish: () => setSaving(false),
        };
        if (initial) router.patch(`/account/addresses/${initial.id}`, payload, opts);
        else router.post('/account/addresses', payload, opts);
    };

    const zoneShape: LatLngExpression[] | null = zone.uses_polygon && zone.polygon.length >= 3 ? zone.polygon : null;

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-shop-line px-3 py-2">
                <button
                    type="button"
                    onClick={() => (step === 'details' ? setStep('map') : onClose())}
                    className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-shop-sunken"
                    aria-label="Back"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                    <p className="text-base leading-tight font-bold">{step === 'map' ? 'Set your delivery location' : 'Address details'}</p>
                    <p className="text-xs text-shop-muted">
                        {step === 'map' ? 'Move the map so the pin sits on your house' : 'Help our rider find you'}
                    </p>
                </div>
            </div>

            {step === 'map' ? (
                <>
                    <div className="relative min-h-0 flex-1">
                        <MapContainer
                            center={[start.lat, start.lng]}
                            zoom={initial ? 17 : 15}
                            minZoom={11}
                            maxZoom={19}
                            zoomControl={false}
                            className="h-full w-full"
                            ref={(m) => {
                                mapRef.current = m;
                            }}
                        >
                            <TileLayer
                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                                maxZoom={19}
                            />
                            {zoneShape ? (
                                <Polygon positions={zoneShape} pathOptions={{ color: accent, weight: 2, fillOpacity: 0.05, dashArray: '6 6' }} />
                            ) : (
                                <Circle
                                    center={[zone.center.lat, zone.center.lng]}
                                    radius={zone.radius_km * 1000}
                                    pathOptions={{ color: accent, weight: 2, fillOpacity: 0.04, dashArray: '6 6' }}
                                />
                            )}
                            <CenterTracker
                                onMoving={setMoving}
                                onMove={(lat, lng) => {
                                    setPos({ lat, lng });
                                    lookup(lat, lng);
                                }}
                            />
                        </MapContainer>

                        {/* Fixed centre pin */}
                        <div className="pointer-events-none absolute inset-0 z-500 flex items-center justify-center">
                            <div
                                className={cn(
                                    'flex -translate-y-1/2 flex-col items-center transition-transform duration-200 ease-shop',
                                    moving && '-translate-y-[78%]',
                                )}
                            >
                                {/* Lifts while dragging, drops with a small bounce when the map settles */}
                                <MapPin
                                    key={moving ? 'up' : 'down'}
                                    className={cn(
                                        'h-12 w-12 drop-shadow-lg',
                                        !moving && 'bc-pin-drop',
                                        inZone ? 'fill-shop-accent text-white' : 'fill-shop-danger text-white',
                                    )}
                                    strokeWidth={1.5}
                                />
                            </div>
                            <span
                                className={cn('absolute h-2 w-2 rounded-full bg-black/40 transition', moving ? 'scale-150 opacity-40' : 'opacity-70')}
                            />
                        </div>

                        {/* Map buttons */}
                        <div className="absolute right-3 bottom-4 z-500 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => flyTo(zone.center.lat, zone.center.lng, 15)}
                                className="flex h-12 w-12 items-center justify-center rounded-full bg-shop-surface shadow-lg ring-1 ring-shop-line"
                                aria-label="Back to Mabinay"
                                title="Back to Mabinay"
                            >
                                <Crosshair className="h-5 w-5" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={useMyLocation}
                            className="absolute bottom-4 left-1/2 z-500 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-shop-surface px-4 text-sm font-semibold whitespace-nowrap shadow-lg ring-1 ring-shop-line"
                        >
                            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4 text-shop-accent-ink" />}
                            Use my current location
                        </button>
                    </div>

                    {/* Bottom card */}
                    <div className="space-y-3 border-t border-shop-line bg-shop-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <div className="flex items-start gap-3">
                            <span
                                className={cn(
                                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                                    inZone ? 'bg-shop-accent-soft text-shop-accent-ink' : 'bg-shop-danger-soft text-shop-danger',
                                )}
                            >
                                <Navigation className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                    {geo.loading || moving
                                        ? 'Finding address…'
                                        : geo.label || (geo.barangay ? `${geo.barangay}, Mabinay` : 'Pinned location')}
                                </p>
                                <p className="text-xs text-shop-muted">
                                    {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                                </p>
                            </div>
                        </div>
                        {!inZone && (
                            <p className="rounded-xl bg-shop-danger-soft px-3 py-2 text-sm font-medium text-shop-danger">
                                Sorry, we only deliver within Mabinay. Move the pin inside the dashed area.
                            </p>
                        )}
                        {(locError || errors.lat) && <p className="text-sm text-shop-danger">{errors.lat ?? locError}</p>}
                        <button
                            type="button"
                            disabled={!inZone || moving}
                            onClick={() => setStep('details')}
                            className="bc-press shadow-shop-md h-14 w-full cursor-pointer rounded-2xl bg-shop-accent text-base font-semibold text-shop-on-accent disabled:cursor-not-allowed disabled:bg-shop-sunken disabled:text-shop-muted disabled:shadow-none"
                        >
                            Confirm location
                        </button>
                    </div>
                </>
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="space-y-4 px-4 py-4">
                        <div className="flex gap-2">
                            {['Home', 'Work', 'Other'].map((l) => (
                                <button
                                    key={l}
                                    type="button"
                                    onClick={() => setForm({ ...form, label: l })}
                                    className={cn(
                                        'h-10 rounded-full border px-4 text-sm font-semibold',
                                        form.label === l
                                            ? 'border-shop-accent bg-shop-accent-soft text-shop-accent-ink'
                                            : 'border-shop-line text-shop-muted',
                                    )}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                        <label className="block space-y-1.5">
                            <span className="text-sm font-semibold">Barangay</span>
                            <select
                                className={inputCls}
                                value={form.barangay}
                                onChange={(e) => setForm({ ...form, barangay: e.target.value })}
                                required
                            >
                                <option value="">Choose barangay</option>
                                {barangays.map((b) => (
                                    <option key={b} value={b}>
                                        {b}
                                    </option>
                                ))}
                            </select>
                            {errors.barangay && <span className="text-sm text-shop-danger">{errors.barangay}</span>}
                            {geo.barangay && !form.barangay && <span className="text-xs text-shop-muted">Map suggests: {geo.barangay}</span>}
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-sm font-semibold">Street / Purok / Sitio</span>
                            <input
                                className={inputCls}
                                value={form.street}
                                onChange={(e) => setForm({ ...form, street: e.target.value })}
                                placeholder="e.g. Purok 3, Rizal St."
                                maxLength={191}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-sm font-semibold">Landmark</span>
                            <input
                                className={inputCls}
                                value={form.landmark}
                                onChange={(e) => setForm({ ...form, landmark: e.target.value })}
                                placeholder="e.g. Blue gate beside the chapel"
                                maxLength={191}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="text-sm font-semibold">Note to rider (optional)</span>
                            <textarea
                                className={cn(inputCls, 'h-24 py-3')}
                                value={form.notes_for_rider}
                                onChange={(e) => setForm({ ...form, notes_for_rider: e.target.value })}
                                placeholder="e.g. Call when you arrive"
                                maxLength={255}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-shop-accent"
                                checked={form.is_default}
                                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                            />
                            Make this my default address
                        </label>
                        {Object.entries(errors)
                            .filter(([k]) => !['barangay', 'lat'].includes(k))
                            .map(([k, v]) => (
                                <p key={k} className="text-sm text-shop-danger">
                                    {v}
                                </p>
                            ))}
                    </div>
                    <div className="sticky bottom-0 border-t border-shop-line bg-shop-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                        <button
                            type="button"
                            disabled={saving || !form.barangay}
                            onClick={save}
                            className="bc-press flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-shop-accent text-base font-semibold text-shop-on-accent disabled:opacity-60"
                        >
                            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
                            Save address
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
