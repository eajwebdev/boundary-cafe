<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A Google or Facebook login linked to a customer. */
class CustomerSocialAccount extends Model
{
    public const PROVIDERS = ['google', 'facebook'];

    protected $fillable = ['customer_id', 'provider', 'provider_user_id', 'email', 'name', 'avatar', 'last_used_at'];

    protected function casts(): array
    {
        return ['last_used_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /** Providers that have credentials configured (buttons are hidden for the rest). */
    public static function enabledProviders(): array
    {
        return array_values(array_filter(
            self::PROVIDERS,
            fn (string $provider) => filled(config("services.{$provider}.client_id")) && filled(config("services.{$provider}.client_secret")),
        ));
    }

    public static function label(string $provider): string
    {
        return $provider === 'facebook' ? 'Facebook' : 'Google';
    }
}
