<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use App\Helpers\MenuHelper;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'fname',
        'lname',
        'username',
        'password',
        'role',
        'branch_id',
        'access',
        'pos_layout',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'role'       => 'string',
        'access'     => 'array',
        'pos_layout' => 'string',
        'password'   => 'hashed',
    ];

    protected $attributes = [
        'role'       => 'cashier',
        'pos_layout' => 'grid',
    ];

    // ── Role constants ─────────────────────────────────────────────

    const ROLE_SUPER_ADMIN   = 'super_admin';
    const ROLE_ADMINISTRATOR = 'administrator';
    const ROLE_MANAGER       = 'manager';
    const ROLE_CASHIER       = 'cashier';
    const ROLE_WAITER        = 'waiter';

    public static function roles(): array
    {
        return [
            self::ROLE_SUPER_ADMIN   => 'Super Admin',
            self::ROLE_ADMINISTRATOR => 'Administrator',
            self::ROLE_MANAGER       => 'Manager',
            self::ROLE_CASHIER       => 'Cashier',
            self::ROLE_WAITER        => 'Waiter / Server',
        ];
    }

    /** Default menu access per role when a user has no explicit `access` list. */
    public static function defaultAccessFor(string $role): array
    {
        return match ($role) {
            self::ROLE_CASHIER => ['2', '3', '14', '15', '16', '39', '40', '41'],
            self::ROLE_WAITER  => ['41'],
            self::ROLE_MANAGER => array_values(array_diff(MenuHelper::ids(), ['23', '25', '28'])),
            default            => [],
        };
    }

    // ── POS Layout constants ───────────────────────────────────────

    /**
     * Valid POS layout modes.
     * Matches the values in PosIndex.tsx LayoutMode type.
     * Used for validation in UserController.
     */
    const POS_LAYOUTS = [
        'grid',
        'tablet',
        'cafe',
        'mobile',     // Android phone cashier — compact vertical layout
    ];

    public static function posLayoutLabels(): array
    {
        return [
            'grid'       => 'PC / Standard',
            'tablet'     => 'Tablet / Touch',
            'cafe'       => 'Cafe / Quick',
            'mobile'     => 'Mobile / Android Phone',
        ];
    }

    // ── Role Helpers ───────────────────────────────────────────────

    public function isSuperAdmin(): bool   { return $this->role === self::ROLE_SUPER_ADMIN; }
    public function isAdministrator(): bool{ return $this->role === self::ROLE_ADMINISTRATOR; }
    public function isManager(): bool      { return $this->role === self::ROLE_MANAGER; }
    public function isCashier(): bool      { return $this->role === self::ROLE_CASHIER; }
    public function isWaiter(): bool       { return $this->role === self::ROLE_WAITER; }

    /** Super Admin OR Administrator */
    public function isAdmin(): bool
    {
        return in_array($this->role, [self::ROLE_SUPER_ADMIN, self::ROLE_ADMINISTRATOR]);
    }

    /** Manager or above */
    public function hasElevatedAccess(): bool
    {
        return in_array($this->role, [
            self::ROLE_SUPER_ADMIN,
            self::ROLE_ADMINISTRATOR,
            self::ROLE_MANAGER,
        ]);
    }

    /** Can approve petty cash vouchers and cash counts */
    public function canApprove(): bool
    {
        return in_array($this->role, [
            self::ROLE_SUPER_ADMIN,
            self::ROLE_ADMINISTRATOR,
            self::ROLE_MANAGER,
        ]);
    }

    /** Super Admin is not restricted to any branch */
    public function isBranchless(): bool
    {
        return $this->role === self::ROLE_SUPER_ADMIN;
    }

    public function getRoleLabelAttribute(): string
    {
        return self::roles()[$this->role] ?? ucfirst($this->role);
    }

    // ── Menu Access ────────────────────────────────────────────────

    public function getAccessibleMenuIds(): array
    {
        $enabledModuleIds = SystemSetting::enabledMenuIds();

        if ($this->isSuperAdmin() || $this->isAdministrator()) {
            return $enabledModuleIds;
        }

        if ($this->isCashier() || $this->isManager() || $this->isWaiter()) {
            $baseAccess = !empty($this->access)
                ? array_map('strval', $this->access)
                : self::defaultAccessFor($this->role);
            return array_values(array_intersect($baseAccess, $enabledModuleIds));
        }

        $baseAccess = array_map('strval', $this->access ?? []);
        return array_values(array_intersect($baseAccess, $enabledModuleIds));
    }

    public function hasAccess(string|int $menuId): bool
    {
        $menuIdStr = (string) $menuId;

        // Dashboard (1) and System Settings (28) are always accessible to super admins and administrators
        if (in_array($menuIdStr, ['1', '28'], true) && ($this->isSuperAdmin() || $this->isAdministrator())) {
            return true;
        }

        // If module is disabled system-wide, nobody has access
        if (!SystemSetting::isModuleEnabled($menuIdStr)) {
            return false;
        }

        if ($this->isSuperAdmin() || $this->isAdministrator()) {
            return true;
        }

        return in_array($menuIdStr, $this->getAccessibleMenuIds(), true);
    }

    public function getAccessibleMenus(): array
    {
        $accessibleIds = $this->getAccessibleMenuIds();
        return array_intersect_key(
            MenuHelper::all(),
            array_flip($accessibleIds)
        );
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFullNameAttribute(): string
    {
        return trim("{$this->fname} {$this->lname}");
    }

    /**
     * Human-readable label for the user's POS layout.
     * e.g.  $user->pos_layout_label → "Cafe / Quick"
     */
    /** Layouts retired with the restaurant/cafe cleanup fall back to the standard grid. */
    public function getPosLayoutAttribute(?string $value): string
    {
        return in_array($value, self::POS_LAYOUTS, true) ? $value : 'grid';
    }

    public function getPosLayoutLabelAttribute(): string
    {
        return self::posLayoutLabels()[$this->pos_layout ?? 'grid'] ?? 'PC / Standard';
    }

    // ── Relationships ──────────────────────────────────────────────

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function supplier()
    {
        return $this->hasOneThrough(
            Supplier::class,
            Branch::class,
            'id',
            'id',
            'branch_id',
            'supplier_id'
        );
    }

    public function sales()
    {
        return $this->hasMany(Sale::class);
    }

    public function cashSessions()
    {
        return $this->hasMany(CashSession::class);
    }

    public function cashCounts()
    {
        return $this->hasMany(CashCount::class, 'counted_by');
    }

    public function verifiedCashCounts()
    {
        return $this->hasMany(CashCount::class, 'verified_by');
    }

    public function expenses()
    {
        return $this->hasMany(Expense::class);
    }

    public function goodsReceived()
    {
        return $this->hasMany(GoodsReceivedNote::class, 'received_by');
    }

    public function confirmedGrns()
    {
        return $this->hasMany(GoodsReceivedNote::class, 'confirmed_by');
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }

    // ── Petty Cash ─────────────────────────────────────────────────

    /** Petty cash funds managed by this user */
    public function managedPettyCashFunds()
    {
        return $this->hasMany(PettyCashFund::class, 'managed_by');
    }

    /** Petty cash vouchers this user submitted */
    public function pettyCashRequests()
    {
        return $this->hasMany(PettyCashVoucher::class, 'requested_by');
    }

    /** Petty cash vouchers this user approved or rejected */
    public function pettyCashApprovals()
    {
        return $this->hasMany(PettyCashVoucher::class, 'approved_by');
    }

    // ── Old relationships kept for backwards compatibility ──────────

    public function sentRequisitions()
    {
        return $this->hasMany(Requisition::class, 'production_user_id');
    }

    public function receivedRequisitions()
    {
        return $this->hasMany(Requisition::class, 'enterprise_user_id');
    }

    public function issuedConsignments()
    {
        return $this->hasMany(ConsignmentStock::class, 'enterprise_user_id');
    }

    public function receivedConsignments()
    {
        return $this->hasMany(ConsignmentStock::class, 'production_user_id');
    }

    public function receivableBalances()
    {
        return $this->hasMany(ProductionBalance::class, 'enterprise_user_id');
    }

    public function payableBalances()
    {
        return $this->hasMany(ProductionBalance::class, 'production_user_id');
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeSuperAdmins($query)    { return $query->where('role', self::ROLE_SUPER_ADMIN); }
    public function scopeAdministrators($query) { return $query->where('role', self::ROLE_ADMINISTRATOR); }
    public function scopeManagers($query)       { return $query->where('role', self::ROLE_MANAGER); }
    public function scopeCashiers($query)       { return $query->where('role', self::ROLE_CASHIER); }
    public function scopeWaiters($query)        { return $query->where('role', self::ROLE_WAITER); }
    public function scopeForBranch($query, int $branchId) { return $query->where('branch_id', $branchId); }
}