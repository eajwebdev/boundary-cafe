import { useForm } from '@inertiajs/react';
import { BadgeCheck, Lock } from 'lucide-react';
import { useId } from 'react';

import { Field, formatPhone, inputCls } from '@/components/storefront/AuthForms';
import { ShopButton } from '@/components/storefront/ui';
import { useBusinessName, useRewardsName } from '@/hooks/use-business-name';
import { useServiceArea } from '@/hooks/use-service-area';
import CustomerLayout from '@/layouts/CustomerLayout';

interface Props {
    profile: { provider: string; provider_label: string; name: string | null; email: string | null; avatar: string | null };
    barangays: string[];
}

/** After the first Google/Facebook sign-in: confirm name, add the PH mobile number and barangay, accept the terms. */
export default function CompleteRegistration({ profile, barangays }: Props) {
    const area = useServiceArea();
    const id = useId();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    const form = useForm({
        name: profile.name ?? '',
        contact_number: '',
        barangay: '',
        birthday: '',
        existing_password: '',
        terms: false,
    });
    const e = form.errors as Record<string, string | undefined>;
    const needsPassword = !!e.existing_password || form.data.existing_password !== '';

    return (
        <CustomerLayout title="Complete your registration" barangays={barangays} hideBottomNav>
            <div className="mx-auto max-w-lg px-4 py-8">
                <div className="shadow-shop-md rounded-[28px] bg-shop-surface p-6 ring-1 ring-shop-line sm:p-8">
                    <div className="flex items-center gap-3">
                        {profile.avatar ? (
                            <img src={profile.avatar} alt="" className="h-12 w-12 rounded-full ring-2 ring-shop-line" referrerPolicy="no-referrer" />
                        ) : (
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-shop-accent-soft text-lg font-bold text-shop-accent-ink">
                                {(profile.name ?? '?').charAt(0).toUpperCase()}
                            </span>
                        )}
                        <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-semibold text-shop-success">
                                <BadgeCheck className="h-4 w-4" /> Signed in with {profile.provider_label}
                            </p>
                            {profile.email && <p className="truncate text-sm text-shop-muted">{profile.email}</p>}
                        </div>
                    </div>

                    <h1 className="mt-6 font-display text-[28px] leading-tight font-bold">Complete your registration</h1>
                    <p className="mt-1.5 text-shop-muted">
                        One more step: add your mobile number so the café can reach you and your {rewardsName} points follow you to every branch.
                    </p>

                    <form
                        className="mt-6 space-y-4"
                        noValidate
                        onSubmit={(ev) => {
                            ev.preventDefault();
                            form.post('/account/auth/complete', { preserveScroll: true });
                        }}
                    >
                        <Field label="Full name" error={e.name} htmlFor={`${id}-name`}>
                            <input
                                id={`${id}-name`}
                                className={inputCls}
                                value={form.data.name}
                                onChange={(ev) => form.setData('name', ev.target.value)}
                                autoComplete="name"
                                aria-invalid={!!e.name || undefined}
                                required
                            />
                        </Field>
                        <Field
                            label="Mobile number"
                            error={e.contact_number}
                            hint="09… or +63… both work. Already a member at the counter? Use the same number to keep your points."
                            htmlFor={`${id}-tel`}
                        >
                            <input
                                id={`${id}-tel`}
                                className={inputCls}
                                value={form.data.contact_number}
                                onChange={(ev) => form.setData('contact_number', formatPhone(ev.target.value))}
                                autoComplete="tel"
                                inputMode="tel"
                                placeholder="0917 123 4567"
                                aria-invalid={!!e.contact_number || undefined}
                                required
                            />
                        </Field>
                        {needsPassword && (
                            <Field
                                label="Password of your existing account"
                                error={e.existing_password}
                                hint={`We found an account with this number. Enter its password to link ${profile.provider_label}.`}
                                htmlFor={`${id}-pw`}
                            >
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-shop-muted" />
                                    <input
                                        id={`${id}-pw`}
                                        type="password"
                                        className={`${inputCls} pl-10`}
                                        value={form.data.existing_password}
                                        onChange={(ev) => form.setData('existing_password', ev.target.value)}
                                        autoComplete="current-password"
                                        aria-invalid={!!e.existing_password || undefined}
                                    />
                                </div>
                            </Field>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label={`Barangay in ${area.town}`} error={e.barangay} htmlFor={`${id}-brgy`}>
                                <select
                                    id={`${id}-brgy`}
                                    className={inputCls}
                                    value={form.data.barangay}
                                    onChange={(ev) => form.setData('barangay', ev.target.value)}
                                    aria-invalid={!!e.barangay || undefined}
                                    required
                                >
                                    <option value="">Choose barangay</option>
                                    {barangays.map((b) => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Birthday (optional)" error={e.birthday} hint="Bonus points every birthday month." htmlFor={`${id}-bday`}>
                                <input
                                    id={`${id}-bday`}
                                    className={inputCls}
                                    type="date"
                                    value={form.data.birthday}
                                    onChange={(ev) => form.setData('birthday', ev.target.value)}
                                    autoComplete="bday"
                                />
                            </Field>
                        </div>
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-shop-muted">
                            <input
                                type="checkbox"
                                className="mt-0.5 h-5 w-5 shrink-0 accent-shop-accent"
                                checked={form.data.terms}
                                onChange={(ev) => form.setData('terms', ev.target.checked)}
                            />
                            <span>
                                I agree to the Terms and Privacy Policy, and that {businessName} may use my details to prepare my orders and run{' '}
                                {rewardsName}.
                            </span>
                        </label>
                        {e.terms && (
                            <p className="text-sm text-shop-danger" role="alert">
                                {e.terms}
                            </p>
                        )}
                        <ShopButton type="submit" size="lg" block loading={form.processing}>
                            Finish and open my card
                        </ShopButton>
                    </form>
                </div>
            </div>
        </CustomerLayout>
    );
}
