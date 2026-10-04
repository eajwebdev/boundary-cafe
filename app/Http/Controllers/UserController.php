<?php

namespace App\Http\Controllers;

use App\Helpers\MenuHelper;
use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    // ─── Menu IDs that only Super Admin can assign ────────────────────────────
    // Administrator can manage users but cannot grant access to these menus.

    private const SUPER_ADMIN_ONLY_MENUS = [
        '25', // Branches         — branch management is super_admin scope
        '28', // System Settings  — global settings are super_admin only
    ];

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $actor   = Auth::user();
        $isSuper = $actor->isSuperAdmin();

        $users = User::with('branch:id,name,code,business_type')
            ->when($this->scopedBranchId(), fn($q, $id) => $q->where('branch_id', $id))
            ->latest('created_at')
            ->get()
            ->map(fn (User $u) => [
                'id'               => $u->id,
                'fname'            => $u->fname,
                'lname'            => $u->lname,
                'full_name'        => $u->full_name,
                'username'         => $u->username,
                'role'             => $u->role,
                'role_label'       => $u->role_label,
                'branch_id'        => $u->branch_id,
                'branch'           => $u->branch ? [
                    'id'            => $u->branch->id,
                    'name'          => $u->branch->name,
                    'code'          => $u->branch->code,
                    'business_type' => $u->branch->business_type,
                ] : null,
                'access'           => $u->access ?? [],
                'pos_layout'       => $u->pos_layout ?? 'grid',
                'pos_layout_label' => $u->pos_layout_label,
                'created_at'       => $u->created_at?->toIso8601String(),
                'is_self'          => $u->id === $actor->id,
            ]);

        // Roles the actor can assign
        // Super Admin → all roles
        // Administrator → only manager and cashier (cannot promote to admin-tier)
        $assignableRoles = $isSuper
            ? User::roles()
            : collect(User::roles())->only(['manager', 'cashier'])->toArray();

        // Menus the actor can grant, filtered by enabled modules
        $enabledMenuIds = $this->getEnabledMenuIds();
        $grantableMenus = $this->filterByEnabled(
            $isSuper ? MenuHelper::grouped() : $this->grantableMenusForAdmin(),
            $enabledMenuIds
        );

        return Inertia::render('Users/Index', [
            'users'            => $users,
            'branches'         => Branch::orderBy('name')
                ->get(['id', 'name', 'code', 'business_type'])
                ->map(fn ($b) => [
                    'id'            => $b->id,
                    'name'          => $b->name,
                    'code'          => $b->code,
                    'business_type' => $b->business_type,
                ]),
            'roles'            => $assignableRoles,
            'menus'            => $grantableMenus,
            'menuIds'          => MenuHelper::ids(),
            'is_super_admin'   => $isSuper,
            'is_administrator' => $actor->isAdministrator(),
        ]);
    }

    // ── Store ─────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $actor   = Auth::user();
        $isSuper = $actor->isSuperAdmin();

        if (! $actor->isAdmin()) {
            abort(403, 'Only administrators can create users.');
        }

        $allowedRoles = $isSuper
            ? array_keys(User::roles())
            : ['manager', 'cashier'];

        $validated = $request->validate([
            'fname'      => ['required', 'string', 'max:255'],
            'lname'      => ['required', 'string', 'max:255'],
            'username'   => ['required', 'string', 'max:255', 'unique:users,username'],
            'password'   => ['required', 'string', 'min:6'],
            'role'       => ['required', 'string', 'in:' . implode(',', $allowedRoles)],
            'branch_id'  => ['required', 'exists:branches,id'],
            'access'     => ['nullable', 'array'],
            'access.*'   => ['string', 'in:' . implode(',', MenuHelper::ids())],
            'pos_layout' => ['nullable', 'string', 'in:' . implode(',', User::POS_LAYOUTS)],
        ], [
            'username.unique'    => 'This username is already taken.',
            'password.min'       => 'Password must be at least 6 characters.',
            'branch_id.required' => 'Please select a branch.',
            'branch_id.exists'   => 'Selected branch does not exist.',
        ]);

        // Strip super-admin-only menus if not super admin
        $access = $this->sanitizeAccess($validated['access'] ?? [], $isSuper);

        $user = User::create([
            'fname'      => trim($validated['fname']),
            'lname'      => trim($validated['lname']),
            'username'   => trim($validated['username']),
            'password'   => Hash::make($validated['password']),
            'role'       => $validated['role'],
            'branch_id'  => $validated['branch_id'],
            'access'     => $access,
            'pos_layout' => $validated['pos_layout'] ?? 'grid',
        ]);

        ActivityLog::create([
            'user_id'      => $actor->id,
            'action'       => 'user_created',
            'subject_type' => User::class,
            'subject_id'   => $user->id,
            'properties'   => [
                'new_data'   => $user->only(['fname', 'lname', 'username', 'role', 'branch_id', 'access']),
                'ip'         => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'User created successfully.']);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    public function update(Request $request, User $user): RedirectResponse
    {
        $actor   = Auth::user();
        $isSuper = $actor->isSuperAdmin();

        if (! $actor->isAdmin()) {
            abort(403, 'Only administrators can update users.');
        }

        // Administrator cannot edit a super_admin account
        if (! $isSuper && $user->isSuperAdmin()) {
            abort(403, 'You cannot edit a Super Admin account.');
        }

        $allowedRoles = $isSuper
            ? array_keys(User::roles())
            : ['manager', 'cashier'];

        $validated = $request->validate([
            'fname'      => ['required', 'string', 'max:255'],
            'lname'      => ['required', 'string', 'max:255'],
            'username'   => ['required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'password'   => ['nullable', 'string', 'min:6'],
            'role'       => ['required', 'string', 'in:' . implode(',', $allowedRoles)],
            'branch_id'  => ['required', 'exists:branches,id'],
            'access'     => ['nullable', 'array'],
            'access.*'   => ['string', 'in:' . implode(',', MenuHelper::ids())],
            'pos_layout' => ['nullable', 'string', 'in:' . implode(',', User::POS_LAYOUTS)],
        ], [
            'username.unique'    => 'This username is already taken.',
            'password.min'       => 'Password must be at least 6 characters.',
            'branch_id.required' => 'Please select a branch.',
        ]);

        $access = $this->sanitizeAccess($validated['access'] ?? [], $isSuper);

        $updateData = [
            'fname'      => trim($validated['fname']),
            'lname'      => trim($validated['lname']),
            'username'   => trim($validated['username']),
            'role'       => $validated['role'],
            'branch_id'  => $validated['branch_id'],
            'access'     => $access,
            'pos_layout' => $validated['pos_layout'] ?? $user->pos_layout ?? 'grid',
        ];

        if (! empty($validated['password'])) {
            $updateData['password'] = Hash::make($validated['password']);
        }

        $oldData   = $user->only(['fname', 'lname', 'username', 'role', 'branch_id', 'access', 'pos_layout']);
        $scalarOld = array_intersect_key($oldData, array_flip(['fname', 'lname', 'username', 'role', 'branch_id', 'pos_layout']));
        $scalarNew = array_intersect_key($updateData, array_flip(['fname', 'lname', 'username', 'role', 'branch_id', 'pos_layout']));
        $changed   = array_keys(array_diff_assoc($scalarNew, $scalarOld));

        $accessOld = $oldData['access'] ?? []; sort($accessOld);
        $accessNew = $access; sort($accessNew);
        if ($accessOld !== $accessNew) $changed[] = 'access';
        if (! empty($validated['password'])) $changed[] = 'password';

        if (! empty($changed)) {
            $user->update($updateData);

            ActivityLog::create([
                'user_id'      => $actor->id,
                'action'       => 'user_updated',
                'subject_type' => User::class,
                'subject_id'   => $user->id,
                'properties'   => [
                    'old_data'       => $oldData,
                    'new_data'       => array_diff_key($updateData, ['password' => '']),
                    'changed_fields' => $changed,
                    'ip'             => $request->ip(),
                    'user_agent'     => $request->userAgent(),
                ],
            ]);
        }

        return back()->with('message', ['type' => 'success', 'text' => 'User updated successfully.']);
    }

    // ── Destroy ───────────────────────────────────────────────────────────────

    public function destroy(Request $request, User $user): RedirectResponse
    {
        $actor = Auth::user();

        if ($actor->id === $user->id) {
            throw ValidationException::withMessages(['error' => 'You cannot delete your own account.']);
        }

        // Administrator cannot delete super_admin or another administrator
        if (! $actor->isSuperAdmin() && ($user->isSuperAdmin() || $user->isAdministrator())) {
            abort(403, 'You cannot delete this account.');
        }

        $oldData = $user->only(['fname', 'lname', 'username', 'role', 'branch_id', 'access']);

        ActivityLog::create([
            'user_id'      => $actor->id,
            'action'       => 'user_deleted',
            'subject_type' => User::class,
            'subject_id'   => $user->id,
            'properties'   => [
                'deleted_user' => $user->full_name,
                'old_data'     => $oldData,
                'reason'       => $request->input('reason', 'No reason provided'),
                'ip'           => $request->ip(),
                'user_agent'   => $request->userAgent(),
            ],
        ]);

        $user->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'User deleted successfully.']);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Strip super-admin-only menu IDs from access list when actor is not super admin.
     */
    private function sanitizeAccess(array $access, bool $isSuper): array
    {
        if ($isSuper) return $access;

        return array_values(
            array_filter($access, fn ($id) => ! in_array((string) $id, self::SUPER_ADMIN_ONLY_MENUS))
        );
    }

    /**
     * Return all grouped menus minus super-admin-only ones — used for Administrator's grant panel.
     */
    private function grantableMenusForAdmin(): array
    {
        $grouped = MenuHelper::grouped();
        foreach ($grouped as $group => $menus) {
            foreach (self::SUPER_ADMIN_ONLY_MENUS as $id) {
                unset($grouped[$group][$id]);
            }
            if (empty($grouped[$group])) unset($grouped[$group]);
        }
        return $grouped;
    }

    /**
     * Returns IDs of menus that are enabled in system module settings.
     * If a module key is missing (never saved), it defaults to enabled.
     */
    private function getEnabledMenuIds(): array
    {
        $enabled = [];
        foreach (array_keys(MenuHelper::all()) as $id) {
            $key = "modules.menu_{$id}";
            if (SystemSetting::get($key, null, 'true') !== 'false') {
                $enabled[] = (string) $id;
            }
        }
        return $enabled;
    }

    /**
     * Remove disabled menu IDs from grouped menus.
     */
    private function filterByEnabled(array $grouped, array $enabledIds): array
    {
        foreach ($grouped as $group => $menus) {
            foreach (array_keys($menus) as $id) {
                if (! in_array((string) $id, $enabledIds)) {
                    unset($grouped[$group][$id]);
                }
            }
            if (empty($grouped[$group])) unset($grouped[$group]);
        }
        return $grouped;
    }
}