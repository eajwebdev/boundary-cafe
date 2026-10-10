import { Head, Link, router, usePage } from '@inertiajs/react';
import { Gift, Home, LogOut, ReceiptText, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AuthTabs, LoginForm, RegisterForm } from '@/components/storefront/AuthForms';
import { useIsDesktop } from '@/components/storefront/ui';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useBusinessName, useRewardsName } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';
import type { CustomerSession } from '@/lib/customer';
import { cn } from '@/lib/utils';

type AuthMode = 'login' | 'register';

const AuthSheetContext = createContext<{ requireAuth: (mode?: AuthMode) => void; customer: CustomerSession | null }>({
    requireAuth: () => {},
    customer: null,
});

/** Pages call requireAuth() when a guest tries to order; it opens the login/register panel. */
export function useCustomerAuth() {
    return useContext(AuthSheetContext);
}

interface Props {
    children: ReactNode;
    title?: string;
    /** Extra content in the sticky header (e.g. the delivery address chip). */
    headerSlot?: ReactNode;
    /** Trailing header action, after the account buttons (e.g. the cart button). */
    headerEnd?: ReactNode;
    /** Second header row (e.g. delivery / pickup tabs and the menu search). */
    subHeader?: ReactNode;
    /** Full-width announcement above the header; scrolls away with the page. */
    topStrip?: ReactNode;
    /** Hide the phone bottom navigation (checkout/auth have their own bottom bars). */
    hideBottomNav?: boolean;
    /** Wider max width for the three-column ordering workspace. */
    wide?: boolean;
    barangays?: string[];
}

const NAV = [
    { href: '/', label: 'Menu', icon: Home, auth: false },
    { href: '/account/orders', label: 'Orders', icon: ReceiptText, auth: true },
    { href: '/account/rewards', label: 'Rewards', icon: Gift, auth: true },
    { href: '/account', label: 'Account', icon: User, auth: true },
] as const;

