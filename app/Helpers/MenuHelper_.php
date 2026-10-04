<?php

namespace App\Helpers;

class MenuHelper
{
    /**
     * Get all available menus (numeric ID → label)
     */
    public static function all(): array
    {
        return [
            '1'  => 'Dashboard',
            '2'  => 'Shop',
            '3'  => 'Catering',
            '4'  => 'Rentals',
            '5'  => 'Products & Categories',
            '6'  => 'Sugar Cane',
            '7'  => 'Live Stocks',
            '8'  => 'User Management',
            '9'  => 'Settings',
            '10' => 'Logs',
            '11' => 'Sales Orders',
            '12' => 'POS',
            // Add more here when needed
        ];
    }

    /**
     * Get valid numeric IDs for validation
     */
    public static function ids(): array
    {
        return array_keys(self::all());
    }

    /**
     * Get label for a menu ID
     */
    public static function label(string|int $id): ?string
    {
        return self::all()[(string) $id] ?? null;
    }
}