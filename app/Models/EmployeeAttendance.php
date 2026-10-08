<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One time-in / time-out attempt from the employee portal (accepted or rejected). */
class EmployeeAttendance extends Model
{
    public const TYPE_IN = 'in';

    public const TYPE_OUT = 'out';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'employee_id',
        'branch_id',
        'type',
        'status',
        'reason',
        'latitude',
        'longitude',
        'accuracy_m',
        'distance_m',
        'face_distance',
        'liveness',
        'photo',
        'ip_address',
        'user_agent',
    ];

    protected $hidden = ['photo'];

    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'accuracy_m' => 'integer',
            'distance_m' => 'integer',
            'face_distance' => 'float',
            'liveness' => 'array',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
