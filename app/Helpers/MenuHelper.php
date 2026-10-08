<?php

namespace App\Helpers;

class MenuHelper
{
    /**
     * Get all available menus (numeric ID → label)
     * Must stay in sync with MENU constant in AdminLayout.tsx
     */
    public static function all(): array
    {
        return [
            '1' => 'Dashboard',
            '2' => 'POS / Cashier',
            '3' => 'Sales History',
            '6' => 'Products',
            '7' => 'Categories',
            '8' => 'Variants',
            '9' => 'Bundles',
            '10' => 'Recipes',
            '11' => 'Stock Management',
            '12' => 'Purchase Orders',
            '13' => 'Goods Received Notes',
            '14' => 'Cash Sessions',
            '15' => 'Cash Counts',
            '16' => 'Petty Cash',
            '17' => 'Expenses',
            '18' => 'Daily Summary',
            '19' => 'Sales Report',
            '20' => 'Inventory Report',
            '21' => 'Expense Report',
            '22' => 'Activity Logs',
            '23' => 'User Management',
            '24' => 'Suppliers',
            '25' => 'Branches',
            '27' => 'Expense Categories',
            '28' => 'System Settings',
            '29' => 'Promos & Discounts',
            '30' => 'Ingredient Usage Report',
            '31' => 'Losses / Damages',
            '33' => 'Inventory',
            '34' => 'Stock Transfers',
            '36' => 'Stock Count',
            '39' => 'Customers',
            '40' => 'Online Orders',
            '41' => 'Table Ordering',
            '42' => 'Dining Tables',
            '43' => 'Delivery Zone',
            '44' => 'Loyalty Program',
            '45' => 'Employees',
            '46' => 'Attendance',
            '47' => 'Z-Reading',
        ];
    }

    /**
     * Menu IDs that were retired when the system was narrowed to a restaurant/cafe.
     * Kept here so stale `access` arrays and module toggles can be ignored safely.
     */
    public static function retired(): array
    {
        return ['4', '5', '26', '32', '35', '37', '38'];
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

    /**
     * Grouped menus for frontend sidebar / permission panels (used by UserController & SystemSettingsController)
     */
    public static function grouped(): array
    {
        return [
            'Main' => [
                '1' => 'Dashboard',
            ],
            'Sales' => [
                '2' => 'POS / Cashier',
                '3' => 'Sales History',
                '40' => 'Online Orders',
                '41' => 'Table Ordering',
                '29' => 'Promos & Discounts',
                '39' => 'Customers',
                '44' => 'Loyalty Program',
            ],
            'Inventory' => [
                '6' => 'All Products',
                '7' => 'Categories',
                '8' => 'Variants',
                '9' => 'Bundles',
                '10' => 'Recipes',
                '11' => 'Stock Management',
                '12' => 'Purchase Orders',
                '13' => 'Goods Received Notes',
                '31' => 'Losses / Damages',
                '33' => 'Inventory',
                '34' => 'Stock Transfers',
                '36' => 'Stock Count',
            ],
            'Cash' => [
                '14' => 'Cash Sessions',
                '15' => 'Cash Counts',
                '47' => 'Z-Reading',
                '16' => 'Petty Cash',
                '17' => 'Expenses',
            ],
            'Reports' => [
                '18' => 'Daily Summary',
                '19' => 'Sales Report',
                '20' => 'Inventory Report',
                '21' => 'Expense Report',
                '30' => 'Ingredient Usage Report',
                '22' => 'Activity Logs',
            ],
            'Management' => [
                '23' => 'Users',
                '45' => 'Employees',
                '46' => 'Attendance',
                '24' => 'Suppliers',
                '25' => 'Branches',
                '27' => 'Expense Categories',
                '42' => 'Dining Tables',
                '43' => 'Delivery Zone',
                '28' => 'System Settings',
            ],
        ];
    }
}
