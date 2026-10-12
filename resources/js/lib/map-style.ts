import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Base map: OpenFreeMap's "Positron" vector style (free, no API key, commercial use allowed),
 * recoloured in the café's palette — warm cream land, soft blue water, sage parks, orange-tinted
 * main roads and navy labels — so the map feels like part of the app rather than a generic map.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const NAVY = '#1b2a5b';
const HALO = '#fffaf3';

/** Paint overrides per Positron layer id. Layers missing from a future style version are skipped. */
const BRAND_PAINT: Record<string, Record<string, string>> = {
    background: { 'background-color': '#f7efe3' },
    landuse_residential: { 'fill-color': '#f2e8da' },
    park: { 'fill-color': '#e2ead2' },
    landcover_wood: { 'fill-color': '#dce6cc' },
    water: { 'fill-color': '#bcd4ea' },
    waterway: { 'line-color': '#9fc0de' },
    building: { 'fill-color': '#ebe0cf', 'fill-outline-color': '#ddcfba' },
    road_area_pier: { 'fill-color': '#f7efe3' },
    road_pier: { 'line-color': '#f7efe3' },
    highway_path: { 'line-color': '#efe3d1' },
    highway_minor: { 'line-color': '#ffffff' },
    highway_major_casing: { 'line-color': '#efc6a3' },
    highway_major_inner: { 'line-color': '#ffe9d6' },
    highway_major_subtle: { 'line-color': '#f4d9c1' },
    highway_motorway_casing: { 'line-color': '#eaa979' },
    highway_motorway_inner: { 'line-color': '#ffd6b5' },
    highway_motorway_subtle: { 'line-color': '#f2c9a6' },
    highway_motorway_bridge_casing: { 'line-color': '#eaa979' },
    highway_motorway_bridge_inner: { 'line-color': '#ffd6b5' },
    tunnel_motorway_casing: { 'line-color': '#eaa979' },
    tunnel_motorway_inner: { 'line-color': '#ffe9d6' },
    boundary_3: { 'line-color': '#c9b9a3' },
    boundary_2: { 'line-color': '#c9b9a3' },
    'highway-name-minor': { 'text-color': '#5b6478', 'text-halo-color': HALO },
    'highway-name-major': { 'text-color': '#5b6478', 'text-halo-color': HALO },
    'highway-name-path': { 'text-color': '#8a8f9c', 'text-halo-color': HALO },
    water_name_point_label: { 'text-color': '#3f6a99', 'text-halo-color': HALO },
    water_name_line_label: { 'text-color': '#3f6a99', 'text-halo-color': HALO },
    waterway_line_label: { 'text-color': '#3f6a99', 'text-halo-color': HALO },
};

/** Recolour the loaded base style. Call on every `style.load`. */
export function applyBrandColors(map: MapLibreMap): void {
    for (const layer of map.getStyle().layers ?? []) {
        const overrides =
            BRAND_PAINT[layer.id] ??
            (layer.type === 'symbol' && layer.id.startsWith('label_') ? { 'text-color': NAVY, 'text-halo-color': HALO } : null);
        if (!overrides) continue;
        for (const [property, value] of Object.entries(overrides)) {
            try {
                map.setPaintProperty(layer.id, property as Parameters<MapLibreMap['setPaintProperty']>[1], value);
            } catch {
                /* property not valid for this layer in a newer style: keep the original */
            }
        }
    }
}
