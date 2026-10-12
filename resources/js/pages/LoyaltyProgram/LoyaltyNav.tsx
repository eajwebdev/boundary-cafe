import { Link, usePage } from '@inertiajs/react';
import { BarChart3, Gift, QrCode, Settings2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const TABS = [
    { href: '/loyalty-program', label: 'Overview & settings', icon: Settings2 },
    { href: '/loyalty-program/rewards', label: 'Reward catalog', icon: Gift },
    { href: '/loyalty-program/claims', label: 'Claims', icon: QrCode },
    { href: '/loyalty-program/reports', label: 'Reports', icon: BarChart3 },
] as const;

/** Sub-navigation shared by the Loyalty Program pages. */
export default function LoyaltyNav({ pendingClaims }: { pendingClaims?: number }) {
    const path = usePage().url.split('?')[0];

    return (
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" aria-label="Loyalty program">
            {TABS.map(({ href, label, icon: Icon }) => {
                const active = href === '/loyalty-program' ? path === href : path.startsWith(href);
                return (
                    <Link
                        key={href}
                        href={href}
                        prefetch
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors',
                            active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                        {href === '/loyalty-program/claims' && !!pendingClaims && pendingClaims > 0 && (
                            <span
                                className={cn(
                                    'flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black',
                                    active ? 'bg-primary-foreground/20' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                                )}
                            >
                                {pendingClaims}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
