<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TimeClockControllerTest extends TestCase
{
    use RefreshDatabase;

    private const BRANCH_LAT = 9.7306;

    private const BRANCH_LNG = 122.9213;

    private Branch $branch;

    private Employee $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $supplier = Supplier::create(['name' => 'Test Supplier']);
        $this->branch = Branch::create([
            'supplier_id' => $supplier->id, 'name' => 'Mabinay', 'code' => 'MAB',
            'latitude' => self::BRANCH_LAT, 'longitude' => self::BRANCH_LNG, 'geofence_radius_m' => 100,
        ]);
        $this->employee = Employee::create([
            'branch_id' => $this->branch->id, 'first_name' => 'Joy', 'last_name' => 'Cruz', 'pin' => '4321',
            'face_descriptor' => $this->descriptor(0.05), 'face_enrolled_at' => now(),
        ]);
    }

    /** @return array<int, float> */
    private function descriptor(float $value): array
    {
        return array_fill(0, 128, $value);
    }

    private function jpeg(): string
    {
        $image = imagecreatetruecolor(16, 16);
        ob_start();
        imagejpeg($image);

        return 'data:image/jpeg;base64,'.base64_encode((string) ob_get_clean());
    }

    /** @param  array<string, mixed>  $overrides */
    private function punch(array $overrides = []): TestResponse
    {
        return $this->postJson('/time-clock/punch', $overrides + [
            'employee_code' => $this->employee->employee_code,
            'pin' => '4321',
            'latitude' => self::BRANCH_LAT + 0.0002,   // ≈ 22 m north
            'longitude' => self::BRANCH_LNG,
            'accuracy' => 12,
            'descriptor' => $this->descriptor(0.06),   // distance ≈ 0.11, a match
            'photo' => $this->jpeg(),
        ]);
    }

    public function test_identify_rejects_a_wrong_pin_with_a_generic_message(): void
    {
        $this->postJson('/time-clock/identify', ['employee_code' => $this->employee->employee_code, 'pin' => '0000'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.pin.0', 'Employee code or PIN is incorrect.');
    }

    public function test_identify_returns_the_next_action_and_branch_area(): void
    {
        $this->postJson('/time-clock/identify', ['employee_code' => strtolower($this->employee->employee_code), 'pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('first_name', 'Joy')
            ->assertJsonPath('next', 'in')
            ->assertJsonPath('branch.radius_m', 100)
            ->assertJsonPath('blocker', null);
    }

    public function test_matching_face_inside_the_area_times_in_then_out(): void
    {
        $this->punch()->assertOk()->assertJsonPath('type', 'in');

        $this->travel(2)->minutes();
        $this->punch()->assertOk()->assertJsonPath('type', 'out');

        $this->assertSame(
            ['in', 'out'],
            EmployeeAttendance::where('status', 'accepted')->orderBy('id')->pluck('type')->all(),
        );
    }

    public function test_second_tap_within_a_minute_is_refused(): void
    {
        $this->punch()->assertOk();

        $this->punch()->assertUnprocessable()->assertJsonPath('errors.employee.0', 'You just clocked in. Please wait a minute before trying again.');
        $this->assertSame(1, EmployeeAttendance::count());
    }

    public function test_outside_the_area_is_rejected_and_logged(): void
    {
        $this->punch(['latitude' => self::BRANCH_LAT + 0.01])   // ≈ 1.1 km away
            ->assertUnprocessable()
            ->assertJsonPath('errors.punch.0', fn (string $message) => str_contains($message, 'You must be within 100 m'));

        $log = EmployeeAttendance::sole();
        $this->assertSame('rejected', $log->status);
        $this->assertGreaterThan(1000, $log->distance_m);
    }

    public function test_a_different_face_is_rejected_and_logged(): void
    {
        $this->punch(['descriptor' => $this->descriptor(-0.05)])   // distance ≈ 1.13
            ->assertUnprocessable()
            ->assertJsonPath('errors.punch.0', 'Your face did not match the enrolled photo. Face the camera in good light and try again.');

        $this->assertSame('rejected', EmployeeAttendance::sole()->status);
    }

    public function test_face_is_matched_against_the_closest_enrolled_sample(): void
    {
        // Four enrolled poses; only the last one is close to today's capture.
        $this->employee->update(['face_descriptor' => [
            $this->descriptor(0.3), $this->descriptor(0.28), $this->descriptor(0.32), $this->descriptor(0.05),
        ]]);

        $this->punch()->assertOk()->assertJsonPath('type', 'in');
        $this->assertEqualsWithDelta(0.1131, EmployeeAttendance::sole()->face_distance, 0.001);
    }

    public function test_imprecise_gps_is_rejected(): void
    {
        $this->punch(['accuracy' => 400])
            ->assertUnprocessable()
            ->assertJsonPath('errors.punch.0', fn (string $message) => str_contains($message, 'not precise enough'));
    }

    public function test_employee_without_an_enrolled_face_cannot_punch(): void
    {
        $this->employee->update(['face_descriptor' => null]);

        $this->punch()->assertUnprocessable()->assertJsonPath('errors.employee.0', 'Your face is not enrolled yet. Ask your manager to enroll it.');
        $this->assertSame(0, EmployeeAttendance::count());
    }

    public function test_branch_without_a_location_blocks_clock_in(): void
    {
        $this->branch->update(['latitude' => null, 'longitude' => null]);

        $this->punch()->assertUnprocessable()->assertJsonPath('errors.employee.0', 'Mabinay has no clock-in location yet. Ask your manager to set it.');
    }

    public function test_photo_must_be_a_jpeg(): void
    {
        $this->punch(['photo' => 'data:image/png;base64,'.base64_encode('not an image')])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo' => 'The photo must be a JPEG image.']);
    }
}
