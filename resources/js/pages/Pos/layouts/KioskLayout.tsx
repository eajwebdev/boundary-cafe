import { Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtMoney } from '../ReceiptTemplate';
import type { Product, CartItem } from '../posTypes';
import ProductThumbnail from '@/components/ProductThumbnail';

export default function KioskLayout({
    filtered,
    cart,
    currency,
    onProductClick,
    onCharge,
    subtotal,
    itemCount,
    onClear,
}: {
    filtered: Product[];
    cart: CartItem[];
    currency: string;
    onProductClick: (p: Product) => void;
    onCharge: () => void;
    subtotal: number;
    itemCount: number;
    onClear: () => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {filtered.map((p) => {
                        const inCart = cart.find((i) => i.product_id === p.id);
                        const isBundleMTO = p.product_type === 'bundle' || p.product_type === 'made_to_order';
                        const outStock = !isBundleMTO && p.stock <= 0;
                        return (
                            <button
                                key={p.id}
                                onClick={() => onProductClick(p)}
                                disabled={outStock}
                                className={cn(
                                    'relative flex flex-col overflow-hidden rounded-3xl border text-left shadow-sm transition-all duration-150 select-none active:scale-[0.96]',
                                    outStock
                                        ? 'cursor-not-allowed border-border bg-card opacity-40'
                                        : inCart
                                          ? 'border-primary/70 bg-primary/8 shadow-xl ring-2 ring-primary/20'
                                          : 'border-border bg-card hover:border-primary/50 hover:shadow-lg',
                                )}
                            >
                                <ProductThumbnail
                                    src={p.product_img}
                                    name={p.name}
                                    categoryName={p.category?.name}
                                    unit={p.unit}
                                    aspect="aspect-square"
                                    className="w-full shrink-0"
                                    padding="p-4"
                                />
                                {inCart && (
                                    <div className="absolute top-3 right-3 flex h-8 min-w-[32px] items-center justify-center rounded-full bg-primary px-2 text-sm font-black text-primary-foreground shadow-xl">
                                        ×{inCart.qty}
                                    </div>
                                )}
                                {outStock && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                        <span className="rounded-full bg-background/90 px-4 py-2 text-sm font-black tracking-widest text-destructive uppercase">
                                            Out of Stock
                                        </span>
                                    </div>
                                )}
                                <div className="p-4">
                                    <p className="line-clamp-2 text-base leading-snug font-bold text-foreground">{p.name}</p>
                                    {p.category && <p className="mt-0.5 text-xs text-muted-foreground">{p.category.name}</p>}
                                    <p className="mt-2 text-2xl font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</p>
                                    {p.has_variants && <p className="mt-1 text-xs text-muted-foreground">{p.variants.length} options available</p>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
            {itemCount > 0 && (
                <div className="flex shrink-0 items-center gap-4 border-t border-border bg-card px-4 py-3 shadow-lg">
                    <button
                        onClick={onClear}
                        className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                        <Trash2 className="h-5 w-5" />
                    </button>
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                            {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xl font-black text-foreground tabular-nums">{fmtMoney(subtotal, currency)}</p>
                    </div>
                    <Button className="h-14 gap-3 rounded-2xl px-8 text-base font-black shadow-lg shadow-primary/25" onClick={onCharge}>
                        <Zap className="h-5 w-5" />
                        Pay Now
                    </Button>
                </div>
            )}
        </div>
    );
}
