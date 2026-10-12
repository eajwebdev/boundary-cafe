<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\User;
use App\Services\DeliveryZoneService;
use App\Services\RiderDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Rider Dashboard (menu 49): the rider's deliveries, ones they can take, the cash they hold,
 * and their phone's live GPS position, which staff and the customer see on a map.
 */
class DeliveryController extends Controller
{
    public function __construct(private RiderDeliveryService $deliveries, private DeliveryZoneService $zone) {}

    public function index(Request $request): Response
    {
        $rider = $this->rider($request);

        return Inertia::render('Rider/Dashboard', $this->dashboardData($rider) + [
            'store' => $this->storeLocation($rider),
        ]);
    }

    /** Polled by the dashboard every few seconds. */
    public function feed(Request $request): JsonResponse
    {
        return response()->json($this->dashboardData($this->rider($request)));
    }

    public function claim(Request $request, OnlineOrder $onlineOrder): JsonResponse
    {
        $order = $this->deliveries->claim($onlineOrder, $this->rider($request));

        return response()->json(['message' => "{$order->order_number} is yours. Collect it when it is ready."]);
    }

    public function pickUp(Request $request, OnlineOrder $onlineOrder): JsonResponse
    {
        $order = $this->deliveries->pickUp($onlineOrder, $this->rider($request));

        return response()->json(['message' => "{$order->order_number}: on the way. The customer can now see you on the map."]);
    }

    public function deliver(Request $request, OnlineOrder $onlineOrder): JsonResponse
    {
        $order = $this->deliveries->deliver($onlineOrder, $this->rider($request));
        $collected = $order->payment_method === 'cod' ? ' Cash collected: ₱'.number_format((float) $order->total, 2).'.' : '';

        return response()->json(['message' => "{$order->order_number} delivered.{$collected}"]);
    }

    public function position(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['nullable', 'numeric', 'min:0'],
            'heading' => ['nullable', 'numeric', 'between:0,360'],
        ]);

        $this->deliveries->recordPosition(
            $this->rider($request),
            (float) $data['lat'],
            (float) $data['lng'],
            isset($data['accuracy']) ? (int) min(65535, round((float) $data['accuracy'])) : null,
            isset($data['heading']) ? (int) round((float) $data['heading']) % 360 : null,
        );

        return response()->json(['ok' => true]);
    }

    private function rider(Request $request): User
    {
        $user = $request->user();
        abort_unless($user->isRider() && $user->branch_id, 403, 'Only riders assigned to a branch can deliver.');

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function dashboardData(User $rider): array
    {
        $base = OnlineOrder::with('items')
            ->where('branch_id', $rider->branch_id)
            ->where('fulfillment_type', OnlineOrder::FULFILLMENT_DELIVERY);

        $mine = (clone $base)->where('rider_id', $rider->id)->active()->orderBy('created_at')->get();
        $available = (clone $base)->whereNull('rider_id')->whereIn('status', RiderDeliveryService::ASSIGNABLE_STATUSES)->orderBy('created_at')->get();
        $deliveredToday = (clone $base)->where('rider_id', $rider->id)
            ->where('status', OnlineOrder::STATUS_COMPLETED)
            ->where('completed_at', '>=', today())
            ->latest('completed_at')
            ->get();

        return [
            'mine' => $mine->map(fn (OnlineOrder $o) => $this->card($o))->values(),
            'available' => $available->map(fn (OnlineOrder $o) => $this->card($o))->values(),
            'delivered_today' => $deliveredToday->map(fn (OnlineOrder $o) => [
                'id' => $o->id,
                'order_number' => $o->order_number,
                'customer_name' => $o->contact_name,
                'barangay' => $o->barangay,
                'total' => (float) $o->total,
                'payment_method' => $o->payment_method,
                'completed_at' => $o->completed_at?->toIso8601String(),
                'cash_remitted' => $o->cash_remitted_at !== null,
            ])->values(),
            'cash_on_hand' => $this->deliveries->cashOnHand($rider),
            'position' => $rider->riderPosition()->first()?->toMapArray(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function card(OnlineOrder $o): array
    {
        return [
            'id' => $o->id,
            'order_number' => $o->order_number,
            'status' => $o->status,
            'status_label' => OnlineOrder::statusLabel($o->status),
            'customer_name' => $o->contact_name,
            'contact_number' => $o->contact_number,
            'barangay' => $o->barangay,
            'address' => $o->addressSummary(),
            'landmark' => $o->landmark,
            'notes_for_rider' => $o->notes_for_rider,
            'customer_note' => $o->customer_note,
            'lat' => $o->lat,
            'lng' => $o->lng,
            'payment_method' => $o->payment_method,
            'total' => (float) $o->total,
            'collect' => $o->payment_method === 'cod' ? (float) $o->total : 0.0,
            'estimated_ready_at' => $o->estimated_ready_at?->toIso8601String(),
            'created_at' => $o->created_at?->toIso8601String(),
            'items' => $o->items->map(fn ($i) => [
                'name' => $i->product_name,
                'variant' => $i->variant_name,
                'quantity' => $i->quantity,
                'note' => $i->note,
            ])->values(),
        ];
    }

    /**
     * Where riders collect orders: the branch's saved location, or the delivery zone centre.
     *
     * @return array{name: string, lat: float, lng: float}
     */
    private function storeLocation(User $rider): array
    {
        $branch = $rider->branch;
        $center = $this->zone->center();

        return [
            'name' => $branch?->display_name ?? 'Store',
            'lat' => (float) ($branch?->latitude ?? $center['lat']),
            'lng' => (float) ($branch?->longitude ?? $center['lng']),
        ];
    }
}
