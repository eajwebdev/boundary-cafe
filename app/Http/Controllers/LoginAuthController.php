<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class LoginAuthController extends Controller
{
    private const DEMO_ACCOUNTS = [
        'admin' => User::ROLE_ADMINISTRATOR,
        'manager' => User::ROLE_MANAGER,
        'cashier' => User::ROLE_CASHIER,
        'cashier_tag' => User::ROLE_CASHIER,
        'cashier_mab' => User::ROLE_CASHIER,
        'waiter' => User::ROLE_WAITER,
    ];

    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 300;

    public function getLogin(): Response|RedirectResponse
    {
        if (Auth::check()) {
            return redirect()->to($this->defaultRouteFor(Auth::user()));
        }

        $isDemo = (bool) config('app.demo');

        $demoUsers = [];
        if ($isDemo) {
            $users = User::whereIn('username', array_keys(self::DEMO_ACCOUNTS))
                ->where('role', '!=', User::ROLE_SUPER_ADMIN)
                ->with('branch')
                ->orderBy('id')
                ->get()
                ->filter(fn (User $user): bool => self::DEMO_ACCOUNTS[$user->username] === $user->role);
            $demoUsers = $users->map(function ($u) {
                $roleLabel = match ($u->role) {
                    User::ROLE_ADMINISTRATOR => 'Administrator',
                    User::ROLE_MANAGER => 'Store Manager',
                    User::ROLE_CASHIER => 'Cashier',
                    User::ROLE_WAITER => 'Waiter / Server',
                    default => ucfirst(str_replace('_', ' ', $u->role)),
                };

                return [
                    'id' => $u->id,
                    'name' => trim($u->fname.' '.$u->lname),
                    'username' => $u->username,
                    'role' => $u->role,
                    'role_label' => $roleLabel,
                    'branch' => $u->branch?->name ?? 'Main Store',
                ];
            })->values();
        }

        return Inertia::render('Login', [
            'business_name' => SystemSetting::businessName(),
            'logo_url' => SystemSetting::logoUrl(),
            'tagline' => (string) SystemSetting::get('general.tagline', null, ''),
            'locations' => $this->branchLocations(),
            'is_demo' => $isDemo,
            'demo_users' => $demoUsers,
        ]);
    }

    /** Active branch places for the login page, e.g. "Boundary Cafe – Tagukon" becomes "Tagukon". */
    private function branchLocations(): string
    {
        return Branch::where('is_active', true)
            ->orderBy('id')
            ->get(['id', 'name'])
            ->map(fn (Branch $branch) => $branch->location)
            ->filter()
            ->unique()
            ->implode(' · ');
    }

    public function postLogin(Request $request): RedirectResponse
    {
        $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $throttleKey = $this->throttleKey($request);
        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($throttleKey);

            return back()->withErrors([
                'username' => "Too many login attempts. Please try again in {$seconds} seconds.",
            ]);
        }

        $authenticated = Auth::attempt(
            ['username' => $request->username, 'password' => $request->password],
            $request->boolean('remember')
        );

        if (! $authenticated) {
            RateLimiter::hit($throttleKey, self::DECAY_SECONDS);

            ActivityLog::create([
                'user_id' => null,
                'action' => 'login_failed',
                'properties' => [
                    'username' => $request->username,
                    'ip' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'url' => $request->fullUrl(),
            ]);

            return back()->withErrors([
                'username' => 'Invalid username or password.',
            ])->onlyInput('username');
        }

        RateLimiter::clear($throttleKey);
        $request->session()->regenerate();

        $user = Auth::user();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'login',
            'subject_type' => get_class($user),
            'subject_id' => $user->id,
            'properties' => [
                'username' => $user->username,
                'role' => $user->role,
                'branch_id' => $user->branch_id,
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'method' => $request->method(),
            'url' => $request->fullUrl(),
        ]);

        return redirect()->to($this->defaultRouteFor($user));
    }

    public function postDemoLogin(Request $request): RedirectResponse
    {
        abort_unless(config('app.demo'), 404);

        $validated = $request->validate([
            'username' => ['required', 'string'],
        ]);

        abort_unless(isset(self::DEMO_ACCOUNTS[$validated['username']]), 404);

        $user = User::where('username', $validated['username'])
            ->where('role', self::DEMO_ACCOUNTS[$validated['username']])
            ->firstOrFail();

        Auth::login($user);
        $request->session()->regenerate();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'login',
            'subject_type' => get_class($user),
            'subject_id' => $user->id,
            'properties' => [
                'username' => $user->username,
                'role' => $user->role,
                'branch_id' => $user->branch_id,
                'demo' => true,
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'method' => $request->method(),
            'url' => $request->fullUrl(),
        ]);

        return redirect()->to($this->defaultRouteFor($user));
    }

    public function postLogout(Request $request): RedirectResponse
    {
        $user = Auth::user();

        if ($user) {
            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'logout',
                'subject_type' => get_class($user),
                'subject_id' => $user->id,
                'properties' => [
                    'username' => $user->username,
                    'ip' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'url' => $request->fullUrl(),
            ]);
        }

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    private function throttleKey(Request $request): string
    {
        return Str::lower($request->input('username')).'|'.$request->ip();
    }

    private function defaultRouteFor(User $user): string
    {
        if ($user->isSuperAdmin()) {
            return route('dashboard');
        }

        // Waiters land on the table ordering screen
        if ($user->isWaiter()) {
            return route('table-orders.index');
        }

        // Cashiers always land on POS — never on dashboard
        if ($user->isCashier()) {
            return route('pos.index');
        }

        $access = array_map('strval', $user->access ?? []);

        if (in_array('1', $access)) {
            return route('dashboard');
        }

        $routeMap = [
            '2' => 'pos.index',
            '40' => 'online-orders.index',
            '41' => 'table-orders.index',
            '6' => 'products.index',
            '14' => 'cash-sessions.index',
            '18' => 'reports.daily',
            '22' => 'logs.index',
            '23' => 'users.index',
        ];

        foreach ($routeMap as $menuId => $routeName) {
            if (in_array($menuId, $access)) {
                try {
                    return route($routeName);
                } catch (\Exception) {
                    continue;
                }
            }
        }

        return route('dashboard');
    }
}
