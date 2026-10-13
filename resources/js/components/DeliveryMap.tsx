import 'maplibre-gl/dist/maplibre-gl.css';

import type { GeoJSONSource } from 'maplibre-gl';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl';
// MapLibre decodes tiles in a web worker. Vite bundles that worker into its own file; tell MapLibre where it is.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'react';

import { applyBrandColors, MAP_STYLE_URL } from '@/lib/map-style';

/** One pin on a delivery map. */
export interface MapPoint {
    id: string;
    lat: number;
    lng: number;
    /** `available` = a delivery nobody has taken yet (drawn grey). */
    kind: 'store' | 'rider' | 'drop' | 'available';
    label: string;
    /** Riders whose last GPS fix is old are drawn faded. */
    stale?: boolean;
    /** Stop number shown inside the pin instead of an icon. */
    number?: number;
}

interface Props {
    points: MapPoint[];
    /** Draw a dashed line between pins, e.g. the rider and their stops. */
    lines?: [string, string][];
    /** The map re-frames itself when this changes, not on every live update, so it does not jump while someone pans. */
    fitKey?: string;
    /** Pin to fly to and enlarge (e.g. the delivery card the rider tapped). */
    focusId?: string | null;
    onSelect?: (id: string) => void;
    /** Room to keep around the pins when framing them, e.g. extra space under overlaid buttons. */
    fitPadding?: number | { top: number; right: number; bottom: number; left: number };
    /** A road route to draw as a solid line, as [lng, lat] pairs (in-app navigation). */
    routeGeometry?: [number, number][] | null;
    /** Keep the camera on this point (navigation mode); framing all pins is skipped while set. */
    follow?: { lat: number; lng: number; zoom?: number } | null;
    className?: string;
}

/**
 * Pin artwork. Icons are Lucide's (ISC licence, already used across the app): motorbike for the rider,
 * house for a customer, package for an order nobody has taken, coffee for the café.
 */
const ICON: Record<string, string> = {
    motorbike:
        '<path d="m18 14-1-3"/><path d="m3 9 6 2a2 2 0 0 1 2-2h2a2 2 0 0 1 1.99 1.81"/><path d="M8 17h3a1 1 0 0 0 1-1 6 6 0 0 1 6-6 1 1 0 0 0 1-1v-.75A5 5 0 0 0 17 5"/><circle cx="19" cy="17" r="3"/><circle cx="5" cy="17" r="3"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    package:
        '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
};

const PIN_STYLE: Record<MapPoint['kind'], { bg: string; icon: string }> = {
    store: { bg: '#0f172a', icon: ICON.coffee },
    rider: { bg: '#7c3aed', icon: ICON.motorbike },
    drop: { bg: '#e11d48', icon: ICON.house },
    available: { bg: '#64748b', icon: ICON.package },
};

/** Teardrop location pin (tip at the bottom centre, which is where it points on the map). */
const TEARDROP = 'M18 45c-1.3 0-2.1-1-3.1-2.4C9.4 35.2 2 27.6 2 18 2 9.2 9.2 2 18 2s16 7.2 16 16c0 9.6-7.4 17.2-12.9 24.6-1 1.4-1.8 2.4-3.1 2.4z';

setWorkerUrl(maplibreWorkerUrl);

const DEFAULT_CENTER: [number, number] = [122.9264, 9.7355]; // Mabinay, [lng, lat]
const ROUTE_SOURCE = 'bc-route';
const ROAD_SOURCE = 'bc-road';

/**
 * Markup for a pin. The rider is a round badge (it moves; a soft pulse while live). Everything else is a
 * teardrop location pin whose tip marks the exact spot, showing a stop number or an icon.
 */
