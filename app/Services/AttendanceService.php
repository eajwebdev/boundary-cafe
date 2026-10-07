<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Time-in / time-out from the employee portal. The phone sends its GPS fix and
 * a face descriptor; both are checked here, never trusted from the client.
 */
class AttendanceService
{
    /** Euclidean distance between face descriptors at or below which two faces match. */
    public const FACE_MATCH_THRESHOLD = 0.5;

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
     * @param  array{latitude: float, longitude: float, accuracy: float, descriptor: array<int, float>, photo: string}  $data
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

        $reason = match (true) {
            $data['accuracy'] > self::MAX_GPS_ACCURACY_M => 'Your location is not precise enough (±'.round($data['accuracy']).' m). Turn on GPS / high accuracy and try again.',
            $distance > $branch->geofence_radius_m => "You are {$distance} m from {$branch->name}. You must be within {$branch->geofence_radius_m} m to clock {$type}.",
            $faceDistance > self::FACE_MATCH_THRESHOLD => 'Your face did not match the enrolled photo. Face the camera in good light and try again.',
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
            'photo' => $data['photo'],
            'ip_address' => $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);

        if ($reason) {
            throw ValidationException::withMessages(['punch' => $reason]);
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
