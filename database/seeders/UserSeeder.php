<?php

namespace Database\Seeders;

use App\Helpers\MenuHelper;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Default users for single-branch store:
     *   super_admin   — system administrator (full privileges, bypasses branch locks)
     *   administrator — store administrator (full branch admin: products, inventory, users, reports)
     *   manager       — store manager (expenses, cash counts, stock audits)
     *   cashier       — POS cashier (fast cashiering, sales, cash drawer)
     */
    public function run(): void
    {
        $branch = Branch::where('code', 'BC-MAIN')->first() ?? Branch::first();

        $users = [
            // ── 1. Super Admin ─────────────────────────────────────────────
            [
                'fname' => 'System',
                'lname' => 'Administrator',
                'username' => 'superadmin',
                'password' => Hash::make('superadmin123'),
                'role' => User::ROLE_SUPER_ADMIN,
                'branch_id' => null,
                'access' => MenuHelper::ids(),
            ],

            // ── 2. Store Administrator ─────────────────────────────────────
            [
                'fname' => 'Store',
                'lname' => 'Admin',
                'username' => 'admin',
                'password' => Hash::make('admin123'),
                'role' => User::ROLE_ADMINISTRATOR,
                'branch_id' => $branch?->id,
                'access' => MenuHelper::ids(),
            ],

            // ── 3. Store Manager ───────────────────────────────────────────
            [
                'fname' => 'Store',
                'lname' => 'Manager',
                'username' => 'manager',
                'password' => Hash::make('manager123'),
                'role' => User::ROLE_MANAGER,
                'branch_id' => $branch?->id,
                'access' => array_values(array_diff(MenuHelper::ids(), ['23', '25', '28'])),
            ],

            // ── 4. POS Cashier ─────────────────────────────────────────────
            [
                'fname' => 'Main',
                'lname' => 'Cashier',
                'username' => 'cashier',
                'password' => Hash::make('cashier123'),
                'role' => User::ROLE_CASHIER,
                'branch_id' => $branch?->id,
                'access' => ['2', '3', '14', '15', '16', '39'],
            ],
        ];

        foreach ($users as $data) {
            User::updateOrCreate(['username' => $data['username']], $data);
        }

        foreach (Branch::whereIn('code', ['BC-TAG', 'BC-MAB'])->get() as $branchOffice) {
            $suffix = strtolower(str_replace('BC-', '', $branchOffice->code));
            User::updateOrCreate(['username' => "cashier_{$suffix}"], [
                'fname' => $branchOffice->code === 'BC-TAG' ? 'Tagukon' : 'Mabinay',
                'lname' => 'Cashier',
                'password' => Hash::make('cashier123'),
                'role' => User::ROLE_CASHIER,
                'branch_id' => $branchOffice->id,
                'access' => ['2', '3', '14', '15', '16', '39'],
            ]);
        }

        $this->command->info('✓ Single Branch Users seeded ('.count($users).')');
    }
}
