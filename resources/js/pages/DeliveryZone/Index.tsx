import { router, useForm } from '@inertiajs/react';
import type { Map as LeafletMap } from 'leaflet';
import { Crosshair, Loader2, MapPin, PencilLine, Save, Trash2, Undo2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { confirmDialog } from '@/components/ConfirmDialog';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

const ZoneEditorMap = lazy(() => import('./ZoneEditorMap'));

interface Props {
    zone: { center: { lat: number; lng: number }; radius_km: number; uses_polygon: boolean; polygon: [number, number][] };
    barangays: { id: number; name: string; is_deliverable: boolean }[];
    settings: {
        enabled: boolean;
        branch_code: string;
        delivery_enabled: boolean;
        pickup_enabled: boolean;
        delivery_fee: number;
        free_delivery_min: number;
        min_order: number;
        prep_minutes: number;
        delivery_minutes: number;
        zone_use_polygon: boolean;
        store_hours: { open: string; close: string; days: number[] };
    };
    status: { is_open: boolean; message: string | null };
    branch: { name: string; code: string } | null;
    branches: { code: string; name: string }[];
    flash?: { success?: string | null; message?: { type: string; text: string } | null };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const inputCls = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function DeliveryZone({ zone, barangays, settings, status, branch, branches, flash }: Props) {
    const mapRef = useRef<LeafletMap | null>(null);
    const [drawing, setDrawing] = useState(false);
    const form = useForm({
        enabled: settings.enabled,
        branch_code: settings.branch_code,
        delivery_enabled: settings.delivery_enabled,
        pickup_enabled: settings.pickup_enabled,
        delivery_fee: settings.delivery_fee,
        free_delivery_min: settings.free_delivery_min,
        min_order: settings.min_order,
        prep_minutes: settings.prep_minutes,
        delivery_minutes: settings.delivery_minutes,
        store_hours: settings.store_hours,
        center: zone.center,
        radius_km: zone.radius_km,
        zone_use_polygon: settings.zone_use_polygon,
        polygon: zone.polygon,
    });

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
    }, [flash]);

    const d = form.data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => form.setData(k, v as any);
    const deliverable = barangays.filter((b) => b.is_deliverable).length;

    return (
        <AdminLayout title="Delivery Zone">
            <form
                className="space-y-5"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.put('/delivery-zone', { preserveScroll: true });
                }}
            >
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1">
                        <h1 className="text-xl font-bold">Online ordering & delivery zone</h1>
                        <p className="text-sm text-muted-foreground">
                            Customers can order only inside this zone and only from deliverable Mabinay barangays. Fulfilled by {branch?.name ?? '—'}.
                        </p>
                    </div>
                    <span className={cn('rounded-full px-3 py-1 text-sm font-semibold', status.is_open ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700')}>
                        {status.is_open ? 'Open now' : (status.message ?? 'Closed')}
                    </span>
                    <button type="submit" disabled={form.processing} className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
                        {form.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
                    </button>
                </div>
                {Object.keys(form.errors).length > 0 && (
                    <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{Object.values(form.errors).map((e, i) => <p key={i}>{e}</p>)}</div>
                )}

                <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                    {/* Map */}
                    <section className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                            <label className="flex items-center gap-2 text-sm font-semibold">
                                <input type="checkbox" checked={d.zone_use_polygon} onChange={(e) => set('zone_use_polygon', e.target.checked)} className="h-4 w-4 accent-primary" />
                                Use drawn boundary
                            </label>
                            <span className="text-xs text-muted-foreground">{d.zone_use_polygon ? `${d.polygon.length} points` : `Radius ${d.radius_km} km around the centre`}</span>
                            <div className="ml-auto flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDrawing((v) => !v)}
                                    className={cn('flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold', drawing ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}
                                >
                                    <PencilLine className="h-4 w-4" /> {drawing ? 'Drawing… click the map' : 'Draw boundary'}
                                </button>
                                <button type="button" disabled={!d.polygon.length} onClick={() => set('polygon', d.polygon.slice(0, -1))} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm disabled:opacity-40">
                                    <Undo2 className="h-4 w-4" /> Undo
                                </button>
                                <button
                                    type="button"
                                    disabled={!d.polygon.length}
                                    onClick={async () => {
                                        if (await confirmDialog({ title: 'Clear the drawn boundary?', confirmLabel: 'Clear', tone: 'danger' })) set('polygon', []);
                                    }}
                                    className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-destructive disabled:opacity-40"
                                >
                                    <Trash2 className="h-4 w-4" /> Clear
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const c = mapRef.current?.getCenter();
                                        if (c) set('center', { lat: Number(c.lat.toFixed(7)), lng: Number(c.lng.toFixed(7)) });
                                    }}
                                    className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm"
                                    title="Use the middle of the map as the Mabinay centre"
                                >
                                    <Crosshair className="h-4 w-4" /> Set centre here
                                </button>
                            </div>
                        </div>
                        <div className="h-[460px]">
                            <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                                <ZoneEditorMap
                                    center={d.center}
                                    radiusKm={Number(d.radius_km) || 1}
                                    usePolygon={d.zone_use_polygon}
                                    polygon={d.polygon}
                                    drawing={drawing}
                                    onAddPoint={(p) => set('polygon', [...d.polygon, p])}
                                    mapRef={mapRef}
                                />
                            </Suspense>
                        </div>
                        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-3">
                            <Field label="Centre latitude">
                                <input className={inputCls} type="number" step="0.0000001" value={d.center.lat} onChange={(e) => set('center', { ...d.center, lat: Number(e.target.value) })} />
                            </Field>
                            <Field label="Centre longitude">
                                <input className={inputCls} type="number" step="0.0000001" value={d.center.lng} onChange={(e) => set('center', { ...d.center, lng: Number(e.target.value) })} />
                            </Field>
                            <Field label="Fallback radius (km)">
                                <input className={inputCls} type="number" step="0.5" min="0.5" max="60" value={d.radius_km} onChange={(e) => set('radius_km', Number(e.target.value))} />
                            </Field>
                        </div>
                        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            Tip: OpenStreetMap has no mapped boundary for Mabinay, so trace the municipal border with “Draw boundary” (click each corner, then save) and tick “Use drawn boundary”.
                            Until then the radius around the centre is used together with the barangay check.
                        </p>
                    </section>

                    {/* Settings */}
                    <div className="space-y-5">
                        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                            <h2 className="font-bold">Ordering</h2>
                            <Toggle label="Accept online orders" checked={d.enabled} onChange={(v) => set('enabled', v)} />
                            <Toggle label="Offer delivery" checked={d.delivery_enabled} onChange={(v) => set('delivery_enabled', v)} />
                            <Toggle label="Offer pickup" checked={d.pickup_enabled} onChange={(v) => set('pickup_enabled', v)} />
                            <Field label="Fulfilling branch">
                                <select className={inputCls} value={d.branch_code} onChange={(e) => set('branch_code', e.target.value)}>
                                    {branches.map((b) => (
                                        <option key={b.code} value={b.code}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Delivery fee (₱)">
                                    <input className={inputCls} type="number" min="0" step="1" value={d.delivery_fee} onChange={(e) => set('delivery_fee', Number(e.target.value))} />
                                </Field>
                                <Field label="Free delivery from (₱)">
                                    <input className={inputCls} type="number" min="0" step="1" value={d.free_delivery_min} onChange={(e) => set('free_delivery_min', Number(e.target.value))} />
                                </Field>
                                <Field label="Minimum order (₱)">
                                    <input className={inputCls} type="number" min="0" step="1" value={d.min_order} onChange={(e) => set('min_order', Number(e.target.value))} />
                                </Field>
                                <Field label="Prep time (min)">
                                    <input className={inputCls} type="number" min="5" max="240" value={d.prep_minutes} onChange={(e) => set('prep_minutes', Number(e.target.value))} />
                                </Field>
                                <Field label="Delivery time (min)">
                                    <input className={inputCls} type="number" min="0" max="240" value={d.delivery_minutes} onChange={(e) => set('delivery_minutes', Number(e.target.value))} />
                                </Field>
                            </div>
                        </section>

                        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                            <h2 className="font-bold">Store hours (online)</h2>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Opens">
                                    <input className={inputCls} type="time" value={d.store_hours.open} onChange={(e) => set('store_hours', { ...d.store_hours, open: e.target.value })} />
                                </Field>
                                <Field label="Closes">
                                    <input className={inputCls} type="time" value={d.store_hours.close} onChange={(e) => set('store_hours', { ...d.store_hours, close: e.target.value })} />
                                </Field>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {DAYS.map((day, i) => {
                                    const on = d.store_hours.days.includes(i);
                                    return (
                                        <button
                                            key={day}
                                            type="button"
                                            onClick={() => set('store_hours', { ...d.store_hours, days: on ? d.store_hours.days.filter((x) => x !== i) : [...d.store_hours.days, i].sort() })}
                                            className={cn('h-9 w-12 rounded-lg border text-sm font-semibold', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    </div>
                </div>
            </form>

            {/* Barangays */}
            <section className="mt-5 rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <h2 className="font-bold">Mabinay barangays</h2>
                    <span className="text-sm text-muted-foreground">
                        {deliverable} of {barangays.length} deliverable — tap to toggle
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {barangays.map((b) => (
                        <button
                            key={b.id}
                            type="button"
                            onClick={() => router.patch(`/delivery-zone/barangays/${b.id}`, {}, { preserveScroll: true })}
                            className={cn(
                                'flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-semibold',
                                b.is_deliverable ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'border-border text-muted-foreground line-through',
                            )}
                        >
                            <span className="truncate">{b.name}</span>
                            <span className={cn('h-2 w-2 shrink-0 rounded-full', b.is_deliverable ? 'bg-emerald-500' : 'bg-zinc-400')} />
                        </button>
                    ))}
                </div>
            </section>
        </AdminLayout>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex items-center justify-between gap-3 text-sm">
            <span>{label}</span>
            <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-primary" />
        </label>
    );
}
