<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LogsController extends Controller
{
    public function index(Request $request): \Inertia\Response
    {
        $perPage = $request->integer('per_page', 25);
        $perPage = max(10, min($perPage, 500));

        $authUser = auth()->user();

        // Scope to branch users for non-admins
        $branchUserIds = null;
        if (!$authUser->isAdmin()) {
            $branchUserIds = User::where('branch_id', $authUser->branch_id)->pluck('id');
        }

        $query = ActivityLog::query()
            ->with(['user' => fn($q) => $q->select('id', 'fname', 'lname', 'username')])
            ->when($branchUserIds, fn($q) => $q->whereIn('user_id', $branchUserIds))
            ->latest('created_at');

        // User filter
        if ($userId = $request->integer('user_id')) {
            $query->where('user_id', $userId);
        }

        // Action filter – treat 0 / "0" / empty as ALL
        $action = $request->input('action');
        if ($action !== null && $action !== '' && $action !== '0' && $action != 0) {
            $query->where('action', $action);
        }

        // Date range
        if ($from = $request->date('from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->date('to')) {
            $query->whereDate('created_at', '<=', $to);
        }

        // Sorting
        $sort = $request->string('sort', 'created_at');
        $direction = $request->string('direction', 'desc');
        $allowedSorts = ['created_at', 'action', 'user_id'];
        if (in_array($sort, $allowedSorts)) {
            $query->orderBy($sort, $direction === 'asc' ? 'asc' : 'desc');
        }

        $logs = $query->paginate($perPage)->withQueryString();

        // Prepare users for filter dropdown — scoped to branch for non-admins
        $userIds = ActivityLog::distinct()->whereNotNull('user_id')
            ->when($branchUserIds, fn($q) => $q->whereIn('user_id', $branchUserIds))
            ->pluck('user_id');
        $usersForFilter = User::whereIn('id', $userIds)
            ->select('id', 'fname', 'lname', 'username')
            ->orderBy('fname')
            ->get()
            ->map(fn($u) => [
                'value' => (string) $u->id,
                'label' => trim("{$u->fname} {$u->lname}") ?: $u->username ?: "User #{$u->id}",
            ]);

        // Prepare actions for filter dropdown
        $actions = ActivityLog::distinct('action')
            ->pluck('action')
            ->sort()
            ->values()
            ->map(fn($a) => [
                'value' => $a,
                'label' => ucfirst(str_replace('_', ' ', $a)),
            ]);

        return Inertia::render('Logs/Index', [
            'logs'           => $logs,
            'users'          => $logs->pluck('user')->filter()->keyBy('id'),
            'usersForFilter' => $usersForFilter,
            'actions'        => $actions,
            'filters'        => $request->only([
                'user_id', 'action', 'from', 'to', 'per_page', 'sort', 'direction'
            ]),
        ]);
    }
}