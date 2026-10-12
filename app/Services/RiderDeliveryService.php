<?php

namespace App\Services;

use App\Models\OnlineOrder;
use App\Models\RiderPosition;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Delivery riders: who carries each delivery, the rider's own steps (picked up → delivered),
 * the cash they collect on delivery until it is handed back, and their live GPS position.
 * Status changes still go through OnlineOrderService::transition(), so the order rules stay in one place.
 */
class RiderDeliveryService
{
    /** Deliveries a rider may be given or take: confirmed but not yet on the road. */
    public const ASSIGNABLE_STATUSES = [OnlineOrder::STATUS_ACCEPTED, OnlineOrder::STATUS_PREPARING, OnlineOrder::STATUS_READY];

    public function __construct(private OnlineOrderService $online) {}

    /** Active riders of a branch, for the staff board's rider picker and map. */
    public function riders(int $branchId): Collection
    {
        return User::riders()->where('branch_id', $branchId)->with('riderPosition')->orderBy('fname')->get();
    }

    /** Staff give a delivery to a rider of the same branch, or take it back with null. */
    public function assign(OnlineOrder $order, ?User $rider): OnlineOrder
    {
        return DB::transaction(function () use ($order, $rider) {
            $order = OnlineOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssignable($order);

            if ($rider && (! $rider->isRider() || $rider->branch_id !== $order->branch_id)) {
                throw ValidationException::withMessages(['rider_id' => 'Choose a rider from this branch.']);
            }

            $order->update(['rider_id' => $rider?->id, 'rider_assigned_at' => $rider ? now() : null]);

            return $order;
        });
    }

    /** A rider takes an unassigned delivery for themselves; the first tap wins. */
    public function claim(OnlineOrder $order, User $rider): OnlineOrder
    {
        return DB::transaction(function () use ($order, $rider) {
            $order = OnlineOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssignable($order);

            if ($order->branch_id !== $rider->branch_id) {
                abort(404);
            }
            if ($order->rider_id && $order->rider_id !== $rider->id) {
                throw ValidationException::withMessages(['order' => 'Another rider already took this delivery.']);
            }

            $order->update(['rider_id' => $rider->id, 'rider_assigned_at' => now()]);

            return $order;
        });
    }

    /** The rider collected the food from the counter and is on the way. */
    public function pickUp(OnlineOrder $order, User $rider): OnlineOrder
    {
        $this->ensureOwnDelivery($order, $rider);

        return $this->online->transition($order, OnlineOrder::STATUS_OUT_FOR_DELIVERY, $rider, 'rider');
    }

    /** Handed to the customer: the sale is recorded under the rider, who now holds any cash collected. */
    public function deliver(OnlineOrder $order, User $rider): OnlineOrder
    {
        $this->ensureOwnDelivery($order, $rider);

        if ($order->status !== OnlineOrder::STATUS_OUT_FOR_DELIVERY) {
            throw ValidationException::withMessages(['status' => 'Tap "Picked up" before marking this order delivered.']);
        }

        return $this->online->transition($order, OnlineOrder::STATUS_COMPLETED, $rider, 'rider');
    }

    /** Cash-on-delivery money the rider has collected and not yet handed back. */
    public function cashOnHand(User $rider): float
    {
        return round((float) OnlineOrder::cashWithRider($rider->id)->sum('total'), 2);
    }

    /**
     * Staff received the rider's cash: every delivered COD order they hold is marked remitted.
     *
     * @return array{orders: int, amount: float}
     */
    public function remit(User $rider, User $receivedBy): array
    {
        return DB::transaction(function () use ($rider, $receivedBy) {
            $orders = OnlineOrder::cashWithRider($rider->id)->lockForUpdate()->get(['id', 'total']);

            OnlineOrder::whereIn('id', $orders->pluck('id'))->update([
                'cash_remitted_at' => now(),
                'cash_remitted_to' => $receivedBy->id,
            ]);

            return ['orders' => $orders->count(), 'amount' => round((float) $orders->sum('total'), 2)];
        });
    }

    /** Store the rider phone's latest GPS fix. */
    public function recordPosition(User $rider, float $lat, float $lng, ?int $accuracyMeters, ?int $heading): RiderPosition
    {
        return RiderPosition::updateOrCreate(['user_id' => $rider->id], [
            'lat' => $lat,
            'lng' => $lng,
            'accuracy_m' => $accuracyMeters,
            'heading' => $heading,
            'recorded_at' => now(),
        ]);
    }

    private function ensureAssignable(OnlineOrder $order): void
    {
        if (! $order->isDelivery()) {
            throw ValidationException::withMessages(['order' => 'Only delivery orders go to a rider.']);
        }
        if (! in_array($order->status, self::ASSIGNABLE_STATUSES, true)) {
            throw ValidationException::withMessages(['order' => 'This delivery can no longer change rider.']);
        }
    }

    /** Riders act only on deliveries given to them; anything else looks like it does not exist. */
    private function ensureOwnDelivery(OnlineOrder $order, User $rider): void
    {
        if ($order->rider_id !== $rider->id) {
            abort(404);
        }
    }
}
