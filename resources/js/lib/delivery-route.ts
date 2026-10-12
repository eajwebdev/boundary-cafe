/**
 * Delivery route helpers for riders: straight-line distances, a nearest-first stop order and rough
 * travel times. Roads are never straight, so distances are stretched by ROAD_FACTOR and times use a
 * typical town motorbike speed. Good enough to decide "who first", not a turn-by-turn router.
 */

export interface LatLng {
    lat: number;
    lng: number;
}

/** Roads wind: a 1 km crow-flies hop is roughly 1.3 km on the road. */
const ROAD_FACTOR = 1.3;
const MOTORBIKE_KMH = 25;

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
    const rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function roadKm(a: LatLng, b: LatLng): number {
    return distanceKm(a, b) * ROAD_FACTOR;
}

export function rideMinutes(km: number): number {
    return Math.max(1, Math.round((km / MOTORBIKE_KMH) * 60));
}

export function formatKm(km: number): string {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export interface PlannedStop<T> {
    stop: T;
    /** 1-based position in the suggested order. */
    number: number;
    /** Road distance from the previous stop (or the start). */
    legKm: number;
    /** Minutes from the start to this stop, riding the suggested order. */
    etaMinutes: number;
}

/**
 * Nearest-first order: from `start`, always ride to the closest stop not yet visited.
 * Stops without a map pin go last, in their original order.
 */
export function planRoute<T extends { lat: number | null; lng: number | null }>(start: LatLng, stops: T[]): PlannedStop<T>[] {
    const pinned = stops.filter((s): s is T & LatLng => s.lat !== null && s.lng !== null);
    const unpinned = stops.filter((s) => s.lat === null || s.lng === null);
    const plan: PlannedStop<T>[] = [];
    let here = start;
    let minutes = 0;

    while (pinned.length > 0) {
        let best = 0;
        for (let i = 1; i < pinned.length; i++) {
            if (distanceKm(here, pinned[i]) < distanceKm(here, pinned[best])) best = i;
        }
        const [next] = pinned.splice(best, 1);
        const legKm = roadKm(here, next);
        minutes += rideMinutes(legKm);
        plan.push({ stop: next, number: plan.length + 1, legKm, etaMinutes: minutes });
        here = next;
    }

    unpinned.forEach((stop) => plan.push({ stop, number: plan.length + 1, legKm: 0, etaMinutes: 0 }));

    return plan;
}

/** Google Maps directions through every stop in order (Maps allows up to 9 waypoints between start and end). */
export function googleRouteUrl(start: LatLng, stops: LatLng[]): string | null {
    if (stops.length === 0) return null;
    const fmt = (p: LatLng) => `${p.lat},${p.lng}`;
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).slice(0, 9).map(fmt).join('|');
    const params = new URLSearchParams({ api: '1', origin: fmt(start), destination: fmt(destination), travelmode: 'driving' });
    if (waypoints) params.set('waypoints', waypoints);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
}
