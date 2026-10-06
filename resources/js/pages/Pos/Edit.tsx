'use client';

import { usePage, router, Link } from '@inertiajs/react';
import { ArrowLeft, Plus, Minus, Save, X, Package, AlertTriangle, ShoppingCart, Search } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import { fmtMoney } from './ReceiptTemplate';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Variant {
    id: number;
    name: string;
    extra_price: number;
    is_available: boolean;
}
interface Product {
    id: number;
    name: string;
    product_img: string | null;
    price: number;
    stock: number;
    category: { id: number; name: string } | null;
    variants: Variant[];
    has_variants: boolean;
}
interface SaleItem {
    id: number;
    product_id: number;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    price: number;
    total: number;
}
interface Sale {
    id: number;
    receipt_number: string;
    status: string;
    payment_method: string;
    total: number;
    customer_name: string | null;
    notes: string | null;
    created_at: string;
    cashier: string;
    items: SaleItem[];
}
interface PageProps {
    sale: Sale;
    products: Product[];
    app: { currency: string };
    auth: { user: { fname: string } | null };
    settings: { max_discount_percent: number; allow_discount: boolean } | null;
    [key: string]: unknown;
}

interface CartItem {
    key: string;
    product_id: number;
    variant_id: number | null;
    name: string;
    variant_name: string | null;
    price: number;
    qty: number;
    stock: number;
}

