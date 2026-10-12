<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerSocialAccount;
use App\Models\LoyaltyTransaction;
use App\Services\DeliveryZoneService;
use App\Services\LoyaltyRewardService;
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
                'has_password' => $customer->hasOnlineAccount(),
                'loyalty_points' => (int) $customer->loyalty_points,
                'orders_count' => $customer->onlineOrders()->count(),
                'active_orders_count' => $customer->onlineOrders()->active()->count(),
            ],
            'social' => [
                'available' => CustomerSocialAccount::enabledProviders(),
                'linked' => $customer->socialAccounts()->get(['provider', 'email', 'created_at'])->map(fn (CustomerSocialAccount $a) => [
                    'provider' => $a->provider,
                    'label' => CustomerSocialAccount::label($a->provider),
                    'email' => $a->email,
                    'linked_at' => $a->created_at?->toIso8601String(),
                ])->values(),
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
        $customer = $this->customer();
        // Accounts made with Google/Facebook have no password yet: they can set one without a current password.
        $hasPassword = $customer->hasOnlineAccount();
        $data = $request->validate([
            'current_password' => [$hasPassword ? 'required' : 'nullable', 'string'],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
        ]);

        if ($hasPassword && ! Hash::check($data['current_password'], $customer->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is incorrect.']);
        }

        $customer->update(['password' => $data['password']]);

        return back()->with('success', 'Password changed.');
    }

    public function rewards(LoyaltyRewardService $rewards): Response
    {
        $rewards->expireStale($this->customer());
        $customer = $this->customer()->refresh();
        $branchId = app(OnlineOrderService::class)->branch()?->id;

        return Inertia::render('Customer/Rewards', [
            'card' => [
                'name' => $customer->name,
                'customer_number' => $customer->customer_number,
                'loyalty_token' => $customer->loyalty_token,
                'card_url' => route('loyalty.card', $customer->loyalty_token),
                'masked_contact' => $customer->maskedContactNumber(),
                'points' => (int) $customer->loyalty_points,
                'reserved_points' => (int) $customer->reserved_points,
                'lifetime_earned' => (int) $customer->lifetime_points_earned,
                'lifetime_redeemed' => (int) $customer->lifetime_points_redeemed,
                'enabled' => (bool) $customer->loyalty_enabled,
                'joined_at' => $customer->joined_at?->format('M Y'),
            ],
            'tier' => $this->loyalty->tierFor($customer, $branchId),
            'rules' => $this->loyalty->rules($branchId),
            // Rewards are claimed in-store at any branch, so the catalog is not filtered by branch here.
            'catalog' => $rewards->catalog()->map(fn ($reward) => $rewards->rewardToFrontend($reward, $branchId))->values(),
            'claims' => $customer->rewardClaims()->with(['items', 'branch:id,name'])->limit(20)->get()
                ->map(fn ($claim) => $rewards->claimToCustomer($claim))->values(),
            'purchases' => $customer->sales()->with('branch:id,name')->where('status', 'completed')->latest()->limit(20)
                ->get(['id', 'receipt_number', 'branch_id', 'total', 'loyalty_points_earned', 'reward_retail_value', 'channel', 'created_at'])
                ->map(fn ($sale) => [
                    'id' => $sale->id,
                    'receipt_number' => $sale->receipt_number,
                    'branch' => $sale->branch?->name,
                    'total' => (float) $sale->total,
                    'points_earned' => (int) $sale->loyalty_points_earned,
                    'is_reward' => (float) $sale->total === 0.0 && (float) $sale->reward_retail_value > 0,
                    'channel' => $sale->channel,
                    'created_at' => $sale->created_at?->toIso8601String(),
                ])->values(),
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
