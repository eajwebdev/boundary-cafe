import { Link, router } from '@inertiajs/react';
import { Award, Cake, ChevronRight, Download, Gift, Lock, QrCode, Store, TrendingUp } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Pill, ProductImage, QtyControl, RouteLine, ShopButton } from '@/components/storefront/ui';
import { useBusinessName, useRewardsName } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';
import CustomerLayout from '@/layouts/CustomerLayout';
import type { RewardItem } from '@/lib/customer';
import { earnRule, manilaTime, peso } from '@/lib/customer';
import { downloadLoyaltyCard } from '@/lib/loyalty-card';
import { cn } from '@/lib/utils';

interface Claim {
    id: number;
    code: string;
    status: string;
    status_label: string;
    points: number;
    summary: string;
    items: { name: string; quantity: number; points: number }[];
    qr: string | null;
    expires_at: string | null;
    redeemed_at: string | null;
    branch: string | null;
    created_at: string | null;
}

interface Props {
    card: {
        name: string;
        customer_number: string | null;
        loyalty_token: string;
        card_url: string;
        masked_contact: string | null;
        points: number;
        reserved_points: number;
        lifetime_earned: number;
        lifetime_redeemed: number;
        enabled: boolean;
        joined_at: string | null;
    };
    tier: { enabled: boolean; name: string; multiplier: number; next: { name: string; min: number; points_needed: number } | null; progress: number };
    rules: {
        spend_increment: number;
        points_per_increment: number;
        birthday_bonus: number;
        claim_expiry_minutes: number;
        tiers: { name: string; min: number; multiplier: number }[];
    };
    catalog: RewardItem[];
    claims: Claim[];
    purchases: {
        id: number;
        receipt_number: string;
        branch: string | null;
        total: number;
        points_earned: number;
        is_reward: boolean;
        channel: string;
        created_at: string;
    }[];
    transactions: { id: number; type: string; points: number; balance_after: number; reason: string | null; created_at: string }[];
}

const TYPE_LABEL: Record<string, string> = {
    earn: 'Earned',
    redeem: 'Redeemed',
    reserve: 'Held for a reward',
    release: 'Returned',
    reversal: 'Returned',
    adjustment: 'Adjustment',
    bonus: 'Birthday bonus',
    expire: 'Expired',
};

const CLAIM_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'accent'> = {
    reserved: 'accent',
    redeemed: 'success',
    expired: 'warning',
    cancelled: 'neutral',
    voided: 'danger',
};

type HistoryTab = 'points' | 'purchases' | 'redemptions';

