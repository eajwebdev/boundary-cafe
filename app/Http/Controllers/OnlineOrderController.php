<?php

namespace App\Http\Controllers;

use App\Models\OnlineOrder;
use App\Services\OnlineOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Staff board for customer online orders (menu 40).
 */
class OnlineOrderController extends Controller
{
    public function __construct(private OnlineOrderService $online) {}

    public function index(): Response
    {
        return Inertia::render('OnlineOrders/Index', [
            'board' => $this->boardData(),
            'store' => [
                'status' => $this->online->storeStatus($this->online->branch()),
            ],
        ]);
    }

    /** Polled by the board every ~15s. */
    public function feed(): JsonResponse
    {
        return response()->json($this->boardData());
    }

    /** Lightweight count for the sidebar badge / chime. */
    public function pendingCount(): JsonResponse
    {
        $query = OnlineOrder::query()->where('status', OnlineOrder::STATUS_PENDING);
        if ($branchId = $this->scopedBranchId()) {
            $query->where('branch_id', $branchId);
        }

        return response()->json([
            'pending' => $query->count(),
            'latest_id' => (int) (clone $query)->max('id'),
        ]);
    }

    public function transition(Request $request, OnlineOrder $onlineOrder): RedirectResponse|JsonResponse
    {
        $this->authorizeBranch($onlineOrder->branch_id);

        $data = $request->validate([
            'status' => ['required', Rule::in([
                OnlineOrder::STATUS_ACCEPTED, OnlineOrder::STATUS_PREPARING, OnlineOrder::STATUS_READY,
                OnlineOrder::STATUS_OUT_FOR_DELIVERY, OnlineOrder::STATUS_COMPLETED,
                OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED,
            ])],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $order = $this->online->transition($onlineOrder, $data['status'], Auth::user(), 'staff', $data['reason'] ?? null);

        if ($request->wantsJson()) {
            return response()->json(['order' => $this->card($order->fresh(['items', 'customer']))]);
        }

        return back()->with('success', "{$order->order_number}: ".OnlineOrder::statusLabel($order->status));
    }

    private function boardData(): array
    {
        $branchId = $this->scopedBranchId();
        $base = OnlineOrder::with(['items', 'customer:id,name,contact_number,loyalty_points', 'handler:id,fname,lname'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $active = (clone $base)->active()->orderBy('created_at')->get();
        $finishedToday = (clone $base)
            ->whereIn('status', OnlineOrder::FINAL_STATUSES)
            ->where('updated_at', '>=', today())
            ->latest('updated_at')
            ->limit(30)
            ->get();

        return [
            'active' => $active->map(fn ($o) => $this->card($o))->values(),
            'finished' => $finishedToday->map(fn ($o) => $this->card($o))->values(),
            'counts' => collect(OnlineOrder::ACTIVE_STATUSES)->mapWithKeys(fn ($s) => [$s => $active->where('status', $s)->count()]),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function card(OnlineOrder $o): array
    {
        $allowed = $o->allowedTransitions('staff');

        return [
            'id' => $o->id,
            'order_number' => $o->order_number,
            'status' => $o->status,
            'status_label' => OnlineOrder::statusLabel($o->status),
            'fulfillment_type' => $o->fulfillment_type,
            'payment_method' => $o->payment_method,
            'customer_name' => $o->contact_name,
            'contact_number' => $o->contact_number,
            'barangay' => $o->barangay,
            'address' => $o->addressSummary(),
            'landmark' => $o->landmark,
            'notes_for_rider' => $o->notes_for_rider,
            'lat' => $o->lat,
            'lng' => $o->lng,
            'customer_note' => $o->customer_note,
            'subtotal' => (float) $o->subtotal,
            'promo_label' => $o->promo_label,
            'promo_discount' => (float) $o->promo_discount,
            'vat_amount' => (float) $o->vat_amount,
            'loyalty_discount' => (float) $o->loyalty_discount,
            'loyalty_points_redeemed' => (int) $o->loyalty_points_redeemed,
            'delivery_fee' => (float) $o->delivery_fee,
            'total' => (float) $o->total,
            'cancel_reason' => $o->cancel_reason,
            'handled_by' => $o->handler ? trim($o->handler->fname.' '.$o->handler->lname) : null,
            'sale_id' => $o->sale_id,
            'created_at' => $o->created_at?->toIso8601String(),
            'updated_at' => $o->updated_at?->toIso8601String(),
            'estimated_ready_at' => $o->estimated_ready_at?->toIso8601String(),
            'next_status' => $o->nextStatus(),
            'next_label' => $o->nextStatus() ? OnlineOrder::statusLabel($o->nextStatus()) : null,
            'can_cancel' => in_array(OnlineOrder::STATUS_CANCELLED, $allowed, true),
            'can_reject' => in_array(OnlineOrder::STATUS_REJECTED, $allowed, true),
            'items' => $o->items->map(fn ($i) => [
                'name' => $i->product_name,
                'variant' => $i->variant_name,
                'quantity' => $i->quantity,
                'price' => (float) $i->price,
                'total' => (float) $i->total,
                'note' => $i->note,
            ])->values(),
        ];
    }
}
