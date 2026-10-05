<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Customers can now sign in to the online ordering app.
     *
     * Walk-in customers created at the POS keep a NULL password until they
     * register online with the same mobile number (their points carry over).
     *
     * Before the unique indexes are added, mobile numbers are normalised to
     * 09XXXXXXXXX and duplicate phones/emails are moved into `notes` so no
     * data is lost.
     */
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('password')->nullable()->after('email');
            $table->rememberToken()->after('password');
            $table->string('barangay', 80)->nullable()->after('address');
            $table->timestamp('email_verified_at')->nullable()->after('remember_token');
            $table->timestamp('phone_verified_at')->nullable()->after('email_verified_at');
            $table->timestamp('last_login_at')->nullable()->after('phone_verified_at');
        });

        $this->normaliseAndDeduplicate();

        Schema::table('customers', function (Blueprint $table) {
            $table->unique('contact_number', 'customers_contact_number_unique');
            $table->unique('email', 'customers_email_unique');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropUnique('customers_contact_number_unique');
            $table->dropUnique('customers_email_unique');
            $table->dropColumn([
                'password', 'remember_token', 'barangay', 'email_verified_at',
                'phone_verified_at', 'last_login_at',
            ]);
        });
    }

    private function normaliseAndDeduplicate(): void
    {
        $seenPhones = [];
        $seenEmails = [];

        DB::table('customers')->orderBy('id')->get(['id', 'contact_number', 'email', 'notes'])
            ->each(function ($row) use (&$seenPhones, &$seenEmails) {
                $phone = self::normalisePhone($row->contact_number);
                $email = $row->email ? strtolower(trim($row->email)) : null;
                $notes = $row->notes;

                if ($phone !== null && isset($seenPhones[$phone])) {
                    $notes = trim(($notes ? $notes.' | ' : '')."Duplicate mobile {$phone} (also on customer #{$seenPhones[$phone]})");
                    $phone = null;
                }
                if ($email !== null && isset($seenEmails[$email])) {
                    $notes = trim(($notes ? $notes.' | ' : '')."Duplicate email {$email} (also on customer #{$seenEmails[$email]})");
                    $email = null;
                }

                if ($phone !== null) {
                    $seenPhones[$phone] = $row->id;
                }
                if ($email !== null) {
                    $seenEmails[$email] = $row->id;
                }

                DB::table('customers')->where('id', $row->id)->update([
                    'contact_number' => $phone,
                    'email' => $email ?: null,
                    'notes' => $notes,
                ]);
            });
    }

    private static function normalisePhone(?string $raw): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $raw);
        if (str_starts_with($digits, '63') && strlen($digits) === 12) {
            $digits = '0'.substr($digits, 2);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '0'.$digits;
        }

        return $digits !== '' ? $digits : null;
    }
};
