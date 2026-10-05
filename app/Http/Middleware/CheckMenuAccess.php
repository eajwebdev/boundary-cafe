<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckMenuAccess
{
    public function handle(Request $request, Closure $next, string $menuId): Response
    {
        $user = Auth::guard('web')->user();

        if (!$user) {
            // Not logged in → redirect to login
            return redirect()->route('login');
        }

        // Check if module is disabled system-wide (menu 28 System Settings is always accessible for admins)
        if ($menuId !== '28' && !\App\Models\SystemSetting::isModuleEnabled($menuId)) {
            $target = $this->homeFor($user);
            if ($request->url() === $target || $request->fullUrl() === $target) {
                abort(403, 'This module is disabled in system settings.');
            }
            return redirect()->to($target)->with('error', 'This module is disabled in system settings.');
        }

        if (!$user->hasAccess($menuId)) {
            $target = $this->homeFor($user);

            // Guard against infinite redirect loop if current URL is the target URL
            if ($request->url() === $target || $request->fullUrl() === $target) {
                abort(403, 'You do not have permission to access this page.');
            }

            return redirect()->to($target)->with('error', 'You do not have access to that page.');
        }

        return $next($request);
    }

    /** Where to send a user who cannot open the requested page. */
    private function homeFor($user): string
    {
        foreach (['1' => 'dashboard', '2' => 'pos.index', '41' => 'table-orders.index', '40' => 'online-orders.index'] as $menuId => $routeName) {
            if ($user->hasAccess($menuId)) {
                return route($routeName);
            }
        }

        return route('settings.index');
    }
}
