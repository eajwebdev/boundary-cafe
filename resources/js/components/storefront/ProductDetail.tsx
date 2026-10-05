import { Check, Minus, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import type { CartLine, MenuProduct } from '@/lib/customer';
import { cn } from '@/lib/utils';

import { Price, ProductImage, useIsDesktop } from './ui';

interface Props {
    product: MenuProduct | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdd: (line: Omit<CartLine, 'key'>) => void;
    disabled?: boolean;
    disabledReason?: string | null;
}

/** Item details & options. Centred dialog on desktop, bottom sheet on phones. */
export default function ProductDetail({ product, open, onOpenChange, onAdd, disabled, disabledReason }: Props) {
    const isDesktop = useIsDesktop();
    const [variantId, setVariantId] = useState<number | null>(null);
    const [qty, setQty] = useState(1);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (product && open) {
            setVariantId(product.variants.find((v) => !v.sold_out)?.id ?? null);
            setQty(1);
            setNote('');
        }
    }, [product, open]);

    if (!product) return null;

    const variant = product.variants.find((v) => v.id === variantId) ?? null;
    const unit = product.price + (variant?.extra_price ?? 0);
    const maxQty = Math.max(1, Math.min(50, product.max_quantity || 50));
    const needsVariant = product.variants.length > 0 && !variant;
    const blocked = disabled || product.sold_out || needsVariant;

    const add = () => {
        onAdd({
            product_id: product.id,
            variant_id: variant?.id ?? null,
            name: product.name,
            variant_name: variant?.name ?? null,
            image: product.image,
            unit_price: unit,
            quantity: qty,
            note: note.trim(),
        });
        onOpenChange(false);
    };

    const options = (
        <div className="space-y-6">
            {product.variants.length > 0 && (
                <fieldset>
                    <legend className="mb-3 flex w-full items-center justify-between">
                        <span className="font-display text-lg font-semibold">Choose one</span>
                        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', variant ? 'bg-shop-success-soft text-shop-success' : 'bg-shop-accent-soft text-shop-accent-ink')}>
                            {variant ? 'Done' : 'Required'}
                        </span>
                    </legend>
                    <div className="space-y-2">
                        {product.variants.map((v) => {
                            const checked = variantId === v.id;
                            return (
                                <label
                                    key={v.id}
                                    className={cn(
                                        'bc-press flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2',
                                        checked ? 'border-shop-accent bg-shop-accent-soft/60' : 'border-shop-line hover:bg-shop-sunken',
                                        v.sold_out && 'cursor-not-allowed opacity-50',
                                    )}
                                >
                                    <input type="radio" name="variant" className="sr-only" checked={checked} disabled={v.sold_out} onChange={() => setVariantId(v.id)} />
                                    <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-shop-accent bg-shop-accent' : 'border-shop-line')}>
                                        {checked && <Check className="h-3 w-3 text-shop-on-accent" strokeWidth={3} />}
                                    </span>
                                    <span className="flex-1 font-medium">{v.name}</span>
                                    <span className="text-sm text-shop-muted tabular-nums">{v.sold_out ? 'Sold out' : v.extra_price > 0 ? `+₱${v.extra_price}` : 'Included'}</span>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            )}

            <div>
                <label htmlFor="item-note" className="font-display mb-2 block text-lg font-semibold">
                    Special instructions <span className="text-sm font-normal text-shop-muted">(optional)</span>
                </label>
                <textarea
                    id="item-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 200))}
                    placeholder="Less ice, no onions, extra sauce…"
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-shop-line bg-shop-surface px-4 py-3 text-base outline-none placeholder:text-shop-muted/80 focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15"
                />
                <p className="mt-1 text-right text-xs text-shop-muted tabular-nums">{note.length}/200</p>
            </div>
        </div>
    );

    const footer = (
        <div className="flex items-center gap-3">
            <div className="flex h-14 items-center rounded-2xl border border-shop-line bg-shop-surface">
                <button
                    type="button"
                    className="bc-press flex h-14 w-12 cursor-pointer items-center justify-center rounded-l-2xl disabled:opacity-30"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                >
                    <Minus className="h-5 w-5" />
                </button>
                <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
                    {qty}
                </span>
                <button
                    type="button"
                    className="bc-press flex h-14 w-12 cursor-pointer items-center justify-center rounded-r-2xl disabled:opacity-30"
                    onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                    disabled={qty >= maxQty}
                    aria-label="Increase quantity"
                >
                    <Plus className="h-5 w-5" />
                </button>
            </div>
            <button
                type="button"
                disabled={blocked}
                onClick={add}
                className="bc-press flex h-14 flex-1 cursor-pointer items-center justify-between rounded-2xl bg-shop-accent px-5 text-base font-bold text-shop-on-accent shadow-shop-md disabled:cursor-not-allowed disabled:bg-shop-sunken disabled:text-shop-muted disabled:shadow-none"
            >
                <span>{product.sold_out ? 'Sold out' : disabled ? (disabledReason ?? 'Unavailable') : needsVariant ? 'Choose an option' : 'Add to order'}</span>
                {!blocked && <Price value={unit * qty} />}
            </button>
        </div>
    );

    const heading = (
        <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-shop-accent-ink uppercase">{product.category}</p>
            <h2 className="font-display mt-1 text-[28px] leading-tight font-bold">{product.name}</h2>
            <p className="mt-2 text-base leading-relaxed text-shop-muted">{product.description ?? 'Made fresh when you order it at our Mabinay kitchen.'}</p>
            <p className="font-display mt-3 text-2xl font-bold">
                <Price value={product.price} />
            </p>
        </div>
    );

    if (isDesktop) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent showCloseButton={false} className="bc-shop grid max-h-[86dvh] gap-0 overflow-hidden rounded-[28px] border-shop-line bg-shop-surface p-0 sm:max-w-4xl md:grid-cols-[1fr_1.05fr]">
                    <DialogTitle className="sr-only">{product.name}</DialogTitle>
                    <DialogDescription className="sr-only">Choose options and add to your order</DialogDescription>
                    <ProductImage src={product.image} alt={product.name} className="aspect-square h-full w-full md:aspect-auto" />
                    <div className="flex min-h-0 flex-col">
                        <div className="flex justify-end p-3 pb-0">
                            <button type="button" onClick={() => onOpenChange(false)} className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken" aria-label="Close">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-7 pb-6">
                            {heading}
                            {options}
                        </div>
                        <div className="border-t border-shop-line p-5">{footer}</div>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" showCloseButton={false} className="bc-shop flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-[28px] border-shop-line bg-shop-surface p-0 sm:mx-auto sm:max-w-xl">
                <SheetTitle className="sr-only">{product.name}</SheetTitle>
                <SheetDescription className="sr-only">Choose options and add to your order</SheetDescription>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="relative">
                        <ProductImage src={product.image} alt={product.name} className="aspect-square max-h-[52dvh] w-full" />
                        <div className="absolute inset-x-0 top-2 mx-auto h-1.5 w-10 rounded-full bg-white/80" aria-hidden />
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="bc-press absolute top-3 right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-shop-surface/95 shadow-shop-md"
                            aria-label="Close"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-6 px-5 pt-5 pb-6">
                        {heading}
                        {options}
                    </div>
                </div>
                <div className="border-t border-shop-line bg-shop-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
            </SheetContent>
        </Sheet>
    );
}
