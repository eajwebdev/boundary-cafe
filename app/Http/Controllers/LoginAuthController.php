<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class LoginAuthController extends Controller
{
    private const MAX_ATTEMPTS   = 5;
    private const DECAY_SECONDS  = 300;

    public function getLogin(): Response|RedirectResponse
    {
        if (Auth::check()) {
            return redirect()->to($this->defaultRouteFor(Auth::user()));
        }

        $isDemo = filter_var(env('DEMO', false), FILTER_VALIDATE_BOOLEAN) || (bool) config('app.demo', false);

        $demoUsers = [];
        if ($isDemo) {
            $branch = Branch::first();
            $users = User::where('role', '!=', User::ROLE_SUPER_ADMIN)
                ->where('username', '!=', 'superadmin')
                ->orderBy('id')
                ->get();
            $demoUsers = $users->map(function ($u) use ($branch) {
                $roleLabel = match($u->role) {
                    User::ROLE_SUPER_ADMIN   => 'Super Admin',
                    User::ROLE_ADMINISTRATOR => 'Administrator',
                    User::ROLE_MANAGER       => 'Store Manager',
                    User::ROLE_CASHIER       => 'Cashier',
                    User::ROLE_WAITER        => 'Waiter / Server',
                    default                  => ucfirst(str_replace('_', ' ', $u->role)),
                };

                $password = match($u->username) {
                    'superadmin' => 'superadmin123',
                    'admin'      => 'admin123',
                    'manager'    => 'manager123',
                    'cashier'    => 'cashier123',
                    'waiter'     => 'waiter123',
                    default      => str_starts_with($u->username, 'cashier') ? 'cashier123' : 'password',
                };

                return [
                    'id'         => $u->id,
                    'name'       => trim($u->fname . ' ' . $u->lname),
                    'username'   => $u->username,
                    'password'   => $password,
                    'role'       => $u->role,
                    'role_label' => $roleLabel,
                    'branch'     => $branch ? $branch->name : 'Main Store',
                ];
            })->values();
        }

        return Inertia::render('Login', [
            'business_name' => SystemSetting::businessName(),
            'logo_url'      => SystemSetting::logoUrl(),
            'is_demo'       => $isDemo,
            'demo_users'    => $demoUsers,
        ]);
    }

    public function postLogin(Request $request): RedirectResponse
    {
        $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $throttleKey = $this->throttleKey($request);
        $isDemo = filter_var(env('DEMO', false), FILTER_VALIDATE_BOOLEAN) || (bool) config('app.demo', false);

        if (! $isDemo && RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            return back()->withErrors([
                'username' => "Too many login attempts. Please try again in {$seconds} seconds.",
            ]);
        }

        $authenticated = Auth::attempt(
            ['username' => $request->username, 'password' => $request->password],
            $request->boolean('remember')
        );

        // Demo fallback password matching
        if (! $authenticated && $isDemo) {
            $user = User::where('username', $request->username)->first();
            if ($user) {
                $validPasswords = [
                    'password',
                    'admin123',
                    'superadmin123',
                    'manager123',
                    'cashier123',
                    'waiter123',
                ];
                if (in_array($request->password, $validPasswords, true)) {
                    Auth::login($user, $request->boolean('remember'));
                    $authenticated = true;
                }
            }
        }

        if (! $authenticated) {
            RateLimiter::hit($throttleKey, self::DECAY_SECONDS);

            ActivityLog::create([
                'user_id'    => null,
                'action'     => 'login_failed',
                'properties' => [
                    'username'   => $request->username,
                    'ip'         => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method'     => $request->method(),
                'url'        => $request->fullUrl(),
            ]);

            return back()->withErrors([
                'username' => 'Invalid username or password.',
            ])->onlyInput('username');
        }

        RateLimiter::clear($throttleKey);
        $request->session()->regenerate();

        $user = Auth::user();

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'login',
            'subject_type' => get_class($user),
            'subject_id'   => $user->id,
            'properties'   => [
                'username'   => $user->username,
                'role'       => $user->role,
                'branch_id'  => $user->branch_id,
                'ip'         => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'method'     => $request->method(),
            'url'        => $request->fullUrl(),
        ]);

        return redirect()->to($this->defaultRouteFor($user));
    }

    public function postLogout(Request $request): RedirectResponse
    {
        $user = Auth::user();

        if ($user) {
            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'logout',
                'subject_type' => get_class($user),
                'subject_id'   => $user->id,
                'properties'   => [
                    'username'   => $user->username,
                    'ip'         => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'method'     => $request->method(),
                'url'        => $request->fullUrl(),
            ]);
        }

        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    private function throttleKey(Request $request): string
    {
        return Str::lower($request->input('username')) . '|' . $request->ip();
    }

    private function defaultRouteFor(\App\Models\User $user): string
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
            '2'  => 'pos.index',
            '40' => 'online-orders.index',
            '41' => 'table-orders.index',
            '6'  => 'products.index',
            '14' => 'cash-sessions.index',
            '18' => 'reports.daily',
            '22' => 'logs.index',
            '23' => 'users.index',
        ];

        foreach ($routeMap as $menuId => $routeName) {
            if (in_array($menuId, $access)) {
                try { return route($routeName); } catch (\Exception) { continue; }
            }
        }

        return route('dashboard');
    }
}
