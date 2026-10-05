<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\LoyaltyTransaction;
use App\Services\DeliveryZoneService;
use App\Services\LoyaltyService;
use App\Services\OnlineOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AccountController extends Controller
{
    public function __construct(private LoyaltyService $loyalty, private DeliveryZoneService $zone) {}

    private function customer(): Customer
    {
        return Auth::guard('customer')->user();
    }

    public function show(): Response
    {
        $customer = $this->customer();

        return Inertia::render('Customer/Account', [
            'profile' => [
                'name' => $customer->name,
                'contact_number' => $customer->contact_number,
                'email' => $customer->email,
                'barangay' => $customer->barangay,
                'birthday' => $customer->birthday?->toDateString(),
                'customer_number' => $customer->customer_number,
                'joined_at' => $customer->joined_at?->toDateString(),
            ],
            'addresses' => $customer->addresses()->get()->map(fn (CustomerAddress $a) => $a->toFrontend())->values(),
            'zone' => $this->zone->toFrontend(),
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $customer = $this->customer();
        $request->merge(['contact_number' => Customer::normalisePhone($request->input('contact_number'))]);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'contact_number' => ['required', 'regex:/^09\d{9}$/', Rule::unique('customers', 'contact_number')->ignore($customer->id)],
            'email' => ['required', 'email:rfc', 'max:120', Rule::unique('customers', 'email')->ignore($customer->id)],
            'barangay' => ['required', Rule::exists('barangays', 'name')->where('is_deliverable', true)],
            'birthday' => ['nullable', 'date', 'before:today'],
        ], ['contact_number.regex' => 'Enter a valid PH mobile number, e.g. 0917 123 4567.']);

        // Birthday can only be set once, so the birthday bonus cannot be farmed.
        if ($customer->birthday && ($data['birthday'] ?? null) && $customer->birthday->toDateString() !== $data['birthday']) {
            throw ValidationException::withMessages(['birthday' => 'Your birthday is already on file. Please ask the cafe to correct it.']);
        }

        $customer->update($data);

        return back()->with('success', 'Profile updated.');
    }

    public function updatePassword(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);

        $customer = $this->customer();
        if (! Hash::check($data['current_password'], $customer->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }

        $customer->update(['password' => $data['password']]);

        return back()->with('success', 'Password changed.');
    }

    public function rewards(): Response
    {
        $customer = $this->customer();
        $branchId = app(OnlineOrderService::class)->branch()?->id;

        return Inertia::render('Customer/Rewards', [
            'card' => [
                'name' => $customer->name,
                'customer_number' => $customer->customer_number,
                'loyalty_token' => $customer->loyalty_token,
                'card_url' => route('loyalty.card', $customer->loyalty_token),
                'points' => (int) $customer->loyalty_points,
                'lifetime_earned' => (int) $customer->lifetime_points_earned,
                'lifetime_redeemed' => (int) $customer->lifetime_points_redeemed,
                'enabled' => (bool) $customer->loyalty_enabled,
            ],
            'tier' => $this->loyalty->tierFor($customer, $branchId),
            'rules' => $this->loyalty->rules($branchId),
            'transactions' => $customer->loyaltyTransactions()->limit(50)->get()->map(fn (LoyaltyTransaction $t) => [
                'id' => $t->id,
                'type' => $t->type,
                'points' => (int) $t->points,
                'balance_after' => (int) $t->balance_after,
                'reason' => $t->reason,
                'created_at' => $t->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }
}
