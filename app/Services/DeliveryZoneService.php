<?php

namespace App\Services;

use App\Models\Barangay;
use App\Models\SystemSetting;

/**
 * Mabinay-only delivery zone.
 *
 * A delivery address is accepted only when BOTH:
 *   1. the pin is inside the drawn boundary polygon (or, if none is saved,
 *      within the fallback radius of the Mabinay centre), and
 *   2. the selected barangay is a deliverable Mabinay barangay.
 */
class DeliveryZoneService
{
    public const DEFAULT_CENTER = ['lat' => 9.7355043, 'lng' => 122.926378];

    public function center(): array
    {
        $raw = SystemSetting::get('online.zone_center', null, self::DEFAULT_CENTER);
        $c = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: self::DEFAULT_CENTER);

        return ['lat' => (float) ($c['lat'] ?? self::DEFAULT_CENTER['lat']), 'lng' => (float) ($c['lng'] ?? self::DEFAULT_CENTER['lng'])];
    }

    public function radiusKm(): float
    {
        return max(0.5, (float) SystemSetting::get('online.zone_radius_km', null, 15));
    }

    /** @return array<int, array{0: float, 1: float}> list of [lat, lng] vertices */
    public function polygon(): array
    {
        $raw = SystemSetting::get('online.zone_polygon', null, []);
        $points = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: []);

        return collect($points)
            ->filter(fn ($p) => is_array($p) && count($p) >= 2 && is_numeric($p[0]) && is_numeric($p[1]))
            ->map(fn ($p) => [(float) $p[0], (float) $p[1]])
            ->values()
            ->all();
    }

    public function usesPolygon(): bool
    {
        return (bool) SystemSetting::get('online.zone_use_polygon', null, false) && count($this->polygon()) >= 3;
    }

    public function containsPoint(float $lat, float $lng): bool
    {
        if (abs($lat) > 90 || abs($lng) > 180) {
            return false;
        }

        if ($this->usesPolygon()) {
            return $this->pointInPolygon($lat, $lng, $this->polygon());
        }

        $c = $this->center();

        return $this->distanceKm($c['lat'], $c['lng'], $lat, $lng) <= $this->radiusKm();
    }

    /** @return array{ok: bool, message: ?string} */
    public function check(?float $lat, ?float $lng, ?string $barangay): array
    {
        if ($lat === null || $lng === null) {
            return ['ok' => false, 'message' => 'Please pin your delivery location on the map.'];
        }
        if (! $this->containsPoint($lat, $lng)) {
            return ['ok' => false, 'message' => 'Sorry, we only deliver within Mabinay.'];
        }
        if (! Barangay::isDeliverable($barangay)) {
            return ['ok' => false, 'message' => 'Please choose a Mabinay barangay we deliver to.'];
        }

        return ['ok' => true, 'message' => null];
    }

    public function toFrontend(): array
    {
        return [
            'center' => $this->center(),
            'radius_km' => $this->radiusKm(),
            'uses_polygon' => $this->usesPolygon(),
            'polygon' => $this->polygon(),
            'barangays' => Barangay::deliverable()->ordered()->get(['name', 'lat', 'lng'])
                ->map(fn ($b) => ['name' => $b->name, 'lat' => $b->lat, 'lng' => $b->lng])->values(),
        ];
    }

    public function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /** Ray-casting point-in-polygon test on [lat, lng] vertices. */
    private function pointInPolygon(float $lat, float $lng, array $polygon): bool
    {
        $inside = false;
        $n = count($polygon);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$yi, $xi] = $polygon[$i];
            [$yj, $xj] = $polygon[$j];
            $intersects = (($yi > $lat) !== ($yj > $lat))
                && ($lng < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi);
            if ($intersects) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }
}
