<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use App\Services\AttendanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    public function index(Request $request): Response
    {
        $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'status' => ['nullable', 'in:rejected'],
        ]);

        $user = Auth::user();
        $isAdmin = $user->isAdmin();
        $branchId = $isAdmin ? ($request->integer('branch_id') ?: null) : $user->branch_id;
        $date = $request->filled('date') ? Carbon::parse($request->input('date')) : now();

        $inScope = fn ($q) => $q
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'));

        $logs = EmployeeAttendance::query()
            ->tap($inScope)
            ->select('employee_attendances.*')
            ->selectRaw('photo IS NOT NULL as has_photo')
            ->with(['employee:id,first_name,last_name,employee_code,position', 'branch:id,name'])
            ->whereBetween('created_at', [$date->copy()->startOfDay(), $date->copy()->endOfDay()])
            ->when($request->input('status') === 'rejected', fn ($q) => $q->where('status', EmployeeAttendance::STATUS_REJECTED))
            ->latest('id')
            ->get();

        $accepted = $logs->where('status', EmployeeAttendance::STATUS_ACCEPTED);
        $lastByEmployee = $accepted->sortBy('id')->groupBy('employee_id')->map->last();

        $branches = Branch::query()
            ->where('is_active', true)
            ->when(! $isAdmin, fn ($q) => $q->whereKey($user->branch_id))
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'address', 'latitude', 'longitude', 'geofence_radius_m']);

        return Inertia::render('Attendance/Index', [
            'logs' => $logs->map(fn (EmployeeAttendance $a) => [
                'id' => $a->id,
                'time' => $a->created_at->format('g:i A'),
                'type' => $a->type,
                'status' => $a->status,
                'reason' => $a->reason,
                'distance_m' => $a->distance_m,
                'accuracy_m' => $a->accuracy_m,
                'face_distance' => $a->face_distance,
                'has_photo' => (bool) $a->has_photo,
                'employee' => $a->employee ? [
                    'id' => $a->employee->id,
                    'name' => $a->employee->full_name,
                    'code' => $a->employee->employee_code,
                    'position' => $a->employee->position,
                ] : null,
                'branch' => $a->branch?->name,
            ])->values(),
            'stats' => [
                'present' => $accepted->pluck('employee_id')->unique()->count(),
                'on_duty' => $lastByEmployee->where('type', EmployeeAttendance::TYPE_IN)->count(),
                'punches' => $accepted->count(),
                'rejected' => $logs->where('status', EmployeeAttendance::STATUS_REJECTED)->count(),
                'employees' => Employee::query()->tap($inScope)->where('is_active', true)->count(),
            ],
            'branches' => $branches->map(fn (Branch $b) => [
                'id' => $b->id,
                'name' => $b->name,
                'code' => $b->code,
                'address' => $b->address,
                'latitude' => $b->latitude,
                'longitude' => $b->longitude,
                'radius_m' => $b->geofence_radius_m,
            ])->values(),
            'filters' => [
                'date' => $date->format('Y-m-d'),
                'branch_id' => $branchId,
                'status' => $request->input('status'),
            ],
            'face_threshold' => AttendanceService::FACE_MATCH_THRESHOLD,
            'is_admin' => $isAdmin,
        ]);
    }

    /** Set where a branch is and how far from it staff may clock in. */
    public function updateLocation(Request $request, Branch $branch): RedirectResponse
    {
        $user = Auth::user();
        abort_if(! $user->isAdmin() && (int) $user->branch_id !== $branch->id, 404);

        $data = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'geofence_radius_m' => ['required', 'integer', 'between:20,2000'],
        ]);
        $branch->update($data);

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'branch_location_updated',
            'subject_type' => Branch::class,
            'subject_id' => $branch->id,
            'properties' => $data + ['ip' => $request->ip()],
        ]);

        return back()->with('success', "{$branch->name} clock-in area saved ({$data['geofence_radius_m']} m).");
    }

    public function photo(EmployeeAttendance $attendance): HttpResponse
    {
        $user = Auth::user();
        abort_if(! $user->isAdmin() && (int) $attendance->branch_id !== (int) $user->branch_id, 404);
        abort_unless($attendance->photo, 404);

        return EmployeeController::imageResponse($attendance->photo);
    }
}
