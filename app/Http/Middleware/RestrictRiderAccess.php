<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps riders on their Rider Dashboard. Any other staff route — including ones
 * without a menu-access check — is refused.
 */
class RestrictRiderAccess
{
    /** Route names a rider may use. */
    private const ALLOWED_ROUTES = ['rider.*', 'logout.post'];

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('web')->user();

        if (! $user?->isRider() || $request->routeIs(...self::ALLOWED_ROUTES)) {
            return $next($request);
        }

        $message = 'Riders can only use the Rider Dashboard.';

        if ($request->isMethod('GET') && ! $request->expectsJson() && $user->hasAccess('49')) {
            return redirect()->route('rider.dashboard')->with('error', $message);
        }

        abort(403, $message);
    }
}
