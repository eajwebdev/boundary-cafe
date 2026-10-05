<?php

namespace App\Http\Controllers;

use App\Models\Barangay;
use App\Models\Branch;
use App\Models\SystemSetting;
use App\Services\DeliveryZoneService;
use App\Services\OnlineOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Delivery zone & online ordering settings (menu 43).
 */
class DeliveryZoneController extends Controller
{
    public function __construct(private DeliveryZoneService $zone, private OnlineOrderService $online) {}

    public function index(): Response
    {
        $branch = $this->online->branch();
        $rawHours = SystemSetting::get('online.store_hours', null, null);
        $hours = is_array($rawHours) ? $rawHours : (json_decode((string) $rawHours, true) ?: []);

        return Inertia::render('DeliveryZone/Index', [
            'zone' => $this->zone->toFrontend(),
            'barangays' => Barangay::ordered()->get()->map(fn (Barangay $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'is_deliverable' => $b->is_deliverable,
                'lat' => $b->lat,
                'lng' => $b->lng,
            ])->values(),
            'settings' => $this->online->settings($branch) + [
                'branch_code' => (string) SystemSetting::get('online.branch_code', null, 'BC-MAB'),
                'zone_use_polygon' => (bool) SystemSetting::get('online.zone_use_polygon', null, false),
                'store_hours' => [
                    'open' => $hours['open'] ?? '08:00',
                    'close' => $hours['close'] ?? '21:00',
                    'days' => array_map('intval', $hours['days'] ?? [0, 1, 2, 3, 4, 5, 6]),
                ],
            ],
            'status' => $this->online->storeStatus($branch),
            'branch' => $branch ? ['name' => $branch->name, 'code' => $branch->code] : null,
            'branches' => Branch::where('is_active', true)->orderBy('name')->get(['code', 'name']),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'branch_code' => ['required', 'string', 'exists:branches,code'],
            'delivery_enabled' => ['required', 'boolean'],
            'pickup_enabled' => ['required', 'boolean'],
            'delivery_fee' => ['required', 'numeric', 'min:0', 'max:1000'],
            'free_delivery_min' => ['required', 'numeric', 'min:0', 'max:100000'],
            'min_order' => ['required', 'numeric', 'min:0', 'max:100000'],
            'prep_minutes' => ['required', 'integer', 'min:5', 'max:240'],
            'delivery_minutes' => ['required', 'integer', 'min:0', 'max:240'],
            'store_hours.open' => ['required', 'date_format:H:i'],
            'store_hours.close' => ['required', 'date_format:H:i', 'after:store_hours.open'],
            'store_hours.days' => ['required', 'array', 'min:1'],
            'store_hours.days.*' => ['integer', 'between:0,6'],
            'center.lat' => ['required', 'numeric', 'between:-90,90'],
            'center.lng' => ['required', 'numeric', 'between:-180,180'],
            'radius_km' => ['required', 'numeric', 'min:0.5', 'max:60'],
            'zone_use_polygon' => ['required', 'boolean'],
            'polygon' => ['nullable', 'array', 'max:500'],
            'polygon.*' => ['array', 'size:2'],
            'polygon.*.*' => ['numeric'],
        ]);

        if ($data['zone_use_polygon'] && count($data['polygon'] ?? []) < 3) {
            return back()->withErrors(['polygon' => 'Draw at least 3 points on the map to use a boundary polygon.']);
        }

        foreach (['enabled', 'branch_code', 'delivery_enabled', 'pickup_enabled', 'delivery_fee', 'free_delivery_min', 'min_order', 'prep_minutes', 'delivery_minutes', 'zone_use_polygon'] as $key) {
            SystemSetting::set("online.{$key}", $data[$key]);
        }
        SystemSetting::set('online.store_hours', [
            'open' => $data['store_hours']['open'],
            'close' => $data['store_hours']['close'],
            'days' => array_values(array_map('intval', $data['store_hours']['days'])),
        ]);
        SystemSetting::set('online.zone_center', ['lat' => (float) $data['center']['lat'], 'lng' => (float) $data['center']['lng']]);
        SystemSetting::set('online.zone_radius_km', $data['radius_km']);
        SystemSetting::set('online.zone_polygon', array_map(
            fn ($p) => [round((float) $p[0], 7), round((float) $p[1], 7)],
            $data['polygon'] ?? []
        ));
        SystemSetting::flushCache();

        return back()->with('success', 'Delivery zone and online ordering settings saved.');
    }

    public function toggleBarangay(Barangay $barangay): RedirectResponse
    {
        $barangay->update(['is_deliverable' => ! $barangay->is_deliverable]);

        return back()->with('success', "{$barangay->name} is now ".($barangay->is_deliverable ? 'deliverable' : 'not deliverable').'.');
    }
}
