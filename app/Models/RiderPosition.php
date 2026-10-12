<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A rider's latest GPS fix, sent by their phone while the Rider Dashboard is open. */
class RiderPosition extends Model
{
    /** A fix older than this is shown as "last seen" instead of live. */
    public const LIVE_SECONDS = 90;

    protected $fillable = ['user_id', 'lat', 'lng', 'accuracy_m', 'heading', 'recorded_at'];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'accuracy_m' => 'integer',
            'heading' => 'integer',
            'recorded_at' => 'datetime',
        ];
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function isLive(): bool
    {
        return $this->recorded_at !== null && $this->recorded_at->gt(now()->subSeconds(self::LIVE_SECONDS));
    }

    /**
     * @return array{lat: float, lng: float, accuracy_m: ?int, heading: ?int, recorded_at: ?string, is_live: bool}
     */
    public function toMapArray(): array
    {
        return [
            'lat' => $this->lat,
            'lng' => $this->lng,
            'accuracy_m' => $this->accuracy_m,
            'heading' => $this->heading,
            'recorded_at' => $this->recorded_at?->toIso8601String(),
            'is_live' => $this->isLive(),
        ];
    }
}
