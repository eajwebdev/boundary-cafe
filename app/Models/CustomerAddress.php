<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerAddress extends Model
{
    protected $fillable = [
        'customer_id', 'label', 'barangay', 'municipality', 'province', 'zip_code', 'street', 'landmark', 'notes_for_rider',
        'lat', 'lng', 'formatted_address', 'is_default',
    ];

    protected $casts = [
        'lat' => 'float',
        'lng' => 'float',
        'is_default' => 'boolean',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function toFrontend(): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'barangay' => $this->barangay,
            'municipality' => $this->municipality,
            'province' => $this->province,
            'zip_code' => $this->zip_code,
            'locality' => $this->locality(),
            'street' => $this->street,
            'landmark' => $this->landmark,
            'notes_for_rider' => $this->notes_for_rider,
            'lat' => (float) $this->lat,
            'lng' => (float) $this->lng,
            'formatted_address' => $this->formatted_address,
            'is_default' => (bool) $this->is_default,
            'summary' => collect([$this->street, $this->locality()])->filter()->implode(', '),
        ];
    }

    /** "Dahile, Mabinay, Negros Oriental 6207" */
    public function locality(): string
    {
        return static::formatLocality($this->barangay, $this->municipality, $this->province, $this->zip_code);
    }

    public static function formatLocality(?string $barangay, ?string $municipality, ?string $province, ?string $zipCode): string
    {
        $area = SystemSetting::serviceArea();
        $line = collect([$barangay, $municipality ?: $area['town'], $province ?: $area['province']])->filter()->implode(', ');

        return trim($line.' '.($zipCode ?? ''));
    }
}
