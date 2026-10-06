<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps order takers (waiters) on the table ordering screen. Any other staff
 * route — including ones without a menu-access check — is refused.
 */
class RestrictOrderTakerAccess
{
    /** Route names an order taker may use. */
    private const ALLOWED_ROUTES = ['table-orders.*', 'logout.post'];

    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('web')->user();

        if (! $user?->isWaiter() || $request->routeIs(...self::ALLOWED_ROUTES)) {
            return $next($request);
        }

        $message = 'Order takers can only take table orders.';

        // A page visit goes back to the tables; anything else (or a disabled table module) is refused outright.
        if ($request->isMethod('GET') && ! $request->expectsJson() && $user->hasAccess('41')) {
            return redirect()->route('table-orders.index')->with('error', $message);
        }

        abort(403, $message);
    }
}
