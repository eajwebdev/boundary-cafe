<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ExpenseCategory extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'color',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    // ── Relationships ──────────────────────────────────────────────

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class);
    }

    // ── Helpers ────────────────────────────────────────────────────

    /**
     * Default categories to seed for every fresh install.
     * Usage: foreach (ExpenseCategory::defaults() as $cat)
     *            ExpenseCategory::firstOrCreate(['name' => $cat['name']], $cat);
     */
    public static function defaults(): array
    {
        return [
            ['name' => 'Utilities',      'color' => '#378ADD', 'description' => 'Electricity, water, internet'],
            ['name' => 'Petty cash',     'color' => '#BA7517', 'description' => 'Small miscellaneous purchases'],
            ['name' => 'Supplies',       'color' => '#1D9E75', 'description' => 'Packaging, cleaning materials'],
            ['name' => 'Salary',         'color' => '#7F77DD', 'description' => 'Daily wages and labor pay'],
            ['name' => 'Rent',           'color' => '#D85A30', 'description' => 'Stall or space rental'],
            ['name' => 'Repairs',        'color' => '#D4537E', 'description' => 'Equipment and maintenance'],
            ['name' => 'Transportation', 'color' => '#639922', 'description' => 'Delivery, fuel'],
            ['name' => 'Others',         'color' => '#888780', 'description' => 'Uncategorized expenses'],
        ];
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
