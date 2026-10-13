<?php

namespace App\Http\Controllers\Customer;

use App\Http\Controllers\Controller;
use App\Models\Barangay;
use App\Models\Customer;
use App\Models\CustomerSocialAccount;
use App\Models\SystemSetting;
use App\Services\OnlineOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Socialite\Contracts\User as SocialUser;
use Laravel\Socialite\Facades\Socialite;

/**
 * "Continue with Google / Facebook" for customers.
 *
 * - A linked Google/Facebook account logs straight in.
 * - A provider email that matches an existing customer links to that customer (the provider verified the email).
 * - Otherwise the customer completes registration with their PH mobile number (stored as 09XXXXXXXXX
 *   whether typed as 09…, 9… or +63…). If that number already exists:
 *     · a walk-in record from the POS is taken over and keeps its points (same rule as normal sign-up);
 *     · an account with a password is linked only after its password is entered;
 *     · an account that only uses Google/Facebook must log in with that provider first.
 * Logged-in customers can link and unlink providers from their account page.
 */
class SocialAuthController extends Controller
{
    private const PENDING_KEY = 'social_pending';

    private const LINK_KEY = 'social_link_customer';

    public function redirect(Request $request, string $provider): RedirectResponse
    {
        $this->ensureEnabled($provider);

        $customer = Auth::guard('customer')->user();
        if ($customer && $request->boolean('link')) {
            $request->session()->put(self::LINK_KEY, $customer->id);
        } else {
            $request->session()->forget(self::LINK_KEY);
        }

        $driver = Socialite::driver($provider);

        return $provider === 'facebook'
            ? $driver->scopes(['email'])->redirect()
            : $driver->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $this->ensureEnabled($provider);

        try {
            $social = Socialite::driver($provider)->user();
        } catch (\Throwable $e) {
            Log::info('Social login failed', ['provider' => $provider, 'error' => $e->getMessage()]);

            return redirect()->route('customer.login')->with('error', CustomerSocialAccount::label($provider).' sign-in was cancelled or failed. Please try again.');
        }

        $account = CustomerSocialAccount::with('customer')
            ->where('provider', $provider)
            ->where('provider_user_id', (string) $social->getId())
            ->first();

        // Linking from the account page
        if ($linkTo = $request->session()->pull(self::LINK_KEY)) {
            $current = Auth::guard('customer')->user();
            if (! $current || (int) $current->id !== (int) $linkTo) {
                return redirect()->route('customer.login');
            }
            if ($account && (int) $account->customer_id !== (int) $current->id) {
                return redirect()->route('customer.account')->with('error', 'That '.CustomerSocialAccount::label($provider).' account is already linked to another customer.');
            }
            $this->link($current, $provider, $social);

            return redirect()->route('customer.account')->with('success', CustomerSocialAccount::label($provider).' is now linked to your account.');
        }

        if ($account) {
            return $this->login($request, $account->customer, $provider, $social);
        }

        // Same email as an existing customer: the provider has verified it, so link and log in.
        $email = $social->getEmail() ? strtolower(trim($social->getEmail())) : null;
        if ($email && ($byEmail = Customer::where('email', $email)->first())) {
            $this->link($byEmail, $provider, $social);

            return $this->login($request, $byEmail, $provider, $social);
        }

        $request->session()->put(self::PENDING_KEY, [
            'provider' => $provider,
            'id' => (string) $social->getId(),
            'email' => $email,
            'name' => $social->getName() ?: $social->getNickname(),
            'avatar' => $social->getAvatar(),
            'at' => now()->timestamp,
        ]);

        return redirect()->route('customer.social.complete');
    }

    /** "Complete your registration": mobile number, barangay and terms. */
    public function showComplete(Request $request): Response|RedirectResponse
    {
        $pending = $this->pending($request);
        if (! $pending) {
            return redirect()->route('customer.login')->with('error', 'Please sign in with Google or Facebook again.');
        }

        return Inertia::render('Customer/CompleteRegistration', [
            'profile' => [
                'provider' => $pending['provider'],
                'provider_label' => CustomerSocialAccount::label($pending['provider']),
                'name' => $pending['name'],
                'email' => $pending['email'],
                'avatar' => $pending['avatar'],
            ],
            'barangays' => Barangay::deliverable()->ordered()->pluck('name'),
        ]);
    }

