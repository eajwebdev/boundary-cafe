<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashCount;
use App\Models\CashCountDenomination;
use App\Models\CashSession;
use App\Models\ActivityLog;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Support\Facades\DB;

class CashCountController extends Controller
{
    public function index(): Response
    {
        $user      = Auth::user();
        $isAdmin   = $user->isSuperAdmin() || $user->isAdministrator();
        $isManager = $user->isManager();
        $canSeeAll = $isAdmin || $isManager; // managers/admins see all branch sessions

        if ($isAdmin) {
            $branches = Branch::where('is_active', true)->orderBy('name')->get(['id', 'name']);
            $branchId = (int) request('branch', $branches->first()?->id ?? $user->branch_id);
        } else {
            $branches = [];
            $branchId = $user->branch_id;
        }

        // Cashiers only see their own open sessions; managers/admins see all
        $openSessionsQuery = CashSession::where('branch_id', $branchId)
            ->where('status', 'open');

        if (! $canSeeAll) {
            $openSessionsQuery->where('user_id', $user->id);
        }

        $openSessions = $openSessionsQuery
            ->orderBy('opened_at', 'desc')
            ->get()
            ->map(function ($s) use ($user) {
                $s->loadMissing(['sales', 'expenses.pettyCashVoucher', 'user']);
                $pureCash = (float) $s->sales()->where('payment_method', 'cash')->where('status', '!=', 'voided')->sum('total');
                $instDp   = $s->installment_dp_total;
                $pettyCash= $s->petty_cash_paid;
                $gcash    = $s->gcash_sales_total;
                $card     = $s->card_sales_total;
                $bank     = (float) $s->sales()->where('payment_method', 'bank')->where('status', '!=', 'voided')->sum('total');

                return [
                    'id'              => $s->id,
                    'session_number'  => $s->session_number,
                    'cashier_name'    => $s->user ? trim("{$s->user->fname} {$s->user->lname}") : '—',
                    'is_mine'         => $s->user_id === $user->id,
                    'opened_at'       => $s->opened_at?->toIso8601String(),
                    'opening_cash'    => (float) $s->opening_cash,
                    'pure_cash_sales' => $pureCash,
                    'installment_dp'  => $instDp,
                    'petty_cash_paid' => $pettyCash,
                    'expected_cash'   => $s->computeExpectedCash(),
                    'gcash_system'    => $gcash,
                    'card_system'     => $card,
                    'bank_system'     => $bank,
                ];
            });

        $cashCounts = CashCount::with(['cashSession', 'denominations'])
            ->whereHas('cashSession', fn($q) => $q->where('branch_id', $branchId))
            ->latest()
            ->paginate(15);

        // Sessions opened before today that had sales but no closing cash count.
        // Sessions with zero non-voided sales are exempt (nothing to count).
        $missedQuery = CashSession::where('branch_id', $branchId)
            ->whereDate('opened_at', '<', now()->toDateString())
            ->whereHas('sales', fn($q) => $q->where('status', '!=', 'voided'))
            ->whereDoesntHave('cashCounts', fn($q) => $q->where('count_type', 'closing'))
            ->orderBy('opened_at');

        if (! $canSeeAll) {
            $missedQuery->where('user_id', $user->id);
        }

        $missedCounts = $missedQuery->get()
            ->map(fn($s) => [
                'id'             => $s->id,
                'session_number' => $s->session_number,
                'date'           => $s->opened_at?->toDateString(),
                'status'         => $s->status,
                'sale_count'     => $s->sales()->where('status', '!=', 'voided')->count(),
            ]);

        return Inertia::render('CashCounts/Index', [
            'open_sessions'      => $openSessions,
            'cash_counts'        => $cashCounts,
            'branches'           => $branches,
            'selected_branch_id' => $branchId,
            'is_admin'           => $isAdmin,
            'missed_counts'      => $missedCounts,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $validated = $request->validate([
            'cash_session_id' => ['required', 'exists:cash_sessions,id'],
            'count_type'      => ['required', 'in:closing,midshift'],
            'denominations'   => ['present', 'array'],
            'denominations.*.denomination' => ['required_with:denominations.*', 'numeric'],
            'denominations.*.quantity'     => ['required_with:denominations.*', 'integer', 'min:0'],
            'gcash_counted'   => ['nullable', 'numeric', 'min:0'],
            'card_counted'    => ['nullable', 'numeric', 'min:0'],
            'notes'           => ['nullable', 'string', 'max:1000'],
        ]);

        // Verify session belongs to user's branch
        $session = CashSession::where('id', $validated['cash_session_id'])
            ->where('branch_id', $user->branch_id)
            ->firstOrFail();

        // For closing counts: only the session owner, manager, or admin can close
        if ($validated['count_type'] === 'closing') {
            $canClose = $session->user_id === $user->id
                || $user->isAdmin()
                || $user->isManager();

            if (! $canClose) {
                return back()->withErrors(['error' => 'Only the cashier who opened this session (or a manager/admin) can submit a closing count.']);
            }
        }

        // Pre-compute values from the session so over/short is accurate
        $session->loadMissing(['sales', 'expenses.pettyCashVoucher']);
        $expectedCash = $session->computeExpectedCash();

        $pureCash    = (float) $session->sales()->where('payment_method', 'cash')->where('status', '!=', 'voided')->sum('total');
        $instDp      = $session->installment_dp_total;
        $pettyCash   = $session->petty_cash_paid;
        $gcashSystem = $session->gcash_sales_total;
        $cardSystem  = $session->card_sales_total;

        // system_total = cash in drawer = cash sales + installment DPs - petty cash paid out
        $systemTotal = round($pureCash + $instDp - $pettyCash, 2);

        $gcashCounted = isset($validated['gcash_counted']) ? (float) $validated['gcash_counted'] : null;
        $cardCounted  = isset($validated['card_counted'])  ? (float) $validated['card_counted']  : null;

        DB::beginTransaction();

        try {
            // Create or update the cash count record
            $cashCount = CashCount::updateOrCreate(
                [
                    'cash_session_id' => $validated['cash_session_id'],
                    'count_type'      => $validated['count_type'],
                ],
                [
                    'counted_by'       => $user->id,
                    'opening_cash'     => (float) $session->opening_cash,
                    'expected_cash'    => $expectedCash,
                    'system_total'     => $systemTotal,
                    'pure_cash_sales'  => $pureCash,
                    'installment_dp'   => $instDp,
                    'petty_cash_paid'  => $pettyCash,
                    'gcash_system'     => $gcashSystem,
                    'gcash_counted'    => $gcashCounted,
                    'gcash_over_short' => $gcashCounted !== null ? round($gcashCounted - $gcashSystem, 2) : null,
                    'card_system'      => $cardSystem,
                    'card_counted'     => $cardCounted,
                    'card_over_short'  => $cardCounted !== null ? round($cardCounted - $cardSystem, 2) : null,
                    'counted_at'       => now(),
                    'notes'            => $validated['notes'] ?? null,
                ]
            );

            // Clear previous denominations for this count to avoid duplicate key error
            CashCountDenomination::where('cash_count_id', $cashCount->id)->delete();

            // Insert new denominations (unique per denomination)
            $denominationData = [];
            foreach ($validated['denominations'] as $denom) {
                if ($denom['quantity'] > 0) {
                    $denominationData[] = [
                        'cash_count_id' => $cashCount->id,
                        'denomination'  => (float) $denom['denomination'],
                        'quantity'      => (int) $denom['quantity'],
                        'subtotal'      => (float) $denom['denomination'] * (int) $denom['quantity'],
                        'type'          => (float) $denom['denomination'] >= 1 ? 'bill' : 'coin',
                        'created_at'    => now(),
                        'updated_at'    => now(),
                    ];
                }
            }

            if (!empty($denominationData)) {
                CashCountDenomination::insert($denominationData);
            }

            // Recalculate totals
            $cashCount->recalculate();

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'cash_count_created',
                'subject_type' => CashCount::class,
                'subject_id'   => $cashCount->id,
                'properties'   => [
                    'session_id'    => $validated['cash_session_id'],
                    'count_type'    => $validated['count_type'],
                    'total_counted' => $cashCount->counted_total,
                ],
            ]);

            // ── Auto-close session on closing count ───────────────────────────
            $sessionClosed = false;
            if ($validated['count_type'] === 'closing' && $session->isOpen()) {
                $expected  = $session->computeExpectedCash();
                $counted   = $cashCount->counted_total;
                $overShort = round($counted - $expected, 2);

                $session->update([
                    'expected_cash'    => $expected,
                    'counted_cash'     => $counted,
                    'over_short'       => $overShort,
                    'gcash_system'     => $gcashSystem,
                    'gcash_counted'    => $gcashCounted,
                    'gcash_over_short' => $gcashCounted !== null ? round($gcashCounted - $gcashSystem, 2) : null,
                    'card_system'      => $cardSystem,
                    'card_counted'     => $cardCounted,
                    'card_over_short'  => $cardCounted !== null ? round($cardCounted - $cardSystem, 2) : null,
                    'status'           => 'closed',
                    'closed_at'        => now(),
                    'notes'            => $validated['notes'] ?? $session->notes,
                ]);

                ActivityLog::create([
                    'user_id'      => $user->id,
                    'action'       => 'cash_session_closed',
                    'subject_type' => CashSession::class,
                    'subject_id'   => $session->id,
                    'properties'   => [
                        'session_number' => $session->session_number,
                        'auto_closed'    => true,
                        'via'            => 'closing_count',
                        'opening_cash'   => (float) $session->opening_cash,
                        'expected_cash'  => $expected,
                        'counted_cash'   => $counted,
                        'over_short'     => $overShort,
                        'ip'             => request()->ip(),
                    ],
                ]);

                $sessionClosed = true;
            }

            DB::commit();

            $overShortMsg = '';
            if ($sessionClosed) {
                $os = round($cashCount->counted_total - $session->computeExpectedCash(), 2);
                $overShortMsg = $os == 0
                    ? ' Cash balanced ✓'
                    : ($os > 0
                        ? ' Over by ₱' . number_format(abs($os), 2)
                        : ' Short by ₱' . number_format(abs($os), 2));
            }

            return back()->with('message', [
                'type' => $sessionClosed ? ($overShortMsg && str_contains($overShortMsg, 'Short') ? 'warning' : 'success') : 'success',
                'text' => $sessionClosed
                    ? "Session {$session->session_number} closed.{$overShortMsg}"
                    : "Mid-shift count for session {$session->session_number} saved.",
            ]);

        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => 'Failed to save cash count: ' . $e->getMessage()]);
        }
    }

    public function show(CashCount $cashCount): Response
    {
        $cashCount->loadMissing('cashSession');
        $this->authorizeBranch($cashCount->cashSession?->branch_id);
        $cashCount->load(['cashSession', 'denominations', 'countedBy:id,fname,lname']);

        $counterName = $cashCount->countedBy
            ? trim("{$cashCount->countedBy->fname} {$cashCount->countedBy->lname}")
            : null;

        return Inertia::render('CashCounts/Show', [
            'cashCount'    => $cashCount,
            'counter_name' => $counterName,
        ]);
    }
}