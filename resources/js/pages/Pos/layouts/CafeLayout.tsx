import { cn } from '@/lib/utils';
import type { Product, CartItem, Category } from '../posTypes';
import { fmtMoney } from '../ReceiptTemplate';

export default function CafeLayout({
    filtered,
    allProducts,
    categories,
    activeCat,
    onCatChange,
    cart,
    currency,
    onProductClick,
}: {
    filtered: Product[];
    allProducts: Product[];
    categories: Category[];
    activeCat: number | null;
    onCatChange: (id: number | null) => void;
    cart: CartItem[];
    currency: string;
    onProductClick: (p: Product) => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-border px-3 py-2.5">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => onCatChange(null)}
                        className={cn(
                            'shrink-0 rounded-xl border px-4 py-1.5 text-sm font-bold transition-all',
                            activeCat === null
                                ? 'border-primary bg-primary text-primary-foreground shadow'
                                : 'border-border text-foreground hover:border-primary/40 hover:bg-accent',
                        )}
                    >
                        All <span className="ml-1.5 text-[10px] font-normal opacity-60">{allProducts.length}</span>
                    </button>
                    {categories.map((c) => {
                        const count = allProducts.filter((p) => p.category?.id === c.id).length;
                        return (
                            <button
                                key={c.id}
                                onClick={() => onCatChange(activeCat === c.id ? null : c.id)}
                                className={cn(
                                    'shrink-0 rounded-xl border px-4 py-1.5 text-sm font-bold transition-all',
                                    activeCat === c.id
                                        ? 'border-primary bg-primary text-primary-foreground shadow'
                                        : 'border-border text-foreground hover:border-primary/40 hover:bg-accent',
                                )}
                            >
                                {c.name} <span className="ml-1.5 text-[10px] font-normal opacity-60">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
                                    'relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-all active:scale-[0.97]',
                                    outStock
                                        ? 'cursor-not-allowed border-border bg-card opacity-40'
                                        : inCart
                                          ? 'border-primary bg-primary/8 shadow-md'
                                          : 'border-border bg-card hover:border-primary/50 hover:bg-accent/50',
                                )}
                            >
                                {inCart && (
                                    <div className="absolute top-2 right-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground">
                                        {inCart.qty}
                                    </div>
                                )}
                                <p className="pr-5 text-sm leading-snug font-bold text-foreground">{p.name}</p>
                                {p.has_variants && <p className="text-[10px] text-muted-foreground">{p.variants.length} sizes</p>}
                                {p.product_type === 'bundle' && <p className="text-[9px] font-bold text-purple-400">📦 BUNDLE</p>}
                                {p.product_type === 'made_to_order' && <p className="text-[9px] font-bold text-cyan-400">🍳 MTO</p>}
                                <div className="mt-auto flex w-full items-center justify-between pt-2">
                                    <span className="text-base font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</span>
                                    {p.stock <= 5 && p.stock > 0 && <span className="text-[10px] text-amber-500">⚠ {p.stock}</span>}
                                    {outStock && <span className="text-[10px] font-bold text-destructive">Out</span>}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
