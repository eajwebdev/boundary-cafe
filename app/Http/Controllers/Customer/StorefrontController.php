<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\OnlineOrder;
use App\Models\SystemSetting;
use App\Services\LoyaltyService;
use App\Services\OnlineOrderService;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The public storefront at "/". Guests can browse; ordering requires a customer account.
 */
class StorefrontController extends Controller
{
    public function __construct(private OnlineOrderService $online, private LoyaltyService $loyalty) {}

    public function index(): Response
    {
        $branch = $this->online->branch();
        $customer = Auth::guard('customer')->user();
        $catalog = $branch ? $this->online->catalog($branch) : ['categories' => [], 'products' => []];

        $activeOrder = $customer
            ? OnlineOrder::where('customer_id', $customer->id)->active()->latest()->first()
            : null;

        return Inertia::render('Landing/Index', [
            'store' => [
                'name' => SystemSetting::businessName($branch?->id),
                'logo' => SystemSetting::logoUrl($branch?->id),
                'branch' => $branch ? [
                    'name' => $branch->name,
                    'location' => $branch->location,
                    'address' => $branch->address,
                    'phone' => $branch->phone ?: SystemSetting::get('general.phone', $branch->id, ''),
                ] : null,
                'status' => $this->online->storeStatus($branch),
                'settings' => $this->online->settings($branch),
            ],
            'categories' => $catalog['categories'],
            'products' => $catalog['products'],
            'storefrontPromos' => $this->online->storefrontPromos(),
            'barangays' => fn () => Barangay::deliverable()->ordered()->pluck('name'),
            'loyaltyRules' => [
                'enabled' => $this->loyalty->enabled($branch?->id),
                'spend_per_point' => $this->loyalty->rules($branch?->id)['spend_per_point'],
                'birthday_bonus' => $this->loyalty->rules($branch?->id)['birthday_bonus'],
            ],
            'activeOrder' => $activeOrder ? [
                'order_number' => $activeOrder->order_number,
                'status' => $activeOrder->status,
                'status_label' => OnlineOrder::statusLabel($activeOrder->status),
                'total' => (float) $activeOrder->total,
            ] : null,
        ]);
    }
}
