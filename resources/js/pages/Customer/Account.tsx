import { Link, router, useForm } from '@inertiajs/react';
import { ChevronRight, Gift, KeyRound, Link2, Loader2, LogOut, MapPin, Pencil, Plus, ReceiptText, Star, Trash2, UserRound, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { confirmDialog } from '@/components/ConfirmDialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useRewardsName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import type { DeliveryZone, SavedAddress } from '@/lib/customer';
import { cn } from '@/lib/utils';

const AddressPicker = lazy(() => import('@/components/storefront/AddressPicker'));

interface Props {
    profile: {
        name: string;
        contact_number: string | null;
        email: string | null;
        barangay: string | null;
        birthday: string | null;
        customer_number: string | null;
        joined_at: string | null;
        has_password: boolean;
        loyalty_points: number;
        orders_count: number;
        active_orders_count: number;
    };
    social: { available: string[]; linked: { provider: string; label: string; email: string | null; linked_at: string | null }[] };
    addresses: SavedAddress[];
    zone: DeliveryZone;
    barangays: string[];
}

type Panel = 'details' | 'linked' | 'password' | null;

const inputCls =
    'h-12 w-full rounded-2xl border border-shop-line bg-shop-surface px-4 text-base outline-none focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15 disabled:bg-shop-sunken disabled:text-shop-muted';

const PROVIDER_LABEL: Record<string, string> = { google: 'Google', facebook: 'Facebook' };

function initials(name: string): string {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join('') || '?'
    );
}

