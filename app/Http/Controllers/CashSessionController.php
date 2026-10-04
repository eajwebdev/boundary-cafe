<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\CashSession;
use App\Models\InstallmentPayment;
use App\Models\SystemSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class CashSessionController extends Controller
{
    // ─── Index ────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;
        $isAdmin  = $user->isAdmin();

        // All open sessions for this branch (multiple cashier stations)
        $openSessions = CashSession::with(['user:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->open()
            ->orderBy('opened_at')
            ->get()
            ->map(fn ($s) => $this->mapSession($s, full: true));

        // The current user's own open session (if any)
        $mySession = CashSession::with(['user:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->where('user_id', $user->id)
            ->open()
            ->latest()
            ->first();

        // Session history — latest first, paginated
        $history = CashSession::with(['user:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->orderByDesc('opened_at')
            ->paginate(20)
            ->withQueryString();

        $requireCount   = (bool)  SystemSetting::get('cash.require_count_on_close', $branchId, true);
        $overShortAlert = (float) SystemSetting::get('cash.over_short_alert',        $branchId, 100);

        return Inertia::render('CashSessions/Index', [
            'open_sessions'    => $openSessions,
            'my_session'       => $mySession ? $this->mapSession($mySession, full: true) : null,
            'history'          => $history->through(fn ($s) => $this->mapSession($s)),
            'require_count'    => $requireCount,
            'over_short_alert' => $overShortAlert,
            'is_admin'         => $isAdmin,
        ]);
    }

    // ─── Open session ─────────────────────────────────────────────────────────

    public function open(Request $request): RedirectResponse
    {
        $user     = Auth::user();
        $branchId = $user->branch_id;

        if (! $branchId) {
            return back()->withErrors(['error' => 'No branch assigned to your account.']);
        }

        // One open session per user at a time (multiple stations allowed per branch)
        if (CashSession::where('branch_id', $branchId)->where('user_id', $user->id)->open()->exists()) {
            return back()->withErrors(['error' => 'You already have an open session. Close it first before opening a new one.']);
        }

        $validated = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0'],
            'notes'        => ['nullable', 'string', 'max:500'],
        ]);

        $session = CashSession::create([
            'user_id'      => $user->id,
            'branch_id'    => $branchId,
            'opening_cash' => $validated['opening_cash'],
            'notes'        => $validated['notes'] ?? null,
            'status'       => 'open',
            'opened_at'    => now(),
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'cash_session_opened',
            'subject_type' => CashSession::class,
            'subject_id'   => $session->id,
            'properties'   => [
                'session_number' => $session->session_number,
                'opening_cash'   => (float) $validated['opening_cash'],
                'branch_id'      => $branchId,
                'ip'             => $request->ip(),
            ],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Session {$session->session_number} opened — Opening cash: ₱" . number_format($validated['opening_cash'], 2),
        ]);
    }

    // ─── Close session ────────────────────────────────────────────────────────

    public function close(Request $request, CashSession $session): RedirectResponse
    {
        $user = Auth::user();

        if ($session->branch_id !== $user->branch_id && ! $user->isAdmin()) {
            abort(403, 'Unauthorized.');
        }

        if ($session->isClosed()) {
            return back()->withErrors(['error' => 'This session is already closed.']);
        }

        $requireCount = (bool) SystemSetting::get('cash.require_count_on_close', $session->branch_id, true);

        $validated = $request->validate([
            'counted_cash'  => $requireCount
                ? ['required', 'numeric', 'min:0']
                : ['nullable', 'numeric', 'min:0'],
            'gcash_counted' => ['nullable', 'numeric', 'min:0'],
            'card_counted'  => ['nullable', 'numeric', 'min:0'],
            'notes'         => ['nullable', 'string', 'max:1000'],
        ]);

        $session->loadMissing(['sales', 'expenses.pettyCashVoucher']);

        $expected  = $session->computeExpectedCash();
        $counted   = isset($validated['counted_cash']) ? (float) $validated['counted_cash'] : $expected;
        $overShort = round($counted - $expected, 2);

        // GCash system total from all completed GCash sales this session
        $gcashSystem  = $session->gcash_sales_total;
        $gcashCounted = isset($validated['gcash_counted']) ? (float) $validated['gcash_counted'] : null;

        // Card system total from all completed card sales this session
        $cardSystem   = $session->card_sales_total;
        $cardCounted  = isset($validated['card_counted']) ? (float) $validated['card_counted'] : null;

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
                'opening_cash'   => (float) $session->opening_cash,
                'expected_cash'  => $expected,
                'counted_cash'   => $counted,
                'over_short'     => $overShort,
                'ip'             => $request->ip(),
            ],
        ]);

        $overMsg = $overShort == 0
            ? 'Cash balanced ✓'
            : ($overShort > 0
                ? 'Over by ₱' . number_format(abs($overShort), 2)
                : 'Short by ₱' . number_format(abs($overShort), 2));

        return back()->with('message', [
            'type' => $overShort == 0 ? 'success' : 'warning',
            'text' => "Session closed. {$overMsg}",
        ]);
    }

    // ─── Show ─────────────────────────────────────────────────────────────────

    public function show(CashSession $session): Response
    {
        $user = Auth::user();

        if ($session->branch_id !== $user->branch_id && ! $user->isAdmin()) {
            abort(403, 'Unauthorized.');
        }

        $session->load([
            'user:id,fname,lname',
            'sales' => fn ($q) => $q->orderByDesc('created_at'),
        ]);

        $sales           = $session->sales->where('status', '!=', 'voided');
        $cashSales       = $sales->where('payment_method', 'cash');
        $gcashSales      = $sales->where('payment_method', 'gcash');
        $cardSales       = $sales->where('payment_method', 'card');
        $installmentSales= $sales->where('payment_method', 'installment');
        $otherSales      = $sales->whereNotIn('payment_method', ['cash', 'gcash', 'card', 'installment']);

        // Remittances received on this session's date — broken down by method
        $sessionDate = $session->opened_at?->toDateString() ?? now()->toDateString();
        $remit       = \App\Models\InstallmentPayment::totalsForDate($sessionDate, $session->branch_id);

        // Installment: only the down-payment was actually collected at POS
        $instDp      = (float) $installmentSales->sum('payment_amount');
        $remitTotal  = $remit['total'];

        // Total actually collected (POS + remittances from financing providers)
        $totalCollected = (float) $cashSales->sum('total')
                        + (float) $gcashSales->sum('total')
                        + (float) $cardSales->sum('total')
                        + $instDp
                        + (float) $otherSales->sum('total')
                        + $remitTotal;

        return Inertia::render('CashSessions/Show', [
            'session' => $this->mapSession($session, full: true),
            'summary' => [
                'total_sales'      => $totalCollected,
                'total_count'      => $sales->count(),
                'cash_total'       => (float) $cashSales->sum('total'),
                'gcash_total'      => (float) $gcashSales->sum('total'),
                'card_total'       => (float) $cardSales->sum('total'),
                'installment_dp'   => $instDp,
                // Remittance breakdown by payment method
                'remittance_total' => $remitTotal,
                'remittance_gcash' => (float) $remit['gcash'],
                'remittance_card'  => (float) $remit['card'],
                'remittance_bank'  => (float) $remit['bank'],
                'others_total'     => (float) $otherSales->sum('total'),
                'discount_total'   => (float) $sales->sum('discount_amount'),
                'voided_count'     => $session->sales->where('status', 'voided')->count(),
                // Reconciliation: what GCash/card counted vs system (if session is closed)
                'gcash_system'    => $session->gcash_system    !== null ? (float) $session->gcash_system    : (float) $gcashSales->sum('total'),
                'gcash_counted'   => $session->gcash_counted   !== null ? (float) $session->gcash_counted   : null,
                'gcash_over_short'=> $session->gcash_over_short !== null ? (float) $session->gcash_over_short : null,
                'card_system'     => $session->card_system     !== null ? (float) $session->card_system     : (float) $cardSales->sum('total'),
                'card_counted'    => $session->card_counted    !== null ? (float) $session->card_counted    : null,
                'card_over_short' => $session->card_over_short !== null ? (float) $session->card_over_short : null,
            ],
            'sales' => $session->sales->map(fn ($s) => [
                'id'             => $s->id,
                'receipt_number' => $s->receipt_number,
                // For installment: show only the DP collected, not the full financed amount
                'total'          => $s->payment_method === 'installment'
                    ? (float) $s->payment_amount
                    : (float) $s->total,
                'sale_total'     => (float) $s->total,        // full sale value for reference
                'payment_method' => $s->payment_method,
                'customer_name'  => $s->customer_name,
                'status'         => $s->status,
                'created_at'     => $s->created_at?->toIso8601String(),
            ])->values(),
        ]);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    private function mapSession(CashSession $s, bool $full = false): array
    {
        $base = [
            'id'             => $s->id,
            'session_number' => $s->session_number,
            'status'         => $s->status,
            'opening_cash'   => (float) $s->opening_cash,
            'expected_cash'  => $s->expected_cash  !== null ? (float) $s->expected_cash  : null,
            'counted_cash'   => $s->counted_cash   !== null ? (float) $s->counted_cash   : null,
            'over_short'     => $s->over_short     !== null ? (float) $s->over_short     : null,
            'over_short_status' => $s->over_short_status,
            'notes'          => $s->notes,
            'opened_at'      => $s->opened_at?->toIso8601String(),
            'closed_at'      => $s->closed_at?->toIso8601String(),
            'cashier'        => $s->user ? trim("{$s->user->fname} {$s->user->lname}") : '—',
            'formatted_opening_cash'  => $s->formatted_opening_cash,
            'formatted_expected_cash' => $s->formatted_expected_cash,
            'formatted_counted_cash'  => $s->formatted_counted_cash,
            'formatted_over_short'    => $s->formatted_over_short,
        ];

        if ($full) {
            $purecashSales = (float) $s->sales()->where('payment_method', 'cash')->where('status', '!=', 'voided')->sum('total');
            $instDp        = $s->installment_dp_total;
            $pettyCash     = $s->petty_cash_paid;
            $gcashSystem   = $s->gcash_sales_total;
            $cardSystem    = $s->card_sales_total;
            $otherSales    = (float) $s->sales()->whereNotIn('payment_method', ['cash', 'gcash', 'card', 'installment'])->where('status', '!=', 'voided')->sum('total');

            // Remittances received on this session's date
            $sessionDate = $s->opened_at?->toDateString() ?? now()->toDateString();
            $remit       = InstallmentPayment::totalsForDate($sessionDate, $s->branch_id);

            // Cash in drawer = pure cash sales + installment DPs - petty cash paid out
            // (remittances are GCash/Card/Bank — they do NOT go into the physical cash drawer)
            $cashInDrawer = round($purecashSales + $instDp - $pettyCash, 2);

            // Total collected = POS revenue + installment remittances received today
            $totalCollected = ($purecashSales + $instDp) + $gcashSystem + $cardSystem
                + $otherSales + $remit['total'];

            $base['pure_cash_sales']    = $purecashSales;
            $base['installment_dp']     = $instDp;
            $base['petty_cash_paid']    = $pettyCash;
            $base['cash_sales_total']   = $cashInDrawer;       // net cash in drawer
            $base['gcash_system']       = $gcashSystem;
            $base['card_system']        = $cardSystem;
            $base['remittance_total']   = $remit['total'];
            $base['remittance_gcash']   = (float) $remit['gcash'];
            $base['remittance_card']    = (float) $remit['card'];
            $base['remittance_bank']    = (float) $remit['bank'];
            $base['total_sales']        = $totalCollected;
            $base['sale_count']         = $s->sales()->where('status', '!=', 'voided')->count();
            $base['computed_expected']  = $s->computeExpectedCash();
        }

        return $base;
    }
}