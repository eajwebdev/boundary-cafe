<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\InstallmentPayment;
use App\Models\InstallmentPlan;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class InstallmentController extends Controller
{
    public function index(Request $request): Response
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;

        $status = $request->input('status', 'active');

        $plans = InstallmentPlan::with(['sale:id,receipt_number,created_at', 'user:id,fname,lname'])
            ->forBranch($branchId)
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->latest()
            ->paginate(20)
            ->withQueryString();

        $counts = [
            'active'    => InstallmentPlan::forBranch($branchId)->where('status', 'active')->count(),
            'completed' => InstallmentPlan::forBranch($branchId)->where('status', 'completed')->count(),
            'cancelled' => InstallmentPlan::forBranch($branchId)->where('status', 'cancelled')->count(),
        ];

        // Overdue count (active plans with past due date)
        $counts['overdue'] = InstallmentPlan::forBranch($branchId)
            ->where('status', 'active')
            ->whereNotNull('next_due_date')
            ->where('next_due_date', '<', today())
            ->count();

        return Inertia::render('Installments/Index', [
            'plans'   => $plans,
            'counts'  => $counts,
            'filters' => ['status' => $status],
        ]);
    }

    public function show(InstallmentPlan $installmentPlan): Response
    {
        $this->authorizeBranch($installmentPlan->branch_id);

        $installmentPlan->load([
            'sale:id,receipt_number,created_at,total,payment_method',
            'user:id,fname,lname',
            'payments.receiver:id,fname,lname',
        ]);

        return Inertia::render('Installments/Show', [
            'plan' => $installmentPlan,
        ]);
    }

    /**
     * Record a payment against an installment plan.
     */
    public function pay(Request $request, InstallmentPlan $installmentPlan): RedirectResponse
    {
        $this->authorizeBranch($installmentPlan->branch_id);

        if (! $installmentPlan->isActive()) {
            return back()->withErrors(['error' => 'This installment plan is no longer active.']);
        }

        $validated = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_date'   => ['required', 'date'],
            'payment_method' => ['required', 'in:gcash,card,bank'],
            'notes'          => ['nullable', 'string', 'max:500'],
        ]);

        $user      = Auth::user();
        $amount    = (float) $validated['amount'];
        $remaining = $installmentPlan->remainingBalance();

        if ($amount > $remaining + 0.01) { // allow a tiny rounding buffer
            return back()->withErrors(['error' => "Payment exceeds remaining balance of ₱" . number_format($remaining, 2) . "."]);
        }

        DB::transaction(function () use ($installmentPlan, $validated, $amount, $user) {
            $nextSeq = $installmentPlan->payments()->max('sequence') + 1;

            InstallmentPayment::create([
                'installment_plan_id' => $installmentPlan->id,
                'received_by_user_id' => $user->id,
                'sequence'            => $nextSeq,
                'amount'              => $amount,
                'payment_date'        => $validated['payment_date'],
                'payment_method'      => $validated['payment_method'],
                'notes'               => $validated['notes'] ?? null,
            ]);

            $newTotalPaid = (float) $installmentPlan->total_paid + $amount;
            $newRemaining = max(0, (float) $installmentPlan->balance - $newTotalPaid);
            $newPaidCount = $installmentPlan->paid_count + 1;

            $isFullyPaid = $newRemaining < 0.01;

            $installmentPlan->update([
                'total_paid'   => $newTotalPaid,
                'paid_count'   => $newPaidCount,
                'next_due_date'=> $isFullyPaid ? null : now()->addMonth(),
                'status'       => $isFullyPaid ? 'completed' : 'active',
            ]);

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'installment_payment_recorded',
                'subject_type' => InstallmentPlan::class,
                'subject_id'   => $installmentPlan->id,
                'properties'   => [
                    'amount'         => $amount,
                    'payment_method' => $validated['payment_method'],
                    'sequence'       => $nextSeq,
                    'is_fully_paid'  => $isFullyPaid,
                ],
            ]);
        });

        $provider = InstallmentPlan::PROVIDERS[$installmentPlan->provider] ?? 'Financing';
        return back()->with('message', [
            'type' => 'success',
            'text' => "Remittance of ₱" . number_format($amount, 2) . " from {$provider} recorded.",
        ]);
    }

    /**
     * Cancel an installment plan (manager/admin only).
     */
    public function cancel(InstallmentPlan $installmentPlan): RedirectResponse
    {
        $user = Auth::user();
        if (! $user->hasElevatedAccess()) abort(403);

        $this->authorizeBranch($installmentPlan->branch_id);

        if (! $installmentPlan->isActive()) {
            return back()->withErrors(['error' => 'Plan is already ' . $installmentPlan->status . '.']);
        }

        $installmentPlan->update(['status' => 'cancelled']);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'installment_plan_cancelled',
            'subject_type' => InstallmentPlan::class,
            'subject_id'   => $installmentPlan->id,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Financing record cancelled.']);
    }
}