function pinHtml(point: MapPoint, focused: boolean): string {
    const { bg, icon } = PIN_STYLE[point.kind];
    const fade = point.stale ? 0.45 : 1;

    if (point.kind === 'rider') {
        const size = focused ? 48 : 40;
        const pulse = point.stale
            ? ''
            : `<span style="position:absolute;inset:-7px;border-radius:9999px;background:${bg};opacity:.28;animation:bc-ping 1.6s ease-out infinite"></span>`;
        return `<span style="position:relative;display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:9999px;background:${bg};border:3px solid #fff;box-shadow:0 4px 12px rgba(76,29,149,.45);opacity:${fade};cursor:pointer">${pulse}<svg width="${focused ? 26 : 22}" height="${focused ? 26 : 22}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:relative">${icon}</svg></span>`;
    }

    const scale = focused ? 1.25 : 1;
    const inner =
        point.number !== undefined
            ? `<text x="18" y="23.5" text-anchor="middle" fill="#fff" style="font:800 15px system-ui,sans-serif">${point.number}</text>`
            : `<svg x="8.5" y="8.5" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`;
    const halo = focused
        ? `<span style="position:absolute;left:50%;bottom:-6px;width:22px;height:8px;margin-left:-11px;border-radius:9999px;background:${bg};opacity:.35;animation:bc-ping 1.6s ease-out infinite"></span>`
        : '';

    return `<span style="position:relative;display:block;width:36px;height:46px;transform:scale(${scale});transform-origin:50% 100%;transition:transform .15s;opacity:${fade};cursor:pointer;filter:drop-shadow(0 3px 4px rgba(15,23,42,.35))">${halo}<svg width="36" height="46" viewBox="0 0 36 46" style="position:relative;display:block"><path d="${TEARDROP}" fill="${bg}" stroke="#fff" stroke-width="2.5"/>${inner}</svg></span>`;
}

/**
 * Delivery map (MapLibre GL + OpenFreeMap vector tiles, in the café's colours) with the store, riders and
 * drop-off pins. Load it lazily: the map engine is large and only map screens need it.
 */
