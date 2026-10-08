<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Time-in / time-out from the employee portal. The phone sends its GPS fix,
 * a face descriptor and the result of a live face check; all are checked here,
 * never trusted from the client.
 *
 * Fake faces are stopped in layers:
 *  - Photos: a photo cannot open its mouth, and tilting a flat picture keeps
 *    the nose on the eye–mouth line, so it fails the head-turn depth check.
 *  - Recorded videos: the steps come in a random order chosen here, and each
 *    check is single-use and expires, so a recording cannot follow it.
 *  - Video calls: a live person on a call can follow the steps, so each
 *    employee may only clock in from their own registered phone.
 */
class AttendanceService
{
    /** Euclidean distance between face descriptors at or below which two faces match. */
    public const FACE_MATCH_THRESHOLD = 0.5;

    /** Looser match for the turned-head frames of the live check (a turned face reads further from the enrolled ones). */
    public const STEP_FACE_MATCH_THRESHOLD = 0.6;

    /** The live face check: these actions, in a random order for every punch. */
    public const LIVENESS_ACTIONS = ['turn_left', 'turn_right', 'open_mouth'];

    /** A live check must be finished within this many seconds of being issued. */
    public const CHALLENGE_TTL_SECONDS = 120;

    /**
     * How far the nose tip must move off the eye–mouth line, as a share of the
     * distance between the eyes, when the head turns each way. Only a 3D face
     * can do this.
     */
    public const MIN_HEAD_TURN = 0.1;

    /** How much the mouth must open (inner lip height ÷ width) compared with looking straight ahead. */
    public const MIN_MOUTH_OPEN = 0.2;

    /** Camera names of software that feeds in a video instead of a real camera. */
    public const VIRTUAL_CAMERA_PATTERN = '/virtual|\bobs\b|manycam|snap camera|xsplit|splitcam|droidcam|epoccam|iriun|\bcamo\b|\bndi\b|vcam|youcam/i';

    /** Long-lived cookie that identifies the phone an employee clocks in from. */
    public const DEVICE_COOKIE = 'time_clock_device';

    /** Enrollment needs at least this many face samples (different slight poses). */
    public const MIN_ENROLL_SAMPLES = 4;

    public const MAX_ENROLL_SAMPLES = 8;

    /** A GPS fix less precise than this cannot prove the employee is on site. */
    public const MAX_GPS_ACCURACY_M = 150;

    /** Ignore a second tap of the same button within this many seconds. */
    public const DUPLICATE_WINDOW_SECONDS = 60;

    /** Largest stored photo (decoded bytes): keeps each record in the low-KB range. */
    public const MAX_PHOTO_BYTES = 60 * 1024;

    public function __construct(private DeliveryZoneService $zone) {}

    /** Find an active employee by code + PIN, or fail with one generic message. */
    public function identify(string $code, string $pin): Employee
    {
        $employee = Employee::with('branch')
            ->where('employee_code', strtoupper(trim($code)))
            ->where('is_active', true)
            ->first();

        if (! $employee || ! $employee->checkPin($pin)) {
            throw ValidationException::withMessages(['pin' => 'Employee code or PIN is incorrect.']);
        }

        return $employee;
    }

    /** "in" when the employee has no open time-in today, otherwise "out". */
    public function nextType(Employee $employee): string
    {
        $last = $employee->attendances()
            ->where('status', EmployeeAttendance::STATUS_ACCEPTED)
            ->where('created_at', '>=', now()->startOfDay())
            ->latest('id')
            ->value('type');

        return $last === EmployeeAttendance::TYPE_IN ? EmployeeAttendance::TYPE_OUT : EmployeeAttendance::TYPE_IN;
    }

    /** Problems that stop an employee from clocking in at all (shown before the camera opens). */
    public function blocker(Employee $employee): ?string
    {
        $branch = $employee->branch;

        return match (true) {
            ! $branch => 'You are not assigned to a branch yet. Ask your manager.',
            ! $this->hasLocation($branch) => "{$branch->name} has no clock-in location yet. Ask your manager to set it.",
            ! $employee->hasFace() => 'Your face is not enrolled yet. Ask your manager to enroll it.',
            default => null,
        };
    }

    /**
     * Problem with the phone being used, or null when it is the employee's
     * registered phone (or they have none yet; the first accepted punch registers it).
     */
    public function deviceProblem(Employee $employee, ?string $deviceToken): ?string
    {
        if (! $deviceToken) {
            return 'This phone could not be recognised. Allow cookies for this site and try again.';
        }

        if ($employee->device_token_hash !== null && ! hash_equals($employee->device_token_hash, self::hashDeviceToken($deviceToken))) {
            return 'This is not your registered phone. Clock in with your own phone, or ask your manager to reset your registered phone.';
        }

        return null;
    }

