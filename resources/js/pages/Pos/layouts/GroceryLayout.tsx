import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtMoney, fmtQty } from '../ReceiptTemplate';
import type { Product, CartItem } from '../posTypes';
import ProductThumbnail from '@/components/ProductThumbnail';

export default function GroceryLayout({
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
        <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
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
                            'flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors select-none',
                            outStock
                                ? 'cursor-not-allowed bg-muted/20 opacity-40'
                                : inCart
                                  ? 'bg-primary/5 hover:bg-primary/10'
                                  : 'hover:bg-accent/60',
                        )}
                    >
                        {/* Thumbnail / In-cart badge */}
                        <div
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border',
                                inCart ? 'border-primary bg-primary/10' : 'border-border bg-muted/30',
                            )}
                        >
                            <ProductThumbnail
                                src={p.product_img}
                                name={p.name}
                                categoryName={p.category?.name}
                                unit={p.unit}
                                aspect="aspect-square"
                                className="h-full w-full bg-transparent dark:bg-transparent"
                                padding="p-1"
                            />
                        </div>

                        {/* Title & Barcode */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className={cn('truncate text-sm leading-snug font-bold', outStock ? 'text-muted-foreground' : 'text-foreground')}>
                                    {p.name}
                                </p>
                                <span
                                    className={cn(
                                        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase',
                                        unit === 'kg'
                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                            : unit === 'sack' || unit === 'bag'
                                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                              : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    {unit.toUpperCase()}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                                {p.barcode && <span className="font-mono text-[11px] text-muted-foreground">{p.barcode}</span>}
                                {p.category && <span className="text-[10px] text-muted-foreground/80">• {p.category.name}</span>}
                                {p.has_variants && <span className="text-[10px] text-primary">({p.variants.length} var.)</span>}
                            </div>
                        </div>

                        {/* Stock count */}
                        <div className="shrink-0 text-right">
                            <span
                                className={cn(
                                    'block text-xs font-semibold tabular-nums',
                                    outStock ? 'font-bold text-destructive' : lowStock ? 'text-amber-500' : 'text-muted-foreground',
                                )}
                            >
                                {outStock ? 'Out' : isBundleMTO ? '∞' : `${fmtQty(p.stock)} ${unit}`}
                            </span>
                            <span className="text-[10px] text-muted-foreground">In stock</span>
                        </div>

                        {/* Price */}
                        <div className="min-w-[70px] shrink-0 text-right">
                            <span className="block text-sm font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</span>
                            <span className="text-[10px] text-muted-foreground">/{unit}</span>
                        </div>

                        {/* Quick Add Button / Count */}
                        <div
                            className={cn(
                                'flex h-8 min-w-[32px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-bold transition-colors',
                                outStock
                                    ? 'bg-muted text-muted-foreground/30'
                                    : inCart
                                      ? 'bg-primary text-primary-foreground shadow-xs'
                                      : 'bg-muted text-foreground hover:bg-primary hover:text-primary-foreground',
                            )}
                        >
                            {inCart ? `${fmtQty(inCart.qty)}` : <Plus className="h-4 w-4" />}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
