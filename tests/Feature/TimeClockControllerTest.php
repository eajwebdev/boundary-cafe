<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\EmployeeAttendance;
use App\Models\Supplier;
use App\Services\AttendanceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class TimeClockControllerTest extends TestCase
{
    use RefreshDatabase;

    private const BRANCH_LAT = 9.7306;

    private const BRANCH_LNG = 122.9213;

    private const DEVICE = 'joys-own-phone';

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

    /**
     * Start a live face check the way the portal does before the camera steps.
     * When the portal would refuse, a dummy check is returned so the punch itself can be tested.
     *
     * @return array{token: string, steps: array<int, string>}
     */
    private function challenge(string $device = self::DEVICE): array
    {
        $response = $this->withCredentials()->withCookie(AttendanceService::DEVICE_COOKIE, $device)
            ->postJson('/time-clock/challenge', ['employee_code' => $this->employee->employee_code, 'pin' => '4321']);

        return $response->isOk() ? $response->json() : ['token' => 'not-issued', 'steps' => AttendanceService::LIVENESS_ACTIONS];
    }

    /**
     * A live check a real face passes: the steps in the order asked, the head
     * turning each way and the mouth opening, all of it the enrolled person.
     *
     * @param  array<int, string>  $steps
     * @return array<string, mixed>
     */
    private function liveness(array $steps): array
    {
        $measured = [
            'turn_left' => ['turn' => 0.2, 'mouth' => 0.05],
            'turn_right' => ['turn' => -0.2, 'mouth' => 0.05],
            'open_mouth' => ['turn' => 0.0, 'mouth' => 0.5],
        ];

        return [
            'camera' => 'Front Camera',
            'neutral' => ['turn' => 0.0, 'mouth' => 0.05],
            'steps' => array_map(fn (string $action) => ['action' => $action, 'descriptor' => $this->descriptor(0.06)] + $measured[$action], $steps),
        ];
    }

    /**
     * Time in or out the way the portal does: start a live check, then punch with its result.
     *
     * @param  array<string, mixed>  $overrides
     * @param  (callable(array<string, mixed>): array<string, mixed>)|null  $tamper  changes the live-check result before it is sent
     * @param  array{token: string, steps: array<int, string>}|null  $challenge  an earlier check to reuse
     */
    private function punch(array $overrides = [], ?callable $tamper = null, string $device = self::DEVICE, ?array $challenge = null): TestResponse
    {
        $challenge ??= $this->challenge();
        $liveness = $this->liveness($challenge['steps']);

        return $this->withCredentials()->withCookie(AttendanceService::DEVICE_COOKIE, $device)->postJson('/time-clock/punch', $overrides + [
            'employee_code' => $this->employee->employee_code,
            'pin' => '4321',
            'latitude' => self::BRANCH_LAT + 0.0002,   // ≈ 22 m north
            'longitude' => self::BRANCH_LNG,
            'accuracy' => 12,
            'descriptor' => $this->descriptor(0.06),   // distance ≈ 0.11, a match
            'photo' => $this->jpeg(),
            'challenge' => $challenge['token'],
            'liveness' => $tamper ? $tamper($liveness) : $liveness,
        ]);
    }

    /**
     * Change one step of a live-check result.
     *
     * @param  array<string, mixed>  $liveness
     * @param  array<string, mixed>  $changes
     * @return array<string, mixed>
     */
    private function withStep(array $liveness, string $action, array $changes): array
    {
        $liveness['steps'] = array_map(fn (array $step) => $step['action'] === $action ? $changes + $step : $step, $liveness['steps']);

        return $liveness;
    }

    private function assertRejectedWith(TestResponse $response, string $reason): void
    {
        $response->assertUnprocessable()->assertJsonPath('errors.punch.0', $reason);
        $this->assertSame('rejected', EmployeeAttendance::latest('id')->first()->status);
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

    public function test_challenge_asks_for_every_step_once_and_needs_the_right_pin(): void
    {
        $this->postJson('/time-clock/challenge', ['employee_code' => $this->employee->employee_code, 'pin' => '0000'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.pin.0', 'Employee code or PIN is incorrect.');

        $steps = $this->challenge()['steps'];

        $this->assertEqualsCanonicalizing(['turn_left', 'turn_right', 'open_mouth'], $steps);
    }

    public function test_accepted_punch_keeps_what_the_live_check_measured(): void
    {
        $this->punch()->assertOk();

        $liveness = EmployeeAttendance::sole()->liveness;
        $this->assertSame('Front Camera', $liveness['camera']);
        $this->assertEqualsWithDelta(0.2, $liveness['head_turn_left'], 0.001);
        $this->assertEqualsWithDelta(0.45, $liveness['mouth_open'], 0.001);
    }

    public function test_a_live_check_cannot_be_used_twice(): void
    {
        $challenge = $this->challenge();
        $this->punch(challenge: $challenge)->assertOk();

        $this->travel(2)->minutes();
        $this->assertRejectedWith($this->punch(challenge: $challenge), 'The face check expired. Please try again.');
    }

    public function test_an_expired_live_check_is_rejected(): void
    {
        $challenge = $this->challenge();
        $this->travel(AttendanceService::CHALLENGE_TTL_SECONDS + 1)->seconds();

        $this->assertRejectedWith($this->punch(challenge: $challenge), 'The face check expired. Please try again.');
    }

    public function test_steps_done_in_another_order_are_rejected(): void
    {
        $this->assertRejectedWith(
            $this->punch(tamper: fn (array $liveness) => ['steps' => array_reverse($liveness['steps'])] + $liveness),
            'The face check steps were not done in the order asked. Please try again.',
        );
    }

    public function test_a_flat_photo_that_cannot_turn_its_head_is_rejected(): void
    {
        // Tilting a photo or a screen keeps the nose on the eye–mouth line, so the "turn" barely changes.
        $flat = fn (array $liveness) => $this->withStep($this->withStep($liveness, 'turn_left', ['turn' => 0.02]), 'turn_right', ['turn' => -0.02]);

        $this->assertRejectedWith(
            $this->punch(tamper: $flat),
            'No real head turn was seen. Use your own face, not a photo or video, and turn your head when asked.',
        );
        $this->assertEqualsWithDelta(0.02, EmployeeAttendance::sole()->liveness['head_turn_left'], 0.001);
    }

    public function test_a_turn_to_only_one_side_is_rejected(): void
    {
        $this->assertRejectedWith(
            $this->punch(tamper: fn (array $liveness) => $this->withStep($liveness, 'turn_right', ['turn' => 0.2])),
            'No real head turn was seen. Use your own face, not a photo or video, and turn your head when asked.',
        );
    }

    public function test_a_mouth_that_never_opens_is_rejected(): void
    {
        $this->assertRejectedWith(
            $this->punch(tamper: fn (array $liveness) => $this->withStep($liveness, 'open_mouth', ['mouth' => 0.1])),
            'Your mouth did not open when asked. Please try again and open your mouth wide.',
        );
    }

    public function test_someone_else_doing_a_step_is_rejected(): void
    {
        $this->assertRejectedWith(
            $this->punch(tamper: fn (array $liveness) => $this->withStep($liveness, 'open_mouth', ['descriptor' => $this->descriptor(-0.05)])),
            'Your face did not match during the face check. Only you should be in front of the camera.',
        );
    }

    public function test_a_virtual_camera_is_rejected(): void
    {
        $this->assertRejectedWith(
            $this->punch(tamper: fn (array $liveness) => ['camera' => 'OBS Virtual Camera'] + $liveness),
            "A virtual camera was detected. Use your phone's own camera.",
        );
    }

    public function test_identify_gives_the_phone_a_device_cookie(): void
    {
        $this->postJson('/time-clock/identify', ['employee_code' => $this->employee->employee_code, 'pin' => '4321'])
            ->assertOk()
            ->assertCookie(AttendanceService::DEVICE_COOKIE);
    }

    public function test_first_accepted_punch_registers_the_phone_and_another_phone_is_refused(): void
    {
        $this->punch()->assertOk();
        $this->assertNotNull($this->employee->fresh()->device_registered_at);
        $this->travel(2)->minutes();

        $notYourPhone = 'This is not your registered phone. Clock in with your own phone, or ask your manager to reset your registered phone.';

        // The portal warns before the camera opens and will not start a live check.
        $this->withCredentials()->withCookie(AttendanceService::DEVICE_COOKIE, 'co-workers-phone')
            ->postJson('/time-clock/identify', ['employee_code' => $this->employee->employee_code, 'pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('blocker', $notYourPhone);
        $this->assertSame('not-issued', $this->challenge('co-workers-phone')['token']);

        // A punch sent from another phone anyway is refused and logged.
        $this->assertRejectedWith($this->punch(device: 'co-workers-phone'), $notYourPhone);

        $this->punch()->assertOk()->assertJsonPath('type', 'out');
    }
}
