import { router, useForm } from '@inertiajs/react';
import { Loader2, LogOut, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import CustomerLayout from '@/layouts/CustomerLayout';
import type { DeliveryZone, SavedAddress } from '@/lib/customer';

const AddressPicker = lazy(() => import('@/components/storefront/AddressPicker'));

interface Props {
    profile: { name: string; contact_number: string | null; email: string | null; barangay: string | null; birthday: string | null; customer_number: string | null; joined_at: string | null };
    addresses: SavedAddress[];
    zone: DeliveryZone;
    barangays: string[];
}

const inputCls = 'h-12 w-full rounded-2xl border border-shop-line bg-shop-surface px-4 text-base outline-none focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15 disabled:bg-shop-sunken disabled:text-shop-muted';

export default function Account({ profile, addresses, zone, barangays }: Props) {
    const [picker, setPicker] = useState<{ open: boolean; address: SavedAddress | null }>({ open: false, address: null });

    const form = useForm({
        name: profile.name,
        contact_number: profile.contact_number ?? '',
        email: profile.email ?? '',
        barangay: profile.barangay ?? '',
        birthday: profile.birthday ?? '',
    });
    const pw = useForm({ current_password: '', password: '', password_confirmation: '' });

    return (
        <CustomerLayout title="My account" barangays={barangays}>
            <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4 pb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="font-display text-[30px] leading-none font-bold">My account</h1>
                        <p className="text-sm text-shop-muted">
                            Member {profile.customer_number}
                            {profile.joined_at ? ` · since ${new Date(profile.joined_at).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={() => router.post('/account/logout')} className="flex h-10 items-center gap-2 rounded-full border border-shop-line px-4 text-sm font-semibold">
                        <LogOut className="h-4 w-4" /> Log out
                    </button>
                </div>

                {/* Addresses */}
                <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-display text-lg font-semibold">Delivery addresses</h2>
                        <button type="button" onClick={() => setPicker({ open: true, address: null })} className="flex h-9 items-center gap-1 rounded-full bg-shop-accent-soft px-3 text-sm font-bold text-shop-accent-ink">
                            <Plus className="h-4 w-4" /> Add
                        </button>
                    </div>
                    {addresses.length === 0 ? (
                        <p className="py-4 text-center text-sm text-shop-muted">No saved addresses yet. Add one to order for delivery.</p>
                    ) : (
                        <ul className="space-y-2">
                            {addresses.map((a) => (
                                <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-shop-sunken/60 p-3">
                                    <MapPin className="h-5 w-5 shrink-0 text-shop-accent-ink" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold">
                                            {a.label}
                                            {a.is_default && <span className="ml-2 rounded-full bg-shop-sunken px-2 py-0.5 text-xs font-semibold">Default</span>}
                                        </p>
                                        <p className="truncate text-sm text-shop-muted">{a.summary}</p>
                                    </div>
                                    {!a.is_default && (
                                        <button type="button" onClick={() => router.post(`/account/addresses/${a.id}/default`, {}, { preserveScroll: true })} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-shop-sunken" aria-label="Make default" title="Make default">
                                            <Star className="h-4 w-4" />
                                        </button>
                                    )}
                                    <button type="button" onClick={() => setPicker({ open: true, address: a })} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-shop-sunken" aria-label="Edit">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => confirm('Remove this address?') && router.delete(`/account/addresses/${a.id}`, { preserveScroll: true })}
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-shop-danger hover:bg-shop-danger-soft"
                                        aria-label="Remove"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Profile */}
                <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                    <h2 className="mb-3 font-display text-lg font-semibold">Profile</h2>
                    <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            form.patch('/account', { preserveScroll: true });
                        }}
                    >
                        <Field label="Full name" error={form.errors.name}>
                            <input className={inputCls} value={form.data.name} onChange={(e) => form.setData('name', e.target.value)} required />
                        </Field>
                        <Field label="Mobile number" error={form.errors.contact_number}>
                            <input className={inputCls} value={form.data.contact_number} onChange={(e) => form.setData('contact_number', e.target.value)} inputMode="tel" required />
                        </Field>
                        <Field label="Email" error={form.errors.email}>
                            <input className={inputCls} type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} required />
                        </Field>
                        <Field label="Barangay" error={form.errors.barangay}>
                            <select className={inputCls} value={form.data.barangay} onChange={(e) => form.setData('barangay', e.target.value)} required>
                                <option value="">Choose barangay</option>
                                {barangays.map((b) => (
                                    <option key={b}>{b}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Birthday" error={form.errors.birthday} hint={profile.birthday ? 'Ask the café to correct your birthday.' : 'Set once — used for your birthday bonus.'}>
                            <input className={inputCls} type="date" value={form.data.birthday} disabled={!!profile.birthday} onChange={(e) => form.setData('birthday', e.target.value)} />
                        </Field>
                        <div className="flex items-end">
                            <button type="submit" disabled={form.processing} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-shop-accent font-semibold text-shop-on-accent disabled:opacity-60">
                                {form.processing && <Loader2 className="h-4 w-4 animate-spin" />} Save profile
                            </button>
                        </div>
                    </form>
                </section>

                {/* Password */}
                <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                    <h2 className="mb-3 font-display text-lg font-semibold">Change password</h2>
                    <form
                        className="grid gap-3 sm:grid-cols-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            pw.put('/account/password', { preserveScroll: true, onSuccess: () => pw.reset() });
                        }}
                    >
                        <Field label="Current" error={pw.errors.current_password}>
                            <input className={inputCls} type="password" autoComplete="current-password" value={pw.data.current_password} onChange={(e) => pw.setData('current_password', e.target.value)} required />
                        </Field>
                        <Field label="New" error={pw.errors.password}>
                            <input className={inputCls} type="password" autoComplete="new-password" value={pw.data.password} onChange={(e) => pw.setData('password', e.target.value)} required />
                        </Field>
                        <Field label="Confirm new" error={pw.errors.password_confirmation}>
                            <input className={inputCls} type="password" autoComplete="new-password" value={pw.data.password_confirmation} onChange={(e) => pw.setData('password_confirmation', e.target.value)} required />
                        </Field>
                        <button type="submit" disabled={pw.processing} className="bc-press h-12 cursor-pointer rounded-2xl border border-shop-line font-semibold hover:bg-shop-sunken sm:col-span-3">
                            Update password
                        </button>
                    </form>
                </section>
            </div>

            <Sheet open={picker.open} onOpenChange={(open) => setPicker((p) => ({ ...p, open }))}>
                <SheetContent side="bottom" showCloseButton={false} className="bc-shop h-dvh gap-0 border-shop-line bg-shop-surface p-0 sm:mx-auto sm:h-[90dvh] sm:max-w-2xl sm:rounded-t-3xl">
                    <SheetTitle className="sr-only">Delivery address</SheetTitle>
                    <SheetDescription className="sr-only">Pin your address on the map</SheetDescription>
                    {picker.open && (
                        <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-shop-accent-ink" /></div>}>
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

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{label}</span>
            {children}
            {error ? <span className="block text-sm text-shop-danger">{error}</span> : hint ? <span className="block text-xs text-shop-muted">{hint}</span> : null}
        </label>
    );
}
