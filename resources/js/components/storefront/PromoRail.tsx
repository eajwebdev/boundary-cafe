import { Copy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import type { StorefrontPromo } from '@/lib/customer';
import { cn } from '@/lib/utils';

/** Coupon-style deals. Coded promos copy their code; codeless ones apply themselves. */
export default function PromoRail({ promos, className }: { promos: StorefrontPromo[]; className?: string }) {
    if (!promos.length) return null;

    return (
        <section aria-labelledby="deals-title" className={className}>
            <h2 id="deals-title" className="font-display px-4 text-xl font-bold lg:px-0">
                Deals for you
            </h2>
            <div className="bc-rail mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:px-0">
                {promos.map((p) => (
                    <Coupon key={p.id} promo={p} />
                ))}
            </div>
        </section>
    );
}

function Coupon({ promo: p }: { promo: StorefrontPromo }) {
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
        <article
            className="bc-ticket relative flex h-[132px] w-[86%] max-w-[360px] shrink-0 snap-start overflow-hidden rounded-[22px] bg-shop-surface ring-1 ring-shop-line sm:w-[340px]"
            style={{ ['--ticket-cut' as string]: '50%' }}
        >
            {/* Stub */}
            <div className={cn('relative flex w-[38%] shrink-0 flex-col justify-center overflow-hidden px-4', p.banner ? 'text-white' : 'bg-shop-accent text-shop-on-accent')}>
                {p.banner && (
                    <>
                        <img src={p.banner} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/20" />
                    </>
                )}
                <p className="font-display relative text-[34px] leading-none font-extrabold tracking-tight">{value}</p>
                <p className="relative mt-1 text-xs font-semibold tracking-[0.12em] uppercase opacity-90">off</p>
            </div>
            <div className="w-0 border-l-2 border-dashed border-shop-line" aria-hidden />
            {/* Body */}
            <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
                <div className="min-w-0">
                    <p className="font-display truncate text-base font-semibold">{p.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-shop-muted">
                        {p.minimum_purchase ? `Min. order ₱${p.minimum_purchase.toLocaleString()}` : 'No minimum'}
                        {p.expires_at ? ` · until ${new Date(p.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : ''}
                    </p>
                </div>
                {p.code ? (
                    <button
                        type="button"
                        onClick={copy}
                        className="bc-press flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-xl border border-dashed border-shop-accent bg-shop-accent-soft px-3 font-mono text-sm font-bold text-shop-accent-ink"
                        aria-label={`Copy promo code ${p.code}`}
                    >
                        {p.code} <Copy className="h-3.5 w-3.5" />
                    </button>
                ) : (
                    <span className="flex w-fit items-center gap-1 rounded-xl bg-shop-success-soft px-2.5 py-1.5 text-xs font-semibold text-shop-success">
                        <Sparkles className="h-3.5 w-3.5" /> Applied at checkout
                    </span>
                )}
            </div>
        </article>
    );
}
