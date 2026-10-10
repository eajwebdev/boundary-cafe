<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\SystemSetting;
use App\Models\ZReading;
use App\Services\ZReadingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

class ZReadingController extends Controller
{
    public function __construct(private ZReadingService $zReadings) {}

    /**
     * End-of-day screen: live preview of the selected day, what still blocks
     * closing it, days that were missed, and past readings.
     */
    public function index(Request $request): Response
    {
        $branchId = $this->branchFor($request);
        $pendingDates = $this->zReadings->pendingDates($branchId);

        $request->validate(['date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today']]);
        $date = $request->input('date') ?? $pendingDates[0] ?? today()->toDateString();

        $existing = ZReading::where('branch_id', $branchId)->whereDate('business_date', $date)->first();

        $history = ZReading::with('generatedBy:id,fname,lname')
            ->where('branch_id', $branchId)
            ->orderByDesc('business_date')
            ->paginate(15)
            ->withQueryString()
            ->through(fn (ZReading $reading) => [
                'id' => $reading->id,
                'z_number' => $reading->z_number,
                'business_date' => $reading->business_date->toDateString(),
                'transaction_count' => $reading->transaction_count,
                'net_sales' => $reading->net_sales,
                'over_short' => $reading->over_short,
                'generated_by' => $reading->generatedBy?->full_name,
                'generated_at' => $reading->generated_at->toIso8601String(),
            ]);

        return Inertia::render('ZReadings/Index', [
            'branch_id' => $branchId,
            'branches' => auth()->user()->isAdmin() ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name']) : null,
            'date' => $date,
            'today' => today()->toDateString(),
            'existing' => $existing ? ['id' => $existing->id, 'z_number' => $existing->z_number] : null,
            'preview' => $existing ? null : $this->zReadings->summarize($branchId, $date),
            'blocker' => $existing ? null : $this->zReadings->blockerFor($branchId, $date),
            'open_sessions' => $this->zReadings->blockingSessions($branchId, $date)->map(fn (CashSession $session) => [
                'id' => $session->id,
                'session_number' => $session->session_number,
                'cashier' => $session->user?->full_name ?? 'Unknown',
                'opened_at' => $session->opened_at?->toIso8601String(),
            ]),
            'pending_dates' => $pendingDates,
            'last_reading' => ZReading::where('branch_id', $branchId)->orderByDesc('z_number')->first(['id', 'z_number', 'business_date', 'grand_total']),
            'history' => $history,
        ]);
    }

    /** Lock the day with a new Z-reading. */
    public function store(Request $request): RedirectResponse
    {
        $branchId = $this->branchFor($request);

        $validated = $request->validate([
            'business_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        try {
            $reading = $this->zReadings->generate($request->user(), $branchId, $validated['business_date'], $validated['notes'] ?? null);
        } catch (RuntimeException $e) {
            return back()->withErrors(['z_reading' => $e->getMessage()]);
        }

        return redirect()->route('z-readings.show', $reading)->with('message', [
            'type' => 'success',
            'text' => "Z-{$reading->z_number} saved. ".$reading->business_date->format('M j, Y').' is now closed.',
        ]);
    }

    public function show(ZReading $zReading): Response
    {
        $this->authorizeBranch($zReading->branch_id);
        $zReading->load(['branch:id,name,code,address', 'generatedBy:id,fname,lname']);

        return Inertia::render('ZReadings/Show', [
            'reading' => [
                ...$zReading->toArray(),
                'business_date' => $zReading->business_date->toDateString(),
                'generated_at' => $zReading->generated_at->toIso8601String(),
                'generated_by_name' => $zReading->generatedBy?->full_name,
            ],
            'business' => [
                'name' => SystemSetting::businessName($zReading->branch_id),
                'tin' => (string) SystemSetting::get('general.tin', $zReading->branch_id, ''),
                'branch' => $zReading->branch?->display_name,
                'address' => $zReading->branch?->address,
            ],
        ]);
    }

    /** Count a reprint so copies of the same reading can be told apart. */
    public function reprint(ZReading $zReading): RedirectResponse
    {
        $this->authorizeBranch($zReading->branch_id);
        $zReading->increment('reprint_count');

        return back();
    }

    /** Admins may pick a branch; everyone else works in their own. */
    private function branchFor(Request $request): int
    {
        $user = $request->user();

        if ($user->isAdmin() && $request->filled('branch_id')) {
            return Branch::findOrFail((int) $request->input('branch_id'))->id;
        }

        return $this->workingBranchId();
    }
}