export default function CustomerLayout({ children, title, headerSlot, headerEnd, subHeader, topStrip, hideBottomNav, wide, barangays }: Props) {
    const logoUrl = useLogoUrl();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    // Wordmark: the last word of the business name takes the accent colour ("EAJ <Cafe>").
    const nameWords = businessName.trim().split(/\s+/);
    const nameTail = nameWords.pop() ?? '';
    const nameLead = nameWords.join(' ');
    const page = usePage<{
        customer: CustomerSession | null;
        flash?: { success?: string | null; error?: string | null };
        barangays?: string[];
    }>();
    const customer = page.props.customer ?? null;
    const path = page.url.split('?')[0];
    const isDesktop = useIsDesktop();
    const [authOpen, setAuthOpen] = useState(false);
    const [mode, setMode] = useState<AuthMode>('login');
    const barangayList = barangays ?? page.props.barangays ?? [];

    const requireAuth = useCallback((m: AuthMode = 'login') => {
        setMode(m);
        setAuthOpen(true);
    }, []);

    useEffect(() => {
        const { success, error } = page.props.flash ?? {};
        if (success) toast.success(success);
        if (error) toast.error(error);
    }, [page.props.flash]);

    useEffect(() => {
        if (customer) setAuthOpen(false);
    }, [customer]);

    // The shop always uses its own warm canvas behind overscroll on iOS.
    useEffect(() => {
        const prev = document.body.style.backgroundColor;
        document.body.classList.add('bc-shop-body');
        return () => {
            document.body.style.backgroundColor = prev;
            document.body.classList.remove('bc-shop-body');
        };
    }, []);

    const isActive = (href: string) => (href === '/' ? path === '/' : href === '/account' ? path === '/account' : path.startsWith(href));
    const maxW = wide ? 'max-w-[1320px]' : 'max-w-5xl';

    const authBody = (
        <div className="space-y-5">
            <AuthTabs mode={mode} onChange={setMode} />
            {mode === 'login' ? (
                <LoginForm onSuccess={() => setAuthOpen(false)} />
            ) : (
                <RegisterForm barangays={barangayList} onSuccess={() => setAuthOpen(false)} />
            )}
        </div>
    );
    const authTitle = mode === 'login' ? 'Welcome back' : `Join ${businessName}`;
    const authDesc =
        mode === 'login'
            ? `Log in to order, follow your delivery and collect ${rewardsName}.`
            : 'Order for delivery or pickup anywhere in Mabinay, and earn points on every order.';

    return (
        <AuthSheetContext.Provider value={{ requireAuth, customer }}>
            <Head title={title}>
                <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
                <meta name="theme-color" content="#111b40" media="(prefers-color-scheme: dark)" />
            </Head>
            <div className="bc-shop min-h-dvh bg-shop-bg">
                <a
                    href="#shop-main"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-shop-surface focus:px-4 focus:py-2"
                >
                    Skip to content
                </a>

                {topStrip}

                {/* ── Header ─────────────────────────────────────────── */}
                <header
                    id="shop-header"
                    className="shadow-shop-sm sticky top-0 z-40 border-b border-shop-line bg-shop-surface pt-[env(safe-area-inset-top)]"
                >
                    <div className={cn('mx-auto flex h-14 items-center gap-2 px-4 lg:h-16 lg:gap-4 lg:px-6', maxW)}>
                        <Link href="/" className="bc-press flex min-w-0 items-center gap-2.5 rounded-full" aria-label={`${businessName} — menu`}>
                            <img
                                src={logoUrl}
                                alt=""
                                width={40}
                                height={40}
                                className="h-9 w-9 shrink-0 rounded-full ring-1 ring-shop-line lg:h-10 lg:w-10"
                            />
                            <span className="truncate font-display text-lg leading-none font-bold">
                                {nameLead && `${nameLead} `}
                                <span className="text-shop-accent-ink">{nameTail}</span>
                            </span>
                        </Link>

                        <div className="flex min-w-0 flex-1 lg:justify-center">{headerSlot}</div>

                        <nav className="hidden items-center gap-1 lg:flex" aria-label="Account">
                            {NAV.slice(1, 3).map((n) =>
                                customer ? (
                                    <Link
                                        key={n.href}
                                        href={n.href}
                                        className={cn(
                                            'bc-press flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-shop-muted hover:bg-shop-sunken hover:text-shop-ink',
                                            isActive(n.href) && 'bg-shop-sunken text-shop-ink',
                                        )}
                                    >
                                        <n.icon className="h-4 w-4" />
                                        {n.label}
                                    </Link>
                                ) : null,
                            )}
                        </nav>

                        {customer ? (
                            <div className="flex shrink-0 items-center gap-1.5">
                                <Link
                                    href="/account/rewards"
                                    className="bc-press flex h-9 items-center gap-1.5 rounded-full bg-shop-navy px-3 text-sm font-semibold text-shop-navy-ink lg:h-10"
                                    aria-label={`${customer.loyalty_points} ${rewardsName} points`}
                                >
                                    <Gift className="h-4 w-4" />
                                    <span className="tabular-nums">{customer.loyalty_points.toLocaleString()}</span>
                                    <span className="hidden sm:inline">pts</span>
                                </Link>
                                <Link
                                    href="/account"
                                    className={cn(
                                        'bc-press hidden h-10 w-10 items-center justify-center rounded-full bg-shop-accent-soft text-sm font-bold text-shop-accent-ink lg:flex',
                                        isActive('/account') && 'ring-2 ring-shop-accent',
                                    )}
                                    aria-label="My account"
                                >
                                    {customer.first_name?.[0]?.toUpperCase() ?? 'U'}
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => router.post('/account/logout')}
                                    className="bc-press hidden h-10 w-10 cursor-pointer items-center justify-center rounded-full text-shop-muted hover:bg-shop-sunken hover:text-shop-ink lg:flex"
                                    aria-label="Log out"
                                    title="Log out"
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => requireAuth('login')}
                                    className="bc-press h-9 cursor-pointer rounded-lg border border-shop-ink px-3.5 text-sm font-semibold text-shop-ink hover:bg-shop-sunken"
                                >
                                    Log in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => requireAuth('register')}
                                    className="bc-press hidden h-9 cursor-pointer rounded-lg bg-shop-accent px-3.5 text-sm font-semibold text-shop-on-accent hover:brightness-[1.04] lg:block"
                                >
                                    Sign up
                                </button>
                            </div>
                        )}
                        {headerEnd}
                    </div>
                    {subHeader && <div className={cn('mx-auto px-4 lg:px-6', maxW)}>{subHeader}</div>}
                </header>

                <main id="shop-main" className={cn('mx-auto w-full', maxW, !hideBottomNav && 'pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-12')}>
                    {children}
                </main>

                {/* ── Bottom navigation (phones & tablets) ─────────────── */}
                {!hideBottomNav && (
                    <nav
                        aria-label="Main"
                        className="fixed inset-x-0 bottom-0 z-40 border-t border-shop-line bg-shop-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
                    >
                        <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
                            {NAV.map((n) => {
                                const active = isActive(n.href);
                                const content = (
                                    <>
                                        <span
                                            className={cn(
                                                'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-300',
                                                active ? 'bg-shop-accent-soft text-shop-accent-ink' : 'text-shop-muted',
                                            )}
                                        >
                                            <n.icon className="h-5.5 w-5.5" strokeWidth={active ? 2.4 : 1.9} />
                                        </span>
                                        <span className={cn('text-[11px] font-semibold', active ? 'text-shop-ink' : 'text-shop-muted')}>
                                            {n.label}
                                        </span>
                                    </>
                                );
                                const cls = 'bc-press flex cursor-pointer flex-col items-center justify-center gap-0.5';
                                return n.auth && !customer ? (
                                    <button key={n.href} type="button" className={cls} onClick={() => requireAuth('login')}>
                                        {content}
                                    </button>
                                ) : (
                                    <Link key={n.href} href={n.href} className={cls} prefetch aria-current={active ? 'page' : undefined}>
                                        {content}
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>
                )}
            </div>

            {/* ── Login / register: dialog on desktop, bottom sheet on phones ── */}
            {isDesktop ? (
                <Dialog open={authOpen} onOpenChange={setAuthOpen}>
                    <DialogContent className="bc-shop max-h-[90dvh] overflow-y-auto rounded-3xl border-shop-line bg-shop-surface p-7 sm:max-w-lg">
                        <DialogTitle className="font-display text-2xl font-bold">{authTitle}</DialogTitle>
                        <DialogDescription className="text-shop-muted">{authDesc}</DialogDescription>
                        {authBody}
                    </DialogContent>
                </Dialog>
            ) : (
                <Sheet open={authOpen} onOpenChange={setAuthOpen}>
                    <SheetContent
                        side="bottom"
                        className="bc-shop max-h-[94dvh] gap-0 overflow-y-auto rounded-t-[28px] border-shop-line bg-shop-surface px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                    >
                        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-shop-line" aria-hidden />
                        <SheetTitle className="font-display text-2xl font-bold">{authTitle}</SheetTitle>
                        <SheetDescription className="mt-1 mb-5 text-shop-muted">{authDesc}</SheetDescription>
                        {authBody}
                    </SheetContent>
                </Sheet>
            )}
        </AuthSheetContext.Provider>
    );
}
