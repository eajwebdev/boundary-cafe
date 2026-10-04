<?php

namespace App\Http\Controllers;

use App\Models\PettyCashFund;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;

class PettyCashFundController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);

        $validated = $request->validate([
            'fund_name'   => ['required', 'string', 'max:100'],
            'fund_amount' => ['required', 'numeric', 'min:100'],
            'notes'       => ['nullable', 'string', 'max:500'],
        ]);

        $fund = PettyCashFund::create([
            'branch_id'       => $user->branch_id,
            'managed_by'      => $user->id,
            'fund_name'       => trim($validated['fund_name']),
            'fund_amount'     => $validated['fund_amount'],
            'current_balance' => $validated['fund_amount'],
            'notes'           => $validated['notes'] ?? null,
            'status'          => 'active',
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'petty_cash_fund_created',
            'subject_type' => PettyCashFund::class,
            'subject_id'   => $fund->id,
            'properties'   => [
                'fund_name'      => $fund->fund_name,
                'initial_amount' => (float) $validated['fund_amount'],
            ],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Petty Cash Fund \"{$fund->fund_name}\" created with initial balance ₱" . number_format($fund->fund_amount, 2) . ".",
        ]);
    }

    public function close(Request $request, PettyCashFund $fund): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);
        $this->authorizeBranch($fund->branch_id);

        $fund->close();

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'petty_cash_fund_closed',
            'subject_type' => PettyCashFund::class,
            'subject_id'   => $fund->id,
            'properties'   => ['fund_name' => $fund->fund_name],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Petty Cash Fund \"{$fund->fund_name}\" has been closed.",
        ]);
    }
}