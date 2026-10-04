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
        $user = Auth::user();

        if (!$user) {
            // Not logged in → redirect to login
            return redirect()->route('login');
        }

        // Check if module is disabled system-wide (menu 28 System Settings is always accessible for admins)
        if ($menuId !== '28' && !\App\Models\SystemSetting::isModuleEnabled($menuId)) {
            $target = $user->hasAccess('1') ? route('dashboard') : ($user->hasAccess('2') ? route('pos.index') : route('settings.index'));
            if ($request->url() === $target || $request->fullUrl() === $target) {
                abort(403, 'This module is disabled in system settings.');
            }
            return redirect()->to($target)->with('error', 'This module is disabled in system settings.');
        }

        if (!$user->hasAccess($menuId)) {
            $target = $user->hasAccess('1') ? route('dashboard') : ($user->hasAccess('2') ? route('pos.index') : route('settings.index'));

            // Guard against infinite redirect loop if current URL is the target URL
            if ($request->url() === $target || $request->fullUrl() === $target) {
                abort(403, 'You do not have permission to access this page.');
            }

            return redirect()->to($target)->with('error', 'You do not have access to that page.');
        }

        return $next($request);
    }
}