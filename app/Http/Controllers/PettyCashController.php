<?php

namespace App\Http\Controllers;

use App\Models\PettyCashFund;
use App\Models\PettyCashVoucher;
use App\Models\ExpenseCategory;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class PettyCashController extends Controller
{
    public function index(): Response
    {
        $user = Auth::user();
        $branchId = $user->branch_id;

        $isManager = $user->hasElevatedAccess() || 
                     in_array($user->role ?? '', ['manager', 'administrator', 'super_admin']);

        $activeFund = PettyCashFund::activeForBranch($branchId);

        $vouchers = PettyCashVoucher::with([
            'fund', 
            'requestedBy:id,fname,lname', 
            'approvedBy:id,fname,lname', 
            'expenseCategory'
        ])
            ->whereHas('fund', fn($q) => $q->where('branch_id', $branchId))
            ->latest()
            ->paginate(15);

        $categories = ExpenseCategory::active()->get(['id', 'name']);

        return Inertia::render('PettyCash/Index', [
            'active_fund'   => $activeFund ? [
                'id'              => $activeFund->id,
                'fund_name'       => $activeFund->fund_name,
                'fund_amount'     => (float) $activeFund->fund_amount,
                'current_balance' => (float) $activeFund->current_balance,
            ] : null,
            'vouchers'      => $vouchers,
            'categories'    => $categories,
            'is_manager'    => $isManager,
            'current_user'  => [
                'id'   => $user->id,
                'name' => trim(($user->fname ?? '') . ' ' . ($user->lname ?? '')),
                'role' => $user->role ?? 'unknown',
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();
        $branchId = $user->branch_id;

        $validated = $request->validate([
            'fund_id'             => ['required', 'exists:petty_cash_funds,id'],
            'voucher_type'        => ['required', 'in:withdrawal,replenishment'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'expense_category_id' => ['required_if:voucher_type,withdrawal', 'nullable', 'exists:expense_categories,id'],
            'payee'               => ['required', 'string', 'max:150'],
            'purpose'             => ['required', 'string', 'max:500'],
        ]);

        $fund = PettyCashFund::where('id', $validated['fund_id'])
            ->where('branch_id', $branchId)
            ->firstOrFail();

        if (!$fund->isActive()) {
            return back()->withErrors(['fund_id' => 'This petty cash fund is no longer active.']);
        }

        $voucher = PettyCashVoucher::create([
            'petty_cash_fund_id'  => $validated['fund_id'],
            'requested_by'        => $user->id,
            'voucher_type'        => $validated['voucher_type'],
            'amount'              => $validated['amount'],
            'expense_category_id' => $validated['expense_category_id'] ?? null,
            'payee'               => trim($validated['payee']),
            'purpose'             => trim($validated['purpose']),
            'status'              => 'pending',
        ]);

        try {
            $voucher->approve($user->id);
        } catch (\RuntimeException $e) {
            // Approval failed (e.g. insufficient balance) — delete the just-created pending voucher
            $voucher->delete();
            return back()->withErrors(['amount' => $e->getMessage()]);
        }

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'petty_cash_voucher_created',
            'subject_type' => PettyCashVoucher::class,
            'subject_id'   => $voucher->id,
            'properties'   => [
                'voucher_number' => $voucher->voucher_number,
                'type'           => $validated['voucher_type'],
                'amount'         => (float) $validated['amount'],
                'purpose'        => $validated['purpose'],
            ],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Petty cash voucher #{$voucher->voucher_number} recorded.",
        ]);
    }

    public function approve(Request $request, PettyCashVoucher $voucher): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess() && !in_array(strtolower($user->role ?? ''), ['manager', 'administrator', 'super_admin'])) {
            abort(403, 'You do not have permission to approve vouchers.');
        }
        $voucher->loadMissing('fund');
        $this->authorizeBranch($voucher->fund?->branch_id);

        if ($voucher->status !== 'pending') {
            return back()->withErrors(['error' => 'This voucher is no longer pending.']);
        }

        try {
            $voucher->approve($user->id);
        } catch (\RuntimeException $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }

        return back()->with('message', [
            'type' => 'success',
            'text' => "Voucher #{$voucher->voucher_number} has been approved successfully.",
        ]);
    }

    public function reject(Request $request, PettyCashVoucher $voucher): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess() && !in_array(strtolower($user->role ?? ''), ['manager', 'administrator', 'super_admin'])) {
            abort(403, 'You do not have permission to reject vouchers.');
        }
        $voucher->loadMissing('fund');
        $this->authorizeBranch($voucher->fund?->branch_id);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $voucher->reject($user->id, $validated['reason']);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Voucher #{$voucher->voucher_number} has been rejected.",
        ]);
    }
}