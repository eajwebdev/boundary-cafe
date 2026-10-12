<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\LoyaltyRewardClaim;
use App\Services\LoyaltyRewardService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Reward claims (menu 44): QR claims waiting to be scanned and those already completed, across all branches.
 */
class LoyaltyClaimController extends Controller
{
    public function __construct(private LoyaltyRewardService $rewards) {}

    public function index(Request $request): Response
    {
        $this->rewards->expireStale();

        $filters = $request->validate([
            'status' => ['nullable', Rule::in(['all', 'reserved', 'redeemed', 'cancelled', 'expired', 'voided'])],
            'search' => ['nullable', 'string', 'max:80'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);
        $status = $filters['status'] ?? 'reserved';
        $search = trim((string) ($filters['search'] ?? ''));

        $claims = LoyaltyRewardClaim::with(['customer:id,name,customer_number,contact_number', 'items', 'branch:id,name', 'sale:id,receipt_number', 'redeemer:id,fname,lname'])
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($filters['branch_id'] ?? null, fn ($q, $branchId) => $q->where('branch_id', $branchId))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->whereDate('created_at', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->whereDate('created_at', '<=', $to))
            ->when($search !== '', fn ($q) => $q->where(fn ($inner) => $inner
                ->where('code', 'like', '%'.strtoupper($search).'%')
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$search}%")
                    ->orWhere('customer_number', 'like', "%{$search}%")
                    ->orWhere('contact_number', 'like', '%'.preg_replace('/\D+/', '', $search).'%'))))
            ->latest()
            ->paginate(25)
            ->withQueryString()
            ->through(fn (LoyaltyRewardClaim $claim) => [
                'id' => $claim->id,
                'code' => $claim->code,
                'status' => $claim->status,
                'status_label' => LoyaltyRewardClaim::statusLabel($claim->status),
                'customer' => $claim->customer ? [
                    'id' => $claim->customer->id,
                    'name' => $claim->customer->name,
                    'customer_number' => $claim->customer->customer_number,
                ] : null,
                'summary' => $claim->summary(),
                'points' => $claim->points,
                'retail_value' => (float) $claim->retail_value,
                'cost_value' => (float) $claim->cost_value,
                'branch' => $claim->branch?->name,
                'receipt_number' => $claim->sale?->receipt_number,
                'sale_id' => $claim->sale_id,
                'cashier' => $claim->redeemer ? trim("{$claim->redeemer->fname} {$claim->redeemer->lname}") : null,
                'created_at' => $claim->created_at?->toIso8601String(),
                'expires_at' => $claim->expires_at?->toIso8601String(),
                'redeemed_at' => $claim->redeemed_at?->toIso8601String(),
            ]);

        $counts = LoyaltyRewardClaim::selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('LoyaltyProgram/Claims', [
            'claims' => $claims,
            'counts' => $counts,
            'branches' => Branch::orderBy('name')->get(['id', 'name']),
            'filters' => ['status' => $status, 'search' => $search, 'branch_id' => $filters['branch_id'] ?? null, 'from' => $filters['from'] ?? null, 'to' => $filters['to'] ?? null],
        ]);
    }

    public function cancel(Request $request, LoyaltyRewardClaim $claim): RedirectResponse
    {
        if (! $this->rewards->cancel($claim, $request->user())) {
            return back()->withErrors(['error' => 'Only a claim that is still waiting can be cancelled.']);
        }

        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'loyalty_claim_cancelled',
            'subject_type' => LoyaltyRewardClaim::class,
            'subject_id' => $claim->id,
            'properties' => ['description' => "Cancelled reward claim {$claim->code} ({$claim->points} pts returned)"],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'method' => $request->method(),
            'url' => $request->fullUrl(),
        ]);

        return back()->with('success', "Claim {$claim->code} cancelled and {$claim->points} points returned.");
    }
}
