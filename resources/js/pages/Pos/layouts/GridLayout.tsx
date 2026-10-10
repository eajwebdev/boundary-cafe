import { Plus } from 'lucide-react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { cn } from '@/lib/utils';
import type { Product, CartItem } from '../posTypes';
import { fmtMoney, fmtQty } from '../ReceiptTemplate';

/** Visual catalog: compact, tap-to-add product cards that auto-fill the width (more items on screen). */
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
    if (filtered.length === 0) {
        return (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-1 text-center text-muted-foreground">
                <p className="text-sm font-bold text-foreground">No menu items match</p>
                <p className="text-xs">Try another category or clear the search.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
            {filtered.map((p) => {
                const inCartQty = cart.filter((i) => i.product_id === p.id).reduce((sum, i) => sum + i.qty, 0);
                const isBundleMTO = p.product_type === 'bundle' || p.product_type === 'made_to_order';
                const outStock = !isBundleMTO && p.stock <= 0;
                const lowStock = !isBundleMTO && p.stock > 0 && p.stock <= 5;
                const unit = p.unit || (p.name.toLowerCase().includes('rice') || p.name.toLowerCase().includes('feed') ? 'kg' : 'pc');

                return (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => onProductClick(p)}
                        disabled={outStock}
                        title={p.barcode ? `${p.name} · ${p.barcode}` : p.name}
                        className={cn(
                            'group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-2 text-left shadow-xs transition-all duration-150 select-none',
                            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.97]',
                            outStock
                                ? 'cursor-not-allowed border-border opacity-45'
                                : inCartQty > 0
                                  ? 'border-primary ring-2 ring-primary/20'
                                  : 'border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
                        )}
                    >
                        <div className="relative">
                            <ProductThumbnail
                                src={p.product_img}
                                name={p.name}
                                categoryName={p.category?.name}
                                unit={p.unit}
                                aspect="aspect-[3/2]"
                                className="rounded-xl"
                                padding="p-1.5"
                            />

                            {inCartQty > 0 && (
                                <span className="absolute top-1.5 right-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-xs font-black text-primary-foreground tabular-nums shadow-md ring-2 ring-card">
                                    {fmtQty(inCartQty)}
                                </span>
                            )}
                            {unit === 'kg' && (
                                <span className="absolute top-1.5 left-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 uppercase backdrop-blur-xs dark:text-emerald-300">
                                    kg
                                </span>
                            )}
                            {outStock && (
                                <span className="absolute inset-x-2 bottom-2 rounded-full bg-background/90 py-0.5 text-center text-[10px] font-black tracking-widest text-destructive uppercase shadow-sm">
                                    Out of stock
                                </span>
                            )}
                        </div>

                        <p className="mt-2 line-clamp-2 min-h-10 px-0.5 text-[13px] leading-tight font-bold text-foreground">{p.name}</p>

                        <div className="mt-1.5 flex w-full items-center justify-between gap-1 px-0.5">
                            <span className="text-[15px] font-black text-primary tabular-nums">
                                {fmtMoney(p.price, currency)}
                                {unit === 'kg' && <span className="ml-0.5 text-[10px] font-semibold text-muted-foreground">/kg</span>}
                            </span>
                            {!outStock && (
                                <span
                                    className={cn(
                                        'ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors pointer-coarse:h-9 pointer-coarse:w-9',
                                        inCartQty > 0
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground',
                                    )}
                                    aria-hidden="true"
                                >
                                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                                </span>
                            )}
                        </div>

                        {lowStock && (
                            <p className="mt-1 px-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                Only {fmtQty(p.stock)} {unit} left
                            </p>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
