import { Link, useForm } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';

import { Field, formatPhone, inputCls } from '@/components/storefront/AuthForms';
import { ShopButton } from '@/components/storefront/ui';
import { useBusinessName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import { login } from '@/routes/customer';
import { post as completeSocialAccount } from '@/routes/customer/social/complete';

type Props = { provider: string; name: string; email: string | null; barangays: string[] };

export default function CompleteSocialAccount({ provider, name, email, barangays }: Props) {
    const businessName = useBusinessName();
    const form = useForm({ name, contact_number: '', email: email ?? '', barangay: '', terms: false });

    return (
        <CustomerLayout title="Finish your account" barangays={barangays} hideBottomNav>
            <div className="mx-auto max-w-xl px-4 py-8">
                <div className="rounded-4xl bg-shop-surface p-6 shadow-shop-md ring-1 ring-shop-line sm:p-10">
                    <Link href={login.url()} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-shop-muted hover:text-shop-ink">
                        <ArrowLeft className="h-4 w-4" /> Back to login
                    </Link>
                    <h1 className="font-display text-3xl font-bold">Finish your {businessName} account</h1>
                    <p className="mt-2 mb-6 text-shop-muted">You signed in with {provider}. Add your mobile number before we create your account.</p>
                    <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); form.post(completeSocialAccount.url()); }}>
                        <Field label="Full name" error={form.errors.name} htmlFor="social-name">
                            <input id="social-name" className={inputCls} value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} autoComplete="name" required />
                        </Field>
                        <Field label="Mobile number" error={form.errors.contact_number} hint="Required before your account is saved." htmlFor="social-phone">
                            <input id="social-phone" className={inputCls} value={form.data.contact_number} onChange={(event) => form.setData('contact_number', formatPhone(event.target.value))} autoComplete="tel" inputMode="tel" placeholder="0917 123 4567" required />
                        </Field>
                        <Field label="Email" error={form.errors.email} htmlFor="social-email">
                            <input id="social-email" className={inputCls} type="email" value={form.data.email} onChange={(event) => form.setData('email', event.target.value)} autoComplete="email" readOnly={!!email} required />
                        </Field>
                        <Field label="Barangay in Mabinay" error={form.errors.barangay} htmlFor="social-barangay">
                            <select id="social-barangay" className={inputCls} value={form.data.barangay} onChange={(event) => form.setData('barangay', event.target.value)} required>
                                <option value="">Choose barangay</option>
                                {barangays.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                            </select>
                        </Field>
                        <label className="flex items-start gap-2.5 text-sm text-shop-muted">
                            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-shop-accent" checked={form.data.terms} onChange={(event) => form.setData('terms', event.target.checked)} />
                            <span>I agree that {businessName} may use my details to prepare my orders and run rewards.</span>
                        </label>
                        {form.errors.terms && <p role="alert" className="text-sm text-shop-danger">{form.errors.terms}</p>}
                        <ShopButton type="submit" size="lg" block loading={form.processing}>Create my account</ShopButton>
                    </form>
                </div>
            </div>
        </CustomerLayout>
    );
}
