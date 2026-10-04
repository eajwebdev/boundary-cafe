<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarehouseStock extends Model
{
    protected $table = 'warehouse_stocks';

    protected $fillable = [
        'warehouse_id', 'product_id', 'stock',
        'capital', 'markup', 'price',
        'expiry_date', 'batch_number', 'days_before_expiry_warning',
        'updated_by',
    ];

    protected $casts = [
        'stock'                      => 'integer',
        'capital'                    => 'decimal:2',
        'markup'                     => 'decimal:2',
        'price'                      => 'decimal:2',
        'expiry_date'                => 'date',
        'days_before_expiry_warning' => 'integer',
    ];

    protected $attributes = [
        'stock'                      => 0,
        'capital'                    => 0.00,
        'markup'                     => 0.00,
        'price'                      => 0.00,
        'days_before_expiry_warning' => 30,
    ];

    protected static function booted(): void
    {
        static::saving(function (WarehouseStock $s) {
            if (!is_null($s->capital) && !is_null($s->markup)) {
                $s->price = round((float) $s->capital * (1 + ((float) $s->markup / 100)), 2);
            }
        });
    }

    public function warehouse(): BelongsTo { return $this->belongsTo(Warehouse::class); }
    public function product(): BelongsTo   { return $this->belongsTo(Product::class); }
    public function updatedBy(): BelongsTo { return $this->belongsTo(User::class, 'updated_by'); }

    public function getStockStatusAttribute(): string
    {
        if ($this->expiry_date && $this->expiry_date->isPast()) return 'Expired';
        if ($this->stock <= 0)  return 'Out of Stock';
        if ($this->stock <= 5)  return 'Low Stock';
        return 'In Stock';
    }
}
