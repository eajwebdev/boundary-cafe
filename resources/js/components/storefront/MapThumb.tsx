import { MapPin } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Static map preview built from OpenStreetMap tiles (no Leaflet, no API key).
 * Renders a 3×3 tile block positioned so the pinned point sits in the centre.
 */
export default function MapThumb({ lat, lng, zoom = 16, className, label }: { lat: number; lng: number; zoom?: number; className?: string; label?: string }) {
    const n = 2 ** zoom;
    const xt = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const yt = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const tx = Math.floor(xt);
    const ty = Math.floor(yt);
    // Pixel offset of the point inside the 768×768 block (block starts one tile up/left).
    const px = (xt - tx + 1) * 256;
    const py = (yt - ty + 1) * 256;

    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            tiles.push({ key: `${dx}${dy}`, x: tx + dx, y: ty + dy, left: (dx + 1) * 256, top: (dy + 1) * 256 });
        }
    }

    return (
        <div className={cn('relative overflow-hidden bg-shop-sunken', className)} role="img" aria-label={label ?? 'Map preview of the pinned location'}>
            <div className="absolute" style={{ width: 768, height: 768, left: `calc(50% - ${px}px)`, top: `calc(50% - ${py}px)` }}>
                {tiles.map((t) => (
                    <img
                        key={t.key}
                        src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
                        alt=""
                        decoding="async"
                        draggable={false}
                        className="absolute h-64 w-64 max-w-none select-none"
                        style={{ left: t.left, top: t.top }}
                    />
                ))}
            </div>
            <MapPin className="absolute top-1/2 left-1/2 h-8 w-8 -translate-x-1/2 -translate-y-full fill-shop-accent text-white drop-shadow-md" strokeWidth={1.5} />
            <span className="absolute right-1 bottom-0.5 text-[9px] text-black/60">© OpenStreetMap</span>
        </div>
    );
}
