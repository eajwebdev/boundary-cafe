<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\LoyaltyRewardClaim;
use App\Services\LoyaltyRewardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Customer side of reward claiming: pick rewards → hold points → show the QR at any branch.
 */
class RewardClaimController extends Controller
{
    public function __construct(private LoyaltyRewardService $rewards) {}

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.reward_id' => ['required', 'integer', 'exists:loyalty_rewards,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:'.LoyaltyRewardService::MAX_QUANTITY],
        ]);

        $claim = $this->rewards->claim($this->customer(), $data['items']);

        return redirect()->route('customer.rewards.claims.show', $claim->code)
            ->with('success', 'Your reward is ready. Show this QR at the counter.');
    }

    public function show(string $code): Response
    {
        $claim = $this->ownedClaim($code);
        if ($claim->isReserved() && $claim->isPastExpiry()) {
            $this->rewards->expireStale($this->customer());
            $claim->refresh();
        }

        return Inertia::render('Customer/RewardClaim', [
            'claim' => $this->rewards->claimToCustomer($claim),
        ]);
    }

    /** Lets the QR screen notice when the cashier has scanned and completed the claim. */
    public function status(string $code): JsonResponse
    {
        $claim = $this->ownedClaim($code);
        if ($claim->isReserved() && $claim->isPastExpiry()) {
            $this->rewards->expireStale($this->customer());
            $claim->refresh();
        }

        return response()->json(['status' => $claim->status, 'status_label' => LoyaltyRewardClaim::statusLabel($claim->status)]);
    }

    public function cancel(string $code): RedirectResponse
    {
        $claim = $this->ownedClaim($code);
        if (! $this->rewards->cancel($claim)) {
            return back()->with('error', 'This reward can no longer be cancelled.');
        }

        return redirect()->route('customer.rewards')->with('success', "Cancelled — your {$claim->points} points are back.");
    }

    /** The daily rewards popup was shown; do not show it again today. */
    public function popupSeen(): JsonResponse
    {
        $this->customer()->forceFill(['rewards_popup_seen_on' => today()])->save();

        return response()->json(['ok' => true]);
    }

    private function customer(): Customer
    {
        return Auth::guard('customer')->user();
    }

    private function ownedClaim(string $code): LoyaltyRewardClaim
    {
        return LoyaltyRewardClaim::with('items')
            ->where('customer_id', $this->customer()->id)
            ->where('code', strtoupper($code))
            ->firstOrFail();
    }
}
