<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\OnlineOrder;
use App\Services\OnlineOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class OrderController extends Controller
{
    public function __construct(private OnlineOrderService $online) {}

    public function index(): Response
    {
        $orders = OnlineOrder::with('items')
            ->where('customer_id', Auth::guard('customer')->id())
            ->latest()
            ->paginate(15)
            ->through(fn (OnlineOrder $o) => [
                'order_number' => $o->order_number,
                'status' => $o->status,
                'status_label' => OnlineOrder::statusLabel($o->status),
                'is_active' => $o->isActive(),
                'fulfillment_type' => $o->fulfillment_type,
                'total' => (float) $o->total,
                'item_count' => (int) $o->items->sum('quantity'),
                'items_preview' => $o->items->take(3)->map(fn ($i) => "{$i->quantity}× {$i->product_name}")->implode(', '),
                'created_at' => $o->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Customer/Orders', ['orders' => $orders]);
    }

    public function show(string $orderNumber): Response
    {
        return Inertia::render('Customer/OrderTrack', [
            'order' => $this->find($orderNumber)->toTrackingArray(),
        ]);
    }

    /** Lightweight JSON for live tracking (polled every ~10s while active). */
    public function status(string $orderNumber): JsonResponse
    {
        return response()->json($this->find($orderNumber)->toTrackingArray());
    }

    public function cancel(Request $request, string $orderNumber): RedirectResponse
    {
        $order = $this->find($orderNumber);
        $reason = trim((string) $request->input('reason', '')) ?: 'Cancelled by customer';

        $this->online->transition($order, OnlineOrder::STATUS_CANCELLED, null, 'customer', mb_substr($reason, 0, 255));

        return back()->with('success', 'Your order has been cancelled.');
    }

    /** Only the owner can see an order; everyone else gets a 404. */
    private function find(string $orderNumber): OnlineOrder
    {
        return OnlineOrder::where('order_number', $orderNumber)
            ->where('customer_id', Auth::guard('customer')->id())
            ->firstOrFail();
    }
}
