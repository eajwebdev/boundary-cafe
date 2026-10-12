<?php

namespace App\Http\Controllers\Rider;

use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Models\User;
use App\Services\DeliveryZoneService;
use App\Services\RiderDeliveryService;
use App\Services\RoutingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Rider Dashboard (menu 49): the rider's deliveries, ones they can take, the cash they hold,
 * and their phone's live GPS position, which staff and the customer see on a map.
 */
class DeliveryController extends Controller
{
    public function __construct(private RiderDeliveryService $deliveries, private DeliveryZoneService $zone, private RoutingService $routing) {}

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

    /** Road route for in-app navigation; `route` is null when routing is unavailable (the app falls back to a straight line). */
    public function route(Request $request): JsonResponse
    {
        $this->rider($request);
        $data = $request->validate([
            'from_lat' => ['required', 'numeric', 'between:-90,90'],
            'from_lng' => ['required', 'numeric', 'between:-180,180'],
            'to_lat' => ['required', 'numeric', 'between:-90,90'],
            'to_lng' => ['required', 'numeric', 'between:-180,180'],
        ]);

        return response()->json([
            'route' => $this->routing->route((float) $data['from_lat'], (float) $data['from_lng'], (float) $data['to_lat'], (float) $data['to_lng']),
        ]);
    }

    /**
     * The rider's own deliveries with filters: status (delivered / in progress / cancelled) and a date
     * range on the day the delivery finished (or was assigned, for ones still in progress).
     */
    public function history(Request $request): JsonResponse
    {
        $rider = $this->rider($request);
        $data = $request->validate([
            'status' => ['nullable', 'in:all,delivered,active,cancelled'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);
        $status = $data['status'] ?? 'all';
        $day = 'COALESCE(completed_at, cancelled_at, rider_assigned_at, created_at)';

        $query = OnlineOrder::query()
            ->where('rider_id', $rider->id)
            ->when($status === 'delivered', fn ($q) => $q->where('status', OnlineOrder::STATUS_COMPLETED))
            ->when($status === 'active', fn ($q) => $q->active())
            ->when($status === 'cancelled', fn ($q) => $q->whereIn('status', [OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED]))
            ->when($data['from'] ?? null, fn ($q, $from) => $q->whereRaw("{$day} >= ?", [Carbon::parse($from)->startOfDay()]))
            ->when($data['to'] ?? null, fn ($q, $to) => $q->whereRaw("{$day} <= ?", [Carbon::parse($to)->endOfDay()]));

        $delivered = (clone $query)->where('status', OnlineOrder::STATUS_COMPLETED);
        $cod = (clone $delivered)->where('payment_method', 'cod');

        $page = (clone $query)->with('items')->orderByRaw("{$day} DESC")->orderByDesc('id')->paginate(20);

        return response()->json([
            'summary' => [
                'deliveries' => (clone $query)->count(),
                'delivered' => (clone $delivered)->count(),
                'sales' => round((float) (clone $delivered)->sum('total'), 2),
                'cash_collected' => round((float) (clone $cod)->sum('total'), 2),
                'cash_handed_over' => round((float) (clone $cod)->whereNotNull('cash_remitted_at')->sum('total'), 2),
            ],
            'rows' => collect($page->items())->map(fn (OnlineOrder $o) => [
                'id' => $o->id,
                'order_number' => $o->order_number,
                'status' => $o->status,
                'status_label' => OnlineOrder::statusLabel($o->status),
                'customer_name' => $o->contact_name,
                'barangay' => $o->barangay,
                'total' => (float) $o->total,
                'payment_method' => $o->payment_method,
                'cash_remitted' => $o->cash_remitted_at !== null,
                'item_count' => (int) $o->items->sum('quantity'),
                'cancel_reason' => $o->cancel_reason,
                'assigned_at' => $o->rider_assigned_at?->toIso8601String(),
                'completed_at' => $o->completed_at?->toIso8601String(),
                'cancelled_at' => $o->cancelled_at?->toIso8601String(),
            ])->values(),
            'page' => $page->currentPage(),
            'has_more' => $page->hasMorePages(),
        ]);
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
