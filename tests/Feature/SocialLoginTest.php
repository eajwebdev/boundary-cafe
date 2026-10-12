<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerSocialAccount;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialUser;
use Tests\TestCase;

class SocialLoginTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        config([
            'services.google.client_id' => 'google-id', 'services.google.client_secret' => 'google-secret',
            'services.facebook.client_id' => 'fb-id', 'services.facebook.client_secret' => 'fb-secret',
        ]);
    }

    private function fakeGoogle(string $id = 'g-123', ?string $email = 'maria.santos@gmail.com', string $name = 'Maria Santos'): void
    {
        Socialite::fake('google', (new SocialUser)->map(['id' => $id, 'name' => $name, 'email' => $email, 'avatar' => 'https://example.test/a.png']));
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function completion(array $overrides = []): array
    {
        return $overrides + ['name' => 'Maria Santos', 'contact_number' => '+63 917 555 0101', 'barangay' => 'Poblacion', 'terms' => true];
    }

    public function test_a_new_customer_completes_registration_with_a_mobile_number_stored_as_09(): void
    {
        $this->fakeGoogle();

        $this->get('/account/auth/google/callback')->assertRedirect('/account/auth/complete');
        $this->get('/account/auth/complete')->assertOk()->assertInertia(fn ($page) => $page
            ->component('Customer/CompleteRegistration')
            ->where('profile.name', 'Maria Santos')
            ->where('profile.provider', 'google'));

        $this->post('/account/auth/complete', $this->completion())->assertSessionHasNoErrors()->assertRedirect();

        $customer = Customer::where('contact_number', '09175550101')->firstOrFail();
        $this->assertSame('maria.santos@gmail.com', $customer->email);
        $this->assertNull($customer->password);
        $this->assertTrue($customer->socialAccounts()->where('provider', 'google')->where('provider_user_id', 'g-123')->exists());
        $this->assertAuthenticatedAs($customer, 'customer');
    }

    public function test_a_returning_customer_logs_straight_in(): void
    {
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        CustomerSocialAccount::create(['customer_id' => $joy->id, 'provider' => 'google', 'provider_user_id' => 'g-joy']);
        $this->fakeGoogle('g-joy', 'someone-else@gmail.com');

        $this->get('/account/auth/google/callback')->assertRedirect('/');

        $this->assertAuthenticatedAs($joy, 'customer');
    }

    public function test_a_matching_email_links_to_the_existing_customer_without_a_duplicate(): void
    {
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail();
        $before = Customer::count();
        $this->fakeGoogle('g-new', strtoupper($joy->email));

        $this->get('/account/auth/google/callback')->assertRedirect('/');

        $this->assertAuthenticatedAs($joy, 'customer');
        $this->assertSame($before, Customer::count());
        $this->assertTrue($joy->socialAccounts()->where('provider', 'google')->exists());
    }

    public function test_a_walk_in_number_typed_with_plus_63_is_taken_over_and_keeps_its_points(): void
    {
        $walkIn = Customer::create(['name' => 'Walk-in Maria', 'contact_number' => '09175550101', 'loyalty_points' => 80]);
        $before = Customer::count();
        $this->fakeGoogle();
        $this->get('/account/auth/google/callback');

        $this->post('/account/auth/complete', $this->completion(['contact_number' => '+63 917 555 0101']))->assertSessionHasNoErrors();

        $this->assertSame($before, Customer::count(), 'No duplicate customer');
        $walkIn->refresh();
        $this->assertSame(80, $walkIn->loyalty_points);
        $this->assertSame('Maria Santos', $walkIn->name);
        $this->assertTrue($walkIn->socialAccounts()->where('provider', 'google')->exists());
        $this->assertAuthenticatedAs($walkIn, 'customer');
    }

    public function test_an_account_with_a_password_is_linked_only_with_its_password(): void
    {
        $joy = Customer::where('contact_number', '09171234567')->firstOrFail(); // password "password"
        $this->fakeGoogle('g-joy-2', 'joy.other@gmail.com', 'Joy D.');
        $this->get('/account/auth/google/callback');

        $this->post('/account/auth/complete', $this->completion(['contact_number' => '0917 123 4567']))
            ->assertSessionHasErrors('existing_password');
        $this->post('/account/auth/complete', $this->completion(['contact_number' => '639171234567', 'existing_password' => 'wrong']))
            ->assertSessionHasErrors('existing_password');
        $this->assertGuest('customer');

        $this->post('/account/auth/complete', $this->completion(['contact_number' => '639171234567', 'existing_password' => 'password']))
            ->assertSessionHasNoErrors();

        $this->assertAuthenticatedAs($joy, 'customer');
        $this->assertTrue($joy->socialAccounts()->where('provider_user_id', 'g-joy-2')->exists());
    }

    public function test_a_number_registered_only_with_facebook_cannot_be_claimed_with_google(): void
    {
        $fbOnly = Customer::create(['name' => 'FB Only', 'contact_number' => '09175550101']);
        CustomerSocialAccount::create(['customer_id' => $fbOnly->id, 'provider' => 'facebook', 'provider_user_id' => 'fb-1']);
        $this->fakeGoogle();
        $this->get('/account/auth/google/callback');

        $this->post('/account/auth/complete', $this->completion())->assertSessionHasErrors('contact_number');

        $this->assertFalse($fbOnly->socialAccounts()->where('provider', 'google')->exists());
        $this->assertGuest('customer');
    }

    public function test_normal_sign_up_cannot_take_over_a_social_only_account(): void
    {
        $fbOnly = Customer::create(['name' => 'FB Only', 'contact_number' => '09175550101']);
        CustomerSocialAccount::create(['customer_id' => $fbOnly->id, 'provider' => 'facebook', 'provider_user_id' => 'fb-1']);

        $this->post('/account/register', [
            'name' => 'Intruder', 'contact_number' => '+639175550101', 'email' => 'intruder@example.test',
            'password' => 'secret123', 'password_confirmation' => 'secret123', 'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasErrors('contact_number');

        $this->assertSame('FB Only', $fbOnly->fresh()->name);
    }

    public function test_completing_registration_needs_the_terms_and_a_valid_number(): void
    {
        $this->fakeGoogle();
        $this->get('/account/auth/google/callback');

        $this->post('/account/auth/complete', $this->completion(['contact_number' => '12345', 'terms' => false]))
            ->assertSessionHasErrors(['contact_number', 'terms']);
    }

    public function test_the_last_login_method_cannot_be_unlinked_without_a_password(): void
    {
        $customer = Customer::create(['name' => 'Social Only', 'contact_number' => '09175550101']);
        CustomerSocialAccount::create(['customer_id' => $customer->id, 'provider' => 'google', 'provider_user_id' => 'g-1']);

        $this->actingAs($customer, 'customer')->delete('/account/social/google')->assertSessionHas('error');
        $this->assertTrue($customer->socialAccounts()->exists());

        $this->actingAs($customer, 'customer')->put('/account/password', ['password' => 'newpass123', 'password_confirmation' => 'newpass123'])
            ->assertSessionHasNoErrors();
        $this->actingAs($customer->fresh(), 'customer')->delete('/account/social/google')->assertSessionHas('success');
        $this->assertFalse($customer->socialAccounts()->exists());
    }

    public function test_providers_without_credentials_are_unavailable(): void
    {
        config(['services.facebook.client_id' => null]);

        $this->get('/account/auth/facebook/redirect')->assertNotFound();
        $this->get('/account/login')->assertInertia(fn ($page) => $page->where('social_login', ['google']));
    }
}
