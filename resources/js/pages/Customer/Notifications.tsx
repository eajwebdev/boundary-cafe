import { Link } from '@inertiajs/react';
import { Bell, Cake, CheckCircle2, Clock, Coins, Gift, RotateCcw, SlidersHorizontal, Target, Trophy } from 'lucide-react';

import { RouteLine } from '@/components/storefront/ui';
import CustomerLayout from '@/layouts/CustomerLayout';
import { manilaTime, timeAgo } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface NotificationRow {
    id: string;
    kind: string;
    title: string;
    body: string;
    points: number;
    balance: number | null;
    reference: string | null;
    unread: boolean;
    created_at: string;
}

interface Props {
    notifications: {
        data: NotificationRow[];
        links: { url: string | null; label: string; active: boolean }[];
        next_page_url: string | null;
        prev_page_url: string | null;
    };
}

const KIND_ICON: Record<string, React.ElementType> = {
    points_earned: Coins,
    birthday_bonus: Cake,
    reward_redeemed: CheckCircle2,
    claim_released: Clock,
    points_returned: RotateCcw,
    points_expired: Clock,
    points_adjusted: SlidersHorizontal,
    mission_assigned: Target,
    mission_completed: Trophy,
};

export default function Notifications({ notifications }: Props) {
    const rows = notifications.data;

    return (
        <CustomerLayout title="Notifications">
            <div className="mx-auto max-w-2xl px-4 pt-5 lg:px-6 lg:pt-8">
                <h1 className="font-display text-[30px] leading-none font-bold">Notifications</h1>
                <p className="mt-1.5 text-shop-muted">Points you earn after each order, rewards you claim and more.</p>

                <section className="mt-6 rounded-[24px] bg-shop-surface p-2 ring-1 ring-shop-line sm:p-3">
                    {rows.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-shop-sunken text-shop-muted">
                                <Bell className="h-6 w-6" />
                            </span>
                            <p className="font-semibold">Nothing yet</p>
                            <p className="max-w-xs text-sm text-shop-muted">After your next order we’ll let you know how many points you earned.</p>
                            <Link
                                href="/"
                                className="bc-press mt-1 rounded-full bg-shop-accent px-5 py-2.5 text-sm font-semibold text-shop-on-accent"
                            >
                                Order now
                            </Link>
                        </div>
                    ) : (
                        <ul className="divide-y divide-shop-line">
                            {rows.map((n) => {
                                const Icon = KIND_ICON[n.kind] ?? Gift;
                                const positive = n.points > 0;
                                return (
                                    <li key={n.id} className={cn('flex gap-3 rounded-2xl px-3 py-3.5', n.unread && 'bg-shop-accent-soft/60')}>
                                        <span
                                            className={cn(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                                positive ? 'bg-shop-success-soft text-shop-success' : 'bg-shop-sunken text-shop-muted',
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="font-semibold">
                                                    {n.title}
                                                    {n.unread && (
                                                        <span
                                                            className="ml-2 inline-block h-2 w-2 rounded-full bg-shop-accent align-middle"
                                                            aria-label="New"
                                                        />
                                                    )}
                                                </p>
                                                {n.points !== 0 && (
                                                    <span
                                                        className={cn(
                                                            'shrink-0 font-display text-lg leading-none font-semibold tabular-nums',
                                                            positive ? 'text-shop-success' : 'text-shop-muted',
                                                        )}
                                                    >
                                                        {positive ? '+' : '−'}
                                                        {Math.abs(n.points)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-sm text-shop-muted">{n.body}</p>
                                            <p className="mt-1 text-xs text-shop-muted" title={manilaTime(n.created_at, true)}>
                                                {timeAgo(n.created_at)}
                                                {n.balance !== null && ` · balance ${n.balance.toLocaleString()} pts`}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                {(notifications.prev_page_url || notifications.next_page_url) && (
                    <div className="mt-4 flex justify-between">
                        {notifications.prev_page_url ? (
                            <Link
                                href={notifications.prev_page_url}
                                className="bc-press rounded-full px-4 py-2 text-sm font-semibold hover:bg-shop-sunken"
                            >
                                ← Newer
                            </Link>
                        ) : (
                            <span />
                        )}
                        {notifications.next_page_url && (
                            <Link
                                href={notifications.next_page_url}
                                className="bc-press rounded-full px-4 py-2 text-sm font-semibold hover:bg-shop-sunken"
                            >
                                Older →
                            </Link>
                        )}
                    </div>
                )}
                <RouteLine className="mx-auto mt-6 h-3 w-40 opacity-50" />
            </div>
        </CustomerLayout>
    );
}
