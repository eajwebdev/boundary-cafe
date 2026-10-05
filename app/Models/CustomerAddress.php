<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerAddress extends Model
{
    protected $fillable = [
        'customer_id', 'label', 'barangay', 'street', 'landmark', 'notes_for_rider',
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
            'street' => $this->street,
            'landmark' => $this->landmark,
            'notes_for_rider' => $this->notes_for_rider,
            'lat' => (float) $this->lat,
            'lng' => (float) $this->lng,
            'formatted_address' => $this->formatted_address,
            'is_default' => (bool) $this->is_default,
            'summary' => collect([$this->street, $this->barangay, 'Mabinay'])->filter()->implode(', '),
        ];
    }
}