    public static function hashDeviceToken(string $deviceToken): string
    {
        return hash('sha256', $deviceToken);
    }

    /**
     * Start a live face check: the steps in a random order, valid once and only briefly.
     *
     * @return array{token: string, steps: array<int, string>, expires_in: int}
     */
    public function issueChallenge(Employee $employee): array
    {
        $token = Str::random(40);
        $steps = Arr::shuffle(self::LIVENESS_ACTIONS);

        Cache::put(self::challengeKey($token), ['employee_id' => $employee->id, 'steps' => $steps], self::CHALLENGE_TTL_SECONDS);

        return ['token' => $token, 'steps' => $steps, 'expires_in' => self::CHALLENGE_TTL_SECONDS];
    }

    private static function challengeKey(string $token): string
    {
        return 'time-clock:challenge:'.hash('sha256', $token);
    }

    /**
     * Why the live face check failed, or null when it passed. The check is
     * used up either way, so it cannot be replayed.
     *
     * @param  array{camera?: ?string, neutral: array{turn: float, mouth: float}, steps: array<int, array{action: string, descriptor: array<int, float>, turn: float, mouth: float}>}  $liveness
     */
    public function livenessProblem(Employee $employee, string $challengeToken, array $liveness): ?string
    {
        $challenge = Cache::pull(self::challengeKey($challengeToken));
        $steps = array_column($liveness['steps'], null, 'action');
        $neutral = $liveness['neutral'];

        return match (true) {
            ! $challenge || $challenge['employee_id'] !== $employee->id => 'The face check expired. Please try again.',
            array_column($liveness['steps'], 'action') !== $challenge['steps'] => 'The face check steps were not done in the order asked. Please try again.',
            (bool) preg_match(self::VIRTUAL_CAMERA_PATTERN, (string) ($liveness['camera'] ?? '')) => "A virtual camera was detected. Use your phone's own camera.",
            $this->stepFaceDistance($employee, $liveness['steps']) > self::STEP_FACE_MATCH_THRESHOLD => 'Your face did not match during the face check. Only you should be in front of the camera.',
            $steps['turn_left']['turn'] - $neutral['turn'] < self::MIN_HEAD_TURN,
            $neutral['turn'] - $steps['turn_right']['turn'] < self::MIN_HEAD_TURN => 'No real head turn was seen. Use your own face, not a photo or video, and turn your head when asked.',
            $steps['open_mouth']['mouth'] - $neutral['mouth'] < self::MIN_MOUTH_OPEN => 'Your mouth did not open when asked. Please try again and open your mouth wide.',
            default => null,
        };
    }

    /**
     * Worst match among the live-check frames, so every step must be the same person.
     *
     * @param  array<int, array{descriptor: array<int, float>}>  $steps
     */
    private function stepFaceDistance(Employee $employee, array $steps): float
    {
        return max(array_map(fn (array $step) => $this->closestFaceDistance($employee->faceSamples(), $step['descriptor']), $steps));
    }

    /**
     * What the live check measured, kept on the attendance record for review.
     *
     * @param  array{camera?: ?string, neutral: array{turn: float, mouth: float}, steps: array<int, array{action: string, turn: float, mouth: float}>}  $liveness
     * @return array<string, mixed>
     */
    private function livenessSummary(array $liveness): array
    {
        $steps = array_column($liveness['steps'], null, 'action');
        $neutral = $liveness['neutral'];

        return [
            'steps' => array_column($liveness['steps'], 'action'),
            'camera' => isset($liveness['camera']) ? mb_substr((string) $liveness['camera'], 0, 120) : null,
            'head_turn_left' => isset($steps['turn_left']) ? round($steps['turn_left']['turn'] - $neutral['turn'], 3) : null,
            'head_turn_right' => isset($steps['turn_right']) ? round($neutral['turn'] - $steps['turn_right']['turn'], 3) : null,
            'mouth_open' => isset($steps['open_mouth']) ? round($steps['open_mouth']['mouth'] - $neutral['mouth'], 3) : null,
        ];
    }

    public function hasLocation(Branch $branch): bool
    {
        return $branch->latitude !== null && $branch->longitude !== null;
    }

    public function distanceMeters(Branch $branch, float $lat, float $lng): int
    {
        return (int) round($this->zone->distanceKm((float) $branch->latitude, (float) $branch->longitude, $lat, $lng) * 1000);
    }

    /** @param  array<int, float>  $a
     *  @param  array<int, float>  $b */
    public function faceDistance(array $a, array $b): float
    {
        $sum = 0.0;
        foreach ($a as $i => $value) {
            $sum += ((float) $value - (float) ($b[$i] ?? 0)) ** 2;
        }

        return sqrt($sum);
    }