    public function complete(Request $request): RedirectResponse
    {
        $pending = $this->pending($request);
        if (! $pending) {
            return redirect()->route('customer.login')->with('error', 'Your sign-in expired. Please continue with Google or Facebook again.');
        }

        $request->merge(['contact_number' => Customer::normalisePhone($request->input('contact_number'))]);
        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'contact_number' => ['required', 'regex:/^09\d{9}$/'],
            'barangay' => ['required', 'string', Rule::exists('barangays', 'name')->where('is_deliverable', true)],
            'birthday' => ['nullable', 'date', 'before:today', 'after:1900-01-01'],
            'existing_password' => ['nullable', 'string'],
            'terms' => ['accepted'],
        ], [
            'contact_number.regex' => 'Enter a valid PH mobile number, e.g. 0917 123 4567 or +63 917 123 4567.',
            'barangay.exists' => 'We currently deliver only within '.SystemSetting::serviceArea()['town'].'. Please choose your barangay.',
            'terms.accepted' => 'Please agree to the Terms and Privacy Policy to continue.',
        ]);

        $existing = Customer::where('contact_number', $data['contact_number'])->first();

        if ($existing && ! $existing->isWalkIn()) {
            if ($existing->socialAccounts()->where('provider', $pending['provider'])->exists()) {
                throw ValidationException::withMessages(['contact_number' => 'This number already uses a different '.CustomerSocialAccount::label($pending['provider']).' account. Log in with that one.']);
            }
            if (! $existing->hasOnlineAccount()) {
                $other = CustomerSocialAccount::label((string) $existing->socialAccounts()->value('provider'));
                throw ValidationException::withMessages(['contact_number' => "This number is already registered with {$other}. Continue with {$other}, then link ".CustomerSocialAccount::label($pending['provider']).' from your account page.']);
            }
            if (empty($data['existing_password'])) {
                throw ValidationException::withMessages(['existing_password' => 'This number already has an account. Enter its password to link '.CustomerSocialAccount::label($pending['provider']).' to it.']);
            }
            if (! Hash::check($data['existing_password'], $existing->password)) {
                throw ValidationException::withMessages(['existing_password' => 'That password is not correct for this mobile number.']);
            }
        }

        $customer = DB::transaction(function () use ($existing, $data, $pending) {
            $emailTaken = $pending['email'] && Customer::where('email', $pending['email'])
                ->when($existing, fn ($q) => $q->whereKeyNot($existing->id))
                ->exists();
            $email = $emailTaken ? null : $pending['email'];

            if ($existing) {
                $existing->update(array_filter([
                    'name' => $existing->isWalkIn() ? $data['name'] : null,
                    'email' => $existing->email ? null : $email,
                    'barangay' => $existing->barangay ? null : $data['barangay'],
                    'birthday' => $existing->birthday ? null : ($data['birthday'] ?? null),
                ]) + ['is_active' => true, 'loyalty_enabled' => true]);
                $customer = $existing;
            } else {
                $customer = Customer::create([
                    'name' => $data['name'],
                    'contact_number' => $data['contact_number'],
                    'email' => $email,
                    'barangay' => $data['barangay'],
                    'birthday' => $data['birthday'] ?? null,
                    'branch_id' => app(OnlineOrderService::class)->branch()?->id,
                    'is_active' => true,
                    'loyalty_enabled' => true,
                ]);
            }

            if ($email && ! $customer->email_verified_at) {
                $customer->forceFill(['email_verified_at' => now()])->save();
            }

            CustomerSocialAccount::updateOrCreate(
                ['provider' => $pending['provider'], 'provider_user_id' => $pending['id']],
                ['customer_id' => $customer->id, 'email' => $pending['email'], 'name' => $pending['name'], 'avatar' => $pending['avatar'], 'last_used_at' => now()],
            );

            return $customer;
        });

        $request->session()->forget(self::PENDING_KEY);
        Auth::guard('customer')->login($customer, true);
        $request->session()->regenerate();
        $customer->forceFill(['last_login_at' => now()])->save();

        $rewardsName = SystemSetting::rewardsName();

        return redirect()->intended('/account/rewards')->with('success', $existing
            ? "Welcome back! Your account and {$rewardsName} points are linked to ".CustomerSocialAccount::label($pending['provider']).'.'
            : 'Welcome to '.SystemSetting::businessName()."! Your {$rewardsName} card is ready.");
    }

    public function unlink(string $provider): RedirectResponse
    {
        $customer = Auth::guard('customer')->user();
        $account = $customer->socialAccounts()->where('provider', $provider)->first();
        if (! $account) {
            return back();
        }
        if (! $customer->hasOnlineAccount() && $customer->socialAccounts()->count() <= 1) {
            return back()->with('error', 'Set a password first, so you can still log in after unlinking '.CustomerSocialAccount::label($provider).'.');
        }

        $account->delete();

        return back()->with('success', CustomerSocialAccount::label($provider).' unlinked.');
    }

    private function login(Request $request, Customer $customer, string $provider, SocialUser $social): RedirectResponse
    {
        if (! $customer->is_active) {
            return redirect()->route('customer.login')->with('error', 'Your account is inactive. Please contact the café.');
        }

        $customer->socialAccounts()->where('provider', $provider)->update(['last_used_at' => now(), 'avatar' => $social->getAvatar()]);
        Auth::guard('customer')->login($customer, true);
        $request->session()->regenerate();
        $customer->forceFill(['last_login_at' => now()])->save();

        return redirect()->intended('/')->with('success', 'Welcome back, '.strtok($customer->name, ' ').'!');
    }

    private function link(Customer $customer, string $provider, SocialUser $social): void
    {
        CustomerSocialAccount::updateOrCreate(
            ['customer_id' => $customer->id, 'provider' => $provider],
            [
                'provider_user_id' => (string) $social->getId(),
                'email' => $social->getEmail(),
                'name' => $social->getName(),
                'avatar' => $social->getAvatar(),
                'last_used_at' => now(),
            ],
        );
    }

    /**
     * @return array{provider: string, id: string, email: ?string, name: ?string, avatar: ?string, at: int}|null
     */
    private function pending(Request $request): ?array
    {
        $pending = $request->session()->get(self::PENDING_KEY);

        // The Google/Facebook sign-in is good for 30 minutes to finish registering.
        return is_array($pending) && ($pending['at'] ?? 0) > now()->subMinutes(30)->timestamp ? $pending : null;
    }

    private function ensureEnabled(string $provider): void
    {
        abort_unless(in_array($provider, CustomerSocialAccount::enabledProviders(), true), 404);
    }
}