// ─── Edit page ────────────────────────────────────────────────────────────────
export default function PosEdit() {
    const { props } = usePage<PageProps>();
    const { sale, products, app } = props;
    const currency = app?.currency ?? '₱';

    // Initialise cart from existing sale items
    const initialCart: CartItem[] = sale.items.map((i) => ({
        key: `${i.product_id}-${i.variant_name ?? 'base'}`,
        product_id: i.product_id,
        variant_id: null,
        name: i.product_name,
        variant_name: i.variant_name,
        price: i.price,
        qty: i.quantity,
        stock: (products.find((p) => p.id === i.product_id)?.stock ?? i.quantity) + i.quantity,
    }));

    const [cart, setCart] = useState<CartItem[]>(initialCart);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const filtered = useMemo(() => {
        if (!search.trim()) return products;
        const q = search.toLowerCase();
        return products.filter((p) => p.name.toLowerCase().includes(q));
    }, [products, search]);

    const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

    const addItem = useCallback((product: Product, variantId: number | null = null, variantName: string | null = null) => {
        const extra = variantId ? (product.variants.find((v) => v.id === variantId)?.extra_price ?? 0) : 0;
        const price = product.price + extra;
        const key = `${product.id}-${variantId ?? 'base'}`;
        setCart((prev) => {
            const ex = prev.find((i) => i.key === key);
            if (ex) {
                if (ex.qty >= ex.stock) return prev;
                return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
            }
            return [
                ...prev,
                {
                    key,
                    product_id: product.id,
                    variant_id: variantId,
                    name: product.name,
                    variant_name: variantName,
                    price,
                    qty: 1,
                    stock: product.stock,
                },
            ];
        });
    }, []);

    const updateQty = (key: string, delta: number) =>
        setCart((prev) =>
            prev.flatMap((i) => {
                if (i.key !== key) return [i];
                const nq = Math.round((i.qty + delta) * 1000) / 1000;
                if (nq <= 0) return [];
                if (nq > i.stock) return [i];
                return [{ ...i, qty: nq }];
            }),
        );

    const setExactQty = (key: string, newQty: number) =>
        setCart((prev) =>
            prev.flatMap((i) => {
                if (i.key !== key) return [i];
                if (newQty <= 0) return [];
                const safeQty = Math.min(i.stock, Math.round(newQty * 1000) / 1000);
                return [{ ...i, qty: safeQty }];
            }),
        );

    const removeItem = (key: string) => setCart((prev) => prev.filter((i) => i.key !== key));

    const handleSave = () => {
        if (!cart.length) return;
        setLoading(true);
        setErrors({});

        router.put(
            routes.pos.update(sale.id),
            {
                items: cart.map((i) => ({ id: i.product_id, qty: i.qty, variant_id: i.variant_id })),
                payment_method: sale.payment_method,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    router.visit(routes.pos.show(sale.id));
                },
                onError: (e) => {
                    setErrors(e);
                    setLoading(false);
                },
                onFinish: () => setLoading(false),
            },
        );
    };

    return (
        <AdminLayout>
            <div className="mx-auto max-w-5xl space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href={routes.pos.show(sale.id)}>
                            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">Edit Sale</h1>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{sale.receipt_number}</p>
                        </div>
                    </div>
                    <Button className="h-9 gap-2" onClick={handleSave} disabled={loading || !cart.length}>
                        {loading ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        Save changes
                    </Button>
                </div>

                {/* Warning */}
                <div className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                        Saving will restore stock for removed items and deduct stock for new items. Only today's sales can be edited.
                    </p>
                </div>

                {/* Error */}
                {Object.keys(errors).length > 0 && (
                    <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {Object.values(errors)[0]}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
                    {/* ── Product picker ───────────────────── */}
                    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card lg:col-span-3">
                        <div className="border-b border-border p-3">
                            <p className="mb-2 text-sm font-bold text-foreground">Add products</p>
                            <div className="relative">
                                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search products…"
                                    className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="max-h-80 flex-1 overflow-y-auto p-3">
                            {filtered.length === 0 ? (
                                <div className="flex h-24 flex-col items-center justify-center gap-2 text-muted-foreground">
                                    <Package className="h-6 w-6 opacity-20" />
                                    <p className="text-xs">No products found</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filtered.map((p) => {
                                        const inCart = cart.find((i) => i.product_id === p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => addItem(p)}
                                                disabled={p.stock <= 0}
                                                className={cn(
                                                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                                                    p.stock <= 0
                                                        ? 'cursor-not-allowed border-border opacity-40'
                                                        : inCart
                                                          ? 'border-primary/50 bg-primary/5'
                                                          : 'border-border hover:border-primary/40 hover:bg-accent',
                                                )}
                                            >
                                                <ProductThumbnail
                                                    src={p.product_img}
                                                    name={p.name}
                                                    categoryName={p.category?.name}
                                                    aspect="h-9 w-9 rounded-lg shrink-0 border border-border"
                                                    padding="p-0.5"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                                                    <p className="text-xs font-bold text-primary tabular-nums">{fmtMoney(p.price, currency)}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p
                                                        className={cn(
                                                            'text-xs font-medium',
                                                            p.stock <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {p.stock} left
                                                    </p>
                                                    {inCart && <p className="text-[10px] font-bold text-primary">×{inCart.qty} in cart</p>}
                                                </div>
                                                <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Cart ─────────────────────────────── */}
                    <div className="flex flex-col rounded-xl border border-border bg-card lg:col-span-2">
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                            <div className="flex items-center gap-2">
                                <ShoppingCart className="h-4 w-4 text-primary" />
                                <span className="text-sm font-bold">Updated cart</span>
                                {itemCount > 0 && (
                                    <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                                        {itemCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {cart.length === 0 ? (
                                <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
                                    <ShoppingCart className="h-8 w-8 opacity-15" />
                                    <p className="text-sm">No items in cart</p>
                                </div>
                            ) : (
                                <div className="px-3 py-2">
                                    {cart.map((item) => (
                                        <div key={item.key} className="group flex items-center gap-2 border-b border-border/50 py-2.5 last:border-0">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                                                {item.variant_name && <p className="text-[10px] text-muted-foreground">{item.variant_name}</p>}
                                                <p className="text-xs font-bold text-primary tabular-nums">{fmtMoney(item.price, currency)}</p>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    onClick={() => updateQty(item.key, -1)}
                                                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0.001"
                                                    value={item.qty}
                                                    onChange={(e) => setExactQty(item.key, parseFloat(e.target.value) || 0)}
                                                    className="h-6 w-14 rounded-md border border-border bg-background text-center font-mono text-xs font-bold"
                                                />
                                                <button
                                                    onClick={() => updateQty(item.key, 1)}
                                                    disabled={item.qty >= item.stock}
                                                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums">
                                                {fmtMoney(item.price * item.qty, currency)}
                                            </span>
                                            <button
                                                onClick={() => removeItem(item.key)}
                                                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:text-destructive"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {cart.length > 0 && (
                            <div className="shrink-0 space-y-2 border-t border-border p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">{itemCount} items</span>
                                    <div className="text-right">
                                        <p className="text-[10px] tracking-wider text-muted-foreground uppercase">New total</p>
                                        <p className="text-xl font-bold text-foreground tabular-nums">{fmtMoney(subtotal, currency)}</p>
                                    </div>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Original total</span>
                                    <span className="tabular-nums">{fmtMoney(sale.total, currency)}</span>
                                </div>
                                {subtotal !== sale.total && (
                                    <div
                                        className={cn(
                                            'flex justify-between text-xs font-semibold',
                                            subtotal > sale.total ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400',
                                        )}
                                    >
                                        <span>Difference</span>
                                        <span className="tabular-nums">
                                            {subtotal > sale.total ? '+' : ''}
                                            {fmtMoney(subtotal - sale.total, currency)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