    /**
     * Distance to the closest enrolled sample, so a slight head turn still matches.
     *
     * @param  array<int, array<int, float>>  $samples
     * @param  array<int, float>  $descriptor
     */
    public function closestFaceDistance(array $samples, array $descriptor): float
    {
        return min(array_map(fn (array $sample) => $this->faceDistance($sample, $descriptor), $samples));
    }

    /**
     * Enrollment samples must all be the same person: each one has to be close
     * to the average of the set.
     *
     * @param  array<int, array<int, float>>  $samples
     *
     * @throws ValidationException
     */
    public function assertConsistentSamples(array $samples): void
    {
        $mean = array_map(
            fn (int $index) => array_sum(array_column($samples, $index)) / count($samples),
            range(0, 127),
        );

        foreach ($samples as $number => $sample) {
            if ($this->faceDistance($sample, $mean) > self::FACE_MATCH_THRESHOLD) {
                throw ValidationException::withMessages([
                    'descriptors' => 'Face sample '.($number + 1).' does not look like the others. Retake all samples with only one person in view.',
                ]);
            }
        }
    }

    /**
     * Record a time-in / time-out. Rejections are stored too, then reported back.
     *
     * @param  array{latitude: float, longitude: float, accuracy: float, descriptor: array<int, float>, photo: string, device_token: ?string, challenge: string, liveness: array<string, mixed>}  $data
     */
    public function punch(Employee $employee, array $data, Request $request): EmployeeAttendance
    {
        if ($blocker = $this->blocker($employee)) {
            throw ValidationException::withMessages(['employee' => $blocker]);
        }

        $type = $this->nextType($employee);
        $recent = $employee->attendances()
            ->where('status', EmployeeAttendance::STATUS_ACCEPTED)
            ->where('created_at', '>=', now()->subSeconds(self::DUPLICATE_WINDOW_SECONDS))
            ->latest('id')
            ->first();
        if ($recent) {
            throw ValidationException::withMessages(['employee' => 'You just clocked '.$recent->type.'. Please wait a minute before trying again.']);
        }

        $branch = $employee->branch;
        $distance = $this->distanceMeters($branch, $data['latitude'], $data['longitude']);
        $faceDistance = round($this->closestFaceDistance($employee->faceSamples(), $data['descriptor']), 4);
        $deviceProblem = $this->deviceProblem($employee, $data['device_token']);
        // Always run: it uses up the challenge even when another check fails first.
        $livenessProblem = $this->livenessProblem($employee, $data['challenge'], $data['liveness']);

        $reason = match (true) {
            $deviceProblem !== null => $deviceProblem,
            $data['accuracy'] > self::MAX_GPS_ACCURACY_M => 'Your location is not precise enough (±'.round($data['accuracy']).' m). Turn on GPS / high accuracy and try again.',
            $distance > $branch->geofence_radius_m => "You are {$distance} m from {$branch->name}. You must be within {$branch->geofence_radius_m} m to clock {$type}.",
            $faceDistance > self::FACE_MATCH_THRESHOLD => 'Your face did not match the enrolled photo. Face the camera in good light and try again.',
            $livenessProblem !== null => $livenessProblem,
            default => null,
        };

        $attendance = $employee->attendances()->create([
            'branch_id' => $branch->id,
            'type' => $type,
            'status' => $reason ? EmployeeAttendance::STATUS_REJECTED : EmployeeAttendance::STATUS_ACCEPTED,
            'reason' => $reason,
            'latitude' => $data['latitude'],
            'longitude' => $data['longitude'],
            'accuracy_m' => (int) round($data['accuracy']),
            'distance_m' => $distance,
            'face_distance' => $faceDistance,
            'liveness' => $this->livenessSummary($data['liveness']),
            'photo' => $data['photo'],
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        if ($reason) {
            throw ValidationException::withMessages(['punch' => $reason]);
        }

        if ($employee->device_token_hash === null) {
            $employee->update([
                'device_token_hash' => self::hashDeviceToken($data['device_token']),
                'device_registered_at' => now(),
            ]);
        }

        return $attendance;
    }

    /**
     * Validate a small JPEG data URL and return it unchanged.
     *
     * @throws ValidationException
     */
    public static function assertSmallJpeg(string $dataUrl, string $field): string
    {
        $prefix = 'data:image/jpeg;base64,';
        $bytes = str_starts_with($dataUrl, $prefix) ? base64_decode(substr($dataUrl, strlen($prefix)), true) : false;

        if ($bytes === false || @getimagesizefromstring($bytes) === false) {
            throw ValidationException::withMessages([$field => 'The photo must be a JPEG image.']);
        }
        if (strlen($bytes) > self::MAX_PHOTO_BYTES) {
            throw ValidationException::withMessages([$field => 'The photo is too large (max '.(self::MAX_PHOTO_BYTES / 1024).' KB).']);
        }

        return $dataUrl;
    }
}
