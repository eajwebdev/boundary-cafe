import { Bike, Clock3, ShoppingBag, Store } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useLogoUrl } from '@/hooks/use-logo';
import type { CartLine } from '@/lib/customer';
import { cn } from '@/lib/utils';

import { Price, ProductImage, QtyControl, RouteLine, ShopButton, useMediaQuery } from './ui';

export interface CartSettings {
    min_order: number;
    delivery_fee: number;
    free_delivery_min: number;
    delivery_enabled: boolean;
    pickup_enabled: boolean;
    prep_minutes: number;
    delivery_minutes: number;
}

interface Props {
    lines: CartLine[];
    subtotal: number;
    count: number;
    onQuantity: (key: string, qty: number) => void;
    onClear: () => void;
    settings: CartSettings;
    fulfillment: 'delivery' | 'pickup';
    onFulfillment: (f: 'delivery' | 'pickup') => void;
    isOpen: boolean;
    closedReason?: string | null;
    onCheckout: () => void;
    variant: 'rail' | 'sheet';
}

/** The order summary — persistent right rail on desktop, bottom/right sheet elsewhere. */
export function CartPanel({
    lines,
    subtotal,
    count,
    onQuantity,
    onClear,
    settings,
    fulfillment,
    onFulfillment,
    isOpen,
    closedReason,
    onCheckout,
    variant,
}: Props) {
    const logoUrl = useLogoUrl();
    const minLeft = Math.max(0, settings.min_order - subtotal);
    const freeFrom = settings.free_delivery_min;
    const fee = fulfillment === 'delivery' ? (freeFrom > 0 && subtotal >= freeFrom ? 0 : settings.delivery_fee) : 0;
    const total = subtotal + fee;
    const eta =
        fulfillment === 'delivery'
            ? `${settings.prep_minutes + settings.delivery_minutes}–${settings.prep_minutes + settings.delivery_minutes + 15} min`
            : `${settings.prep_minutes}–${settings.prep_minutes + 10} min`;

    return (
        <div
            className={cn(
                'flex h-full min-h-0 flex-col',
                variant === 'rail' && 'shadow-shop-md rounded-[26px] bg-shop-surface ring-1 ring-shop-line',
            )}
        >
            <div className="px-5 pt-5">
                <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-xl font-bold">Your order</h2>
                    {count > 0 && (
                        <button type="button" onClick={onClear} className="cursor-pointer text-sm font-medium text-shop-muted hover:text-shop-danger">
                            Clear
                        </button>
                    )}
                </div>
                {/* Fulfilment */}
                <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-shop-sunken p-1" role="radiogroup" aria-label="Delivery or pickup">
                    {(['delivery', 'pickup'] as const).map((f) => {
                        const enabled = f === 'delivery' ? settings.delivery_enabled : settings.pickup_enabled;
                        const Icon = f === 'delivery' ? Bike : Store;
                        return (
                            <button
                                key={f}
                                type="button"
                                role="radio"
                                aria-checked={fulfillment === f}
                                disabled={!enabled}
                                onClick={() => onFulfillment(f)}
                                className={cn(
                                    'bc-press flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40',
                                    fulfillment === f ? 'shadow-shop-sm bg-shop-surface text-shop-ink' : 'text-shop-muted',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {f === 'delivery' ? 'Delivery' : 'Pickup'}
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-shop-muted">
                    <Clock3 className="h-3.5 w-3.5" /> {fulfillment === 'delivery' ? 'Arrives in' : 'Ready in'} about {eta}
                </p>
            </div>

            {lines.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
                    <div className="relative">
                        <img src={logoUrl} alt="" className="h-20 w-20 rounded-full opacity-90 ring-8 ring-shop-sunken" />
                        <span className="absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full bg-shop-accent text-shop-on-accent">
                            <ShoppingBag className="h-4 w-4" />
                        </span>
                    </div>
                    <p className="mt-5 font-display text-lg font-semibold">Nothing here yet</p>
                    <p className="mt-1 max-w-[16rem] text-sm text-shop-muted">
                        Tap the + on anything that looks good. Your order builds up right here.
                    </p>
                </div>
            ) : (
                <>
                    <ul className="mt-3 min-h-0 flex-1 divide-y divide-shop-line overflow-y-auto overscroll-contain px-5" aria-live="polite">
                        {lines.map((l) => (
                            <li key={l.key} className="flex gap-3 py-3.5">
                                <ProductImage src={l.image} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] leading-tight font-semibold">{l.name}</p>
                                    {l.variant_name && <p className="truncate text-xs text-shop-muted">{l.variant_name}</p>}
                                    {l.note && <p className="truncate text-xs text-shop-muted italic">“{l.note}”</p>}
                                    <p className="mt-1 text-sm font-semibold">
                                        <Price value={l.unit_price * l.quantity} />
                                    </p>
                                </div>
                                <QtyControl
                                    size="sm"
                                    qty={l.quantity}
                                    label={l.name}
                                    onAdd={() => onQuantity(l.key, l.quantity + 1)}
                                    onRemove={() => onQuantity(l.key, l.quantity - 1)}
                                    disabled={l.quantity >= 50}
                                    className="self-center shadow-none"
                                />
                            </li>
                        ))}
                    </ul>

                    {/* Ticket-style summary */}
                    <div className="px-3 pb-3">
                        <div className="bc-ticket rounded-[22px] bg-shop-sunken px-4 pt-4 pb-4" style={{ ['--ticket-cut' as string]: '34%' }}>
                            {minLeft > 0 ? (
                                <Progress
                                    label={`Add ₱${minLeft.toLocaleString()} more to reach the minimum order`}
                                    value={subtotal / settings.min_order}
                                    tone="warning"
                                />
                            ) : fulfillment === 'delivery' && freeFrom > 0 && subtotal < freeFrom ? (
                                <Progress
                                    label={`₱${(freeFrom - subtotal).toLocaleString()} more for free delivery`}
                                    value={subtotal / freeFrom}
                                    tone="accent"
                                />
                            ) : fulfillment === 'delivery' && freeFrom > 0 ? (
                                <p className="text-sm font-semibold text-shop-success">Free delivery unlocked. Hatid na!</p>
                            ) : (
                                <RouteLine className="h-4 opacity-80" />
                            )}
                            <div className="bc-tear my-3.5" />
                            <dl className="space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-shop-muted">
                                        Subtotal · {count} item{count !== 1 ? 's' : ''}
                                    </dt>
                                    <dd className="font-semibold">
                                        <Price value={subtotal} />
                                    </dd>
                                </div>
                                {fulfillment === 'delivery' && (
                                    <div className="flex justify-between">
                                        <dt className="text-shop-muted">Delivery fee</dt>
                                        <dd className="font-semibold">
                                            {fee === 0 ? <span className="text-shop-success">Free</span> : <Price value={fee} />}
                                        </dd>
                                    </div>
                                )}
                                <div className="flex justify-between pt-1.5 text-base">
                                    <dt className="font-semibold">Estimated total</dt>
                                    <dd className="font-display text-lg font-bold">
                                        <Price value={total} />
                                    </dd>
                                </div>
                            </dl>
                            <p className="mt-1 text-xs text-shop-muted">Promos and points are applied at checkout.</p>
                        </div>
                    </div>

                    <div className="border-t border-shop-line px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:pb-5">
                        {!isOpen && (
                            <p className="mb-2 rounded-xl bg-shop-warning-soft px-3 py-2 text-sm text-shop-warning">
                                {closedReason ?? 'We are closed for online orders right now.'}
                            </p>
                        )}
                        <ShopButton size="lg" block disabled={!isOpen || minLeft > 0} onClick={onCheckout} className="justify-between">
                            <span>Go to checkout</span>
                            <Price value={total} />
                        </ShopButton>
                    </div>
                </>
            )}
        </div>
    );
}

function Progress({ label, value, tone }: { label: string; value: number; tone: 'warning' | 'accent' }) {
    const pct = Math.max(4, Math.min(100, value * 100));
    return (
        <div>
            <p className={cn('text-sm font-semibold', tone === 'warning' ? 'text-shop-warning' : 'text-shop-accent-ink')}>{label}</p>
            <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-shop-surface"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className="h-full rounded-full bg-shop-accent transition-[width] duration-500 ease-shop" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** Phones: bottom sheet. Tablets: right sheet. */
export function CartSheet({ open, onOpenChange, ...panel }: Omit<Props, 'variant'> & { open: boolean; onOpenChange: (o: boolean) => void }) {
    const isTablet = useMediaQuery('(min-width: 640px)');
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isTablet ? 'right' : 'bottom'}
                className={cn(
                    'bc-shop flex flex-col gap-0 border-shop-line bg-shop-surface p-0',
                    isTablet ? 'w-full sm:max-w-md' : 'h-[88dvh] rounded-t-[28px]',
                )}
            >
                {!isTablet && <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-shop-line" aria-hidden />}
                <SheetTitle className="sr-only">Your order</SheetTitle>
                <SheetDescription className="sr-only">Review the items in your cart</SheetDescription>
                <CartPanel {...panel} variant="sheet" />
            </SheetContent>
        </Sheet>
    );
}
