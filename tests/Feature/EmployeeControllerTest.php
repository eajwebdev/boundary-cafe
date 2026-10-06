<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Employee;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class EmployeeControllerTest extends TestCase
{
    use RefreshDatabase;

    private function branch(string $code): Branch
    {
        $supplier = Supplier::firstOrCreate(['name' => 'Test Supplier']);

        return Branch::create(['supplier_id' => $supplier->id, 'name' => "Branch {$code}", 'code' => $code]);
    }

    private function user(string $role, ?Branch $branch, string $username): User
    {
        return User::create([
            'fname' => ucfirst($username), 'lname' => 'Test', 'username' => $username, 'password' => 'password',
            'role' => $role, 'branch_id' => $branch?->id, 'access' => ['45', '46'],
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

    public function test_face_enrollment_needs_at_least_four_matching_samples(): void
    {
        $branch = $this->branch('HOME');
        $manager = $this->user(User::ROLE_MANAGER, $branch, 'mara');
        $crew = Employee::create(['branch_id' => $branch->id, 'first_name' => 'Kitchen']);
        $url = "/employees/{$crew->id}/face";

        $this->actingAs($manager)
            ->post($url, ['descriptors' => [$this->descriptor(0.05), $this->descriptor(0.06), $this->descriptor(0.04)], 'photo' => $this->jpeg()])
            ->assertSessionHasErrors(['descriptors' => 'Capture at least 4 face samples.']);

        $this->actingAs($manager)
            ->post($url, ['descriptors' => [
                $this->descriptor(0.05), $this->descriptor(0.05), $this->descriptor(0.05), $this->descriptor(-0.05),
            ], 'photo' => $this->jpeg()])
            ->assertSessionHasErrors(['descriptors' => 'Face sample 4 does not look like the others. Retake all samples with only one person in view.']);
        $this->assertFalse($crew->fresh()->hasFace());

        $this->actingAs($manager)
            ->post($url, ['descriptors' => [
                $this->descriptor(0.05), $this->descriptor(0.06), $this->descriptor(0.04), $this->descriptor(0.055),
            ], 'photo' => $this->jpeg()])
            ->assertSessionHasNoErrors();
        $this->assertCount(4, $crew->fresh()->faceSamples());
    }

    public function test_staff_users_except_administrators_become_employees(): void
    {
        $branch = $this->branch('HOME');

        $cashier = $this->user(User::ROLE_CASHIER, $branch, 'ana');
        $this->user(User::ROLE_ADMINISTRATOR, $branch, 'boss');
        $this->user(User::ROLE_SUPER_ADMIN, null, 'owner');

        $employee = Employee::sole();
        $this->assertSame($cashier->id, $employee->user_id);
        $this->assertSame($branch->id, $employee->branch_id);
        $this->assertSame('Cashier', $employee->position);
        $this->assertSame('EMP-0001', $employee->employee_code);

        $cashier->update(['fname' => 'Anabel']);
        $this->assertSame('Anabel', $employee->fresh()->first_name);
    }

    public function test_manager_sees_only_their_branch_and_can_add_an_employee_there(): void
    {
        $home = $this->branch('HOME');
        $away = $this->branch('AWAY');
        $manager = $this->user(User::ROLE_MANAGER, $home, 'mara');
        $this->user(User::ROLE_CASHIER, $away, 'faraway');

        $this->actingAs($manager)
            ->get('/employees')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Employees/Index')
                ->has('employees', 1)
                ->where('employees.0.full_name', 'Mara Test'));

        $this->actingAs($manager)
            ->post('/employees', ['first_name' => 'Kitchen', 'last_name' => 'Crew', 'branch_id' => $away->id, 'pin' => '1234'])
            ->assertSessionHasNoErrors();

        $crew = Employee::where('first_name', 'Kitchen')->sole();
        $this->assertSame($home->id, $crew->branch_id, 'Managers can only add to their own branch');
        $this->assertTrue($crew->checkPin('1234'));
    }

    public function test_manager_cannot_set_another_branchs_clock_in_area(): void
    {
        $home = $this->branch('HOME');
        $away = $this->branch('AWAY');
        $manager = $this->user(User::ROLE_MANAGER, $home, 'mara');

        $this->actingAs($manager)
            ->patch("/attendance/branches/{$home->id}/location", ['latitude' => 9.73, 'longitude' => 122.92, 'geofence_radius_m' => 80])
            ->assertSessionHasNoErrors();
        $this->assertSame(80, $home->fresh()->geofence_radius_m);

        $this->actingAs($manager)
            ->patch("/attendance/branches/{$away->id}/location", ['latitude' => 9.73, 'longitude' => 122.92, 'geofence_radius_m' => 80])
            ->assertNotFound();
        $this->assertNull($away->fresh()->latitude);
    }
}
