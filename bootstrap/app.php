<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\CheckMenuAccess;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Inertia\Inertia;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'access' => CheckMenuAccess::class,
        ]);

        $middleware->redirectTo(
            guests: '/',
            users: function () {
                $user = \Illuminate\Support\Facades\Auth::user();
                if ($user && method_exists($user, 'isCashier') && $user->isCashier()) {
                    return '/pos';
                }
                return '/dashboard';
            }
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(function (Response $response, \Throwable $e, Request $request) {
            $status = $response->getStatusCode();

            if (in_array($status, [403, 404, 405])) {
                $page = match ($status) {
                    403 => 'Errors/403',
                    404 => 'Errors/404',
                    405 => 'Errors/405',
                };

                $message = match ($status) {
                    403 => $e->getMessage() ?: 'You do not have permission to access this page.',
                    404 => $e->getMessage() ?: 'The page you are looking for could not be found.',
                    405 => 'The requested method is not allowed.',
                };

                // Safely add allowed methods ONLY for 405
                if ($status === 405 && $e instanceof MethodNotAllowedHttpException) {
                    $allowed = $e->getHeaders()['Allow'] ?? [];

                    if (is_string($allowed)) {
                        $allowed = array_map('trim', explode(',', $allowed));
                    } elseif (!is_array($allowed)) {
                        $allowed = [];
                    }

                    if (!empty($allowed)) {
                        $message .= ' Supported methods: ' . implode(', ', $allowed) . '.';
                    }
                }

                return Inertia::render($page, [
                    'status' => $status,
                    'message' => $message,
                ])
                    ->toResponse($request)
                    ->setStatusCode($status);
            }

            return $response;
        });
    })->create();