import { memo } from 'react';

import type { MenuProduct } from '@/lib/customer';
import { cn } from '@/lib/utils';

import { Price, ProductImage, QtyControl } from './ui';

interface Props {
    product: MenuProduct;
    /** Quantity of the plain (no option, no note) line in the cart. */
    baseQty: number;
    /** All units of this product in the cart, across options/notes. */
    totalQty: number;
    disabled?: boolean;
    onOpen: () => void;
    onQuickAdd: () => void;
    onQuickRemove: () => void;
}

/**
 * Photo-first menu card.
 *   < 640px: compact horizontal row (text left, small square photo right) so a phone shows ~6 items per screen.
 *   ≥ 640px: vertical tile (4:3 photo on top).
 */
function ProductCardBase({ product: p, baseQty, totalQty, disabled, onOpen, onQuickAdd, onQuickRemove }: Props) {
    const hasOptions = p.variants.length > 0;
    const soldOut = p.sold_out;

    return (
        <article
            className={cn(
                'group shadow-shop-sm relative flex h-full cursor-pointer gap-3 rounded-2xl bg-shop-surface p-2.5 ring-1 ring-shop-line transition-[box-shadow,transform] duration-300 ease-shop sm:flex-col-reverse sm:gap-0 sm:p-0',
                !soldOut && 'hover:shadow-shop-md hover:-translate-y-0.5',
                soldOut && 'cursor-not-allowed',
                totalQty > 0 && 'ring-2 ring-shop-accent/60',
            )}
        >
            {/* Text */}
            <div className="flex min-w-0 flex-1 flex-col py-0.5 sm:p-4 sm:pt-3">
                <h3
                    className={cn(
                        'line-clamp-2 font-display text-[15px] leading-snug font-semibold text-shop-ink sm:text-[17px]',
                        soldOut && 'text-shop-muted',
                    )}
                >
                    <button
                        type="button"
                        className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!soldOut) onOpen();
                        }}
                        disabled={soldOut}
                        aria-label={`${p.name}, ₱${p.price}${soldOut ? ', sold out' : ''}`}
                    >
                        {p.name}
                    </button>
                </h3>
                {p.description && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-shop-muted sm:mt-1 sm:line-clamp-2 sm:text-sm">{p.description}</p>
                )}
                <div className="mt-auto flex items-end justify-between gap-2 pt-1.5 sm:pt-3">
                    <p className="text-[15px] font-bold text-shop-ink sm:text-[17px]">
                        {hasOptions && <span className="mr-1 text-xs font-medium text-shop-muted">from</span>}
                        <Price value={p.price} />
                    </p>
                    {hasOptions && !soldOut && <span className="text-xs font-medium text-shop-muted">{p.variants.length} options</span>}
                </div>
            </div>

            {/* Photo */}
            <div className="relative h-[84px] w-[84px] shrink-0 sm:h-auto sm:w-full">
                <ProductImage
                    src={p.image}
                    alt={p.name}
                    className={cn(
                        'h-full w-full rounded-xl sm:aspect-[4/3] sm:rounded-t-2xl sm:rounded-b-none [&_img]:group-hover:scale-[1.03]',
                        soldOut && 'opacity-60 grayscale',
                    )}
                />
                {soldOut ? (
                    <span className="absolute inset-x-2 bottom-2 rounded-xl bg-shop-ink/85 py-1.5 text-center text-xs font-semibold text-shop-bg">
                        Sold out today
                    </span>
                ) : (
                    <div className="absolute -right-1.5 -bottom-1.5 z-10 sm:right-3 sm:bottom-3">
                        {hasOptions ? (
                            <div className="relative">
                                <QtyControl qty={0} label={p.name} onAdd={onOpen} disabled={disabled} />
                                {totalQty > 0 && (
                                    <span className="absolute -top-2 -left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-shop-ink px-1.5 text-xs font-bold text-shop-bg tabular-nums">
                                        {totalQty}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <QtyControl qty={baseQty} label={p.name} onAdd={onQuickAdd} onRemove={onQuickRemove} disabled={disabled} />
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

export default memo(ProductCardBase);
