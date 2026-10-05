<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\ActivityLog;
use App\Helpers\MenuHelper;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class SystemSettingsController extends Controller
{
    // ─── Settings visibility rules ────────────────────────────────────────────
    //
    // super_admin_only  → only super admin can see and edit these keys
    // admin_readonly    → administrator can SEE but not edit
    // branch_allowed    → administrator can override per-branch
    //
    // Everything not listed is visible + editable by both super_admin & administrator.

    // Only the modules group is super-admin-only (menus/feature toggles).
    // Administrators can now read and edit global settings for all other groups
    // (general, tax, pos, receipt, inventory, cash, notification).
    // Specific sensitive keys within those groups remain super-admin-only.
    private const SUPER_ADMIN_ONLY_GROUPS = [
        'modules',      // which modules/menus are active for the whole system
    ];

    private const SUPER_ADMIN_ONLY_KEYS = [
        'general.ai_chat_enabled',
        'general.currency_symbol',
        'general.currency_code',
        'general.timezone',
        'general.tin',
        'tax.enable_vat',
        'tax.vat_rate',
        'tax.vat_inclusive',
        'tax.enable_service_charge',
        'tax.service_charge_rate',
    ];

    // Groups that administrators are allowed to access at global scope (null branch).
    private const ADMIN_GLOBAL_GROUPS = [
        'general', 'tax', 'pos', 'receipt', 'inventory', 'cash', 'notification',
    ];

    // ── Index ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = auth()->user();
        $branchId = $request->integer('branch_id') ?: null;
        $isSuper  = $user->isSuperAdmin();
        $isAdmin  = $user->isAdmin(); // super OR administrator

        // Super admin:    can view global scope AND any branch
        // Administrator:   can view global scope (filtered to ADMIN_GLOBAL_GROUPS)
        //                  AND can view/edit any branch override
        // If no branch is explicitly requested, default to the user's own branch
        // (admins can still select "Global" from the UI scope picker)
        if (! $isSuper && ! $branchId && $user->branch_id) {
            $branchId = $user->branch_id;
        }

        $globalRows = SystemSetting::whereNull('branch_id')
            ->orderBy('group')
            ->orderBy('id')
            ->get()
            ->keyBy('key');

        $branchRows = $branchId
            ? SystemSetting::where('branch_id', $branchId)
                ->get()
                ->keyBy('key')
            : collect();

        // Build a defaults lookup keyed by 'key' so we can fill in missing
        // label / type / description on old DB rows that predate migrations.
        $defaults = collect(SystemSetting::defaults())->keyBy('key');

        $groups = [];
        foreach ($globalRows as $key => $row) {
            $group = $row->group;

            // Modules group is handled by the dedicated module-toggles UI — never include here.
            // Also guard by key prefix for old rows that were saved with group = null.
            if (in_array($group, self::SUPER_ADMIN_ONLY_GROUPS) || str_starts_with($key, 'modules.')) continue;

            // Online ordering (menu 43) and loyalty (menu 44) have their own dedicated pages.
            if (in_array($group, ['online', 'loyalty'], true)) continue;

            // When an admin is in global scope (no branch selected), only show
            // the groups they are allowed to configure globally
            if (! $isSuper && ! $branchId && ! in_array($group, self::ADMIN_GLOBAL_GROUPS)) continue;

            $override = $branchRows->get($key);
            $def      = $defaults->get($key, []);

            $groups[$group][$key] = [
                'key'          => $key,
                'label'        => $row->label        ?? ($def['label']       ?? $key),
                'description'  => $row->description  ?? ($def['description'] ?? null),
                'type'         => $row->type          ?? ($def['type']        ?? 'string'),
                'options'      => $row->options
                                    ? json_decode($row->options, true)
                                    : (isset($def['options']) ? json_decode($def['options'], true) : null),
                'is_readonly'  => $row->is_readonly,
                // Super-admin-only keys are read-only for admins even if shown
                'super_only'   => in_array($key, self::SUPER_ADMIN_ONLY_KEYS)
                                || in_array($group, self::SUPER_ADMIN_ONLY_GROUPS),
                'global_value' => $row->value,
                'value'        => $override?->value ?? $row->value,
                'is_overridden'=> $override !== null,
            ];
        }

        // Module/feature flags — which menu IDs are enabled system-wide
        $moduleSettings = $this->getModuleSettings();

        return Inertia::render('Settings/Index', [
            'settings'          => $groups,
            'module_settings'   => $moduleSettings,
            // Both super admin AND administrator can pick branches AND the global scope.
            'branches'          => $isSuper || $user->isAdministrator()
                ? Branch::orderBy('name')->get(['id','name','code','business_type'])
                : null,
            'active_branch_id'  => $branchId,
            'is_super_admin'    => $isSuper,
            'is_administrator'  => $user->isAdministrator(),
            // Pass grouped menus so the UI can render feature flags for super admin and administrator
            'menu_groups'       => ($isSuper || $user->isAdministrator()) ? MenuHelper::grouped() : [],
        ]);
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    public function save(Request $request): RedirectResponse
    {
        $user         = auth()->user();
        $branchId     = $request->integer('branch_id') ?: null;
        $isSuper      = $user->isSuperAdmin();
        $values       = $request->input('settings', []);
        $enabledMenus = $request->input('enabled_menus');

        if ((empty($values) || ! is_array($values)) && $enabledMenus === null) {
            return back()->with('message', ['type' => 'warning', 'text' => 'No settings were changed.']);
        }

        // If enabled_menus was passed and user is super_admin or administrator, apply them
        $modulesSaved = false;
        if ($enabledMenus !== null && ($isSuper || $user->isAdministrator())) {
            $this->applyModuleSettings(is_array($enabledMenus) ? $enabledMenus : [], $request->ip());
            $modulesSaved = true;
        }

        $definitions = SystemSetting::whereNull('branch_id')
            ->get()
            ->keyBy('key');

        $saved   = 0;
        $changed = [];

        foreach ($values as $key => $rawValue) {
            $def = $definitions->get($key);
            if (! $def)             continue;
            if ($def->is_readonly)  continue;

            // Non-super admins: block modules group and super-admin-only keys
            if (! $isSuper) {
                $group = explode('.', $key)[0];
                if (in_array($group, self::SUPER_ADMIN_ONLY_GROUPS)) continue;
                if (in_array($key,   self::SUPER_ADMIN_ONLY_KEYS))   continue;
                // When saving global scope, admin may only touch allowed groups
                if (! $branchId && ! in_array($group, self::ADMIN_GLOBAL_GROUPS)) continue;
            }

            $value = match ($def->type) {
                'boolean' => filter_var($rawValue, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false',
                'integer' => (string) (int)   $rawValue,
                'decimal' => (string) (float) $rawValue,
                default    => (string) ($rawValue ?? ''),
            };

            $existing = SystemSetting::where('key', $key)
                ->where('branch_id', $branchId)
                ->first();

            $oldValue = $existing?->value ?? $def->value;

            if ($oldValue !== $value) {
                SystemSetting::set($key, $value, $branchId);
                $changed[$key] = ['from' => $oldValue, 'to' => $value];
                $saved++;
            }
        }

        if ($saved > 0) {
            ActivityLog::create([
                'user_id'      => auth()->id(),
                'action'       => 'settings_saved',
                'subject_type' => SystemSetting::class,
                'subject_id'   => 0,
                'properties'   => [
                    'branch_id' => $branchId,
                    'scope'     => $branchId ? "branch:{$branchId}" : 'global',
                    'changed'   => $changed,
                    'ip'        => $request->ip(),
                ],
            ]);
        }

        $msg = $modulesSaved && $saved > 0
            ? 'Settings and module access saved successfully.'
            : ($modulesSaved ? 'Module access saved successfully.' : ($branchId ? 'Branch settings saved.' : 'Global settings saved.'));

        return back()->with('message', [
            'type' => 'success',
            'text' => $msg,
        ]);
    }

    // ── Save module/feature flags ─────────────────────────────────────────────

    public function saveModules(Request $request): RedirectResponse
    {
        $user = auth()->user();
        if (! $user->isAdmin()) {
            abort(403, 'Only administrators can manage module availability.');
        }

        $enabled = $request->input('enabled_menus', []);
        $this->applyModuleSettings(is_array($enabled) ? $enabled : [], $request->ip());

        return back()->with('message', ['type' => 'success', 'text' => 'Module settings saved.']);
    }

    private function applyModuleSettings(array $enabled, ?string $ip): void
    {
        $allIds     = array_keys(MenuHelper::all());
        $menuLabels = MenuHelper::all();
        $changed    = [];

        foreach ($allIds as $id) {
            $idStr     = (string) $id;
            $key       = "modules.menu_{$idStr}";
            $isEnabled = in_array($idStr, array_map('strval', $enabled));
            $isCurrentlyEnabled = SystemSetting::isModuleEnabled($idStr);

            if ($isCurrentlyEnabled !== $isEnabled) {
                $new = $isEnabled ? 'true' : 'false';
                SystemSetting::updateOrCreate(
                    ['key' => $key, 'branch_id' => null],
                    [
                        'value'  => $new,
                        'group'  => 'modules',
                        'type'   => 'boolean',
                        'label'  => $menuLabels[$id] ?? $key,
                    ]
                );
                $changed[$idStr] = $new;
            }
        }

        SystemSetting::flushCache(null);

        if (!empty($changed)) {
            ActivityLog::create([
                'user_id'      => auth()->id(),
                'action'       => 'modules_updated',
                'subject_type' => SystemSetting::class,
                'subject_id'   => 0,
                'properties'   => ['changed' => $changed, 'ip' => $ip],
            ]);
        }
    }

    // ── Reset branch key to global default ────────────────────────────────────

    public function reset(Request $request, string $key): RedirectResponse
    {
        $user     = auth()->user();
        $branchId = $request->integer('branch_id') ?: $user->branch_id;

        if (! $branchId) {
            return back()->withErrors(['error' => 'No branch selected.']);
        }

        SystemSetting::where('key', $key)
            ->where('branch_id', $branchId)
            ->delete();

        return back()->with('message', ['type' => 'success', 'text' => "Setting \"{$key}\" reset to global default."]);
    }

    // ── Upload logo ────────────────────────────────────────────────────────────

    public function uploadLogo(Request $request): RedirectResponse
    {
        $request->validate([
            'logo' => ['required', 'image', 'mimes:jpeg,png,jpg,gif,webp,svg', 'max:2048'],
        ]);

        $user     = auth()->user();
        $branchId = $request->integer('branch_id') ?: null;

        if (! $user->isSuperAdmin() && $branchId !== $user->branch_id) {
            abort(403);
        }

        $old = SystemSetting::get('general.logo', $branchId);
        if ($old && Storage::disk('public')->exists($old)) {
            Storage::disk('public')->delete($old);
        }

        $path = $request->file('logo')->store('logos', 'public');
        SystemSetting::set('general.logo', $path, $branchId);

        return back()->with('message', ['type' => 'success', 'text' => 'Logo uploaded.']);
    }

    // ── Helper: read which menus are enabled ──────────────────────────────────
    private function getModuleSettings(): array
    {
        $menuLabels = MenuHelper::all();
        $result     = [];

        foreach ($menuLabels as $id => $label) {
            $idStr = (string) $id;
            $result[$idStr] = SystemSetting::isModuleEnabled($idStr);
        }

        return $result;
    }
}