<?php

namespace App\Helpers;

class MenuHelper
{
    /**
     * All available menus.
     *
     * Format: 'id' => ['label' => '...', 'group' => '...', 'roles' => [...]]
     *
     * roles = which roles can ever be granted this menu.
     *   super_admin    — full system, no branch restriction
     *   administrator  — branch-level full admin
     *   manager        — approves, verifies, views reports
     *   cashier        — POS only
     *
     * super_admin bypasses all access checks (isSuperAdmin() returns true
     * in User::hasAccess()). The 'roles' list here is used only when building
     * the access-grant UI so admins don't accidentally assign cashier-only
     * menus to a super_admin, or super_admin menus to a cashier.
     *
     * Groups (used for sidebar section headers):
     *   main          — top-level always-visible items
     *   sales         — POS and transaction screens
     *   inventory     — products, stock, purchasing
     *   cash          — cash sessions, counting, petty cash
     *   reports       — summaries, logs, analytics
     *   management    — users, suppliers, branches, settings
     */
    public static function all(): array
    {
        return [

            // ── Main ──────────────────────────────────────────────
            '1'  => [
                'label' => 'Dashboard',
                'group' => 'main',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],

            // ── Sales ─────────────────────────────────────────────
            '2'  => [
                'label' => 'POS / Cashier',
                'group' => 'sales',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],
            '3'  => [
                'label' => 'Sales History',
                'group' => 'sales',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '4'  => [
                'label' => 'Table Orders',
                'group' => 'sales',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],
            '5'  => [
                'label' => 'Orders (Shop)',
                'group' => 'sales',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '29' => [
                'label' => 'Promos & Discounts',
                'group' => 'sales',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],

            // ── Inventory ─────────────────────────────────────────
            '6'  => [
                'label' => 'Products',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '7'  => [
                'label' => 'Categories',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator'],
            ],
            '8'  => [
                'label' => 'Product Variants',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '9'  => [
                'label' => 'Product Bundles',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '10' => [
                'label' => 'Recipes / BOM',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '11' => [
                'label' => 'Stock Management',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '12' => [
                'label' => 'Purchase Orders',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '13' => [
                'label' => 'Goods Received (GRN)',
                'group' => 'inventory',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],

            // ── Cash ──────────────────────────────────────────────
            '14' => [
                'label' => 'Cash Sessions',
                'group' => 'cash',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],
            '15' => [
                'label' => 'Cash Counts',
                'group' => 'cash',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],
            '16' => [
                'label' => 'Petty Cash',
                'group' => 'cash',
                'roles' => ['super_admin', 'administrator', 'manager', 'cashier'],
            ],
            '17' => [
                'label' => 'Expenses',
                'group' => 'cash',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],

            // ── Reports ───────────────────────────────────────────
            '18' => [
                'label' => 'Daily Summary',
                'group' => 'reports',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '19' => [
                'label' => 'Sales Report',
                'group' => 'reports',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '20' => [
                'label' => 'Inventory Report',
                'group' => 'reports',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '21' => [
                'label' => 'Expense Report',
                'group' => 'reports',
                'roles' => ['super_admin', 'administrator', 'manager'],
            ],
            '22' => [
                'label' => 'Activity Logs',
                'group' => 'reports',
                'roles' => ['super_admin', 'administrator'],
            ],

            // ── Management ────────────────────────────────────────
            '23' => [
                'label' => 'User Management',
                'group' => 'management',
                'roles' => ['super_admin', 'administrator'],
            ],
            '24' => [
                'label' => 'Suppliers',
                'group' => 'management',
                'roles' => ['super_admin', 'administrator'],
            ],
            '25' => [
                'label' => 'Branches',
                'group' => 'management',
                'roles' => ['super_admin'],
            ],
            '26' => [
                'label' => 'Dining Tables',
                'group' => 'management',
                'roles' => ['super_admin', 'administrator'],
            ],
            '27' => [
                'label' => 'Expense Categories',
                'group' => 'management',
                'roles' => ['super_admin', 'administrator'],
            ],
            '28' => [
                'label' => 'System Settings',
                'group' => 'management',
                'roles' => ['super_admin', 'administrator'],
            ],
        ];
    }

    // ── Simple lookups ─────────────────────────────────────────────────

    /**
     * All valid numeric string IDs — used in validation rules.
     * e.g.  'access.*' => 'in:' . implode(',', MenuHelper::ids())
     */
    public static function ids(): array
    {
        return array_keys(self::all());
    }

    /**
     * Flat id → label map (matches the old format, backwards compatible).
     * e.g.  ['1' => 'Dashboard', '2' => 'POS / Cashier', ...]
     */
    public static function labels(): array
    {
        return array_map(fn($m) => $m['label'], self::all());
    }

    /**
     * Get the label for a single menu ID.
     */
    public static function label(string|int $id): ?string
    {
        return self::all()[(string) $id]['label'] ?? null;
    }

    /**
     * Get the group for a single menu ID.
     */
    public static function group(string|int $id): ?string
    {
        return self::all()[(string) $id]['group'] ?? null;
    }

    // ── Role-based filtering ───────────────────────────────────────────

    /**
     * All menus accessible to a given role.
     * Returns id → label map.
     *
     * Usage (in controller when building the access-grant UI):
     *   MenuHelper::forRole('cashier')
     *   → ['2' => 'POS / Cashier', '14' => 'Cash Sessions', ...]
     */
    public static function forRole(string $role): array
    {
        return array_map(
            fn($m) => $m['label'],
            array_filter(
                self::all(),
                fn($m) => in_array($role, $m['roles'])
            )
        );
    }

    /**
     * Valid menu IDs for a given role (for validation).
     * Usage:  'access.*' => 'in:' . implode(',', MenuHelper::idsForRole($user->role))
     */
    public static function idsForRole(string $role): array
    {
        return array_keys(self::forRole($role));
    }

    // ── Grouped menus (for sidebar rendering) ─────────────────────────

    /**
     * All group names in display order.
     */
    public static function groups(): array
    {
        return ['main', 'sales', 'inventory', 'cash', 'reports', 'management'];
    }

    /**
     * Human-readable group labels for sidebar section headers.
     */
    public static function groupLabel(string $group): string
    {
        return match ($group) {
            'main'       => 'Main',
            'sales'      => 'Sales',
            'inventory'  => 'Inventory',
            'cash'       => 'Cash',
            'reports'    => 'Reports',
            'management' => 'Management',
            default      => ucfirst($group),
        };
    }

    /**
     * All menus grouped by their section — useful for rendering the sidebar.
     *
     * Returns:
     * [
     *   'main'      => ['1' => 'Dashboard'],
     *   'sales'     => ['2' => 'POS / Cashier', '3' => 'Sales History', ...],
     *   'inventory' => [...],
     *   ...
     * ]
     */
    public static function grouped(): array
    {
        $result = [];

        foreach (self::groups() as $group) {
            $result[$group] = [];
        }

        foreach (self::all() as $id => $menu) {
            $result[$menu['group']][$id] = $menu['label'];
        }

        return array_filter($result); // drop empty groups
    }

    /**
     * Menus grouped by section, filtered to what a specific role can access.
     * Used when building the sidebar for a logged-in user.
     *
     * Usage (in a controller or Inertia shared data):
     *   MenuHelper::groupedForRole($user->role)
     */
    public static function groupedForRole(string $role): array
    {
        $result = [];

        foreach (self::groups() as $group) {
            $result[$group] = [];
        }

        foreach (self::all() as $id => $menu) {
            if (in_array($role, $menu['roles'])) {
                $result[$menu['group']][$id] = $menu['label'];
            }
        }

        return array_filter($result);
    }

    /**
     * Menus a user currently has access to, grouped by section.
     * Filters groupedForRole() down further by the user's actual access array.
     * super_admin bypasses the access array entirely.
     *
     * Usage (in a controller):
     *   MenuHelper::groupedForUser($user)
     */
    public static function groupedForUser(\App\Models\User $user): array
    {
        // Super admin sees everything — no access array check needed
        if ($user->isSuperAdmin()) {
            return self::groupedForRole('super_admin');
        }

        $userAccess = array_map('strval', $user->access ?? []);
        $result     = [];

        foreach (self::groups() as $group) {
            $result[$group] = [];
        }

        foreach (self::all() as $id => $menu) {
            if (in_array($role = $user->role, $menu['roles']) && in_array($id, $userAccess)) {
                $result[$menu['group']][$id] = $menu['label'];
            }
        }

        return array_filter($result);
    }
}
