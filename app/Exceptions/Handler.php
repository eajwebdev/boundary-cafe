<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Throwable;
use Inertia\Inertia;
use Symfony\Component\HttpKernel\Exception\HttpException;

class Handler extends ExceptionHandler
{
    public function render($request, Throwable $e)
    {
        $response = parent::render($request, $e);

        if ($response->getStatusCode() === 403) {
            return Inertia::render('Errors/403', [
                'message' => $e->getMessage() ?: 'You do not have permission to access this page.',
            ])->toResponse($request)->setStatusCode(403);
        }

        return $response;
    }
}