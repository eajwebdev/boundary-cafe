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
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class EmployeeController extends Controller
{
    /** Admins see every branch (optionally filtered); everyone else only their own. */
    private function listBranchId(Request $request): ?int
    {
        $user = Auth::user();

        return $user->isAdmin() ? ($request->integer('branch_id') ?: null) : $user->branch_id;
    }

    private function ensureSameBranch(Employee $employee): void
    {
        $user = Auth::user();
        abort_if(! $user->isAdmin() && (int) $employee->branch_id !== (int) $user->branch_id, 404);
    }

    public function index(Request $request): Response
    {
        $branchId = $this->listBranchId($request);
        $isAdmin = Auth::user()->isAdmin();

        $employees = Employee::query()
            ->with(['branch:id,name,code', 'user:id,username'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'))
            ->orderByDesc('is_active')
            ->orderBy('first_name')
            ->get();

        $lastToday = EmployeeAttendance::query()
            ->whereIn('employee_id', $employees->pluck('id'))
            ->where('status', EmployeeAttendance::STATUS_ACCEPTED)
            ->where('created_at', '>=', now()->startOfDay())
            ->orderBy('id')
            ->get()
            ->keyBy('employee_id');

        return Inertia::render('Employees/Index', [
            'employees' => $employees->map(fn (Employee $e) => [
                'id' => $e->id,
                'employee_code' => $e->employee_code,
                'first_name' => $e->first_name,
                'last_name' => $e->last_name,
                'full_name' => $e->full_name,
                'position' => $e->position,
                'phone' => $e->phone,
                'branch_id' => $e->branch_id,
                'branch' => $e->branch?->only(['id', 'name', 'code']),
                'username' => $e->user?->username,
                'is_active' => $e->is_active,
                'has_pin' => $e->pin !== null,
                'has_face' => $e->hasFace(),
                'face_samples' => count($e->faceSamples()),
                'face_enrolled_at' => $e->face_enrolled_at?->toIso8601String(),
                'device_registered_at' => $e->device_registered_at?->toIso8601String(),
                'today' => ($last = $lastToday->get($e->id)) ? [
                    'type' => $last->type,
                    'time' => $last->created_at->format('g:i A'),
                ] : null,
            ])->values(),
            'branches' => $isAdmin
                ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code'])
                : Branch::whereKey(Auth::user()->branch_id)->get(['id', 'name', 'code']),
            'filters' => ['branch_id' => $branchId],
            'is_admin' => $isAdmin,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request, creating: true);
        $employee = Employee::create($data);
        $this->log('employee_created', $employee, $request);

        return back()->with('success', "{$employee->full_name} added as {$employee->employee_code}.");
    }

    public function update(Request $request, Employee $employee): RedirectResponse
    {
        $this->ensureSameBranch($employee);
        $data = $this->validated($request, creating: false);
        if (empty($data['pin'])) {
            unset($data['pin']);
        }
        $employee->update($data);
        $this->log('employee_updated', $employee, $request);

        return back()->with('success', "{$employee->full_name} updated.");
    }

    public function destroy(Request $request, Employee $employee): RedirectResponse
    {
        $this->ensureSameBranch($employee);

        // Keep history: employees with attendance or a staff account are deactivated, not deleted.
        if ($employee->user_id || $employee->attendances()->exists()) {
            $employee->update(['is_active' => false]);
            $this->log('employee_deactivated', $employee, $request);

            return back()->with('success', "{$employee->full_name} was deactivated (their attendance history is kept).");
        }

        $this->log('employee_deleted', $employee, $request);
        $employee->delete();

        return back()->with('success', 'Employee deleted.');
    }

    /** Store the enrolled face: a small JPEG plus 4–8 face samples (128 numbers each) used for matching. */
    public function enrollFace(Request $request, Employee $employee, AttendanceService $attendance): RedirectResponse
    {
        $this->ensureSameBranch($employee);
        $data = $request->validate([
            'descriptors' => ['required', 'array', 'min:'.AttendanceService::MIN_ENROLL_SAMPLES, 'max:'.AttendanceService::MAX_ENROLL_SAMPLES],
            'descriptors.*' => ['required', 'array', 'size:128'],
            'descriptors.*.*' => ['required', 'numeric', 'between:-1,1'],
            'photo' => ['required', 'string', 'max:'.(int) ceil(AttendanceService::MAX_PHOTO_BYTES * 4 / 3 + 64)],
        ], [
            'descriptors.min' => 'Capture at least :min face samples.',
        ]);
        AttendanceService::assertSmallJpeg($data['photo'], 'photo');

        $samples = array_map(fn (array $sample) => array_map('floatval', array_values($sample)), array_values($data['descriptors']));
        $attendance->assertConsistentSamples($samples);

        $employee->update([
            'face_descriptor' => $samples,
            'face_photo' => $data['photo'],
            'face_enrolled_at' => now(),
        ]);
        $this->log('employee_face_enrolled', $employee, $request);

        return back()->with('success', "Face enrolled for {$employee->full_name}.");
    }

    /** Forget the employee's registered phone; the next phone they clock in with becomes the registered one. */
    public function resetDevice(Request $request, Employee $employee): RedirectResponse
    {
        $this->ensureSameBranch($employee);
        $employee->update(['device_token_hash' => null, 'device_registered_at' => null]);
        $this->log('employee_device_reset', $employee, $request);

        return back()->with('success', "{$employee->full_name} can now clock in from a new phone.");
    }

    /** The enrolled face photo as an image (keeps photos out of the page payload). */
    public function face(Employee $employee): HttpResponse
    {
        $this->ensureSameBranch($employee);
        abort_unless($employee->face_photo, 404);

        return self::imageResponse($employee->face_photo);
    }

    public static function imageResponse(string $dataUrl): HttpResponse
    {
        $bytes = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true) ?: '';

        return response($bytes, 200, [
            'Content-Type' => 'image/jpeg',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $creating): array
    {
        $user = Auth::user();
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:80'],
            'last_name' => ['nullable', 'string', 'max:80'],
            'position' => ['nullable', 'string', 'max:80'],
            'phone' => ['nullable', 'string', 'max:40'],
            'branch_id' => ['required', 'exists:branches,id'],
            'pin' => [$creating ? 'required' : 'nullable', 'digits_between:4,6'],
            'is_active' => ['nullable', 'boolean'],
        ], [
            'pin.digits_between' => 'The PIN must be 4 to 6 digits.',
        ]);

        // Managers can only place employees in their own branch.
        if (! $user->isAdmin()) {
            $data['branch_id'] = $user->branch_id;
        }

        return $data;
    }

    private function log(string $action, Employee $employee, Request $request): void
    {
        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => $action,
            'subject_type' => Employee::class,
            'subject_id' => $employee->id,
            'properties' => ['name' => $employee->full_name, 'code' => $employee->employee_code, 'ip' => $request->ip()],
        ]);
    }
}
