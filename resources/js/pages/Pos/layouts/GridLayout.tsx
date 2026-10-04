import { cn } from '@/lib/utils';
import { fmtMoney, fmtQty } from '../ReceiptTemplate';
import type { Product, CartItem } from '../posTypes';
import ProductThumbnail from '@/components/ProductThumbnail';

export default function GridLayout({
    filtered,
    cart,
    currency,
    onProductClick,
}: {
    filtered: Product[];
    cart: CartItem[];
    currency: string;
    onProductClick: (p: Product) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {filtered.map((p) => {
                const inCart = cart.find((i) => i.product_id === p.id);
                const isBundleMTO = p.product_type === 'bundle' || p.product_type === 'made_to_order';
                const outStock = !isBundleMTO && p.stock <= 0;
                const lowStock = !isBundleMTO && p.stock > 0 && p.stock <= 5;
                const unit = p.unit || (p.name.toLowerCase().includes('rice') || p.name.toLowerCase().includes('feed') ? 'kg' : 'pc');

                return (
                    <button
                        key={p.id}
                        onClick={() => onProductClick(p)}
                        disabled={outStock}
                        className={cn(
                            'group relative flex flex-col overflow-hidden rounded-2xl border p-3 text-left shadow-xs transition-all duration-150 select-none hover:shadow-md',
                            outStock
                                ? 'cursor-not-allowed border-border bg-card/60 opacity-40'
                                : inCart
                                  ? 'border-primary/70 bg-primary/5 shadow-sm ring-2 ring-primary/20'
                                  : 'border-border bg-card hover:border-primary/50 hover:bg-card',
                        )}
                    >
                        {/* Top badges: Unit Pill & Category */}
                        <div className="mb-2 flex w-full items-center justify-between gap-1">
                            <span
                                className={cn(
                                    'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black tracking-wider uppercase shadow-xs',
                                    unit === 'kg'
                                        ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : unit === 'sack' || unit === 'bag'
                                          ? 'border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                          : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {unit.toUpperCase()}
                            </span>

                            {p.barcode && <span className="max-w-[90px] truncate font-mono text-[9px] text-muted-foreground/70">{p.barcode}</span>}
                        </div>

                        {/* Product Image */}
                        <ProductThumbnail
                            src={p.product_img}
                            name={p.name}
                            categoryName={p.category?.name}
                            unit={p.unit}
                            aspect="aspect-square"
                            className="mb-2.5 rounded-xl transition-transform group-hover:scale-[1.02]"
                            padding="p-2"
                        />

                        {/* In-cart counter */}
                        {inCart && (
                            <div className="absolute top-2 right-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-black text-primary-foreground shadow-md ring-2 ring-background">
                                {fmtQty(inCart.qty)} {inCart.unit ?? unit}
                            </div>
                        )}

                        {outStock && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/60 backdrop-blur-xs">
                                <span className="rounded-full border border-destructive/30 bg-background/90 px-3 py-1 text-[10px] font-black tracking-widest text-destructive uppercase shadow-sm">
                                    Out of Stock
                                </span>
                            </div>
                        )}

                        {/* Product Title */}
                        <p title={p.name} className="line-clamp-2 min-h-[2rem] flex-1 text-xs leading-snug font-bold text-foreground">
                            {p.name}
                        </p>

                        {/* Price & Stock */}
                        <div className="mt-2 flex w-full shrink-0 items-baseline justify-between gap-1 border-t border-border/40 pt-2">
                            <div>
                                <span className="text-sm font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</span>
                                <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">/{unit}</span>
                            </div>
                            <span
                                className={cn(
                                    'shrink-0 text-[10px] font-semibold tabular-nums',
                                    outStock ? 'text-destructive' : lowStock ? 'text-amber-500' : 'text-muted-foreground',
                                )}
                            >
                                {isBundleMTO ? '∞' : `${fmtQty(p.stock)} ${unit}`}
                            </span>
                        </div>

                        {p.has_variants && (
                            <p className="mt-1 text-[9px] text-muted-foreground">
                                {p.variants.length} variant{p.variants.length !== 1 ? 's' : ''} available
                            </p>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
