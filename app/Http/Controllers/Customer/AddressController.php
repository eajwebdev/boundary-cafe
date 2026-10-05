<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\CustomerAddress;
use App\Services\DeliveryZoneService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AddressController extends Controller
{
    private const MAX_ADDRESSES = 10;

    public function __construct(private DeliveryZoneService $zone) {}

    public function store(Request $request): RedirectResponse
    {
        $customer = Auth::guard('customer')->user();
        if ($customer->addresses()->count() >= self::MAX_ADDRESSES) {
            throw ValidationException::withMessages(['address' => 'You can save up to '.self::MAX_ADDRESSES.' addresses. Please remove one first.']);
        }

        $data = $this->validated($request);

        $address = DB::transaction(function () use ($customer, $data) {
            $isFirst = ! $customer->addresses()->exists();
            if ($isFirst || ! empty($data['is_default'])) {
                $customer->addresses()->update(['is_default' => false]);
            }

            return $customer->addresses()->create(array_merge($data, ['is_default' => $isFirst || ! empty($data['is_default'])]));
        });

        return back()->with('success', 'Address saved.')->with('saved_address_id', $address->id);
    }

    public function update(Request $request, CustomerAddress $address): RedirectResponse
    {
        $this->authorizeAddress($address);
        $data = $this->validated($request);

        DB::transaction(function () use ($address, $data) {
            if (! empty($data['is_default'])) {
                CustomerAddress::where('customer_id', $address->customer_id)->update(['is_default' => false]);
            }
            $address->update(array_merge($data, ['is_default' => ! empty($data['is_default']) || $address->is_default]));
        });

        return back()->with('success', 'Address updated.');
    }

    public function makeDefault(CustomerAddress $address): RedirectResponse
    {
        $this->authorizeAddress($address);

        DB::transaction(function () use ($address) {
            CustomerAddress::where('customer_id', $address->customer_id)->update(['is_default' => false]);
            $address->update(['is_default' => true]);
        });

        return back()->with('success', 'Default address updated.');
    }

    public function destroy(CustomerAddress $address): RedirectResponse
    {
        $this->authorizeAddress($address);

        DB::transaction(function () use ($address) {
            $wasDefault = $address->is_default;
            $customerId = $address->customer_id;
            $address->delete();
            if ($wasDefault) {
                CustomerAddress::where('customer_id', $customerId)->latest()->first()?->update(['is_default' => true]);
            }
        });

        return back()->with('success', 'Address removed.');
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'label' => ['required', 'string', Rule::in(['Home', 'Work', 'Other'])],
            'barangay' => ['required', 'string', Rule::exists('barangays', 'name')->where('is_deliverable', true)],
            'street' => ['nullable', 'string', 'max:191'],
            'landmark' => ['nullable', 'string', 'max:191'],
            'notes_for_rider' => ['nullable', 'string', 'max:255'],
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'formatted_address' => ['nullable', 'string', 'max:255'],
            'is_default' => ['nullable', 'boolean'],
        ], ['barangay.exists' => 'We only deliver to Mabinay barangays.']);

        if (! $this->zone->containsPoint((float) $data['lat'], (float) $data['lng'])) {
            throw ValidationException::withMessages(['lat' => 'Sorry, we only deliver within Mabinay. Move the pin inside the delivery area.']);
        }

        return $data;
    }

    private function authorizeAddress(CustomerAddress $address): void
    {
        // 404 rather than 403 so other customers' address IDs are not revealed.
        abort_unless((int) $address->customer_id === (int) Auth::guard('customer')->id(), 404);
    }
}