export default function DeliveryMap({
    points,
    lines = [],
    fitKey,
    focusId,
    onSelect,
    fitPadding = 48,
    routeGeometry = null,
    follow = null,
    className,
}: Props) {
    const container = useRef<HTMLDivElement>(null);
    const map = useRef<MapLibreMap | null>(null);
    const markers = useRef(new Map<string, { marker: Marker; html: string }>());
    const ready = useRef(false);
    const latest = useRef({ points, lines, onSelect, routeGeometry });
    latest.current = { points, lines, onSelect, routeGeometry };
    const key = fitKey ?? points.map((p) => p.id).join('|');

    // ── Create the map once ──
    useEffect(() => {
        if (!container.current) return;
        const first = latest.current.points[0];
        const instance = new MapLibreMap({
            container: container.current,
            style: MAP_STYLE_URL,
            center: first ? [first.lng, first.lat] : DEFAULT_CENTER,
            zoom: 14,
            attributionControl: { compact: true },
            dragRotate: false,
            pitchWithRotate: false,
            cooperativeGestures: false,
        });
        instance.addControl(new NavigationControl({ showCompass: false }), 'top-left');
        instance.touchZoomRotate.disableRotation();
        instance.on('style.load', () => applyBrandColors(instance));
        instance.on('load', () => {
            // Road route: a white casing under a solid blue line, drawn below the dashed overview line.
            instance.addSource(ROAD_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            instance.addLayer({
                id: `${ROAD_SOURCE}-casing`,
                type: 'line',
                source: ROAD_SOURCE,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 },
            });
            instance.addLayer({
                id: ROAD_SOURCE,
                type: 'line',
                source: ROAD_SOURCE,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#2563eb', 'line-width': 5.5 },
            });
            instance.addSource(ROUTE_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            instance.addLayer({
                id: ROUTE_SOURCE,
                type: 'line',
                source: ROUTE_SOURCE,
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: { 'line-color': '#7c3aed', 'line-width': 3.5, 'line-opacity': 0.85, 'line-dasharray': [1.2, 2] },
            });
            ready.current = true;
            drawRoute();
            drawRoad();
        });
        map.current = instance;

        const resize = new ResizeObserver(() => instance.resize());
        resize.observe(container.current);
        const pins = markers.current;

        return () => {
            resize.disconnect();
            pins.forEach(({ marker }) => marker.remove());
            pins.clear();
            ready.current = false;
            instance.remove();
            map.current = null;
        };
    }, []);

    function drawRoute() {
        const instance = map.current;
        if (!instance || !ready.current) return;
        const byId = new Map(latest.current.points.map((p) => [p.id, p]));
        const features = latest.current.lines.flatMap(([from, to]) => {
            const a = byId.get(from);
            const b = byId.get(to);
            return a && b
                ? [
                      {
                          type: 'Feature' as const,
                          properties: {},
                          geometry: {
                              type: 'LineString' as const,
                              coordinates: [
                                  [a.lng, a.lat],
                                  [b.lng, b.lat],
                              ],
                          },
                      },
                  ]
                : [];
        });
        (instance.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
    }

    function drawRoad() {
        const instance = map.current;
        if (!instance || !ready.current) return;
        const coordinates = latest.current.routeGeometry ?? [];
        (instance.getSource(ROAD_SOURCE) as GeoJSONSource | undefined)?.setData({
            type: 'FeatureCollection',
            features: coordinates.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }] : [],
        });
    }

    useEffect(drawRoad, [routeGeometry]);

    // ── Navigation: keep the camera on the rider ──
    const followLat = follow?.lat;
    const followLng = follow?.lng;
    const followZoom = follow?.zoom ?? 17;
    useEffect(() => {
        const instance = map.current;
        if (!instance || followLat === undefined || followLng === undefined) return;
        instance.easeTo({ center: [followLng, followLat], zoom: followZoom, duration: 700 });
    }, [followLat, followLng, followZoom]);

    // ── Pins: add, move, restyle or remove as the data changes ──
    useEffect(() => {
        const instance = map.current;
        if (!instance) return;
        const seen = new Set<string>();

        points.forEach((point) => {
            seen.add(point.id);
            const html = pinHtml(point, point.id === focusId);
            const existing = markers.current.get(point.id);
            if (existing) {
                existing.marker.setLngLat([point.lng, point.lat]);
                if (existing.html !== html) {
                    existing.marker.getElement().innerHTML = html;
                    existing.html = html;
                }
                existing.marker.getPopup()?.setText(point.label);
                return;
            }

            const element = document.createElement('div');
            element.innerHTML = html;
            element.setAttribute('role', 'button');
            element.setAttribute('aria-label', point.label);
            element.addEventListener('click', (event) => {
                event.stopPropagation();
                latest.current.onSelect?.(point.id);
            });
            const popup = new Popup({ offset: point.kind === 'rider' ? 24 : [0, -44], closeButton: false, closeOnClick: false }).setText(point.label);
            element.addEventListener('mouseenter', () => popup.setLngLat(marker.getLngLat()).addTo(instance));
            element.addEventListener('mouseleave', () => popup.remove());
            // Round rider badges sit centred on the position; teardrop pins stand on their tip.
            const marker = new Marker({ element, anchor: point.kind === 'rider' ? 'center' : 'bottom' })
                .setLngLat([point.lng, point.lat])
                .setPopup(popup)
                .addTo(instance);
            markers.current.set(point.id, { marker, html });
        });

        markers.current.forEach(({ marker }, id) => {
            if (!seen.has(id)) {
                marker.remove();
                markers.current.delete(id);
            }
        });

        // Keep riders and the focused pin above the rest.
        markers.current.forEach(({ marker }, id) => {
            const kind = points.find((p) => p.id === id)?.kind;
            marker.getElement().style.zIndex = id === focusId ? '3' : kind === 'rider' ? '2' : '1';
        });

        drawRoute();
    }, [points, lines, focusId]);

    // ── Re-frame only when the set of pins changes, not when a rider moves ──
    useEffect(() => {
        const instance = map.current;
        if (!instance || points.length === 0 || follow) return;
        if (points.length === 1) {
            instance.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
            return;
        }
        const bounds = new LngLatBounds();
        points.forEach((p) => bounds.extend([p.lng, p.lat]));
        instance.fitBounds(bounds, { padding: fitPadding, maxZoom: 16, duration: 0 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    // ── Fly to the pin the user tapped ──
    useEffect(() => {
        const instance = map.current;
        const point = focusId ? points.find((p) => p.id === focusId) : undefined;
        if (instance && point) instance.flyTo({ center: [point.lng, point.lat], zoom: Math.max(instance.getZoom(), 16), duration: 600 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusId]);

    return (
        <>
            <style>{'@keyframes bc-ping{0%{transform:scale(.8);opacity:.35}100%{transform:scale(1.9);opacity:0}}'}</style>
            <div ref={container} className={className} />
        </>
    );
}
