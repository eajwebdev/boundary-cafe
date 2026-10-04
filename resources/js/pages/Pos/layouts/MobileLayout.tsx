import { useState } from 'react';
import { ShoppingCart, X, ChevronDown, Package, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtMoney, fmtQty } from '../ReceiptTemplate';
import type { Product, CartItem } from '../posTypes';
import ProductThumbnail from '@/components/ProductThumbnail';

export default function MobileLayout({
    filtered,
    cart,
    currency,
    onProductClick,
    onCharge,
    subtotal,
    itemCount,
    onClear,
    onUpdateQty,
    onSetExactQty,
    onRemove,
}: {
    filtered: Product[];
    cart: CartItem[];
    currency: string;
    onProductClick: (p: Product) => void;
    onCharge: () => void;
    subtotal: number;
    itemCount: number;
    onClear: () => void;
    onUpdateQty: (key: string, delta: number) => void;
    onSetExactQty?: (key: string, qty: number) => void;
    onRemove: (key: string) => void;
}) {
    const [cartOpen, setCartOpen] = useState(false);

    return (
        // min-h-0 is critical: flex children default to min-height:auto which lets
        // the products list grow past the container instead of scrolling within it.
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* ── Product list — scrolls independently ── */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {filtered.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Package className="h-8 w-8 opacity-20" />
                        <p className="text-sm">No products found</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
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
                                        'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:scale-[0.99]',
                                        outStock
                                            ? 'cursor-not-allowed bg-transparent opacity-40'
                                            : inCart
                                              ? 'border-l-2 border-l-primary bg-primary/5'
                                              : 'hover:bg-muted/30',
                                    )}
                                >
                                    <ProductThumbnail
                                        src={p.product_img}
                                        name={p.name}
                                        categoryName={p.category?.name}
                                        unit={p.unit}
                                        aspect="aspect-square"
                                        className="h-11 w-11 shrink-0 rounded-xl"
                                        padding="p-1"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                                        {p.category && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.category.name}</p>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-base font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</p>
                                        {inCart ? (
                                            <span className="text-[10px] font-bold text-emerald-500">×{inCart.qty} added</span>
                                        ) : outStock ? (
                                            <span className="text-[10px] font-semibold text-destructive">Out</span>
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                                {isBundleMTO ? (p.product_type === 'made_to_order' ? 'MTO' : 'Bundle') : p.stock}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Cart drawer + pay bar — always visible at bottom ── */}
            <div className="shrink-0 border-t border-border bg-card shadow-[0_-4px_24px_rgba(0,0,0,0.12)]">
                {/* Expandable cart items */}
                {cartOpen && (
                    <div className="max-h-[40vh] divide-y divide-border overflow-y-auto overscroll-contain border-b border-border">
                        {cart.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground">
                                <ShoppingCart className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                <p className="text-sm">Cart is empty</p>
                            </div>
                        ) : (
                            cart.map((item) => (
                                <div key={item.key} className="flex items-center gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                                        {item.variant_name && <p className="text-xs text-muted-foreground">{item.variant_name}</p>}
                                        <p className="mt-0.5 text-xs font-bold text-primary tabular-nums">
                                            {fmtMoney(item.price, currency)} × {fmtQty(item.qty)} = {fmtMoney(item.price * item.qty, currency)}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <button
                                            onClick={() => onUpdateQty(item.key, (item.unit || '').toLowerCase() === 'kg' ? -0.25 : -1)}
                                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-lg font-bold transition-colors hover:bg-muted"
                                        >
                                            −
                                        </button>
                                        <input
                                            type="number"
                                            step="any"
                                            min="0.001"
                                            value={item.qty}
                                            onChange={(e) => onSetExactQty?.(item.key, parseFloat(e.target.value) || 0)}
                                            className="h-8 w-14 rounded-lg border border-border bg-background text-center font-mono text-xs font-bold"
                                        />
                                        <button
                                            onClick={() => onUpdateQty(item.key, (item.unit || '').toLowerCase() === 'kg' ? 0.25 : 1)}
                                            disabled={item.qty >= item.stock}
                                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border text-lg font-bold transition-colors hover:bg-muted disabled:opacity-30"
                                        >
                                            +
                                        </button>
                                        <button
                                            onClick={() => onRemove(item.key)}
                                            className="ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-destructive transition-colors hover:bg-destructive/10"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Cart toggle + Pay button row */}
                <div className="flex items-center gap-2 px-3 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    <button
                        onClick={() => setCartOpen((o) => !o)}
                        className={cn(
                            'flex h-12 flex-1 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-all',
                            itemCount > 0 ? 'border-primary/30 bg-primary/8 text-foreground' : 'border-border text-muted-foreground',
                        )}
                    >
                        <ShoppingCart className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate text-left">
                            {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''} · ${fmtMoney(subtotal, currency)}` : 'Cart empty'}
                        </span>
                        {itemCount > 0 && <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', cartOpen && 'rotate-180')} />}
                    </button>
                    <button
                        onClick={onCharge}
                        disabled={itemCount === 0}
                        className="flex h-12 items-center gap-1.5 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-all active:scale-95 disabled:opacity-40"
                    >
                        <Zap className="h-4 w-4" />
                        Pay
                    </button>
                </div>
            </div>
        </div>
    );
}
