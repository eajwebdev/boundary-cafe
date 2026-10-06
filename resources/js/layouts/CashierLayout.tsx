'use client';

import { Link, Head, router, usePage } from '@inertiajs/react';
import { ShoppingCart, History, Wallet, Calculator, PiggyBank, LogOut, Sun, Moon, Users, Bike, Utensils } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ReactNode} from 'react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SharedProps } from '@/types/shared';

// ─── Menu IDs (must match MenuHelper.php) ─────────────────────────────────────
const M = {
    POS: '2',
    SALES_HISTORY: '3',
    CASH_SESSIONS: '14',
    CASH_COUNTS: '15',
    PETTY_CASH: '16',
    CUSTOMERS: '39',
    ONLINE_ORDERS: '40',
    TABLES: '41',
} as const;

// Alt+1…8 — reliably interceptable, don't clash with browser or POS F-key bindings
const NAV = [
    { id: M.POS, href: '/pos', icon: ShoppingCart, label: 'Cashier', key: 'Alt+1' },
    { id: M.ONLINE_ORDERS, href: '/online-orders', icon: Bike, label: 'Online Orders', key: 'Alt+2' },
    { id: M.TABLES, href: '/tables', icon: Utensils, label: 'Tables', key: 'Alt+3' },
    { id: M.SALES_HISTORY, href: '/sales/history', icon: History, label: 'History', key: 'Alt+4' },
    { id: M.CASH_SESSIONS, href: '/cash-sessions', icon: Wallet, label: 'Cash Session', key: 'Alt+5' },
    { id: M.CASH_COUNTS, href: '/cash-counts', icon: Calculator, label: 'Cash Count', key: 'Alt+6' },
    { id: M.PETTY_CASH, href: '/petty-cash', icon: PiggyBank, label: 'Petty Cash', key: 'Alt+7' },
    { id: M.CUSTOMERS, href: '/customers', icon: Users, label: 'Customers', key: 'Alt+8' },
] as const;

export default function CashierLayout({ children }: { children: ReactNode }) {
    const { props } = usePage<SharedProps>();
    const { theme, setTheme } = useTheme();
    const currentPath = usePage().url.split('?')[0].replace(/\/$/, '');

    const access: string[] = props.auth?.user?.access ?? [];
    const has = (id: string) => access.includes(id);

    const user = props.auth?.user;
    const branch = (props.branch as { name?: string } | undefined) ?? user?.branch;
    const session = props.session; // only present on POS page
    const appName = props.app?.name ?? 'POS System';
    const appLogo = props.app?.logo_url ?? null;
    const appIcon = props.app?.icon_url || appLogo || '/uploads/logo.png';

    const isActive = (href: string) => {
        const h = href.replace(/\/$/, '');
        return currentPath === h || currentPath.startsWith(h + '/');
    };

    // Global nav shortcuts — disabled on /pos (it registers its own F-key handlers)
    useEffect(() => {
        if (currentPath === '/pos') return;
        const fn = (e: KeyboardEvent) => {
            if (!e.altKey) return;
            const digit = e.key; // "1"–"5" when altKey is held
            const item = NAV.find((n) => n.key === `Alt+${digit}`);
            if (!item) return;
            // Always suppress the browser's Alt+key action first
            e.preventDefault();
            if (has(item.id)) router.visit(item.href);
        };
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [currentPath, access.join(',')]);

    const visibleNav = NAV.filter((n) => has(n.id));

    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
            <Head title={props.title ?? ''}>
                <link rel="icon" href={appIcon} />
                <link rel="apple-touch-icon" href={appIcon} />
            </Head>

            {/* ── Top bar (h-12) ───────────────────────────────────── */}
            <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5 shadow-xs ring-1 ring-black/10">
                        <img src={appIcon} alt={appName} className="h-full w-full object-contain" />
                    </div>
                    <span className="truncate text-sm font-semibold">{branch?.name ?? appName}</span>
                    {/* Session status — only shown when POS passes it as a prop */}
                    {session !== undefined && (
                        <div
                            className={cn(
                                'hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold sm:flex',
                                session
                                    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
                            )}
                        >
                            <span className={cn('h-1.5 w-1.5 rounded-full', session ? 'bg-green-500' : 'bg-amber-500')} />
                            {session ? 'Session Open' : 'No Session'}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground md:block">
                        {user?.fname} {user?.lname}
                        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">Cashier</span>
                    </span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle theme"
                    >
                        <Sun className="h-3.5 w-3.5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                        <Moon className="absolute h-3.5 w-3.5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                    </Button>
                </div>
            </header>

            {/* ── Page content ─────────────────────────────────────── */}
            {/* POS page manages its own layout — no padding, no overflow */}
            <main className={cn('min-h-0 flex-1 overflow-hidden', currentPath !== '/pos' && 'overflow-y-auto p-6')}>{children}</main>

            {/* ── Bottom nav bar (h-16) ────────────────────────────── */}
            <nav className="flex h-16 shrink-0 items-stretch border-t border-border bg-primary select-none">
                {visibleNav.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            className={cn(
                                'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                                active
                                    ? 'border-t-2 border-primary-foreground bg-black/20'
                                    : 'text-primary-foreground/60 hover:bg-black/10 hover:text-primary-foreground',
                            )}
                            style={active ? { color: 'var(--primary-foreground)' } : undefined}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-[10px] leading-none font-semibold">{item.label}</span>
                            <span
                                className={cn(
                                    'absolute right-1.5 bottom-1.5 rounded px-1 py-px font-mono text-[8px] leading-none',
                                    active ? 'bg-white/20 text-primary-foreground' : 'bg-black/20 text-primary-foreground/40',
                                )}
                            >
                                {item.key}
                            </span>
                        </Link>
                    );
                })}

                {/* Divider */}
                <div className="my-2 w-px shrink-0 self-stretch bg-primary-foreground/20" />

                {/* Logout */}
                <button
                    onClick={() => router.post('/logout', {}, { preserveState: false })}
                    className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 text-primary-foreground/60 transition-colors hover:bg-black/10 hover:text-primary-foreground"
                >
                    <LogOut className="h-5 w-5" />
                    <span className="text-[10px] leading-none font-semibold">Logout</span>
                </button>
            </nav>
        </div>
    );
}