export default function Account({ profile, social, addresses, zone, barangays }: Props) {
    const rewardsName = useRewardsName();
    const [picker, setPicker] = useState<{ open: boolean; address: SavedAddress | null }>({ open: false, address: null });
    const [panel, setPanel] = useState<Panel>(null);

    const form = useForm({
        name: profile.name,
        contact_number: profile.contact_number ?? '',
        email: profile.email ?? '',
        barangay: profile.barangay ?? '',
        birthday: profile.birthday ?? '',
    });
    const pw = useForm({ current_password: '', password: '', password_confirmation: '' });

    const providers = Array.from(new Set([...social.available, ...social.linked.map((l) => l.provider)]));
    const since = profile.joined_at ? new Date(profile.joined_at).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : null;

    const logOut = async () => {
        if (await confirmDialog({ title: 'Log out?', description: 'Your cart stays saved on this phone.', confirmLabel: 'Log out' })) {
            router.post('/account/logout');
        }
    };

    return (
        <CustomerLayout title="My account" barangays={barangays}>
            <div className="mx-auto max-w-xl space-y-5 px-4 pt-4 pb-10">
                {/* ── Member header ─────────────────────────────── */}
                <section className="shadow-shop-md rounded-[26px] bg-shop-navy p-5 text-shop-navy-ink">
                    <div className="flex items-center gap-3.5">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/12 font-display text-xl font-bold">
                            {initials(profile.name)}
                        </span>
                        <div className="min-w-0">
                            <h1 className="truncate font-display text-[22px] leading-tight font-bold">{profile.name}</h1>
                            <p className="truncate text-sm text-white/70">
                                <span className="font-mono">{profile.customer_number}</span>
                                {since && ` · member since ${since}`}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                        <Tile
                            href="/account/rewards"
                            icon={Gift}
                            value={profile.loyalty_points.toLocaleString()}
                            label="Points"
                            title={`${rewardsName} points`}
                        />
                        <Tile
                            href="/account/orders"
                            icon={ReceiptText}
                            value={String(profile.orders_count)}
                            label="Orders"
                            badge={profile.active_orders_count > 0 ? `${profile.active_orders_count} active` : undefined}
                        />
                        <Tile
                            onClick={() => document.getElementById('addresses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            icon={MapPin}
                            value={String(addresses.length)}
                            label={addresses.length === 1 ? 'Address' : 'Addresses'}
                        />
                    </div>
                </section>

                {/* ── Delivery addresses ─────────────────────────── */}
                <section id="addresses" className="scroll-mt-20">
                    <div className="mb-2 flex items-center justify-between px-1">
                        <h2 className="text-xs font-bold tracking-[0.14em] text-shop-muted uppercase">Delivery addresses</h2>
                        <button
                            type="button"
                            onClick={() => setPicker({ open: true, address: null })}
                            className="bc-press flex h-9 items-center gap-1 rounded-full bg-shop-accent-soft px-3 text-sm font-bold text-shop-accent-ink"
                        >
                            <Plus className="h-4 w-4" /> Add
                        </button>
                    </div>
                    <div className="overflow-hidden rounded-[22px] bg-shop-surface ring-1 ring-shop-line">
                        {addresses.length === 0 ? (
                            <button
                                type="button"
                                onClick={() => setPicker({ open: true, address: null })}
                                className="flex w-full flex-col items-center gap-1 px-5 py-8 text-center"
                            >
                                <MapPin className="h-6 w-6 text-shop-accent-ink" />
                                <span className="font-semibold">Add your first address</span>
                                <span className="text-sm text-shop-muted">Pin it on the map so the rider finds you.</span>
                            </button>
                        ) : (
                            <ul className="divide-y divide-shop-line">
                                {addresses.map((a) => (
                                    <li key={a.id} className="flex items-center gap-2 py-1.5 pr-1.5 pl-4">
                                        <button
                                            type="button"
                                            onClick={() => setPicker({ open: true, address: a })}
                                            className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
                                            aria-label={`Edit ${a.label}`}
                                        >
                                            <MapPin className="h-5 w-5 shrink-0 text-shop-accent-ink" />
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-2 font-bold">
                                                    <span className="truncate">{a.label}</span>
                                                    {a.is_default && (
                                                        <span className="shrink-0 rounded-full bg-shop-accent-soft px-2 py-0.5 text-[11px] font-bold text-shop-accent-ink">
                                                            Default
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="line-clamp-2 text-sm text-shop-muted">{a.summary}</span>
                                            </span>
                                        </button>
                                        {!a.is_default && (
                                            <IconButton
                                                label="Make default"
                                                onClick={() => router.post(`/account/addresses/${a.id}/default`, {}, { preserveScroll: true })}
                                            >
                                                <Star className="h-4 w-4" />
                                            </IconButton>
                                        )}
                                        <IconButton label="Edit" onClick={() => setPicker({ open: true, address: a })}>
                                            <Pencil className="h-4 w-4" />
                                        </IconButton>
                                        <IconButton
                                            label="Remove"
                                            danger
                                            onClick={async () => {
                                                const confirmed = await confirmDialog({
                                                    title: `Remove “${a.label}”?`,
                                                    confirmLabel: 'Remove',
                                                    tone: 'danger',
                                                });
                                                if (confirmed) router.delete(`/account/addresses/${a.id}`, { preserveScroll: true });
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </IconButton>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </section>

                {/* ── Settings ───────────────────────────────────── */}
                <section>
                    <h2 className="mb-2 px-1 text-xs font-bold tracking-[0.14em] text-shop-muted uppercase">Account settings</h2>
                    <ul className="divide-y divide-shop-line overflow-hidden rounded-[22px] bg-shop-surface ring-1 ring-shop-line">
                        <SettingRow
                            icon={UserRound}
                            title="Personal details"
                            subtitle={[profile.contact_number, profile.email, profile.barangay].filter(Boolean).join(' · ') || 'Add your details'}
                            onClick={() => setPanel('details')}
                        />
                        {providers.length > 0 && (
                            <SettingRow
                                icon={Link2}
                                title="Google & Facebook"
                                subtitle={social.linked.length ? `Linked: ${social.linked.map((l) => l.label).join(', ')}` : 'Log in with one tap'}
                                onClick={() => setPanel('linked')}
                            />
                        )}
                        <SettingRow
                            icon={KeyRound}
                            title={profile.has_password ? 'Change password' : 'Set a password'}
                            subtitle={profile.has_password ? 'Keep your account secure' : 'Also log in with your mobile number'}
                            onClick={() => setPanel('password')}
                        />
                    </ul>
                </section>

                <button
                    type="button"
                    onClick={logOut}
                    className="bc-press flex h-14 w-full items-center justify-center gap-2 rounded-[22px] bg-shop-surface font-semibold text-shop-danger ring-1 ring-shop-line"
                >
                    <LogOut className="h-5 w-5" /> Log out
                </button>
            </div>

            {/* ── Personal details / linked accounts / password ── */}
            <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bc-shop max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[28px] border-shop-line bg-shop-surface p-0 pb-[env(safe-area-inset-bottom)] sm:mx-auto sm:max-w-xl"
                >
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-shop-line bg-shop-surface px-5 py-4">
                        <SheetTitle className="font-display text-lg font-semibold">
                            {panel === 'details'
                                ? 'Personal details'
                                : panel === 'linked'
                                  ? 'Google & Facebook'
                                  : profile.has_password
                                    ? 'Change password'
                                    : 'Set a password'}
                        </SheetTitle>
                        <button
                            type="button"
                            onClick={() => setPanel(null)}
                            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-shop-sunken"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <SheetDescription className="sr-only">Update your account</SheetDescription>

                    <div className="p-5">
                        {panel === 'details' && (
                            <form
                                className="space-y-3"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    form.patch('/account', { preserveScroll: true, onSuccess: () => setPanel(null) });
                                }}
                            >
                                <Field label="Full name" error={form.errors.name}>
                                    <input
                                        className={inputCls}
                                        value={form.data.name}
                                        onChange={(e) => form.setData('name', e.target.value)}
                                        autoComplete="name"
                                        required
                                    />
                                </Field>
                                <Field label="Mobile number" error={form.errors.contact_number}>
                                    <input
                                        className={inputCls}
                                        value={form.data.contact_number}
                                        onChange={(e) => form.setData('contact_number', e.target.value)}
                                        inputMode="tel"
                                        autoComplete="tel"
                                        placeholder="0917 123 4567"
                                        required
                                    />
                                </Field>
                                <Field label="Email" error={form.errors.email}>
                                    <input
                                        className={inputCls}
                                        type="email"
                                        value={form.data.email}
                                        onChange={(e) => form.setData('email', e.target.value)}
                                        autoComplete="email"
                                        required
                                    />
                                </Field>
                                <Field label="Barangay" error={form.errors.barangay}>
                                    <select
                                        className={inputCls}
                                        value={form.data.barangay}
                                        onChange={(e) => form.setData('barangay', e.target.value)}
                                        required
                                    >
                                        <option value="">Choose barangay</option>
                                        {barangays.map((b) => (
                                            <option key={b}>{b}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Birthday"
                                    error={form.errors.birthday}
                                    hint={
                                        profile.birthday
                                            ? 'Ask the café to correct your birthday.'
                                            : 'Set once. You get bonus points in your birthday month.'
                                    }
                                >
                                    <input
                                        className={inputCls}
                                        type="date"
                                        value={form.data.birthday}
                                        disabled={!!profile.birthday}
                                        onChange={(e) => form.setData('birthday', e.target.value)}
                                    />
                                </Field>
                                <SubmitButton processing={form.processing}>Save details</SubmitButton>
                            </form>
                        )}

                        {panel === 'linked' && (
                            <ul className="divide-y divide-shop-line">
                                {providers.map((provider) => {
                                    const linked = social.linked.find((l) => l.provider === provider);
                                    return (
                                        <li key={provider} className="flex items-center justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold">{PROVIDER_LABEL[provider] ?? provider}</p>
                                                <p className="truncate text-sm text-shop-muted">
                                                    {linked ? (linked.email ?? 'Linked') : 'Not linked'}
                                                </p>
                                            </div>
                                            {linked ? (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const ok = await confirmDialog({
                                                            title: `Unlink ${PROVIDER_LABEL[provider]}?`,
                                                            description: 'You can link it again any time.',
                                                            confirmLabel: 'Unlink',
                                                            tone: 'danger',
                                                        });
                                                        if (ok) router.delete(`/account/social/${provider}`, { preserveScroll: true });
                                                    }}
                                                    className="bc-press h-11 cursor-pointer rounded-full border border-shop-line px-4 text-sm font-semibold text-shop-muted hover:bg-shop-sunken"
                                                >
                                                    Unlink
                                                </button>
                                            ) : (
                                                <a
                                                    href={`/account/auth/${provider}/redirect?link=1`}
                                                    className="bc-press flex h-11 items-center gap-1.5 rounded-full bg-shop-accent px-4 text-sm font-semibold text-shop-on-accent"
                                                >
                                                    <Link2 className="h-4 w-4" /> Link
                                                </a>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {panel === 'password' && (
                            <form
                                className="space-y-3"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    pw.put('/account/password', {
                                        preserveScroll: true,
                                        onSuccess: () => {
                                            pw.reset();
                                            setPanel(null);
                                        },
                                    });
                                }}
                            >
                                {!profile.has_password && (
                                    <p className="text-sm text-shop-muted">
                                        You sign in with Google or Facebook. Add a password to also log in with your mobile number.
                                    </p>
                                )}
                                {profile.has_password && (
                                    <Field label="Current password" error={pw.errors.current_password}>
                                        <input
                                            className={inputCls}
                                            type="password"
                                            autoComplete="current-password"
                                            value={pw.data.current_password}
                                            onChange={(e) => pw.setData('current_password', e.target.value)}
                                            required
                                        />
                                    </Field>
                                )}
                                <Field label="New password" error={pw.errors.password} hint="At least 8 characters, with letters and numbers.">
                                    <input
                                        className={inputCls}
                                        type="password"
                                        autoComplete="new-password"
                                        value={pw.data.password}
                                        onChange={(e) => pw.setData('password', e.target.value)}
                                        required
                                    />
                                </Field>
                                <Field label="Confirm new password" error={pw.errors.password_confirmation}>
                                    <input
                                        className={inputCls}
                                        type="password"
                                        autoComplete="new-password"
                                        value={pw.data.password_confirmation}
                                        onChange={(e) => pw.setData('password_confirmation', e.target.value)}
                                        required
                                    />
                                </Field>
                                <SubmitButton processing={pw.processing}>{profile.has_password ? 'Update password' : 'Set password'}</SubmitButton>
                            </form>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* ── Address map picker ────────────────────────────── */}
            <Sheet open={picker.open} onOpenChange={(open) => setPicker((p) => ({ ...p, open }))}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bc-shop h-dvh gap-0 border-shop-line bg-shop-surface p-0 sm:mx-auto sm:h-[90dvh] sm:max-w-2xl sm:rounded-t-3xl"
                >
                    <SheetTitle className="sr-only">Delivery address</SheetTitle>
                    <SheetDescription className="sr-only">Pin your address on the map</SheetDescription>
                    {picker.open && (
                        <Suspense
                            fallback={
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-shop-accent-ink" />
                                </div>
                            }
                        >
                            <AddressPicker
                                zone={zone}
                                barangays={barangays}
                                initial={picker.address}
                                onClose={() => setPicker({ open: false, address: null })}
                                onSaved={() => setPicker({ open: false, address: null })}
                            />
                        </Suspense>
                    )}
                </SheetContent>
            </Sheet>
        </CustomerLayout>
    );
}

/** One figure in the member header; a link, or a button for on-page jumps. */
function Tile({
    href,
    onClick,
    icon: Icon,
    value,
    label,
    badge,
    title,
}: {
    href?: string;
    onClick?: () => void;
    icon: React.ElementType;
    value: string;
    label: string;
    /** Small attention pill, e.g. "1 active". */
    badge?: string;
    title?: string;
}) {
    const cls = cn(
        'bc-press flex min-w-0 flex-col items-start gap-0.5 rounded-2xl bg-white/10 p-3 text-left hover:bg-white/15',
        badge && 'ring-2 ring-shop-accent',
    );
    const body = (
        <>
            <span className="flex w-full items-center justify-between gap-1">
                <Icon className="h-4 w-4 shrink-0 text-white/70" />
                {badge && (
                    <span className="truncate rounded-full bg-shop-accent px-1.5 py-0.5 text-[10px] leading-none font-bold text-shop-on-accent">
                        {badge}
                    </span>
                )}
            </span>
            <span className="mt-1 font-display text-xl leading-none font-bold tabular-nums">{value}</span>
            <span className="w-full truncate text-[11px] text-white/70">{label}</span>
        </>
    );

    return href ? (
        <Link href={href} className={cls} title={title}>
            {body}
        </Link>
    ) : (
        <button type="button" onClick={onClick} className={cls} title={title}>
            {body}
        </button>
    );
}

function SettingRow({ icon: Icon, title, subtitle, onClick }: { icon: React.ElementType; title: string; subtitle: string; onClick: () => void }) {
    return (
        <li>
            <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-shop-sunken/60">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-shop-accent-soft text-shop-accent-ink">
                    <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{title}</span>
                    <span className="block truncate text-sm text-shop-muted">{subtitle}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-shop-muted" />
            </button>
        </li>
    );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                danger ? 'text-shop-danger hover:bg-shop-danger-soft' : 'text-shop-muted hover:bg-shop-sunken',
            )}
        >
            {children}
        </button>
    );
}

function SubmitButton({ processing, children }: { processing: boolean; children: React.ReactNode }) {
    return (
        <button
            type="submit"
            disabled={processing}
            className="bc-press mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-shop-accent font-semibold text-shop-on-accent disabled:opacity-60"
        >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />} {children}
        </button>
    );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{label}</span>
            {children}
            {error ? (
                <span className="block text-sm text-shop-danger">{error}</span>
            ) : hint ? (
                <span className="block text-xs text-shop-muted">{hint}</span>
            ) : null}
        </label>
    );
}
