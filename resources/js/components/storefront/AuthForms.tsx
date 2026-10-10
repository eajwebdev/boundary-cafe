import { useForm } from '@inertiajs/react';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';

import { useBusinessName, useRewardsName } from '@/hooks/use-business-name';
import { cn } from '@/lib/utils';

import { ShopButton } from './ui';

export const inputCls =
    'h-12 w-full rounded-2xl border border-shop-line bg-shop-surface px-4 text-base text-shop-ink outline-none transition placeholder:text-shop-muted/80 focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15 aria-[invalid=true]:border-shop-danger';

/** Formats a PH mobile number as the user types: 0917 123 4567 */
export function formatPhone(raw: string) {
    let d = raw.replace(/\D/g, '');
    if (d.startsWith('63')) d = '0' + d.slice(2);
    if (d.startsWith('9')) d = '0' + d;
    d = d.slice(0, 11);
    return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(' ');
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={htmlFor} className="block text-sm font-semibold text-shop-ink">
                {label}
            </label>
            {children}
            {error ? (
                <p className="text-sm text-shop-danger" role="alert">
                    {error}
                </p>
            ) : hint ? (
                <p className="text-xs text-shop-muted">{hint}</p>
            ) : null}
        </div>
    );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                id={id}
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                autoComplete={autoComplete}
                aria-invalid={invalid || undefined}
                className={cn(inputCls, 'pr-12')}
                required
            />
            <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-2xl text-shop-muted hover:text-shop-ink"
                aria-label={show ? 'Hide password' : 'Show password'}
            >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
        </div>
    );
}

export function AuthTabs({ mode, onChange }: { mode: 'login' | 'register'; onChange: (m: 'login' | 'register') => void }) {
    return (
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-2xl bg-shop-sunken p-1">
            {(['login', 'register'] as const).map((m) => (
                <button
                    key={m}
                    role="tab"
                    type="button"
                    aria-selected={mode === m}
                    onClick={() => onChange(m)}
                    className={cn(
                        'bc-press h-11 cursor-pointer rounded-xl text-sm font-semibold',
                        mode === m ? 'bg-shop-surface text-shop-ink shadow-shop-sm' : 'text-shop-muted hover:text-shop-ink',
                    )}
                >
                    {m === 'login' ? 'Log in' : 'Create account'}
                </button>
            ))}
        </div>
    );
}

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
    const id = useId();
    const form = useForm({ login: '', password: '', remember: true });
    const looksLikePhone = /^[\d\s+]+$/.test(form.data.login) && form.data.login.length > 0;

    return (
        <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
                e.preventDefault();
                form.post('/account/login', { preserveScroll: true, onSuccess: () => onSuccess?.() });
            }}
        >
            <Field label="Mobile number or email" error={form.errors.login} htmlFor={`${id}-login`}>
                <input
                    id={`${id}-login`}
                    className={inputCls}
                    value={form.data.login}
                    onChange={(e) => {
                        const v = e.target.value;
                        form.setData('login', /^[\d\s+]+$/.test(v) ? formatPhone(v) : v);
                    }}
                    autoComplete="username"
                    inputMode={looksLikePhone ? 'tel' : 'email'}
                    placeholder="0917 123 4567"
                    aria-invalid={!!form.errors.login || undefined}
                    required
                />
            </Field>
            <Field label="Password" error={form.errors.password} htmlFor={`${id}-pw`}>
                <PasswordInput id={`${id}-pw`} value={form.data.password} onChange={(v) => form.setData('password', v)} autoComplete="current-password" invalid={!!form.errors.password} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-shop-muted">
                <input type="checkbox" className="h-5 w-5 accent-shop-accent" checked={form.data.remember} onChange={(e) => form.setData('remember', e.target.checked)} />
                Keep me signed in on this phone
            </label>
            <ShopButton type="submit" size="lg" block loading={form.processing}>
                Log in
            </ShopButton>
        </form>
    );
}

export function RegisterForm({ barangays, onSuccess }: { barangays: string[]; onSuccess?: () => void }) {
    const id = useId();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    const form = useForm({
        name: '',
        contact_number: '',
        email: '',
        barangay: '',
        birthday: '',
        password: '',
        password_confirmation: '',
        terms: false,
    });
    const e = form.errors as Record<string, string | undefined>;

    return (
        <form
            className="space-y-4"
            noValidate
            onSubmit={(ev) => {
                ev.preventDefault();
                form.post('/account/register', { preserveScroll: true, onSuccess: () => onSuccess?.() });
            }}
        >
            <Field label="Full name" error={e.name} htmlFor={`${id}-name`}>
                <input id={`${id}-name`} className={inputCls} value={form.data.name} onChange={(ev) => form.setData('name', ev.target.value)} autoComplete="name" aria-invalid={!!e.name || undefined} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mobile number" error={e.contact_number} hint="Members: use the same number to keep your points." htmlFor={`${id}-tel`}>
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
                <Field label="Email" error={e.email} htmlFor={`${id}-email`}>
                    <input id={`${id}-email`} className={inputCls} type="email" value={form.data.email} onChange={(ev) => form.setData('email', ev.target.value)} autoComplete="email" aria-invalid={!!e.email || undefined} required />
                </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Barangay in Mabinay" error={e.barangay} htmlFor={`${id}-brgy`}>
                    <select id={`${id}-brgy`} className={inputCls} value={form.data.barangay} onChange={(ev) => form.setData('barangay', ev.target.value)} aria-invalid={!!e.barangay || undefined} required>
                        <option value="">Choose barangay</option>
                        {barangays.map((b) => (
                            <option key={b} value={b}>
                                {b}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Birthday (optional)" error={e.birthday} hint="Bonus points every birthday month." htmlFor={`${id}-bday`}>
                    <input id={`${id}-bday`} className={inputCls} type="date" value={form.data.birthday} onChange={(ev) => form.setData('birthday', ev.target.value)} autoComplete="bday" />
                </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password" error={e.password} hint="8+ characters, letters and numbers." htmlFor={`${id}-pw`}>
                    <PasswordInput id={`${id}-pw`} value={form.data.password} onChange={(v) => form.setData('password', v)} autoComplete="new-password" invalid={!!e.password} />
                </Field>
                <Field label="Confirm password" error={e.password_confirmation} htmlFor={`${id}-pw2`}>
                    <PasswordInput id={`${id}-pw2`} value={form.data.password_confirmation} onChange={(v) => form.setData('password_confirmation', v)} autoComplete="new-password" />
                </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-shop-muted">
                <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-shop-accent" checked={form.data.terms} onChange={(ev) => form.setData('terms', ev.target.checked)} />
                <span>
                    I agree that {businessName} may use my details to prepare my orders and run {rewardsName}.
                </span>
            </label>
            {e.terms && (
                <p className="text-sm text-shop-danger" role="alert">
                    {e.terms}
                </p>
            )}
            <ShopButton type="submit" size="lg" block loading={form.processing}>
                Create my account
            </ShopButton>
        </form>
    );
}
