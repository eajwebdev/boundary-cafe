<?php

namespace App\Http\Middleware;

use App\Events\TableFloorChanged;
use App\Models\Promo;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Props shared with every Inertia page.
     *
     *   props.auth.user                      → logged-in user object
     *   props.auth.user.branch.feature_flags → { table_ordering, variants, ... }
     *   props.settings.require_cash_session  → branch-scoped POS setting
     *   props.flash.message                  → { type, text } toast
     *   props.app.currency                   → e.g. "₱"
     *   props.promos                         → active promos array (for POS)
     */
    public function share(Request $request): array
    {
        $user = Auth::guard('web')->user(); // staff only — customer routes switch the default guard

        if ($user && ! $user->relationLoaded('branch')) {
            $user->load(['branch.supplier']);
        }

        $branch = $user?->branch;
        $branchId = $branch?->id;

        // ── Active promos ──────────────────────────────────────────
        // Loaded once per request for authenticated users.
        // POS uses this for promo code validation and auto-apply.
        // tableExists() prevents crashes before migration has been run.
        $activePromos = [];
        if ($user && Promo::tableExists()) {
            $activePromos = Promo::with(['products:id', 'categories:id'])
                ->active()->forChannel('pos')
                ->get()
                ->map(fn (Promo $p) => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'code' => $p->code,
                    'discount_type' => $p->discount_type,
                    'discount_value' => (float) $p->discount_value,
                    'applies_to' => $p->applies_to,
                    'minimum_purchase' => $p->minimum_purchase ? (float) $p->minimum_purchase : null,
                    'product_ids' => $p->products->pluck('id')->values(),
                    'category_ids' => $p->categories->pluck('id')->values(),
                    'expires_at' => $p->expires_at?->toIso8601String(),
                ])
                ->values()
                ->all();
        }

        $businessName = SystemSetting::businessName($branchId);
        $logoUrl = SystemSetting::logoUrl($branchId);
        $iconUrl = SystemSetting::iconUrl($branchId);

        return array_merge(parent::share($request), [

            // ── App meta ──────────────────────────────────────────
            'app' => [
                'name' => $businessName,
                'tagline' => (string) SystemSetting::get('general.tagline', null, ''),
                'env' => config('app.env'),
                'currency' => SystemSetting::currencySymbol(),
                'ai_chat_enabled' => (bool) SystemSetting::get('general.ai_chat_enabled', null, true),
                'color_theme' => (string) SystemSetting::get('general.color_theme', null, 'ea'),
                'logo_url' => $logoUrl,
                'icon_url' => $iconUrl,
            ],

            // ── Auth ──────────────────────────────────────────────
            'auth' => [
                'authenticated' => Auth::guard('web')->check(),

                'user' => $user ? [

                    // Identity
                    'id' => $user->id,
                    'fname' => $user->fname,
                    'lname' => $user->lname,
                    'full_name' => $user->full_name,
                    'username' => $user->username,

                    // Role
                    'role' => $user->role,
                    'role_label' => $user->role_label,

                    // Menu access array — used by hasAccess() in the sidebar
                    'access' => $user->getAccessibleMenuIds(),

                    // Boolean role helpers
                    'is_super_admin' => $user->isSuperAdmin(),
                    'is_administrator' => $user->isAdministrator(),
                    'is_manager' => $user->isManager(),
                    'is_cashier' => $user->isCashier(),
                    'is_waiter' => $user->isWaiter(),
                    'is_admin' => $user->isAdmin(),
                    'can_approve' => $user->canApprove(),
                    'pos_layout' => $user->pos_layout ?? 'grid',

                    // Branch (null for super_admin who has no branch)
                    'branch_id' => $user->branch_id,
                    'branch' => $branch ? [
                        'id' => $branch->id,
                        'name' => $branch->name,
                        'location' => $branch->location,
                        'code' => $branch->code,
                        'business_type' => $branch->business_type,
                        'is_active' => $branch->is_active,
                        'feature_flags' => $branch->feature_flags,
                    ] : null,

                    // Supplier — resolved through branch
                    'supplier' => $branch?->supplier ? [
                        'id' => $branch->supplier->id,
                        'name' => $branch->supplier->name,
                        'phone' => $branch->supplier->phone,
                        'address' => $branch->supplier->address,
                        'contact_person' => $branch->supplier->contact_person,
                        'is_campus' => $branch->supplier->is_campus,
                    ] : null,

                ] : null,
            ],

            // ── Branch-scoped system settings ─────────────────────
            'settings' => $user ? [

                // POS behaviour
                'require_cash_session' => SystemSetting::requireCashSession($branchId),
                'allow_negative_stock' => SystemSetting::allowNegativeStock($branchId),
                'allow_discount' => (bool) SystemSetting::get('pos.allow_discount', $branchId, true),
                'max_discount_percent' => SystemSetting::maxDiscountPercent($branchId),
                'default_payment' => SystemSetting::get('pos.default_payment', $branchId, 'cash'),
                'item_mode' => SystemSetting::posItemMode($branchId),
                'require_customer_name' => SystemSetting::requireCustomerName($branchId),
                'default_due_days' => SystemSetting::defaultDueDays($branchId),
                'show_product_images' => (bool) SystemSetting::get('pos.show_product_images', $branchId, true),
                'senior_pwd_discount' => (float) SystemSetting::get('pos.senior_pwd_discount', $branchId, 20),

                // Tax
                'vat_enabled' => SystemSetting::vatEnabled($branchId),
                'vat_rate' => SystemSetting::vatRate($branchId),
                'vat_inclusive' => SystemSetting::vatInclusive($branchId),
                'service_charge_enabled' => (bool) SystemSetting::get('tax.enable_service_charge', $branchId, false),
                'service_charge_rate' => (float) SystemSetting::get('tax.service_charge_rate', $branchId, 0),

                // Receipt
                'receipt_header' => SystemSetting::receiptHeader($branchId),
                'receipt_footer' => SystemSetting::get('receipt.footer_text', $branchId, ''),
                'show_cashier_on_receipt' => (bool) SystemSetting::get('receipt.show_cashier', $branchId, true),
                'receipt_copies' => (int) SystemSetting::get('receipt.copies', $branchId, 1),
                'show_vat_breakdown' => (bool) SystemSetting::get('receipt.show_vat_breakdown', $branchId, false),
                'show_logo_on_receipt' => (bool) SystemSetting::get('receipt.show_logo', $branchId, true),

                // Inventory alerts
                'low_stock_threshold' => SystemSetting::lowStockThreshold($branchId),
                'near_expiry_days' => (int) SystemSetting::get('inventory.near_expiry_days', $branchId, 30),

                // Cash management
                'petty_cash_limit' => SystemSetting::pettyCashLimit($branchId),
                'require_count_on_close' => (bool) SystemSetting::get('cash.require_count_on_close', $branchId, true),
                'over_short_alert' => (float) SystemSetting::get('cash.over_short_alert', $branchId, 100),

            ] : null,

            // ── Realtime (Pusher) — staff screens only ────────────
            // The key and cluster are public by design; the secret never leaves the server.
            'realtime' => fn () => $this->realtime($user),

            // ── Signed-in online customer (separate "customer" guard) ──
            // Only the fields the customer app needs — never staff data.
            'customer' => fn () => ($c = Auth::guard('customer')->user()) ? [
                'id' => $c->id,
                'name' => $c->name,
                'first_name' => Str::before(trim($c->name), ' '),
                'contact_number' => $c->contact_number,
                'email' => $c->email,
                'barangay' => $c->barangay,
                'customer_number' => $c->customer_number,
                'loyalty_points' => (int) $c->loyalty_points,
            ] : null,

            // ── Active promos (staff POS only) ─────────────────────
            // Available on every page via usePage().props.promos
            'promos' => $activePromos,

            // ── Flash messages ────────────────────────────────────
            'flash' => [
                'success' => session('success'),
                'error' => session('error'),
                'warning' => session('warning'),
                'info' => session('info'),
                'message' => session('message'),
                'pos_result' => session('pos_result'),
                'saved_address_id' => session('saved_address_id'),
            ],

            // ── Ziggy route helper ────────────────────────────────
            'ziggy' => [
                'location' => $request->url(),
            ],

        ]);
    }

    /**
     * What the browser needs to open a Pusher connection, or null when realtime is off.
     *
     * @return array{key: string, cluster: string, floor_channel: string|null}|null
     */
    private function realtime(?User $user): ?array
    {
        $pusher = config('broadcasting.connections.pusher');

        if (! $user || config('broadcasting.default') !== 'pusher' || empty($pusher['key'])) {
            return null;
        }

        $branchId = $user->workingBranchId();
        $seesFloor = $branchId && ($user->hasAccess(41) || $user->hasAccess(2));

        return [
            'key' => $pusher['key'],
            'cluster' => $pusher['options']['cluster'],
            'floor_channel' => $seesFloor ? 'private-'.TableFloorChanged::channelFor($branchId) : null,
        ];
    }
}
