import { router } from '@inertiajs/react';
import { Gift, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import MissionCard from '@/components/storefront/MissionCard';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useRewardsName } from '@/hooks/use-business-name';
import type { RewardsPopupData } from '@/lib/customer';
import { jsonRequest } from '@/lib/customer';

/**
 * Once a day, on the first app open: the customer's points and the rewards they can get now.
 * The server stops sending it once /account/rewards/popup-seen is called, which happens as soon as it shows.
 */
export default function RewardsPopup({ data, firstName }: { data: RewardsPopupData; firstName: string }) {
    const rewardsName = useRewardsName();
    const [open, setOpen] = useState(true);
    const recorded = useRef(false);

    useEffect(() => {
        if (recorded.current) return;
        recorded.current = true;
        jsonRequest('/account/rewards/popup-seen', { method: 'POST', body: {} }).catch(() => {
            /* not recorded — it may show once more today, which is harmless */
        });
    }, []);

    const go = (href: string) => {
        setOpen(false);
        router.visit(href);
    };
    const hasAffordable = data.affordable.length > 0;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="bc-shop max-h-[90dvh] overflow-y-auto rounded-3xl border-shop-line bg-shop-surface p-0 sm:max-w-md">
                <div className="relative overflow-hidden rounded-t-3xl bg-shop-navy px-6 pt-6 pb-5 text-shop-navy-ink">
                    <div className="pointer-events-none absolute -top-14 -right-10 h-40 w-40 rounded-full bg-white/8" aria-hidden />
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-white/70 uppercase">
                        <Sparkles className="h-3.5 w-3.5" /> {rewardsName}
                    </p>
                    <DialogTitle className="mt-2 font-display text-2xl font-bold">
                        {greeting}, {firstName}!
                    </DialogTitle>
                    <DialogDescription className="mt-1 text-white/75">
                        You have <span className="font-display text-xl font-bold text-white tabular-nums">{data.points.toLocaleString()}</span>{' '}
                        points.
                    </DialogDescription>
                </div>

                <div className="space-y-4 px-6 pt-5 pb-6">
                    {data.mission && !data.mission.completed && <MissionCard mission={data.mission} />}
                    {hasAffordable ? (
                        <>
                            <p className="text-sm font-semibold">You can get these today — claim at any of our branches:</p>
                            <ul className="grid grid-cols-2 gap-2.5">
                                {data.affordable.map((reward) => {
                                    const canGet = Math.floor(data.points / reward.points_cost);
                                    return (
                                        <li key={reward.id} className="overflow-hidden rounded-2xl bg-shop-sunken ring-1 ring-shop-line">
                                            <div className="aspect-[4/3] bg-shop-bg">
                                                {reward.image ? (
                                                    <img src={reward.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-shop-muted">
                                                        <Gift className="h-8 w-8" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2.5">
                                                <p className="truncate text-sm font-semibold">{reward.name}</p>
                                                <p className="text-xs text-shop-muted tabular-nums">
                                                    {reward.points_cost} pts{canGet > 1 ? ` · up to ${canGet}` : ''}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    ) : data.next ? (
                        <div className="rounded-2xl bg-shop-sunken p-4 ring-1 ring-shop-line">
                            <p className="text-sm font-semibold">
                                {(data.next.points_cost - data.points).toLocaleString()} more points to get a free {data.next.name}.
                            </p>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-shop-bg">
                                <div
                                    className="h-full rounded-full bg-shop-accent"
                                    style={{ width: `${Math.min(100, Math.round((data.points / data.next.points_cost) * 100))}%` }}
                                />
                            </div>
                        </div>
                    ) : null}

                    <div className="grid gap-2">
                        {hasAffordable && (
                            <button
                                type="button"
                                onClick={() => go('/account/rewards#claim')}
                                className="bc-press h-12 cursor-pointer rounded-full bg-shop-accent text-base font-semibold text-shop-on-accent"
                            >
                                Claim rewards
                            </button>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => go('/account/rewards')}
                                className="bc-press h-11 cursor-pointer rounded-full border border-shop-line text-sm font-semibold hover:bg-shop-sunken"
                            >
                                View rewards
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="bc-press h-11 cursor-pointer rounded-full text-sm font-semibold text-shop-muted hover:bg-shop-sunken"
                            >
                                Maybe later
                            </button>
                        </div>
                    </div>
                    <p className="text-center text-xs text-shop-muted">Rewards are claimed in-store: show the QR to the cashier.</p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
