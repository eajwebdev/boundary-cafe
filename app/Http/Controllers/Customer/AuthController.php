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
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 300;

    public function showLogin(Request $request): Response|RedirectResponse
    {
        if (Auth::guard('customer')->check()) {
            return redirect()->intended('/');
        }

        return Inertia::render('Customer/Auth', [
            'mode' => 'login',
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
        ]);
    }

    public function showRegister(): Response|RedirectResponse
    {
        if (Auth::guard('customer')->check()) {
            return redirect()->intended('/');
        }

        return Inertia::render('Customer/Auth', [
            'mode' => 'register',
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
        ]);
    }

    public function login(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'login' => ['required', 'string', 'max:120'],
            'password' => ['required', 'string'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $throttleKey = 'customer-login|'.Str::lower($data['login']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($throttleKey, self::MAX_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            throw ValidationException::withMessages(['login' => "Too many attempts. Try again in {$seconds} seconds."]);
        }

        $login = trim($data['login']);
        $credentials = str_contains($login, '@')
            ? ['email' => strtolower($login)]
            : ['contact_number' => Customer::normalisePhone($login)];
        $credentials['password'] = $data['password'];
        $credentials['is_active'] = true;

        if (! Auth::guard('customer')->attempt($credentials, (bool) ($data['remember'] ?? true))) {
            RateLimiter::hit($throttleKey, self::DECAY_SECONDS);
            throw ValidationException::withMessages(['login' => 'Wrong mobile number/email or password.']);
        }

        RateLimiter::clear($throttleKey);
        $request->session()->regenerate();
        Auth::guard('customer')->user()->forceFill(['last_login_at' => now()])->save();

        return redirect()->intended('/')->with('success', 'Welcome back!');
    }

    public function register(Request $request): RedirectResponse
    {
        $request->merge([
            'contact_number' => Customer::normalisePhone($request->input('contact_number')),
            'email' => $request->filled('email') ? strtolower(trim((string) $request->input('email'))) : null,
        ]);

        // A walk-in customer created at the POS (no password yet) can claim their record and keep their points.
        $existing = Customer::where('contact_number', $request->input('contact_number'))->first();
        $claimable = $existing && ! $existing->hasOnlineAccount();

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'contact_number' => [
                'required', 'regex:/^09\d{9}$/',
                Rule::unique('customers', 'contact_number')->ignore($claimable ? $existing->id : null),
            ],
            'email' => [
                'required', 'email:rfc', 'max:120',
                Rule::unique('customers', 'email')->ignore($claimable ? $existing->id : null),
            ],
            'password' => ['required', 'confirmed', Password::min(8)->letters()->numbers()],
            'barangay' => ['required', 'string', Rule::exists('barangays', 'name')->where('is_deliverable', true)],
            'birthday' => ['nullable', 'date', 'before:today', 'after:1900-01-01'],
            'terms' => ['accepted'],
        ], [
            'contact_number.regex' => 'Enter a valid PH mobile number, e.g. 0917 123 4567.',
            'contact_number.unique' => 'This mobile number already has an account. Please log in instead.',
            'email.unique' => 'This email already has an account. Please log in instead.',
            'barangay.exists' => 'We currently deliver only within Mabinay. Please choose your barangay.',
            'terms.accepted' => 'Please agree to the terms to continue.',
        ]);

        $attributes = [
            'name' => $data['name'],
            'contact_number' => $data['contact_number'],
            'email' => $data['email'],
            'password' => $data['password'],
            'barangay' => $data['barangay'],
            'birthday' => $data['birthday'] ?? $existing?->birthday,
            'branch_id' => $existing?->branch_id ?? app(OnlineOrderService::class)->branch()?->id,
            'is_active' => true,
            'loyalty_enabled' => true,
            'last_login_at' => now(),
        ];

        $customer = $claimable
            ? tap($existing)->update($attributes)
            : Customer::create($attributes);

        Auth::guard('customer')->login($customer, true);
        $request->session()->regenerate();

        $rewardsName = SystemSetting::rewardsName();

        return redirect()->intended('/')->with('success', $claimable
            ? "Account created — your existing {$rewardsName} points are now linked."
            : 'Welcome to '.SystemSetting::businessName()."! Your {$rewardsName} card is ready.");
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::guard('customer')->logout();
        $request->session()->regenerateToken();

        return redirect('/')->with('success', 'You have been logged out.');
    }
}
