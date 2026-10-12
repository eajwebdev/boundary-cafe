import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

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
    /** Draw a dashed line through pins in order, e.g. the rider and their stops. */
    lines?: [string, string][];
    /** The map re-frames itself when this changes, not on every live update, so it does not jump while someone pans. */
    fitKey?: string;
    /** Pin to fly to and enlarge (e.g. the delivery card the rider tapped). */
    focusId?: string | null;
    onSelect?: (id: string) => void;
    className?: string;
}

const PIN_STYLE: Record<MapPoint['kind'], { bg: string; glyph: string }> = {
    store: { bg: '#0f172a', glyph: '<path d="M3 9l1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6" />' },
    rider: { bg: '#7c3aed', glyph: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10l-2-4h3" />' },
    drop: { bg: '#e11d48', glyph: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>' },
    available: { bg: '#64748b', glyph: '<path d="M12 5v14M5 12h14"/>' },
};

function pinIcon(point: MapPoint, focused: boolean): L.DivIcon {
    const { bg, glyph } = PIN_STYLE[point.kind];
    const size = focused ? 44 : 34;
    const pulse =
        (point.kind === 'rider' && !point.stale) || focused
            ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${bg};opacity:.25;animation:bc-ping 1.6s ease-out infinite"></span>`
            : '';
    const inner =
        point.number !== undefined
            ? `<span style="color:#fff;font:800 ${focused ? 17 : 14}px system-ui,sans-serif">${point.number}</span>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;

    return L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<span style="position:relative;display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border-radius:9999px;background:${bg};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);opacity:${point.stale ? 0.45 : 1}">${pulse}${inner}</span>`,
    });
}

function FitToPoints({ points, fitKey }: { points: MapPoint[]; fitKey: string }) {
    const map = useMap();

    useEffect(() => {
        if (points.length === 0) return;
        if (points.length === 1) {
            map.setView([points[0].lat, points[0].lng], 15);
            return;
        }
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 16 });
        // Re-frame only when the set of pins changes, not when a rider moves.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, map]);

    return null;
}

function FlyToFocus({ point }: { point: MapPoint | undefined }) {
    const map = useMap();

    useEffect(() => {
        if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
        // Fly only when the focused pin changes, not when the rider's position updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [point?.id, map]);

    return null;
}

/** OpenStreetMap with the store, riders and drop-off pins. Load it lazily: Leaflet is heavy. */
export default function DeliveryMap({ points, lines = [], fitKey, focusId, onSelect, className }: Props) {
    const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
    const first = points[0];
    const key = fitKey ?? points.map((p) => p.id).join('|');

    return (
        <>
            <style>{'@keyframes bc-ping{0%{transform:scale(.8);opacity:.35}100%{transform:scale(1.9);opacity:0}}'}</style>
            <MapContainer center={first ? [first.lat, first.lng] : [9.7355, 122.9264]} zoom={14} className={className} scrollWheelZoom={false}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />
                <FitToPoints points={points} fitKey={key} />
                <FlyToFocus point={focusId ? byId.get(focusId) : undefined} />
                {lines.map(([from, to]) => {
                    const a = byId.get(from);
                    const b = byId.get(to);
                    return a && b ? (
                        <Polyline
                            key={`${from}-${to}`}
                            positions={[
                                [a.lat, a.lng],
                                [b.lat, b.lng],
                            ]}
                            pathOptions={{ color: '#7c3aed', weight: 3, dashArray: '6 8', opacity: 0.8 }}
                        />
                    ) : null;
                })}
                {points.map((p) => (
                    <Marker
                        key={p.id}
                        position={[p.lat, p.lng]}
                        icon={pinIcon(p, p.id === focusId)}
                        zIndexOffset={p.id === focusId ? 2000 : p.kind === 'rider' ? 1000 : 0}
                        eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
                    >
                        <Tooltip direction="top" offset={[0, -18]}>
                            {p.label}
                        </Tooltip>
                    </Marker>
                ))}
            </MapContainer>
        </>
    );
}
