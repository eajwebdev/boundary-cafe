import { Link, router } from '@inertiajs/react';
import { ArrowLeft, CheckCircle2, Clock, Gift, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

import { Pill, ShopButton } from '@/components/storefront/ui';
import { useRewardsName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import { jsonRequest, manilaTime } from '@/lib/customer';

interface Props {
    claim: {
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
    };
}

/** "ABCDEFGH" → "ABCD-EFGH", easier to read out to a cashier. */
const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

function useCountdown(until: string | null) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!until) return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [until]);
    const ms = until ? new Date(until).getTime() - now : 0;
    return Math.max(0, Math.floor(ms / 1000));
}

export default function RewardClaim({ claim }: Props) {
    const rewardsName = useRewardsName();
    const isWaiting = claim.status === 'reserved';
    const secondsLeft = useCountdown(isWaiting ? claim.expires_at : null);
    const [cancelling, setCancelling] = useState(false);

    // While the QR is on screen, notice when the cashier completes it (or it expires) and refresh.
    useEffect(() => {
        if (!isWaiting) return;
        const id = window.setInterval(async () => {
            try {
                const res = await jsonRequest<{ status: string }>(`/account/rewards/claims/${claim.code}/status`);
                if (res.status !== 'reserved') router.reload({ only: ['claim', 'customer'] });
            } catch {
                /* offline for a moment — try again on the next tick */
            }
        }, 5000);
        return () => window.clearInterval(id);
    }, [isWaiting, claim.code]);

    useEffect(() => {
        if (isWaiting && secondsLeft === 0 && claim.expires_at) router.reload({ only: ['claim', 'customer'] });
    }, [isWaiting, secondsLeft, claim.expires_at]);

    const cancel = () => {
        if (!window.confirm('Cancel this reward? Your points will be returned.')) return;
        setCancelling(true);
        router.post(`/account/rewards/claims/${claim.code}/cancel`, {}, { onFinish: () => setCancelling(false) });
    };

    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, '0');

    return (
        <CustomerLayout title={`Reward ${formatCode(claim.code)}`}>
            <div className="mx-auto max-w-md px-4 pt-5 pb-8">
                <Link href="/account/rewards" className="bc-press inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-shop-muted hover:text-shop-ink">
                    <ArrowLeft className="h-4 w-4" /> {rewardsName}
                </Link>

                <section className="mt-4 overflow-hidden rounded-[28px] bg-shop-surface shadow-shop-lg ring-1 ring-shop-line">
                    <div className="bg-shop-navy px-6 pt-5 pb-4 text-center text-shop-navy-ink">
                        <p className="text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
                            {isWaiting ? 'Show this to the cashier' : claim.status_label}
                        </p>
                        <h1 className="mt-1 font-display text-2xl font-bold">{claim.summary}</h1>
                        <p className="mt-0.5 text-sm text-white/75">{claim.points.toLocaleString()} points</p>
                    </div>

                    {isWaiting && claim.qr ? (
                        <div className="px-6 pt-6 pb-5 text-center">
                            <div className="mx-auto w-fit rounded-3xl bg-white p-4 ring-1 ring-shop-line">
                                <QRCodeSVG value={claim.qr} size={248} level="M" marginSize={1} className="h-auto max-w-full" />
                            </div>
                            <p className="mt-4 text-xs font-semibold tracking-wider text-shop-muted uppercase">Or tell the cashier this code</p>
                            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.12em]">{formatCode(claim.code)}</p>
                            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-shop-warning">
                                <Clock className="h-4 w-4" />
                                Valid for {minutes}:{seconds} · until {manilaTime(claim.expires_at)}
                            </p>
                            <p className="mt-1 text-xs text-shop-muted">Works at any of our branches. Turn your screen brightness up if it won’t scan.</p>
                        </div>
                    ) : (
                        <div className="px-6 py-8 text-center">
                            {claim.status === 'redeemed' ? (
                                <>
                                    <CheckCircle2 className="mx-auto h-14 w-14 text-shop-success" />
                                    <p className="mt-3 font-display text-xl font-bold">Enjoy your reward!</p>
                                    <p className="mt-1 text-sm text-shop-muted">
                                        Claimed {claim.branch ? `at ${claim.branch} ` : ''}
                                        {manilaTime(claim.redeemed_at, true)}.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <XCircle className="mx-auto h-14 w-14 text-shop-muted" />
                                    <p className="mt-3 font-display text-xl font-bold">{claim.status_label}</p>
                                    <p className="mt-1 text-sm text-shop-muted">Your {claim.points} points were returned. You can claim again anytime.</p>
                                </>
                            )}
                        </div>
                    )}

                    <ul className="divide-y divide-shop-line border-t border-shop-line px-6">
                        {claim.items.map((item) => (
                            <li key={item.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Gift className="h-4 w-4 shrink-0 text-shop-accent-ink" />
                                    <span className="truncate font-semibold">
                                        {item.quantity}× {item.name}
                                    </span>
                                </span>
                                <span className="shrink-0 text-shop-muted tabular-nums">{item.points} pts</span>
                            </li>
                        ))}
                    </ul>
                </section>

                <div className="mt-5 space-y-2">
                    {isWaiting ? (
                        <ShopButton variant="danger" block onClick={cancel} loading={cancelling}>
                            Cancel and return points
                        </ShopButton>
                    ) : (
                        <Link
                            href="/account/rewards"
                            className="bc-press flex h-12 items-center justify-center rounded-2xl bg-shop-accent text-[15px] font-semibold text-shop-on-accent"
                        >
                            Back to rewards
                        </Link>
                    )}
                    {isWaiting && (
                        <p className="text-center text-xs text-shop-muted">
                            <Pill tone="accent" className="mr-1">Single use</Pill> The QR stops working once the cashier completes it.
                        </p>
                    )}
                </div>
            </div>
        </CustomerLayout>
    );
}
