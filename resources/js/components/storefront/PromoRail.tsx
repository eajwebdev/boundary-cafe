import { Copy, Sparkles, Tag } from 'lucide-react';
import { toast } from 'sonner';

import type { StorefrontPromo } from '@/lib/customer';

import ScrollRail from './ScrollRail';

/** Banner-style deals. Coded promos copy their code; codeless ones apply themselves. */
export default function PromoRail({ promos, className }: { promos: StorefrontPromo[]; className?: string }) {
    if (!promos.length) return null;

    return (
        <section aria-labelledby="deals-title" className={className}>
            <h2 id="deals-title" className="font-display px-4 text-2xl font-semibold tracking-tight lg:px-0 lg:text-[28px]">
                Deals for you
            </h2>
            <ScrollRail className="mt-4 gap-3 pb-1 lg:gap-4">
                {promos.map((p) => (
                    <Deal key={p.id} promo={p} />
                ))}
            </ScrollRail>
        </section>
    );
}

function Deal({ promo: p }: { promo: StorefrontPromo }) {
    const value = p.discount_type === 'percent' ? `${p.discount_value}%` : `₱${p.discount_value}`;
    const copy = async () => {
        if (!p.code) return;
        try {
            await navigator.clipboard.writeText(p.code);
            toast.success(`Code ${p.code} copied — paste it at checkout`);
        } catch {
            toast(`Use code ${p.code} at checkout`);
        }
    };

    return (
        <article className="relative flex h-30 w-[300px] max-w-[84vw] shrink-0 snap-start overflow-hidden rounded-xl bg-shop-accent text-shop-on-accent shadow-shop-sm">
            <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between py-3 pr-1 pl-4">
                <div className="min-w-0">
                    <p className="font-display text-2xl leading-none font-extrabold tracking-tight">{value} off</p>
                    <p className="mt-1.5 truncate text-sm leading-tight font-semibold">{p.name}</p>
                    <p className="truncate text-xs opacity-80">
                        {p.minimum_purchase ? `Min. order ₱${p.minimum_purchase.toLocaleString()}` : 'No minimum'}
                        {p.expires_at ? ` · until ${new Date(p.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                </div>
                {p.code ? (
                    <button
                        type="button"
                        onClick={copy}
                        className="bc-press flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-full bg-shop-surface px-2.5 font-mono text-xs font-bold text-shop-ink"
                        aria-label={`Copy promo code ${p.code}`}
                    >
                        {p.code} <Copy className="h-3 w-3" />
                    </button>
                ) : (
                    <span className="flex h-7 w-fit items-center gap-1 rounded-full bg-shop-surface px-2.5 text-xs font-semibold text-shop-ink">
                        <Sparkles className="h-3 w-3" /> Applied at checkout
                    </span>
                )}
            </div>
            {/* Photo side, cut on a slant like a printed promo banner */}
            <div className="relative w-[42%] shrink-0 bg-shop-accent-soft [clip-path:polygon(22%_0,100%_0,100%_100%,0_100%)]">
                {p.banner ? (
                    <img src={p.banner} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                    <Tag className="absolute top-1/2 left-[58%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-shop-accent-ink opacity-70" aria-hidden />
                )}
            </div>
        </article>
    );
}
