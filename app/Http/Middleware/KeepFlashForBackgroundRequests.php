<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Background JSON calls (the POS pending-orders poll, the online-orders count, floor refreshes) must not
 * use up a one-time flash meant for the next page. Without this, a poll landing between "sale saved" and
 * the redirect back to the POS ate the sale's result, and the cashier saw "Checkout failed" for a paid sale.
 */
class KeepFlashForBackgroundRequests
{
    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->hasSession() && $request->expectsJson() && ! $request->hasHeader('X-Inertia')) {
            $request->session()->reflash();
        }

        return $response;
    }
}
