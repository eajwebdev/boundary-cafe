<?php

namespace Tests\Feature;

use App\Models\Customer;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SocialAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        config([
            'services.google.client_id' => 'google-client',
            'services.google.client_secret' => 'google-secret',
            'services.facebook.client_id' => 'facebook-client',
            'services.facebook.client_secret' => 'facebook-secret',
        ]);
    }

    public function test_google_account_is_only_created_after_a_valid_mobile_number_is_submitted(): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'google-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => 'google-123', 'name' => 'Google Customer',
                'email' => 'google@example.test', 'email_verified' => true,
            ]),
        ]);

        $state = $this->startProvider('google');
        $this->get(route('customer.social.callback', ['provider' => 'google', 'state' => $state, 'code' => 'valid-code']))
            ->assertRedirect(route('customer.social.complete'));
        $this->assertNull(Customer::where('google_id', 'google-123')->first());

        $this->post(route('customer.social.complete.post'), [
            'name' => 'Google Customer', 'email' => 'changed@example.test',
            'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasErrors('contact_number');
        $this->assertNull(Customer::where('google_id', 'google-123')->first());

        $this->post(route('customer.social.complete.post'), [
            'name' => 'Google Customer', 'contact_number' => '09170000001',
            'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasErrors('contact_number');
        $this->assertNull(Customer::where('google_id', 'google-123')->first());

        $this->post(route('customer.social.complete.post'), [
            'name' => 'Google Customer', 'contact_number' => '0917 555 8899',
            'email' => 'changed@example.test', 'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasNoErrors()->assertRedirect('/');

        $customer = Customer::where('google_id', 'google-123')->firstOrFail();
        $this->assertAuthenticatedAs($customer, 'customer');
        $this->assertSame('09175558899', $customer->contact_number);
        $this->assertSame('google@example.test', $customer->email);
        $this->assertNotNull($customer->email_verified_at);

        $this->post(route('customer.logout'))->assertRedirect('/');
        $state = $this->startProvider('google');
        $this->get(route('customer.social.callback', ['provider' => 'google', 'state' => $state, 'code' => 'another-code']))
            ->assertRedirect('/');
        $this->assertAuthenticatedAs($customer, 'customer');
        $this->assertSame(1, Customer::where('google_id', 'google-123')->count());
    }

    public function test_facebook_without_email_requires_email_and_mobile_before_account_creation(): void
    {
        Http::fake([
            'graph.facebook.com/*/oauth/access_token*' => Http::response(['access_token' => 'facebook-token']),
            'graph.facebook.com/*/me*' => Http::response(['id' => 'facebook-456', 'name' => 'Facebook Customer']),
        ]);

        $state = $this->startProvider('facebook');
        $this->get(route('customer.social.callback', ['provider' => 'facebook', 'state' => $state, 'code' => 'valid-code']))
            ->assertRedirect(route('customer.social.complete'));

        $this->post(route('customer.social.complete.post'), [
            'name' => 'Facebook Customer', 'contact_number' => '0917 555 8898',
            'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasErrors('email');
        $this->assertNull(Customer::where('facebook_id', 'facebook-456')->first());

        $this->post(route('customer.social.complete.post'), [
            'name' => 'Facebook Customer', 'contact_number' => '0917 555 8898',
            'email' => 'facebook@example.test', 'barangay' => 'Poblacion', 'terms' => true,
        ])->assertSessionHasNoErrors()->assertRedirect('/');
        $this->assertAuthenticatedAs(Customer::where('facebook_id', 'facebook-456')->firstOrFail(), 'customer');
    }

    public function test_callback_rejects_wrong_state_and_duplicate_customer_email(): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'google-token']),
            'openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => 'new-google-id', 'name' => 'Existing Customer',
                'email' => 'taken@example.test', 'email_verified' => true,
            ]),
        ]);
        Customer::create(['name' => 'Existing Customer', 'email' => 'taken@example.test', 'contact_number' => '09175558897']);

        $state = $this->startProvider('google');
        $this->get(route('customer.social.callback', ['provider' => 'google', 'state' => 'wrong', 'code' => 'code']))
            ->assertRedirect(route('customer.login'))
            ->assertSessionHasErrors(['social' => 'Sign-in expired. Please try again.']);
        Http::assertNothingSent();

        $state = $this->startProvider('google');
        $this->get(route('customer.social.callback', ['provider' => 'google', 'state' => $state, 'code' => 'code']))
            ->assertRedirect(route('customer.login'))
            ->assertSessionHasErrors(['social' => 'This email already has an account. Log in with your password to continue.']);
        $this->assertNull(Customer::where('google_id', 'new-google-id')->first());
        $this->assertGuest('customer');
    }

    private function startProvider(string $provider): string
    {
        $response = $this->get(route('customer.social.redirect', $provider));
        $response->assertRedirect();
        parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

        return $query['state'];
    }
}
