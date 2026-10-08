<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\SystemSetting;
use App\Services\AttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public employee portal: code + PIN, then GPS + a live face check to time in / time out.
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
            'liveness' => [
                'min_head_turn' => AttendanceService::MIN_HEAD_TURN,
                'min_mouth_open' => AttendanceService::MIN_MOUTH_OPEN,
            ],
        ]);
    }

    /**
     * Check the code + PIN and tell the portal what happens next. Also gives the
     * phone its long-lived device cookie, so it can be registered to the employee.
     */
    public function identify(Request $request): JsonResponse
    {
        $data = $this->validateCredentials($request);
        $deviceToken = $request->cookie(AttendanceService::DEVICE_COOKIE) ?: Str::random(40);

        $employee = $this->attendance->identify($data['employee_code'], $data['pin']);

        return response()
            ->json($this->summary($employee, $deviceToken))
            ->withCookie(cookie()->forever(AttendanceService::DEVICE_COOKIE, $deviceToken));
    }

    /** Start the live face check: the steps to do, in a random order. */
    public function challenge(Request $request): JsonResponse
    {
        $data = $this->validateCredentials($request);
        $employee = $this->attendance->identify($data['employee_code'], $data['pin']);

        $problem = $this->attendance->blocker($employee)
            ?? $this->attendance->deviceProblem($employee, $request->cookie(AttendanceService::DEVICE_COOKIE));
        if ($problem) {
            throw ValidationException::withMessages(['employee' => $problem]);
        }

        return response()->json($this->attendance->issueChallenge($employee));
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
            'challenge' => ['required', 'string', 'max:64'],
            'liveness' => ['required', 'array'],
            'liveness.camera' => ['nullable', 'string', 'max:255'],
            'liveness.neutral' => ['required', 'array'],
            'liveness.neutral.turn' => ['required', 'numeric', 'between:-5,5'],
            'liveness.neutral.mouth' => ['required', 'numeric', 'between:0,5'],
            'liveness.steps' => ['required', 'array', 'size:'.count(AttendanceService::LIVENESS_ACTIONS)],
            'liveness.steps.*.action' => ['required', 'string', 'distinct', Rule::in(AttendanceService::LIVENESS_ACTIONS)],
            'liveness.steps.*.turn' => ['required', 'numeric', 'between:-5,5'],
            'liveness.steps.*.mouth' => ['required', 'numeric', 'between:0,5'],
            'liveness.steps.*.descriptor' => ['required', 'array', 'size:128'],
            'liveness.steps.*.descriptor.*' => ['required', 'numeric', 'between:-1,1'],
        ]);
        AttendanceService::assertSmallJpeg($data['photo'], 'photo');

        $employee = $this->attendance->identify($data['employee_code'], $data['pin']);
        $attendance = $this->attendance->punch($employee, [
            'latitude' => (float) $data['latitude'],
            'longitude' => (float) $data['longitude'],
            'accuracy' => (float) $data['accuracy'],
            'descriptor' => array_map('floatval', $data['descriptor']),
            'photo' => $data['photo'],
            'device_token' => $request->cookie(AttendanceService::DEVICE_COOKIE),
            'challenge' => $data['challenge'],
            'liveness' => $this->livenessInput($data['liveness']),
        ], $request);

        return response()->json([
            'type' => $attendance->type,
            'time' => $attendance->created_at->format('g:i A'),
            'distance_m' => $attendance->distance_m,
            'employee' => $this->summary($employee->fresh('branch'), $request->cookie(AttendanceService::DEVICE_COOKIE)),
        ]);
    }

    /** @return array{employee_code: string, pin: string} */
    private function validateCredentials(Request $request): array
    {
        return $request->validate([
            'employee_code' => ['required', 'string', 'max:20'],
            'pin' => ['required', 'string', 'max:12'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $liveness
     * @return array{camera: ?string, neutral: array{turn: float, mouth: float}, steps: array<int, array{action: string, descriptor: array<int, float>, turn: float, mouth: float}>}
     */
    private function livenessInput(array $liveness): array
    {
        return [
            'camera' => $liveness['camera'] ?? null,
            'neutral' => ['turn' => (float) $liveness['neutral']['turn'], 'mouth' => (float) $liveness['neutral']['mouth']],
            'steps' => array_map(fn (array $step) => [
                'action' => $step['action'],
                'descriptor' => array_map('floatval', array_values($step['descriptor'])),
                'turn' => (float) $step['turn'],
                'mouth' => (float) $step['mouth'],
            ], array_values($liveness['steps'])),
        ];
    }

    /** @return array<string, mixed> */
    private function summary(Employee $employee, ?string $deviceToken): array
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
            'blocker' => $this->attendance->blocker($employee) ?? $this->attendance->deviceProblem($employee, $deviceToken),
        ];
    }
}
