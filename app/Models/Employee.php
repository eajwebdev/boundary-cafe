<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Hash;

/**
 * Someone who clocks in at a branch. Staff users (other than administrators)
 * get one automatically; kitchen crew and others can be added on their own.
 */
class Employee extends Model
{
    /** Staff roles that are not treated as employees. */
    public const NON_EMPLOYEE_ROLES = [User::ROLE_SUPER_ADMIN, User::ROLE_ADMINISTRATOR];

    protected $fillable = [
        'user_id',
        'branch_id',
        'employee_code',
        'first_name',
        'last_name',
        'position',
        'phone',
        'pin',
        'face_photo',
        'face_descriptor',
        'face_enrolled_at',
        'is_active',
    ];

    protected $hidden = [
        'pin',
        'face_photo',
        'face_descriptor',
    ];

    protected function casts(): array
    {
        return [
            'pin' => 'hashed',
            'face_descriptor' => 'array',
            'face_enrolled_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Employee $employee) {
            $employee->employee_code ??= self::nextCode();
        });
    }

    /** EMP-0001, EMP-0002, … */
    public static function nextCode(): string
    {
        $last = (int) self::query()->where('employee_code', 'like', 'EMP-%')->max('id');

        do {
            $code = 'EMP-'.str_pad((string) ++$last, 4, '0', STR_PAD_LEFT);
        } while (self::where('employee_code', $code)->exists());

        return $code;
    }

    /** Create or refresh the employee record that mirrors a staff user. */
    public static function syncFromUser(User $user): void
    {
        $employee = self::where('user_id', $user->id)->first();

        if (! $employee && in_array($user->role, self::NON_EMPLOYEE_ROLES, true)) {
            return;
        }

        $details = [
            'first_name' => $user->fname,
            'last_name' => $user->lname,
            'branch_id' => $user->branch_id,
            'position' => $user->role_label,
        ];

        if ($employee) {
            $employee->update($details);

            return;
        }

        self::create($details + ['user_id' => $user->id]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function attendances(): HasMany
    {
        return $this->hasMany(EmployeeAttendance::class);
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    /**
     * The enrolled face samples, each 128 numbers. Older enrollments stored a
     * single descriptor; it is returned as a one-sample list.
     *
     * @return array<int, array<int, float>>
     */
    public function faceSamples(): array
    {
        $stored = $this->face_descriptor;
        if (! is_array($stored) || $stored === []) {
            return [];
        }

        $samples = is_array($stored[0] ?? null) ? $stored : [$stored];

        return array_values(array_filter($samples, fn ($sample) => is_array($sample) && count($sample) === 128));
    }

    public function hasFace(): bool
    {
        return $this->faceSamples() !== [];
    }

    public function checkPin(string $pin): bool
    {
        return $this->pin !== null && Hash::check($pin, $this->pin);
    }
}
