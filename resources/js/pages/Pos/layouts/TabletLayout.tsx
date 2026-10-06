import { ChevronDown } from 'lucide-react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { cn } from '@/lib/utils';
import type { Product, CartItem } from '../posTypes';
import { fmtMoney } from '../ReceiptTemplate';

export default function TabletLayout({
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((p) => {
                const inCart = cart.find((i) => i.product_id === p.id);
                const isBundleMTO = p.product_type === 'bundle' || p.product_type === 'made_to_order';
                const outStock = !isBundleMTO && p.stock <= 0;
                const lowStock = !isBundleMTO && p.stock > 0 && p.stock <= 5;
                return (
                    <button
                        key={p.id}
                        onClick={() => onProductClick(p)}
                        disabled={outStock}
                        className={cn(
                            'relative flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-150 select-none active:scale-[0.97]',
                            outStock
                                ? 'cursor-not-allowed border-border bg-card opacity-40'
                                : inCart
                                  ? 'border-primary/60 bg-primary/5 shadow-md'
                                  : 'border-border bg-card hover:border-primary/40 hover:shadow-md',
                        )}
                    >
                        <ProductThumbnail src={p.product_img} name={p.name} categoryName={p.category?.name} unit={p.unit} aspect="aspect-[4/3]" />
                        {inCart && (
                            <div className="absolute top-2 right-2 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-black text-primary-foreground shadow-lg">
                                ×{inCart.qty}
                            </div>
                        )}
                        {outStock && (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                                <span className="rounded-full bg-background/90 px-3 py-1 text-[10px] font-black tracking-widest text-destructive uppercase">
                                    Out of stock
                                </span>
                            </div>
                        )}
                        <div className="flex flex-1 flex-col p-3">
                            <p title={p.name} className="line-clamp-3 flex-1 text-sm leading-snug font-bold text-foreground">
                                {p.name}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-1">
                                <span className="text-base font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</span>
                                <span className={cn('shrink-0 text-xs font-semibold', lowStock ? 'text-amber-500' : 'text-muted-foreground')}>
                                    {p.product_type === 'made_to_order'
                                        ? 'MTO'
                                        : p.product_type === 'bundle'
                                          ? '📦'
                                          : lowStock
                                            ? `⚠ ${p.stock}`
                                            : `${p.stock}`}
                                </span>
                            </div>
                            {p.has_variants && (
                                <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <ChevronDown className="h-2.5 w-2.5" />
                                    {p.variants.length} variants
                                </p>
                            )}
                            {p.product_type === 'bundle' && p.bundle_items && (
                                <p className="mt-0.5 text-[10px] font-semibold text-purple-400">📦 {p.bundle_items.length} items in bundle</p>
                            )}
                            {p.product_type === 'made_to_order' && <p className="mt-0.5 text-[10px] font-semibold text-cyan-400">🍳 Made to order</p>}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
