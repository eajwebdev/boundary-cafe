<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Road routes for the rider's in-app navigation, from an OSRM server (OpenStreetMap data).
 *
 * The public OSRM server is a free demo with a fair-use policy, so routes are requested from our
 * server (not each phone), cached briefly, and the server can be swapped with ROUTING_URL in .env
 * (e.g. a self-hosted OSRM). When routing is unavailable the caller gets null and the rider app
 * falls back to a straight-line guide.
 */
class RoutingService
{
    private const CACHE_SECONDS = 120;

    /**
     * @return array{distance_m: float, duration_s: float, geometry: list<array{0: float, 1: float}>, steps: list<array{instruction: string, type: string, modifier: ?string, name: ?string, distance_m: float, location: array{0: float, 1: float}}>}|null
     */
    public function route(float $fromLat, float $fromLng, float $toLat, float $toLng): ?array
    {
        $base = rtrim((string) config('services.routing.url', 'https://router.project-osrm.org'), '/');
        $profile = (string) config('services.routing.profile', 'driving');
        // ~11 m grid: a rider standing still does not trigger a new request every few seconds.
        $key = sprintf('route:v1:%s:%.4f,%.4f>%.4f,%.4f', $profile, $fromLat, $fromLng, $toLat, $toLng);

        $cached = Cache::get($key);
        if ($cached !== null) {
            return $cached ?: null;
        }

        try {
            $response = Http::withHeaders(['User-Agent' => config('app.name', 'CafePOS').' rider navigation ('.config('app.url').')'])
                ->timeout(6)
                ->get(sprintf('%s/route/v1/%s/%F,%F;%F,%F', $base, $profile, $fromLng, $fromLat, $toLng, $toLat), [
                    'overview' => 'full',
                    'geometries' => 'geojson',
                    'steps' => 'true',
                ]);

            $route = $response->ok() && $response->json('code') === 'Ok' ? $response->json('routes.0') : null;
            if (! $route) {
                Cache::put($key, [], now()->addSeconds(20));

                return null;
            }

            $result = [
                'distance_m' => round((float) $route['distance'], 1),
                'duration_s' => round((float) $route['duration'], 1),
                'geometry' => array_map(fn (array $c) => [(float) $c[0], (float) $c[1]], $route['geometry']['coordinates'] ?? []),
                'steps' => collect($route['legs'] ?? [])
                    ->flatMap(fn (array $leg) => $leg['steps'] ?? [])
                    ->map(fn (array $step) => [
                        'instruction' => $this->instruction($step),
                        'type' => (string) ($step['maneuver']['type'] ?? ''),
                        'modifier' => $step['maneuver']['modifier'] ?? null,
                        'name' => ($step['name'] ?? '') !== '' ? $step['name'] : null,
                        'distance_m' => round((float) ($step['distance'] ?? 0), 1),
                        'location' => [(float) $step['maneuver']['location'][0], (float) $step['maneuver']['location'][1]],
                    ])
                    ->values()
                    ->all(),
            ];

            Cache::put($key, $result, now()->addSeconds(self::CACHE_SECONDS));

            return $result;
        } catch (\Throwable $e) {
            Log::info('Routing failed', ['error' => $e->getMessage()]);
            Cache::put($key, [], now()->addSeconds(20));

            return null;
        }
    }

    /**
     * A plain-English instruction for one OSRM step, e.g. "Turn right onto Rizal Street".
     *
     * @param  array<string, mixed>  $step
     */
    public function instruction(array $step): string
    {
        $type = $step['maneuver']['type'] ?? '';
        $modifier = $step['maneuver']['modifier'] ?? null;
        $name = ($step['name'] ?? '') !== '' ? $step['name'] : null;
        $onto = $name ? " onto {$name}" : '';
        $turn = match ($modifier) {
            'left' => 'Turn left',
            'right' => 'Turn right',
            'sharp left' => 'Turn sharp left',
            'sharp right' => 'Turn sharp right',
            'slight left' => 'Bear left',
            'slight right' => 'Bear right',
            'uturn' => 'Make a U-turn',
            default => 'Go straight',
        };

        return match ($type) {
            'depart' => $name ? "Start on {$name}" : 'Start riding',
            'arrive' => match ($modifier) {
                'left', 'slight left', 'sharp left' => 'Arrive: the customer is on your left',
                'right', 'slight right', 'sharp right' => 'Arrive: the customer is on your right',
                default => 'Arrive at the customer',
            },
            'end of road' => 'At the end of the road, '.lcfirst($turn).$onto,
            'fork' => 'Keep '.(str_contains((string) $modifier, 'left') ? 'left' : 'right').' at the fork'.$onto,
            'roundabout', 'rotary' => isset($step['maneuver']['exit']) ? "At the roundabout, take exit {$step['maneuver']['exit']}{$onto}" : "Go through the roundabout{$onto}",
            'merge' => 'Merge'.($modifier ? ' '.str_replace('slight ', '', $modifier) : '').$onto,
            'new name', 'continue' => ($modifier && ! in_array($modifier, ['straight', 'slight left', 'slight right'], true) ? $turn : 'Continue straight').$onto,
            default => $turn.$onto,
        };
    }
}
