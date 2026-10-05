<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\CustomerAddress;
use App\Services\DeliveryZoneService;
use App\Services\OnlineOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class CheckoutController extends Controller
{
    public function __construct(private OnlineOrderService $online, private DeliveryZoneService $zone) {}

    public function show(): Response
    {
        $customer = Auth::guard('customer')->user();
        $branch = $this->online->branch();

        return Inertia::render('Customer/Checkout', [
            'addresses' => $customer->addresses()->get()->map(fn (CustomerAddress $a) => $a->toFrontend())->values(),
            'zone' => $this->zone->toFrontend(),
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
            'store' => [
                'status' => $this->online->storeStatus($branch),
                'settings' => $this->online->settings($branch),
                'branch' => $branch ? ['name' => $branch->name, 'address' => $branch->address] : null,
            ],
            'contact' => ['name' => $customer->name, 'contact_number' => $customer->contact_number],
        ]);
    }

    /** Live price breakdown for the cart (JSON). Rate-limited in routes. */
    public function quote(Request $request): JsonResponse
    {
        $data = $this->validateCart($request);

        return response()->json($this->online->quote(Auth::guard('customer')->user(), $data));
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validateCart($request) + $request->validate([
            'address_id' => ['nullable', 'integer'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'contact_number' => ['nullable', 'string', 'max:20'],
        ]);

        $order = $this->online->place(Auth::guard('customer')->user(), $data);

        return redirect()
            ->route('customer.orders.show', $order->order_number)
            ->with('success', 'Order placed! We will confirm it shortly.')
            ->with('order_placed', $order->order_number);
    }

    private function validateCart(Request $request): array
    {
        return $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:40'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.variant_id' => ['nullable', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'items.*.note' => ['nullable', 'string', 'max:255'],
            'fulfillment_type' => ['required', 'in:delivery,pickup'],
            'promo_code' => ['nullable', 'string', 'max:50'],
            'loyalty_points' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);
    }
}
