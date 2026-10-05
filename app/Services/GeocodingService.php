<?php

namespace App\Services;

use App\Models\Barangay;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Server-side reverse geocoding through OpenStreetMap Nominatim.
 *
 * Results are cached (~11 m grid) to respect Nominatim's usage policy, and the
 * caller falls back to the customer's selected barangay when lookup fails.
 */
class GeocodingService
{
    private const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

    /** @return array{label: ?string, barangay: ?string, municipality: ?string}|null */
    public function reverse(float $lat, float $lng): ?array
    {
        $key = sprintf('geocode:%.4f,%.4f', $lat, $lng);

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached ?: null;
        }

        try {
            $response = Http::withHeaders([
                'User-Agent' => config('app.name', 'BoundaryCafe').' online ordering ('.config('app.url').')',
                'Accept-Language' => 'en',
            ])->timeout(6)->get(self::ENDPOINT, [
                'lat' => $lat,
                'lon' => $lng,
                'format' => 'jsonv2',
                'zoom' => 18,
                'addressdetails' => 1,
            ]);

            if (! $response->ok()) {
                return null;
            }

            $data = $response->json();
            $addr = $data['address'] ?? [];
            $street = $addr['road'] ?? $addr['pedestrian'] ?? $addr['path'] ?? null;
            $area = $addr['village'] ?? $addr['suburb'] ?? $addr['hamlet'] ?? $addr['quarter'] ?? $addr['neighbourhood'] ?? null;
            $town = $addr['town'] ?? $addr['municipality'] ?? $addr['city'] ?? $addr['county'] ?? null;

            $result = [
                'label' => collect([$street, $area, $town])->filter()->unique()->implode(', ') ?: ($data['display_name'] ?? null),
                'barangay' => $this->matchBarangay([$area, $addr['hamlet'] ?? null, $addr['neighbourhood'] ?? null, $data['name'] ?? null]),
                'municipality' => $town,
            ];

            Cache::put($key, $result, now()->addDays(7));

            return $result;
        } catch (\Throwable $e) {
            Log::info('Reverse geocoding failed', ['error' => $e->getMessage()]);
            Cache::put($key, [], now()->addMinutes(10));

            return null;
        }
    }

    private function matchBarangay(array $candidates): ?string
    {
        $names = Barangay::pluck('name');
        foreach (array_filter($candidates) as $candidate) {
            $needle = strtolower(str_replace(['-', ' '], '', $candidate));
            $match = $names->first(fn ($n) => strtolower(str_replace(['-', ' '], '', $n)) === $needle)
                ?? $names->first(fn ($n) => str_contains($needle, strtolower(str_replace(['-', ' '], '', $n))));
            if ($match) {
                return $match;
            }
        }

        return null;
    }
}
