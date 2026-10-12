<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\RedirectResponse;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The customer's notification history: points earned after each order, rewards claimed,
 * expired claims and returned points. Opening the page marks everything as read.
 */
class NotificationController extends Controller
{
    public function index(): Response
    {
        $customer = $this->customer();
        $notifications = $customer->notifications()->paginate(30);
        $unreadIds = $notifications->getCollection()->whereNull('read_at')->pluck('id')->all();

        $page = $notifications->through(fn (DatabaseNotification $n) => [
            'id' => $n->id,
            'kind' => $n->data['kind'] ?? 'info',
            'title' => $n->data['title'] ?? '',
            'body' => $n->data['body'] ?? '',
            'points' => (int) ($n->data['points'] ?? 0),
            'balance' => $n->data['balance'] ?? null,
            'reference' => $n->data['reference'] ?? null,
            'unread' => in_array($n->id, $unreadIds, true),
            'created_at' => $n->created_at?->toIso8601String(),
        ]);

        if ($unreadIds !== []) {
            $customer->unreadNotifications()->whereIn('id', $unreadIds)->update(['read_at' => now()]);
        }

        return Inertia::render('Customer/Notifications', ['notifications' => $page]);
    }

    public function markAllRead(): RedirectResponse
    {
        $this->customer()->unreadNotifications()->update(['read_at' => now()]);

        return back();
    }

    private function customer(): Customer
    {
        return Auth::guard('customer')->user();
    }
}
