import 'leaflet/dist/leaflet.css';

import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

/** Mabinay, Negros Oriental: where the map opens before a branch has a location. */
const FALLBACK_CENTER: [number, number] = [9.7306, 122.9213];

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
    useMapEvents({
        click: (e) => onPick(Number(e.latlng.lat.toFixed(7)), Number(e.latlng.lng.toFixed(7))),
    });
    return null;
}

function FollowCenter({ center }: { center: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.setView(center, Math.max(map.getZoom(), 17));
    }, [center, map]);
    return null;
}

/** Click the map to place the branch; the circle shows the clock-in area. */
export default function GeofenceMap({
    latitude,
    longitude,
    radiusM,
    onPick,
}: {
    latitude: number | null;
    longitude: number | null;
    radiusM: number;
    onPick: (lat: number, lng: number) => void;
}) {
    const center: [number, number] | null = latitude !== null && longitude !== null ? [latitude, longitude] : null;

    return (
        <MapContainer center={center ?? FALLBACK_CENTER} zoom={center ? 17 : 13} className="h-full w-full" scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickToPick onPick={onPick} />
            <FollowCenter center={center} />
            {center && (
                <>
                    <Circle center={center} radius={radiusM} pathOptions={{ color: '#ea580c', fillOpacity: 0.12, weight: 2 }} />
                    <CircleMarker center={center} radius={6} pathOptions={{ color: '#ffffff', fillColor: '#ea580c', fillOpacity: 1, weight: 2 }} />
                </>
            )}
        </MapContainer>
    );
}
