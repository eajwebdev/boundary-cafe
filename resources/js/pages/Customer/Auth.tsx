import { Link } from '@inertiajs/react';
import { ArrowLeft, Bike, Gift, MapPin } from 'lucide-react';
import { useState } from 'react';

import { AuthTabs, LoginForm, RegisterForm } from '@/components/storefront/AuthForms';
import { RouteLine } from '@/components/storefront/ui';
import { useBusinessName, useRewardsName } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';
import CustomerLayout from '@/layouts/CustomerLayout';

export default function CustomerAuth({ mode: initialMode, barangays }: { mode: 'login' | 'register'; barangays: string[] }) {
    const logoUrl = useLogoUrl();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    const usesEajMenu = typeof document !== 'undefined' && document.documentElement.dataset.menuSeeder === 'eaj';
    const heroImage = usesEajMenu ? '/images/products/eaj/boundary-burger.webp' : '/uploads/optimized/boundary_burger.webp';
    const [mode, setMode] = useState(initialMode);

    return (
        <CustomerLayout title={mode === 'login' ? 'Log in' : 'Create account'} barangays={barangays} hideBottomNav wide>
            <div className="px-4 py-6 lg:px-6 lg:py-10">
                <div className="shadow-shop-md mx-auto grid max-w-5xl overflow-hidden rounded-4xl bg-shop-surface ring-1 ring-shop-line lg:grid-cols-[1.05fr_1fr]">
                    {/* Brand side (desktop) */}
                    <div className="relative hidden flex-col justify-between overflow-hidden bg-shop-navy p-10 text-shop-navy-ink lg:flex">
                        <div>
                            <img src={logoUrl} alt="" className="h-14 w-14 rounded-full bg-white p-1 ring-4 ring-white/15" />
                            <h2 className="mt-8 font-display text-4xl leading-[1.05] font-bold">
                                Sulit meals and frappes,
                                <br />
                                hatid sa inyong pinto.
                            </h2>
                            <p className="mt-4 max-w-sm text-white/75">
                                Order {businessName} favourites for delivery anywhere in Mabinay, or pick them up fresh from our café.
                            </p>
                        </div>
                        <ul className="relative z-10 space-y-3 text-sm">
                            <li className="flex items-center gap-3">
                                <Bike className="h-5 w-5 text-shop-accent" /> Track your rider live
                            </li>
                            <li className="flex items-center gap-3">
                                <Gift className="h-5 w-5 text-shop-accent" /> Earn {rewardsName} on every order
                            </li>
                            <li className="flex items-center gap-3">
                                <MapPin className="h-5 w-5 text-shop-accent" /> Delivering across Mabinay, Negros Oriental
                            </li>
                        </ul>
                        <img
                            src={heroImage}
                            alt=""
                            className="pointer-events-none absolute -right-20 bottom-24 h-72 w-72 rounded-full object-cover opacity-90 ring-8 ring-white/10"
                        />
                        <RouteLine className="absolute inset-x-10 bottom-6 h-5 opacity-70" />
                    </div>

                    {/* Form */}
                    <div className="p-6 sm:p-10">
                        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-shop-muted hover:text-shop-ink">
                            <ArrowLeft className="h-4 w-4" /> Back to the menu
                        </Link>
                        <h1 className="font-display text-[32px] leading-tight font-bold">
                            {mode === 'login' ? 'Welcome back' : `Join ${businessName}`}
                        </h1>
                        <p className="mt-1.5 mb-6 text-shop-muted">
                            {mode === 'login' ? 'Log in to continue your order.' : 'It takes a minute — and your first points are waiting.'}
                        </p>
                        <AuthTabs mode={mode} onChange={setMode} />
                        <div className="mt-6">{mode === 'login' ? <LoginForm /> : <RegisterForm barangays={barangays} />}</div>
                    </div>
                </div>
            </div>
        </CustomerLayout>
    );
}
