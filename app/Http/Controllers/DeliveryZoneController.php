<?php

namespace App\Http\Controllers;

use App\Models\Barangay;
use App\Models\Branch;
use App\Models\CustomerAddress;
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
            'barangays' => Barangay::orderBy('municipality')->ordered()->get()->map(fn (Barangay $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'municipality' => $b->municipality,
                'province' => $b->province,
                'is_deliverable' => $b->is_deliverable,
                'lat' => $b->lat,
                'lng' => $b->lng,
            ])->values(),
            'settings' => $this->online->settings($branch) + [
                'branch_code' => (string) SystemSetting::get('online.branch_code', null, 'BC-MAB'),
                'service_area' => SystemSetting::serviceArea()['town'],
                'service_province' => SystemSetting::serviceArea()['province'],
                'zone_use_polygon' => (bool) SystemSetting::get('online.zone_use_polygon', null, false),
                'store_hours' => [
                    'open' => $hours['open'] ?? '08:00',
                    'close' => $hours['close'] ?? '17:00',
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
            'service_area' => ['sometimes', 'required', 'string', 'max:60'],
            'service_province' => ['sometimes', 'required', 'string', 'max:60'],
            'delivery_enabled' => ['required', 'boolean'],
            'pickup_enabled' => ['required', 'boolean'],
            'dine_in_enabled' => ['sometimes', 'boolean'],
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

        if (array_key_exists('dine_in_enabled', $data)) {
            SystemSetting::set('online.dine_in_enabled', $data['dine_in_enabled']);
        }
        foreach (['service_area', 'service_province'] as $key) {
            if (array_key_exists($key, $data)) {
                SystemSetting::set("online.{$key}", trim($data[$key]));
            }
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

    /** Add barangays to the list (one per line or comma-separated), e.g. a new branch's town. */
    public function storeBarangays(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'municipality' => ['required', 'string', 'max:80'],
            'province' => ['required', 'string', 'max:80'],
            'names' => ['required', 'string', 'max:5000'],
            'is_deliverable' => ['required', 'boolean'],
        ]);

        $names = collect(preg_split('/[\r\n,]+/', $data['names']))
            ->map(fn (string $name) => trim(preg_replace('/\s+/', ' ', $name)))
            ->filter(fn (string $name) => $name !== '' && mb_strlen($name) <= 80)
            ->unique(fn (string $name) => mb_strtolower($name))
            ->values();
        if ($names->isEmpty()) {
            return back()->withErrors(['names' => 'Type at least one barangay name.']);
        }

        $municipality = trim($data['municipality']);
        $existing = Barangay::where('municipality', $municipality)->pluck('name')->map(fn ($n) => mb_strtolower($n))->all();
        $added = 0;
        foreach ($names as $name) {
            if (in_array(mb_strtolower($name), $existing, true)) {
                continue;
            }
            Barangay::create([
                'name' => $name,
                'municipality' => $municipality,
                'province' => trim($data['province']),
                'is_deliverable' => $data['is_deliverable'],
            ]);
            $added++;
        }
        $skipped = $names->count() - $added;

        return back()->with('success', "{$added} barangay(s) added to {$municipality}".($skipped > 0 ? " ({$skipped} already listed)." : '.'));
    }

    /** Switch every barangay of one town on or off, e.g. stop Mabinay when moving online ordering to Tagukon. */
    public function setTown(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'municipality' => ['required', 'string', 'exists:barangays,municipality'],
            'is_deliverable' => ['required', 'boolean'],
        ]);

        $count = Barangay::where('municipality', $data['municipality'])->update(['is_deliverable' => $data['is_deliverable']]);

        return back()->with('success', "{$count} {$data['municipality']} barangay(s) are now ".($data['is_deliverable'] ? 'deliverable' : 'not deliverable').'.');
    }

    /** Remove a barangay added by mistake. One that customers saved addresses in can only be switched off. */
    public function destroyBarangay(Barangay $barangay): RedirectResponse
    {
        $inUse = CustomerAddress::where('barangay', $barangay->name)->where('municipality', $barangay->municipality)->count();
        if ($inUse > 0) {
            return back()->withErrors(['barangay' => "{$barangay->name} is used by {$inUse} saved address(es). Switch it off instead."]);
        }

        $barangay->delete();

        return back()->with('success', "{$barangay->name} removed.");
    }

    public function toggleBarangay(Barangay $barangay): RedirectResponse
    {
        $barangay->update(['is_deliverable' => ! $barangay->is_deliverable]);

        return back()->with('success', "{$barangay->name} is now ".($barangay->is_deliverable ? 'deliverable' : 'not deliverable').'.');
    }
}
