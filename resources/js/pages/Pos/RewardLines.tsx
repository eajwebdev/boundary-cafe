import { Gift, Star, X } from 'lucide-react';

import MissionNote from './MissionNote';
import type { LinkedMember, RewardClaimInCart } from './posTypes';
import { fmtMoney } from './ReceiptTemplate';

/**
 * The scanned reward (₱0 lines with a REWARD badge) and the linked member, shown at the top of
 * the order in both register views. Reward lines cannot be edited — remove the reward and rescan.
 */
export default function RewardLines({
    claim,
    member,
    currency,
    onRemoveReward,
    onUnlinkMember,
    compact = false,
}: {
    claim: RewardClaimInCart | null;
    member: LinkedMember | null;
    currency: string;
    onRemoveReward: () => void;
    onUnlinkMember: () => void;
    compact?: boolean;
}) {
    if (!claim && !member) return null;
    const customer = claim?.customer ?? null;

    return (
        <div className="shrink-0 border-b border-emerald-500/25 bg-emerald-500/[0.06]">
            {(customer || member) && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs">
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
                    <span className="min-w-0 truncate font-bold text-foreground">{customer?.name ?? member?.name}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {customer?.customer_number ?? member?.customer_number}
                    </span>
                    {!claim && member && (
                        <>
                            <span className="ml-auto shrink-0 font-semibold text-muted-foreground tabular-nums">
                                {member.points.toLocaleString()} pts
                            </span>
                            <button
                                type="button"
                                onClick={onUnlinkMember}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Unlink member"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </>
                    )}
                </div>
            )}
            {!claim && member?.mission && <MissionNote mission={member.mission} compact />}
            {claim && (
                <ul className="divide-y divide-emerald-500/15 border-t border-emerald-500/20">
                    {claim.items.map((item) => (
                        <li
                            key={`${item.product_id}-${item.variant_id ?? 'base'}`}
                            className={compact ? 'flex items-center gap-2 px-3 py-2' : 'flex items-center gap-3 px-4 py-2.5'}
                        >
                            <span className="shrink-0 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-white">
                                REWARD
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                                {item.quantity}× {item.name}
                            </span>
                            <span className="shrink-0 text-right font-mono text-xs tabular-nums">
                                <span className="text-muted-foreground line-through">{fmtMoney(item.retail_price * item.quantity, currency)}</span>{' '}
                                <span className="font-black text-emerald-600">{fmtMoney(0, currency)}</span>
                            </span>
                        </li>
                    ))}
                    <li className="flex items-center gap-2 px-4 py-1.5 text-[11px] text-muted-foreground">
                        <Gift className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span className="truncate">
                            Reward {claim.code} · {claim.points} pts
                        </span>
                        <button
                            type="button"
                            onClick={onRemoveReward}
                            className="ml-auto shrink-0 rounded-md px-2 py-1 font-bold text-destructive hover:bg-destructive/10"
                        >
                            Remove
                        </button>
                    </li>
                </ul>
            )}
        </div>
    );
}
