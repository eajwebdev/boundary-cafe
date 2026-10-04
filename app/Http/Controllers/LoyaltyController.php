<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\LoyaltyTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class LoyaltyController extends Controller
{
    public function card(string $token): Response
    {
        $customer = Customer::with('branch:id,name')
            ->where('loyalty_token', $token)
            ->where('loyalty_enabled', true)
            ->where('is_active', true)
            ->firstOrFail();

        return Inertia::render('Loyalty/Card', [
            'customer' => [
                'name' => $customer->name,
                'customer_number' => $customer->customer_number,
                'loyalty_token' => $customer->loyalty_token,
                'points' => $customer->loyalty_points,
                'branch' => $customer->branch?->name,
                'joined_at' => $customer->joined_at?->format('F Y'),
            ],
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:100']]);
        $code = trim($data['code']);
        $customer = Customer::where('is_active', true)->where('loyalty_enabled', true)
            ->where(fn ($query) => $query->where('loyalty_token', $code)->orWhere('customer_number', $code))
            ->firstOrFail();

        return response()->json([
            'id' => $customer->id,
            'name' => $customer->name,
            'customer_number' => $customer->customer_number,
            'contact' => $this->mask($customer->contact_number),
            'points' => $customer->loyalty_points,
        ]);
    }

    public function rotate(Customer $customer): RedirectResponse
    {
        abort_unless(Auth::user()?->isManager() || Auth::user()?->isAdmin(), 403);
        $customer->update(['loyalty_token' => (string) Str::uuid()]);

        return back()->with('success', 'A new loyalty QR code has been issued.');
    }

    public function adjust(Request $request, Customer $customer): RedirectResponse
    {
        abort_unless(Auth::user()?->isManager() || Auth::user()?->isAdmin(), 403);
        $data = $request->validate([
            'points' => ['required', 'integer', 'not_in:0', 'between:-100000,100000'],
            'reason' => ['required', 'string', 'min:5', 'max:255'],
        ]);

        $newBalance = max(0, $customer->loyalty_points + $data['points']);
        $actual = $newBalance - $customer->loyalty_points;
        $customer->update(['loyalty_points' => $newBalance]);
        LoyaltyTransaction::create([
            'customer_id' => $customer->id,
            'branch_id' => Auth::user()->branch_id ?? $customer->branch_id,
            'user_id' => Auth::id(),
            'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
            'points' => $actual,
            'balance_after' => $newBalance,
            'reason' => $data['reason'],
        ]);

        return back()->with('success', 'Loyalty points adjusted.');
    }

    private function mask(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        return str_repeat('•', max(0, strlen($value) - 4)).substr($value, -4);
    }
}