export default function Rewards({ card, tier, rules, catalog, claims, purchases, transactions }: Props) {
    const rewardsName = useRewardsName();
    const businessName = useBusinessName();
    const logoUrl = useLogoUrl();
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);
    const [downloading, setDownloading] = useState(false);
    const [selection, setSelection] = useState<Record<number, number>>({});
    const [claiming, setClaiming] = useState(false);
    const [tab, setTab] = useState<HistoryTab>('points');

    const waiting = claims.filter((c) => c.status === 'reserved');
    const pastClaims = claims.filter((c) => c.status !== 'reserved');
    const selectedPoints = useMemo(() => catalog.reduce((sum, r) => sum + (selection[r.id] ?? 0) * r.points_cost, 0), [catalog, selection]);
    const remaining = card.points - selectedPoints;
    const selectedCount = Object.values(selection).reduce((a, b) => a + b, 0);

    // Arriving from the daily popup's "Claim rewards": bring the reward list into view.
    useEffect(() => {
        if (window.location.hash === '#claim') document.getElementById('claim')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const setQty = (reward: RewardItem, qty: number) =>
        setSelection((current) => {
            const next = { ...current };
            if (qty <= 0) delete next[reward.id];
            else next[reward.id] = qty;
            return next;
        });

    const claim = () => {
        const items = Object.entries(selection).map(([rewardId, quantity]) => ({ reward_id: Number(rewardId), quantity }));
        if (items.length === 0) return;
        setClaiming(true);
        router.post(
            '/account/rewards/claims',
            { items },
            {
                preserveScroll: true,
                onError: (errors) => toast.error(String(Object.values(errors)[0] ?? 'Could not claim the reward.')),
                onFinish: () => setClaiming(false),
            },
        );
    };

    const downloadCard = async () => {
        if (!qrCanvasRef.current) return;
        setDownloading(true);
        try {
            await downloadLoyaltyCard({
                businessName,
                rewardsName,
                logoUrl,
                name: card.name,
                memberId: card.customer_number ?? '',
                maskedContact: card.masked_contact,
                points: card.points,
                tier: tier.enabled ? tier.name : null,
                qrCanvas: qrCanvasRef.current,
            });
        } catch {
            toast.error('Could not create the card image. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <CustomerLayout title={rewardsName}>
            <div className="mx-auto max-w-5xl px-4 pt-5 lg:px-6 lg:pt-8">
                <h1 className="font-display text-[30px] leading-none font-bold">{rewardsName}</h1>
                <p className="mt-1.5 text-shop-muted">{earnRule(rules)} — at every branch, dine-in, pickup or delivery.</p>

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    {/* ── Left: card, tier ─────────────────────────────── */}
                    <div className="space-y-5">
                        <section
                            className="shadow-shop-lg relative aspect-[1.586] overflow-hidden rounded-[26px] bg-shop-navy p-5 text-shop-navy-ink sm:p-6"
                            aria-label="Your membership card"
                        >
                            <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/6" aria-hidden />
                            <div className="relative flex h-full flex-col justify-between">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-0.5 shadow-sm sm:h-11 sm:w-11">
                                                <img src={logoUrl} alt={businessName} className="h-full w-full object-contain" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-display text-[15px] leading-tight font-bold">{businessName}</p>
                                                <p className="truncate text-[10px] font-semibold tracking-[0.16em] text-white/70 uppercase">
                                                    {tier.enabled ? `${tier.name} member` : 'Member'}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="mt-3 truncate font-display text-lg leading-tight font-bold sm:text-xl">{card.name}</p>
                                        <p className="font-mono text-xs text-white/60">{card.customer_number}</p>
                                        {card.masked_contact && <p className="font-mono text-xs text-white/50">{card.masked_contact}</p>}
                                    </div>
                                    <div className="shrink-0 rounded-xl bg-white p-1.5">
                                        <QRCodeSVG value={card.card_url} size={72} level="M" />
                                    </div>
                                </div>
                                <div>
                                    <p className="font-display text-[40px] leading-none font-extrabold tabular-nums sm:text-[44px]">
                                        {card.points.toLocaleString()}
                                    </p>
                                    <p className="text-sm text-white/75">
                                        points available
                                        {card.reserved_points > 0 && ` · ${card.reserved_points.toLocaleString()} held for rewards`}
                                    </p>
                                </div>
                            </div>
                            <svg
                                viewBox="0 0 320 40"
                                preserveAspectRatio="none"
                                className="absolute right-0 bottom-3 left-0 h-6 w-full opacity-60"
                                aria-hidden
                            >
                                <path
                                    d="M4 30 C 34 30, 40 8, 74 10 S 112 34, 146 26 S 196 4, 236 14 S 280 34, 316 18"
                                    fill="none"
                                    stroke="#ff6a1f"
                                    strokeWidth="2"
                                    strokeDasharray="1.5 6"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </section>

                        {/* High-resolution QR used only for the downloadable card image */}
                        <QRCodeCanvas ref={qrCanvasRef} value={card.card_url} size={512} level="M" marginSize={0} className="hidden" aria-hidden />

                        <div className="grid grid-cols-2 gap-2">
                            <ShopButton variant="secondary" onClick={downloadCard} loading={downloading} className="gap-2">
                                {!downloading && <Download className="h-4 w-4" />} Download card
                            </ShopButton>
                            <a
                                href={card.card_url}
                                target="_blank"
                                rel="noreferrer"
                                className="bc-press flex h-12 items-center justify-center gap-2 rounded-2xl border border-shop-line bg-shop-surface text-[15px] font-semibold hover:bg-shop-sunken"
                            >
                                <QrCode className="h-4 w-4" /> Full-screen card
                            </a>
                        </div>
                        <p className="text-sm text-shop-muted">
                            Show this card at the counter to earn points on dine-in orders. It only identifies you — to use points, claim a reward
                            below and show its QR.
                        </p>

                        {tier.enabled && (
                            <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="flex items-center gap-2 font-display text-lg font-semibold">
                                        <Award className="h-5 w-5 text-shop-accent-ink" /> {tier.name}
                                    </p>
                                    {tier.multiplier > 1 && <Pill tone="accent">{tier.multiplier}× points</Pill>}
                                </div>
                                <div
                                    className="mt-4 h-2.5 overflow-hidden rounded-full bg-shop-sunken"
                                    role="progressbar"
                                    aria-valuenow={tier.progress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                >
                                    <div
                                        className="h-full rounded-full bg-shop-accent transition-[width] duration-700 ease-shop"
                                        style={{ width: `${tier.progress}%` }}
                                    />
                                </div>
                                <p className="mt-2 text-sm text-shop-muted">
                                    {tier.next
                                        ? `${tier.next.points_needed.toLocaleString()} more lifetime points to reach ${tier.next.name}.`
                                        : 'You’re at our highest tier. Salamat!'}
                                </p>
                            </section>
                        )}

                        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                            <Info icon={TrendingUp} title="Earn" text={`${earnRule(rules)} you spend`} />
                            <Info
                                icon={Store}
                                title="Claim in-store"
                                text={`Your reward QR stays valid for ${rules.claim_expiry_minutes} minutes, at any branch`}
                            />
                            {rules.birthday_bonus > 0 && (
                                <Info icon={Cake} title="Birthday" text={`${rules.birthday_bonus} bonus pts in your month`} />
                            )}
                        </section>
                    </div>

                    {/* ── Right: waiting QRs, catalog, history ─────────── */}
                    <div className="space-y-5">
                        {waiting.length > 0 && (
                            <section className="rounded-[24px] bg-shop-accent-soft p-5 ring-1 ring-shop-accent/30">
                                <h2 className="font-display text-lg font-semibold text-shop-accent-ink">Ready to claim</h2>
                                <ul className="mt-3 space-y-2">
                                    {waiting.map((c) => (
                                        <li key={c.id}>
                                            <Link
                                                href={`/account/rewards/claims/${c.code}`}
                                                className="bc-press flex items-center gap-3 rounded-2xl bg-shop-surface p-3 ring-1 ring-shop-line"
                                            >
                                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-shop-navy text-shop-navy-ink">
                                                    <QrCode className="h-5 w-5" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate font-semibold">{c.summary}</span>
                                                    <span className="block text-xs text-shop-muted">
                                                        {c.points} pts · valid until {manilaTime(c.expires_at)}
                                                    </span>
                                                </span>
                                                <span className="shrink-0 text-sm font-semibold text-shop-accent-ink">Show QR</span>
                                                <ChevronRight className="h-4 w-4 shrink-0 text-shop-muted" />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section id="claim" className="scroll-mt-24 rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="font-display text-lg font-semibold">Get rewards with your points</h2>
                                    <p className="text-sm text-shop-muted">Pick what you want, claim it, then show the QR at the counter.</p>
                                </div>
                                <Gift className="h-6 w-6 shrink-0 text-shop-accent-ink" />
                            </div>

                            {catalog.length === 0 ? (
                                <p className="py-10 text-center text-sm text-shop-muted">No rewards yet — check back soon.</p>
                            ) : (
                                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {catalog.map((reward) => {
                                        const qty = selection[reward.id] ?? 0;
                                        const limit = Math.min(20, reward.max_per_claim ?? 20);
                                        const canAddOne = remaining >= reward.points_cost && qty < limit;
                                        const locked = qty === 0 && card.points < reward.points_cost;
                                        return (
                                            <li
                                                key={reward.id}
                                                className={cn(
                                                    'relative flex flex-col overflow-hidden rounded-2xl ring-1 ring-shop-line',
                                                    qty > 0 ? 'bg-shop-accent-soft ring-shop-accent/40' : 'bg-shop-sunken',
                                                )}
                                            >
                                                <ProductImage
                                                    src={reward.image}
                                                    alt={reward.name}
                                                    className={cn('aspect-[4/3]', locked && 'opacity-60')}
                                                />
                                                <div className="flex flex-1 flex-col gap-1 p-3">
                                                    <p className="line-clamp-2 text-sm leading-snug font-semibold">{reward.name}</p>
                                                    <p className="text-xs text-shop-muted">
                                                        <span className="font-display text-base font-bold text-shop-ink tabular-nums">
                                                            {reward.points_cost}
                                                        </span>{' '}
                                                        pts
                                                        {reward.retail_price > 0 && <> · worth {peso(reward.retail_price)}</>}
                                                    </p>
                                                    {locked && (
                                                        <p className="flex items-center gap-1 text-xs font-semibold text-shop-muted">
                                                            <Lock className="h-3 w-3" /> {(reward.points_cost - card.points).toLocaleString()} pts to
                                                            go
                                                        </p>
                                                    )}
                                                </div>
                                                {!locked && (
                                                    <QtyControl
                                                        qty={qty}
                                                        label={reward.name}
                                                        size="sm"
                                                        disabled={!canAddOne}
                                                        onAdd={() => canAddOne && setQty(reward, qty + 1)}
                                                        onRemove={() => setQty(reward, qty - 1)}
                                                        className="absolute top-2 right-2"
                                                    />
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {selectedCount > 0 && (
                                <div className="shadow-shop-lg sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 flex items-center gap-3 rounded-2xl bg-shop-navy p-3 pl-4 text-shop-navy-ink lg:bottom-4">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-display text-lg leading-tight font-bold tabular-nums">
                                            {selectedPoints.toLocaleString()} pts
                                        </p>
                                        <p className="truncate text-xs text-white/70">
                                            {selectedCount} item{selectedCount === 1 ? '' : 's'} · {remaining.toLocaleString()} pts left after
                                        </p>
                                    </div>
                                    <ShopButton onClick={claim} loading={claiming} className="h-11 px-5">
                                        Claim reward
                                    </ShopButton>
                                </div>
                            )}
                        </section>

                        <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line">
                            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="History">
                                {(
                                    [
                                        ['points', 'Points history'],
                                        ['purchases', 'Purchases'],
                                        ['redemptions', 'Redemptions'],
                                    ] as [HistoryTab, string][]
                                ).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === value}
                                        onClick={() => setTab(value)}
                                        className={cn(
                                            'bc-press h-9 cursor-pointer rounded-full px-3.5 text-sm font-semibold',
                                            tab === value ? 'bg-shop-navy text-shop-navy-ink' : 'bg-shop-sunken text-shop-muted hover:text-shop-ink',
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <RouteLine className="mt-3 h-3 opacity-60" />

                            {tab === 'points' &&
                                (transactions.length === 0 ? (
                                    <Empty text="No points yet — your first order starts the count." />
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
                                                <span
                                                    className={cn(
                                                        'shrink-0 font-display text-lg font-semibold tabular-nums',
                                                        t.points > 0 ? 'text-shop-success' : 'text-shop-muted',
                                                    )}
                                                >
                                                    {t.points > 0 ? '+' : t.points < 0 ? '−' : ''}
                                                    {Math.abs(t.points)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                ))}

                            {tab === 'purchases' &&
                                (purchases.length === 0 ? (
                                    <Empty text="Your purchases at any branch show up here." />
                                ) : (
                                    <ul className="mt-2 divide-y divide-shop-line">
                                        {purchases.map((p) => (
                                            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[15px] font-medium">
                                                        {p.is_reward ? 'Reward claimed' : peso(p.total)}
                                                        <span className="ml-1.5 font-mono text-xs text-shop-muted">{p.receipt_number}</span>
                                                    </p>
                                                    <p className="truncate text-xs text-shop-muted">
                                                        {p.branch ?? businessName} · {manilaTime(p.created_at, true)}
                                                    </p>
                                                </div>
                                                {p.points_earned > 0 && (
                                                    <span className="shrink-0 font-display text-lg font-semibold text-shop-success tabular-nums">
                                                        +{p.points_earned}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                ))}

                            {tab === 'redemptions' &&
                                (pastClaims.length === 0 ? (
                                    <Empty text="Rewards you claim will be listed here." />
                                ) : (
                                    <ul className="mt-2 divide-y divide-shop-line">
                                        {pastClaims.map((c) => (
                                            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-[15px] font-medium">{c.summary}</p>
                                                    <p className="truncate text-xs text-shop-muted">
                                                        {c.points} pts · {c.branch ? `${c.branch} · ` : ''}
                                                        {manilaTime(c.redeemed_at ?? c.created_at, true)}
                                                    </p>
                                                </div>
                                                <Pill tone={CLAIM_TONE[c.status] ?? 'neutral'}>{c.status_label}</Pill>
                                            </li>
                                        ))}
                                    </ul>
                                ))}

                            <p className="mt-3 text-xs text-shop-muted">
                                Lifetime: {card.lifetime_earned.toLocaleString()} earned · {card.lifetime_redeemed.toLocaleString()} redeemed
                                {card.joined_at && ` · member since ${card.joined_at}`}
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </CustomerLayout>
    );
}

function Empty({ text }: { text: string }) {
    return <p className="py-10 text-center text-sm text-shop-muted">{text}</p>;
}

function Info({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
    return (
        <div className="flex gap-3 rounded-[20px] bg-shop-surface p-4 ring-1 ring-shop-line">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-shop-accent-ink" />
            <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-shop-muted">{text}</p>
            </div>
        </div>
    );
}
