import 'leaflet/dist/leaflet.css';

import type { Map as LeafletMap } from 'leaflet';
import { useEffect, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import { themeAccent } from '@/lib/utils';

interface Props {
    center: { lat: number; lng: number };
    radiusKm: number;
    usePolygon: boolean;
    polygon: [number, number][];
    drawing: boolean;
    onAddPoint: (p: [number, number]) => void;
    onCenterChange?: (c: { lat: number; lng: number }) => void;
    mapRef?: React.MutableRefObject<LeafletMap | null>;
}

function ClickToDraw({ drawing, onAddPoint }: { drawing: boolean; onAddPoint: (p: [number, number]) => void }) {
    useMapEvents({
        click: (e) => {
            if (drawing) onAddPoint([Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7))]);
        },
    });
    return null;
}

export default function ZoneEditorMap({ center, radiusKm, usePolygon, polygon, drawing, onAddPoint, mapRef }: Props) {
    const accent = themeAccent();
    const localRef = useRef<LeafletMap | null>(null);

    useEffect(() => {
        const el = localRef.current?.getContainer();
        if (el) el.style.cursor = drawing ? 'crosshair' : '';
    }, [drawing]);

    return (
        <MapContainer
            center={[center.lat, center.lng]}
            zoom={11}
            className="h-full w-full"
            ref={(m) => {
                localRef.current = m;
                if (mapRef) mapRef.current = m;
            }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                maxZoom={19}
            />
            <ClickToDraw drawing={drawing} onAddPoint={onAddPoint} />
            {!usePolygon && (
                <Circle center={[center.lat, center.lng]} radius={radiusKm * 1000} pathOptions={{ color: accent, weight: 2, fillOpacity: 0.08 }} />
            )}
            {polygon.length >= 3 && (
                <Polygon
                    positions={polygon}
                    pathOptions={{
                        color: usePolygon ? accent : '#64748b',
                        weight: 2,
                        fillOpacity: usePolygon ? 0.12 : 0.04,
                        dashArray: usePolygon ? undefined : '6 6',
                    }}
                />
            )}
            {polygon.length === 2 && <Polyline positions={polygon} pathOptions={{ color: accent, weight: 2 }} />}
            {polygon.map((p, i) => (
                <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: accent, fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
            ))}
            <CircleMarker
                center={[center.lat, center.lng]}
                radius={7}
                pathOptions={{ color: '#0f172a', fillColor: accent, fillOpacity: 1, weight: 2 }}
            />
        </MapContainer>
    );
}
