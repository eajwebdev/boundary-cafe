<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use App\Services\DashboardService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Tabbed dashboard. The page shell loads once; each tab fetches its own data
 * lazily from /dashboard/data?tab=… so switching tabs never refetches everything.
 */
class DashboardController extends Controller
{
    /** Menu IDs that unlock each tab (any one is enough). Sales is always visible. */
    private const TAB_ACCESS = [
        'sales' => [],
        'orders' => ['40', '41', '2'],
        'menu' => ['6', '19'],
        'inventory' => ['33', '6', '20'],
        'customers' => ['39', '44'],
        'cash' => ['14', '17', '18'],
    ];

    public function index(): Response
    {
        $user = Auth::user();

        $branches = ($user->isSuperAdmin() || $user->isAdministrator())
            ? Branch::orderBy('name')->get()
            : collect([$user->branch])->filter();

        return Inertia::render('Dashboard/Index', [
            'branches' => $branches->map(fn (Branch $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'code' => $b->code,
                'business_type' => $b->business_type,
                'is_active' => $b->is_active,
            ])->values(),
            'tabs' => $this->allowedTabs($user),
        ]);
    }

    public function data(Request $request, DashboardService $dashboard): JsonResponse
    {
        $user = Auth::user();
        $tab = $request->string('tab')->toString() ?: 'sales';
        abort_unless(in_array($tab, DashboardService::TABS, true), 404);
        abort_unless(in_array($tab, $this->allowedTabs($user), true), 403, 'You do not have access to this dashboard tab.');

        $branchId = ($user->isSuperAdmin() || $user->isAdministrator())
            ? ($request->filled('branch_id') ? (int) $request->input('branch_id') : null)
            : $user->branch_id;

        $from = $request->filled('from') ? Carbon::parse($request->input('from')) : now()->startOfMonth();
        $to = $request->filled('to') ? Carbon::parse($request->input('to')) : now();
        if ($to->lt($from)) {
            [$from, $to] = [$to, $from];
        }
        // Keep queries bounded: at most ~1 year per request.
        if ($from->diffInDays($to) > 366) {
            $from = $to->copy()->subDays(366);
        }

        $dashboard->scope($branchId, $from, $to);

        return response()->json([
            'tab' => $tab,
            'data' => $dashboard->{$tab}(),
            'period' => $dashboard->period(),
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    private function allowedTabs(User $user): array
    {
        return collect(self::TAB_ACCESS)
            ->filter(fn ($ids) => $ids === [] || collect($ids)->contains(fn ($id) => $user->hasAccess($id)))
            ->keys()
            ->values()
            ->all();
    }
}
