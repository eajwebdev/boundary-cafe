<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\Customer;
use App\Models\SystemSetting;
use App\Services\OnlineOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class SocialAuthController extends Controller
{
    private const PENDING_SECONDS = 600;

    public function redirect(Request $request, string $provider): RedirectResponse
    {
        if (Auth::guard('customer')->check()) {
            return redirect('/');
        }

        $this->ensureConfigured($provider);

        $state = Str::random(48);
        $request->session()->put('customer_social_oauth', [
            'provider' => $provider,
            'state' => $state,
            'expires_at' => now()->addSeconds(self::PENDING_SECONDS)->timestamp,
        ]);
        $request->session()->forget('customer_social_pending');

        $query = [
            'client_id' => config("services.{$provider}.client_id"),
            'redirect_uri' => route('customer.social.callback', $provider),
            'response_type' => 'code',
            'state' => $state,
            'scope' => $provider === 'google' ? 'openid email profile' : 'email',
        ];
        $endpoint = $provider === 'google'
            ? 'https://accounts.google.com/o/oauth2/v2/auth'
            : 'https://www.facebook.com/'.config('services.facebook.graph_version').'/dialog/oauth';

        return redirect()->away($endpoint.'?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986));
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $this->ensureConfigured($provider);
        $oauth = $request->session()->pull('customer_social_oauth');

        if (! is_array($oauth) || ($oauth['provider'] ?? null) !== $provider
            || ($oauth['expires_at'] ?? 0) < now()->timestamp
            || ! is_string($request->query('state'))
            || ! hash_equals((string) ($oauth['state'] ?? ''), $request->query('state'))) {
            return $this->loginError('Sign-in expired. Please try again.');
        }

        if (! is_string($request->query('code')) || $request->query('code') === '' || $request->filled('error')) {
            return $this->loginError('Sign-in was cancelled or denied.');
        }

        try {
            $profile = $this->profile($provider, (string) $request->query('code'));
        } catch (Throwable) {
            return $this->loginError('Could not complete sign-in. Please try again.');
        }

        if (! $profile) {
            return $this->loginError('Your account details could not be verified.');
        }

        $customer = Customer::where($provider.'_id', $profile['id'])->first();
        if ($customer) {
            if (! $customer->is_active) {
                return $this->loginError('This customer account is inactive.');
            }

            Auth::guard('customer')->login($customer, true);
            $request->session()->regenerate();
            $customer->forceFill(['last_login_at' => now()])->save();

            return redirect()->intended('/')->with('success', 'Welcome back!');
        }

        if ($profile['email'] && Customer::where('email', $profile['email'])->exists()) {
            return $this->loginError('This email already has an account. Log in with your password to continue.');
        }

        $request->session()->put('customer_social_pending', [
            'provider' => $provider,
            'id' => $profile['id'],
            'name' => $profile['name'],
            'email' => $profile['email'],
            'email_verified' => $profile['email_verified'],
            'expires_at' => now()->addSeconds(self::PENDING_SECONDS)->timestamp,
        ]);

        return redirect()->route('customer.social.complete');
    }

    public function showComplete(Request $request): Response|RedirectResponse
    {
        $pending = $this->pending($request);
        if (! $pending) {
            return $this->loginError('Sign-in expired. Please try again.');
        }

        return Inertia::render('Customer/CompleteSocialAccount', [
            'provider' => ucfirst($pending['provider']),
            'name' => $pending['name'],
            'email' => $pending['email'],
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
        ]);
    }

    public function complete(Request $request): RedirectResponse
    {
        $pending = $this->pending($request);
        if (! $pending) {
            return $this->loginError('Sign-in expired. Please try again.');
        }

        $request->merge([
            'contact_number' => Customer::normalisePhone($request->input('contact_number')),
            'email' => $pending['email'] ?: strtolower(trim((string) $request->input('email'))),
        ]);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'contact_number' => ['required', 'regex:/^09\d{9}$/', Rule::unique('customers', 'contact_number')],
            'email' => ['required', 'email:rfc', 'max:120', Rule::unique('customers', 'email')],
            'barangay' => ['required', 'string', Rule::exists('barangays', 'name')->where('is_deliverable', true)],
            'terms' => ['accepted'],
        ], [
            'contact_number.regex' => 'Enter a valid PH mobile number, e.g. 0917 123 4567.',
            'contact_number.unique' => 'This mobile number already has an account. Please log in instead.',
            'email.unique' => 'This email already has an account. Please log in instead.',
        ]);

        $provider = $pending['provider'];
        $customer = Customer::create([
            'name' => $data['name'],
            'contact_number' => $data['contact_number'],
            'email' => $data['email'],
            'email_verified_at' => $pending['email_verified'] ? now() : null,
            $provider.'_id' => $pending['id'],
            'barangay' => $data['barangay'],
            'branch_id' => app(OnlineOrderService::class)->branch()?->id,
            'is_active' => true,
            'loyalty_enabled' => true,
            'last_login_at' => now(),
        ]);

        $request->session()->forget('customer_social_pending');
        Auth::guard('customer')->login($customer, true);
        $request->session()->regenerate();

        return redirect()->intended('/')->with('success', 'Welcome to '.SystemSetting::businessName().'!');
    }

    /** @return array{id: string, name: string, email: ?string, email_verified: bool}|null */
    private function profile(string $provider, string $code): ?array
    {
        $callback = route('customer.social.callback', $provider);

        if ($provider === 'google') {
            $token = Http::timeout(10)->asForm()->post('https://oauth2.googleapis.com/token', [
                'client_id' => config('services.google.client_id'),
                'client_secret' => config('services.google.client_secret'),
                'redirect_uri' => $callback,
                'grant_type' => 'authorization_code',
                'code' => $code,
            ])->throw()->json('access_token');
            if (! is_string($token) || $token === '') {
                return null;
            }

            $user = Http::timeout(10)->withToken($token)
                ->get('https://openidconnect.googleapis.com/v1/userinfo')->throw()->json();
            if (! is_array($user) || ($user['email_verified'] ?? false) !== true || ! filter_var($user['email'] ?? null, FILTER_VALIDATE_EMAIL)) {
                return null;
            }

            return $this->normaliseProfile($user['sub'] ?? null, $user['name'] ?? null, $user['email'], true);
        }

        $base = 'https://graph.facebook.com/'.config('services.facebook.graph_version');
        $token = Http::timeout(10)->get($base.'/oauth/access_token', [
            'client_id' => config('services.facebook.client_id'),
            'client_secret' => config('services.facebook.client_secret'),
            'redirect_uri' => $callback,
            'code' => $code,
        ])->throw()->json('access_token');
        if (! is_string($token) || $token === '') {
            return null;
        }

        $user = Http::timeout(10)->withToken($token)->get($base.'/me', [
            'fields' => 'id,name,email',
            'appsecret_proof' => hash_hmac('sha256', $token, (string) config('services.facebook.client_secret')),
        ])->throw()->json();
        if (! is_array($user)) {
            return null;
        }

        $email = filter_var($user['email'] ?? null, FILTER_VALIDATE_EMAIL) ?: null;

        return $this->normaliseProfile($user['id'] ?? null, $user['name'] ?? null, $email, false);
    }

    /** @return array{id: string, name: string, email: ?string, email_verified: bool}|null */
    private function normaliseProfile(mixed $id, mixed $name, ?string $email, bool $emailVerified): ?array
    {
        if (! is_string($id) || $id === '' || strlen($id) > 255) {
            return null;
        }

        return [
            'id' => $id,
            'name' => is_string($name) ? Str::limit(trim($name), 120, '') : '',
            'email' => $email ? strtolower($email) : null,
            'email_verified' => $emailVerified,
        ];
    }

    /** @return array{provider: string, id: string, name: string, email: ?string, email_verified: bool, expires_at: int}|null */
    private function pending(Request $request): ?array
    {
        $pending = $request->session()->get('customer_social_pending');
        if (! is_array($pending) || ($pending['expires_at'] ?? 0) < now()->timestamp
            || ! in_array($pending['provider'] ?? null, ['google', 'facebook'], true)
            || ! is_string($pending['id'] ?? null)) {
            $request->session()->forget('customer_social_pending');

            return null;
        }

        return $pending;
    }

    private function ensureConfigured(string $provider): void
    {
        abort_unless(in_array($provider, ['google', 'facebook'], true)
            && config("services.{$provider}.client_id")
            && config("services.{$provider}.client_secret"), 404);
    }

    private function loginError(string $message): RedirectResponse
    {
        return redirect()->route('customer.login')->withErrors(['social' => $message]);
    }
}
