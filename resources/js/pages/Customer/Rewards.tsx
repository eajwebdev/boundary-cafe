import { Award, Cake, Gift, TrendingUp } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { RouteLine } from '@/components/storefront/ui';
import { useRewardsName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import { manilaTime } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface Props {
    card: {
        name: string;
        customer_number: string | null;
        loyalty_token: string;
        card_url: string;
        points: number;
        lifetime_earned: number;
        lifetime_redeemed: number;
        enabled: boolean;
    };
    tier: { enabled: boolean; name: string; multiplier: number; next: { name: string; min: number; points_needed: number } | null; progress: number };
    rules: { spend_per_point: number; peso_per_point: number; minimum_redeem: number; maximum_redeem: number; birthday_bonus: number; tiers: { name: string; min: number; multiplier: number }[] };
    transactions: { id: number; type: string; points: number; balance_after: number; reason: string | null; created_at: string }[];
}

const TYPE_LABEL: Record<string, string> = { earn: 'Earned', redeem: 'Redeemed', reversal: 'Returned', adjustment: 'Adjustment', bonus: 'Birthday bonus' };

export default function Rewards({ card, tier, rules, transactions }: Props) {
    const rewardsName = useRewardsName();
    const worth = card.points * rules.peso_per_point;

    return (
        <CustomerLayout title={rewardsName}>
            <div className="mx-auto max-w-5xl px-4 pt-5 lg:px-6 lg:pt-8">
                <h1 className="font-display text-[30px] leading-none font-bold">{rewardsName}</h1>
                <p className="mt-1.5 text-shop-muted">Points on every order — delivery, pickup or dine-in.</p>

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <div className="space-y-5">
                        {/* Membership card */}
                        <section
                            className="relative aspect-[1.586] overflow-hidden rounded-[26px] bg-shop-navy p-5 text-shop-navy-ink shadow-shop-lg sm:p-6"
                            aria-label="Your membership card"
                        >
                            <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/6" aria-hidden />
                            <div className="relative flex h-full flex-col justify-between">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase">{tier.enabled ? `${tier.name} member` : 'Member'}</p>
                                        <p className="font-display mt-1 text-xl font-bold">{card.name}</p>
                                        <p className="font-mono text-xs text-white/60">{card.customer_number}</p>
                                    </div>
                                    <div className="rounded-xl bg-white p-1.5">
                                        <QRCodeSVG value={card.card_url} size={76} level="M" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-display text-[44px] leading-none font-extrabold tabular-nums">{card.points.toLocaleString()}</p>
                                    <p className="text-sm text-white/75">points · worth ₱{worth.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</p>
                                </div>
                            </div>
                            <svg viewBox="0 0 320 40" preserveAspectRatio="none" className="absolute right-0 bottom-3 left-0 h-6 w-full opacity-60" aria-hidden>
                                <path d="M4 30 C 34 30, 40 8, 74 10 S 112 34, 146 26 S 196 4, 236 14 S 280 34, 316 18" fill="none" stroke="#ff6a1f" strokeWidth="2" strokeDasharray="1.5 6" strokeLinecap="round" />
                            </svg>
                        </section>
                        <p className="text-sm text-shop-muted">Show the QR at the counter, or tell your server your mobile number, to earn points on dine-in orders.</p>

                        {/* Tier progress */}
                        {tier.enabled && (
                            <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-display flex items-center gap-2 text-lg font-semibold">
                                        <Award className="h-5 w-5 text-shop-accent-ink" /> {tier.name}
                                    </p>
                                    {tier.multiplier > 1 && <span className="rounded-full bg-shop-accent-soft px-2.5 py-1 text-xs font-semibold text-shop-accent-ink">{tier.multiplier}× points</span>}
                                </div>
                                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-shop-sunken" role="progressbar" aria-valuenow={tier.progress} aria-valuemin={0} aria-valuemax={100}>
                                    <div className="h-full rounded-full bg-shop-accent transition-[width] duration-700 ease-shop" style={{ width: `${tier.progress}%` }} />
                                </div>
                                <p className="mt-2 text-sm text-shop-muted">
                                    {tier.next ? `${tier.next.points_needed.toLocaleString()} more lifetime points to reach ${tier.next.name}.` : 'You’re at our highest tier. Salamat!'}
                                </p>
                                <div className="mt-4 grid grid-cols-3 gap-2">
                                    {rules.tiers.map((t) => (
                                        <div key={t.name} className={cn('rounded-2xl p-3 text-center', t.name === tier.name ? 'bg-shop-accent-soft ring-1 ring-shop-accent/40' : 'bg-shop-sunken')}>
                                            <p className="text-sm font-semibold">{t.name}</p>
                                            <p className="text-xs text-shop-muted tabular-nums">{t.min.toLocaleString()}+ pts</p>
                                            <p className="text-xs text-shop-muted">{t.multiplier}× earn</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="space-y-5">
                        <section className="grid gap-3 sm:grid-cols-3">
                            <Info icon={TrendingUp} title="Earn" text={`1 point per ₱${rules.spend_per_point} spent`} />
                            <Info icon={Gift} title="Redeem" text={`From ${rules.minimum_redeem} pts · 1 pt = ₱${rules.peso_per_point}`} />
                            {rules.birthday_bonus > 0 && <Info icon={Cake} title="Birthday" text={`${rules.birthday_bonus} bonus pts in your month`} />}
                        </section>

                        <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                            <h2 className="font-display text-lg font-semibold">Points history</h2>
                            <RouteLine className="mt-2 h-3 opacity-60" />
                            {transactions.length === 0 ? (
                                <p className="py-10 text-center text-sm text-shop-muted">No points yet — your first order starts the count.</p>
                            ) : (
                                <ul className="mt-2 divide-y divide-shop-line">
                                    {transactions.map((t) => (
                                        <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <p className="text-[15px] font-medium">{TYPE_LABEL[t.type] ?? t.type}</p>
                                                <p className="truncate text-xs text-shop-muted">
                                                    {t.reason} · {manilaTime(t.created_at, true)}
                                                </p>
                                            </div>
                                            <span className={cn('font-display shrink-0 text-lg font-semibold tabular-nums', t.points >= 0 ? 'text-shop-success' : 'text-shop-muted')}>
                                                {t.points >= 0 ? '+' : '−'}
                                                {Math.abs(t.points)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <p className="mt-3 text-xs text-shop-muted">
                                Lifetime: {card.lifetime_earned.toLocaleString()} earned · {card.lifetime_redeemed.toLocaleString()} redeemed
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </CustomerLayout>
    );
}

function Info({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
    return (
        <div className="rounded-[20px] bg-shop-surface p-4 ring-1 ring-shop-line">
            <Icon className="h-5 w-5 text-shop-accent-ink" />
            <p className="mt-2 font-semibold">{title}</p>
            <p className="text-sm text-shop-muted">{text}</p>
        </div>
    );
}
