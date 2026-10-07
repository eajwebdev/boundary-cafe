<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\SystemSetting;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public employee portal: code + PIN, then GPS + face to time in / time out.
 * No back-office login is involved.
 */
class TimeClockController extends Controller
{
    public function __construct(private AttendanceService $attendance) {}

    public function show(): Response
    {
        return Inertia::render('TimeClock/Index', [
            'business_name' => SystemSetting::businessName(),
            'logo_url' => SystemSetting::logoUrl(),
            'face_threshold' => AttendanceService::FACE_MATCH_THRESHOLD,
        ]);
    }

    /** Check the code + PIN and tell the portal what happens next. */
    public function identify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_code' => ['required', 'string', 'max:20'],
            'pin' => ['required', 'string', 'max:12'],
        ]);

        $employee = $this->attendance->identify($data['employee_code'], $data['pin']);

        return response()->json($this->summary($employee));
    }

    public function punch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_code' => ['required', 'string', 'max:20'],
            'pin' => ['required', 'string', 'max:12'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'accuracy' => ['required', 'numeric', 'min:0'],
            'descriptor' => ['required', 'array', 'size:128'],
            'descriptor.*' => ['required', 'numeric', 'between:-1,1'],
            'photo' => ['required', 'string', 'max:'.(int) ceil(AttendanceService::MAX_PHOTO_BYTES * 4 / 3 + 64)],
        ]);
        AttendanceService::assertSmallJpeg($data['photo'], 'photo');

        $employee = $this->attendance->identify($data['employee_code'], $data['pin']);
        $attendance = $this->attendance->punch($employee, [
            'latitude' => (float) $data['latitude'],
            'longitude' => (float) $data['longitude'],
            'accuracy' => (float) $data['accuracy'],
            'descriptor' => array_map('floatval', $data['descriptor']),
            'photo' => $data['photo'],
        ], $request);

        return response()->json([
            'type' => $attendance->type,
            'time' => $attendance->created_at->format('g:i A'),
            'distance_m' => $attendance->distance_m,
            'employee' => $this->summary($employee->fresh('branch')),
        ]);
    }

    /** @return array<string, mixed> */
    private function summary(Employee $employee): array
    {
        $branch = $employee->branch;

        return [
            'name' => $employee->full_name,
            'first_name' => $employee->first_name,
            'code' => $employee->employee_code,
            'position' => $employee->position,
            'branch' => $branch ? [
                'name' => $branch->name,
                'latitude' => $branch->latitude,
                'longitude' => $branch->longitude,
                'radius_m' => $branch->geofence_radius_m,
            ] : null,
            'next' => $this->attendance->nextType($employee),
            'blocker' => $this->attendance->blocker($employee),
        ];
    }
}
