<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Services\DeliveryZoneService;
use App\Services\GeocodingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GeocodeController extends Controller
{
    public function reverse(Request $request, GeocodingService $geocoder, DeliveryZoneService $zone): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        $lat = (float) $data['lat'];
        $lng = (float) $data['lng'];
        $result = $geocoder->reverse($lat, $lng);

        return response()->json([
            'in_zone' => $zone->containsPoint($lat, $lng),
            'label' => $result['label'] ?? null,
            'barangay' => $result['barangay'] ?? null,
            'municipality' => $result['municipality'] ?? null,
            'resolved' => $result !== null,
        ]);
    }
}
