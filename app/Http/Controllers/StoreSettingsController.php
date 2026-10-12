<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\User;
use App\Services\OnlineOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store Settings (menu 48): staff the admin allows here can close a branch for the day, which stops the
 * storefront and checkout from taking orders until the next morning. Administrators manage every active
 * branch; everyone else manages only their own.
 */
class StoreSettingsController extends Controller
{
    public function __construct(private OnlineOrderService $online) {}

    public function index(Request $request): Response
    {
        $onlineBranchId = $this->online->branch()?->id;

        return Inertia::render('StoreSettings/Index', [
            'branches' => $this->manageableBranches($request->user())->map(fn (Branch $branch) => [
                'id' => $branch->id,
                'name' => $branch->display_name,
                'takes_online_orders' => $branch->id === $onlineBranchId,
                'closure' => $this->online->closureToday($branch),
                'status' => $this->online->storeStatus($branch),
            ])->values(),
            'canManageAllBranches' => $request->user()->isAdmin(),
            'today' => now()->timezone('Asia/Manila')->format('l, F j'),
        ]);
    }

    public function closeToday(Request $request, Branch $branch): RedirectResponse
    {
        $this->authorizeBranch($branch->id);
        abort_unless($branch->is_active, 404);

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:160'],
        ]);

        $this->online->closeForToday($branch, $request->user(), $validated['note'] ?? null);
        $this->log($request, $branch, 'store_closed_today', ['note' => $validated['note'] ?? null]);

        return back()->with('message', ['type' => 'success', 'text' => "{$branch->display_name} is closed for today. Customers can browse but not order."]);
    }

    public function reopen(Request $request, Branch $branch): RedirectResponse
    {
        $this->authorizeBranch($branch->id);
        abort_unless($branch->is_active, 404);

        $this->online->reopenToday($branch);
        $this->log($request, $branch, 'store_reopened_today');

        return back()->with('message', ['type' => 'success', 'text' => "{$branch->display_name} is open again and follows its normal hours."]);
    }

    /**
     * Administrators see every active branch, the one taking online orders first; other staff see only their own.
     *
     * @return Collection<int, Branch>
     */
    private function manageableBranches(User $user): Collection
    {
        if ($user->isAdmin()) {
            $onlineBranchId = $this->online->branch()?->id;

            return Branch::active()->orderBy('name')->get()->sortBy(fn (Branch $branch) => $branch->id === $onlineBranchId ? 0 : 1);
        }

        return $user->branch && $user->branch->is_active ? collect([$user->branch]) : collect();
    }

    /**
     * @param  array<string, mixed>  $properties
     */
    private function log(Request $request, Branch $branch, string $action, array $properties = []): void
    {
        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => Branch::class,
            'subject_id' => $branch->id,
            'properties' => $properties + ['branch' => $branch->name, 'ip' => $request->ip()],
        ]);
    }
}
