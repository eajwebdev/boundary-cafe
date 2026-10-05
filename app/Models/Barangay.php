<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Barangay extends Model
{
    protected $fillable = [
        'name', 'municipality', 'province', 'lat', 'lng', 'is_deliverable', 'sort_order',
    ];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
        'is_deliverable' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function scopeDeliverable($query)
    {
        return $query->where('is_deliverable', true);
    }

    public function scopeOrdered($query)
    {
        return $query->orderBy('sort_order')->orderBy('name');
    }

    public static function isDeliverable(?string $name): bool
    {
        if (! $name) {
            return false;
        }

        return static::deliverable()->where('name', $name)->exists();
    }
}
