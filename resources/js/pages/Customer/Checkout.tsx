import { Link, router, usePage } from '@inertiajs/react';
import { AlertCircle, ArrowLeft, Bike, Check, ChevronRight, Gift, Loader2, MapPin, Plus, RefreshCw, ShoppingBag, Store, Tag, Wallet, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { formatPhone, inputCls } from '@/components/storefront/AuthForms';
import MapThumb from '@/components/storefront/MapThumb';
import { Price, RouteLine, ShopButton, Skeleton } from '@/components/storefront/ui';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useBranchLabel, useRewardsName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import type { CustomerSession, DeliveryZone, SavedAddress, StoreStatus} from '@/lib/customer';
import { jsonRequest, useCart } from '@/lib/customer';
import { cn } from '@/lib/utils';

const AddressPicker = lazy(() => import('@/components/storefront/AddressPicker'));

interface Quote {
    fulfillment_type: 'delivery' | 'pickup';
    lines: { product_id: number; product_variant_id: number | null; name: string; variant: string | null; price: number; quantity: number; total: number; note: string | null }[];
    subtotal: number;
    promo: { id: number; label: string; code: string | null; discount: number } | null;
    promo_error: string | null;
    vat: number;
    loyalty: { enabled: boolean; balance: number; minimum: number; maximum: number; peso_per_point: number; points_to_redeem: number; discount: number; points_to_earn: number; error: string | null };
    delivery_fee: number;
    free_delivery_min: number;
    min_order: number;
    total: number;
    errors: string[];
    can_checkout: boolean;
}

interface PageProps {
    addresses: SavedAddress[];
    zone: DeliveryZone;
    barangays: string[];
    store: {
        status: StoreStatus;
        settings: { delivery_enabled: boolean; pickup_enabled: boolean; delivery_fee: number; prep_minutes: number; delivery_minutes: number; min_order: number };
        branch: { name: string; location: string; address: string | null } | null;
    };
    contact: { name: string; contact_number: string | null };
    customer: CustomerSession;
    flash?: { saved_address_id?: number | null };
    [key: string]: unknown;
}

export default function Checkout() {
    const { props } = usePage<PageProps>();
    return (
        <CustomerLayout title="Checkout" barangays={props.barangays} hideBottomNav wide>
            <CheckoutBody />
        </CustomerLayout>
    );
}

function CheckoutBody() {
    const { props } = usePage<PageProps>();
    const { addresses, zone, barangays, store, contact, customer } = props;
    const cart = useCart(customer.id);
    const branchLabel = useBranchLabel(store.branch?.location);
    const rewardsName = useRewardsName();

    const initialFulfillment = (() => {
        const q = new URLSearchParams(window.location.search).get('fulfillment');
        if (q === 'pickup' && store.settings.pickup_enabled) return 'pickup' as const;
        return store.settings.delivery_enabled ? ('delivery' as const) : ('pickup' as const);
    })();

    const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>(initialFulfillment);
    const [addressId, setAddressId] = useState<number | null>(addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? null);
    const [addressListOpen, setAddressListOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [promoInput, setPromoInput] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [usePoints, setUsePoints] = useState(false);
    const [points, setPoints] = useState(0);
    const [note, setNote] = useState('');
    const [mobile, setMobile] = useState(formatPhone(contact.contact_number ?? ''));
    const [quote, setQuote] = useState<Quote | null>(null);
    const [quoting, setQuoting] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const [placing, setPlacing] = useState(false);
    const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const saved = props.flash?.saved_address_id;
        if (saved && addresses.some((a) => a.id === saved)) setAddressId(saved);
        else if (!addressId && addresses.length) setAddressId(addresses.find((a) => a.is_default)?.id ?? addresses[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addresses]);

    const address = addresses.find((a) => a.id === addressId) ?? null;
    const items = useMemo(() => cart.lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, note: l.note || null })), [cart.lines]);
    const requestedPoints = usePoints ? points : 0;

    // ── Live server quote (debounced) ──
    useEffect(() => {
        if (!items.length) {
            setQuote(null);
            return;
        }
        const t = window.setTimeout(async () => {
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            setQuoting(true);
            setQuoteError(null);
            try {
                setQuote(
                    await jsonRequest<Quote>('/checkout/quote', {
                        method: 'POST',
                        body: { items, fulfillment_type: fulfillment, promo_code: promoCode || null, loyalty_points: requestedPoints },
                        signal: ctrl.signal,
                    }),
                );
            } catch (e) {
                if ((e as Error).name !== 'AbortError') setQuoteError(navigator.onLine ? (e as Error).message || 'We could not price your order.' : 'You seem to be offline.');
            } finally {
                if (!ctrl.signal.aborted) setQuoting(false);
            }
        }, 300);
        return () => window.clearTimeout(t);
    }, [items, fulfillment, promoCode, requestedPoints, retry]);

    const loyaltyMax = quote
        ? Math.max(0, Math.min(quote.loyalty.balance, quote.loyalty.maximum || quote.loyalty.balance, Math.floor((quote.subtotal - (quote.promo?.discount ?? 0)) / quote.loyalty.peso_per_point)))
        : 0;
    const canUsePoints = !!quote?.loyalty.enabled && loyaltyMax >= (quote?.loyalty.minimum ?? 1);

    useEffect(() => {
        if (quote && usePoints && points === 0) setPoints(loyaltyMax);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [usePoints, quote?.loyalty.balance]);

    const needsAddress = fulfillment === 'delivery' && !address;
    const canPlace = !!quote && quote.can_checkout && !quoting && !placing && store.status.is_open && !needsAddress && !quote.loyalty.error;
    const ctaLabel = needsAddress ? 'Add a delivery address' : !store.status.is_open ? 'Closed for online orders' : quote && !quote.can_checkout ? 'Check your order' : 'Place order';

    const placeOrder = () => {
        if (needsAddress) {
            setPickerOpen(true);
            return;
        }
        if (!canPlace) return;
        setPlacing(true);
        setServerErrors({});
        router.post(
            '/checkout',
            {
                items,
                fulfillment_type: fulfillment,
                address_id: fulfillment === 'delivery' ? addressId : null,
                promo_code: promoCode || null,
                loyalty_points: requestedPoints,
                customer_note: note || null,
                contact_number: mobile || null,
            },
            {
                onSuccess: (page) => {
                    if (String(page.url).startsWith('/account/orders/')) cart.clear();
                },
                onError: (errs) => setServerErrors(errs as Record<string, string>),
                onFinish: () => setPlacing(false),
            },
        );
    };

    if (!cart.lines.length) {
        return (
            <div className="flex flex-col items-center px-6 py-24 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-shop-accent-soft text-shop-accent-ink">
                    <ShoppingBag className="h-7 w-7" />
                </span>
                <h1 className="font-display mt-4 text-2xl font-bold">Your order is empty</h1>
                <p className="mt-1 text-shop-muted">Add something from the menu first.</p>
                <Link href="/" className="bc-press mt-6 inline-flex h-12 items-center rounded-2xl bg-shop-accent px-6 font-semibold text-shop-on-accent">
                    Browse the menu
                </Link>
            </div>
        );
    }

    const cartErrors = [...(quote?.errors ?? []), ...(serverErrors.cart ? [serverErrors.cart] : [])];
    const generalErrors = Object.entries(serverErrors)
        .filter(([k]) => !['address_id', 'promo_code', 'loyalty_points', 'cart'].includes(k))
        .map(([, v]) => v);
    const hasPoints = !!quote?.loyalty.enabled;

    return (
        <div className="px-4 pt-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:px-6 lg:pt-8 lg:pb-16">
            <div className="mb-5 flex items-center gap-3">
                <Link href="/" className="bc-press flex h-11 w-11 items-center justify-center rounded-full bg-shop-surface ring-1 ring-shop-line" aria-label="Back to menu">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                    <h1 className="font-display text-[28px] leading-none font-bold">Checkout</h1>
                    <p className="mt-1 text-sm text-shop-muted">{branchLabel}</p>
                </div>
            </div>

            {!store.status.is_open && <Notice tone="warning">{store.status.message ?? 'We are closed for online orders right now.'}</Notice>}
            {generalErrors.map((e, i) => (
                <Notice key={i} tone="danger">
                    {e}
                </Notice>
            ))}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
                <ol className="min-w-0 space-y-4">
                    <Step n={1} title="How do you want it?">
                        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery or pickup">
                            {(['delivery', 'pickup'] as const).map((f) => {
                                const enabled = f === 'delivery' ? store.settings.delivery_enabled : store.settings.pickup_enabled;
                                const Icon = f === 'delivery' ? Bike : Store;
                                const on = fulfillment === f;
                                const s = store.settings;
                                return (
                                    <button
                                        key={f}
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        disabled={!enabled}
                                        onClick={() => setFulfillment(f)}
                                        className={cn(
                                            'bc-press flex cursor-pointer flex-col items-start gap-2 rounded-2xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40',
                                            on ? 'border-shop-accent bg-shop-accent-soft/50 ring-2 ring-shop-accent/20' : 'border-shop-line hover:bg-shop-sunken',
                                        )}
                                    >
                                        <Icon className={cn('h-6 w-6', on ? 'text-shop-accent-ink' : 'text-shop-muted')} />
                                        <span className="font-semibold">{f === 'delivery' ? 'Delivery' : 'Pickup'}</span>
                                        <span className="text-xs text-shop-muted">
                                            {f === 'delivery'
                                                ? `${s.prep_minutes + s.delivery_minutes}–${s.prep_minutes + s.delivery_minutes + 15} min · ₱${s.delivery_fee}`
                                                : `Ready in ~${s.prep_minutes} min · free`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Step>

                    <Step n={2} title={fulfillment === 'delivery' ? 'Deliver to' : 'Pick up at'} error={serverErrors.address_id}>
                        {fulfillment === 'delivery' ? (
                            address ? (
                                <button
                                    type="button"
                                    onClick={() => setAddressListOpen(true)}
                                    className="bc-press flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-shop-line p-2 pr-3 text-left hover:bg-shop-sunken"
                                >
                                    <MapThumb lat={address.lat} lng={address.lng} className="h-20 w-24 shrink-0 rounded-xl" label={`Map of ${address.summary}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold">
                                            {address.label} <span className="font-normal text-shop-muted">· {address.barangay}</span>
                                        </p>
                                        <p className="truncate text-sm text-shop-muted">{address.summary}</p>
                                        {address.landmark && <p className="truncate text-xs text-shop-muted">Landmark: {address.landmark}</p>}
                                    </div>
                                    <span className="text-sm font-semibold text-shop-accent-ink">Change</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setPickerOpen(true)}
                                    className="bc-press flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-shop-accent/50 bg-shop-accent-soft/40 font-semibold text-shop-accent-ink"
                                >
                                    <MapPin className="h-6 w-6" />
                                    Pin your address on the map
                                </button>
                            )
                        ) : (
                            <div className="flex items-start gap-3 rounded-2xl bg-shop-sunken p-4">
                                <Store className="mt-0.5 h-5 w-5 text-shop-accent-ink" />
                                <div>
                                    <p className="font-semibold">{branchLabel}</p>
                                    <p className="text-sm text-shop-muted">{store.branch?.address ?? 'Mabinay, Negros Oriental'}</p>
                                </div>
                            </div>
                        )}
                    </Step>

                    <Step n={3} title="Contact">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-shop-sunken px-4 py-3">
                                <p className="text-xs text-shop-muted">Name</p>
                                <p className="font-semibold">{contact.name}</p>
                            </div>
                            <label className="block">
                                <span className="mb-1 block text-xs text-shop-muted">Mobile for this order</span>
                                <input value={mobile} onChange={(e) => setMobile(formatPhone(e.target.value))} inputMode="tel" autoComplete="tel" className={inputCls} />
                            </label>
                        </div>
                    </Step>

                    <Step
                        n={4}
                        title="Your items"
                        action={
                            <Link href="/" className="text-sm font-semibold text-shop-accent-ink">
                                Edit
                            </Link>
                        }
                    >
                        {quote ? (
                            <ul className="divide-y divide-shop-line">
                                {quote.lines.map((l, i) => (
                                    <li key={i} className="flex gap-3 py-2.5">
                                        <span className="w-8 shrink-0 font-semibold text-shop-accent-ink tabular-nums">{l.quantity}×</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium">{l.name}</p>
                                            {l.variant && <p className="text-sm text-shop-muted">{l.variant}</p>}
                                            {l.note && <p className="text-xs text-shop-muted italic">“{l.note}”</p>}
                                        </div>
                                        <Price value={l.total} className="font-semibold" />
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-3/4" />
                                <Skeleton className="h-5 w-1/2" />
                            </div>
                        )}
                        {cartErrors.map((e, i) => (
                            <InlineError key={i}>{e}</InlineError>
                        ))}
                    </Step>

                    <Step n={5} title="Promo code" icon={Tag} error={promoCode ? (serverErrors.promo_code ?? quote?.promo_error ?? undefined) : undefined}>
                        {quote?.promo && (
                            <div className="mb-3 flex items-center justify-between rounded-2xl bg-shop-success-soft px-4 py-3 text-sm text-shop-success">
                                <span className="flex items-center gap-2 font-semibold">
                                    <Check className="h-4 w-4" /> {quote.promo.label} · −<Price value={quote.promo.discount} />
                                </span>
                                {promoCode && (
                                    <button
                                        type="button"
                                        className="cursor-pointer"
                                        onClick={() => {
                                            setPromoCode('');
                                            setPromoInput('');
                                        }}
                                        aria-label="Remove promo code"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        )}
                        <form
                            className="flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                setPromoCode(promoInput.trim().toUpperCase());
                            }}
                        >
                            <input
                                value={promoInput}
                                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                                placeholder="e.g. WELCOME50"
                                aria-label="Promo code"
                                className={cn(inputCls, 'min-w-0 flex-1 font-mono uppercase')}
                            />
                            <ShopButton type="submit" variant="secondary" disabled={!promoInput.trim()}>
                                Apply
                            </ShopButton>
                        </form>
                    </Step>

                    {hasPoints && quote && (
                        <Step n={6} title={rewardsName} icon={Gift} error={serverErrors.loyalty_points ?? quote.loyalty.error ?? undefined}>
                            <div className="flex items-center justify-between gap-3">
                                <span>
                                    <span className="block font-semibold">Pay with points</span>
                                    <span className="text-sm text-shop-muted">
                                        {quote.loyalty.balance.toLocaleString()} pts available · 1 pt = ₱{quote.loyalty.peso_per_point}
                                    </span>
                                </span>
                                <Switch
                                    checked={usePoints}
                                    disabled={!canUsePoints}
                                    onChange={(v) => {
                                        setUsePoints(v);
                                        if (!v) setPoints(0);
                                    }}
                                    label="Pay with points"
                                />
                            </div>
                            {!canUsePoints && <p className="mt-2 text-xs text-shop-muted">You can redeem once you have at least {quote.loyalty.minimum} points.</p>}
                            {usePoints && canUsePoints && (
                                <div className="mt-4 rounded-2xl bg-shop-sunken p-4">
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-sm text-shop-muted">Using</span>
                                        <span className="font-display text-xl font-bold tabular-nums">{quote.loyalty.points_to_redeem.toLocaleString()} pts</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={quote.loyalty.minimum}
                                        max={loyaltyMax}
                                        value={Math.min(Math.max(points, quote.loyalty.minimum), loyaltyMax)}
                                        onChange={(e) => setPoints(Number(e.target.value))}
                                        className="mt-3 w-full accent-shop-accent"
                                        aria-label="Points to use"
                                    />
                                    <p className="mt-1 text-sm">
                                        Saves you <span className="font-semibold text-shop-success">₱{quote.loyalty.discount.toFixed(2)}</span>
                                    </p>
                                </div>
                            )}
                            {quote.loyalty.points_to_earn > 0 && (
                                <p className="mt-3 text-sm text-shop-muted">
                                    You’ll earn{' '}
                                    <span className="font-semibold text-shop-ink">
                                        {quote.loyalty.points_to_earn} point{quote.loyalty.points_to_earn === 1 ? '' : 's'}
                                    </span>{' '}
                                    when this order is completed.
                                </p>
                            )}
                        </Step>
                    )}

                    <Step n={hasPoints ? 7 : 6} title="Note to the café" optional>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value.slice(0, 500))}
                            placeholder="Extra ketchup, ring the doorbell twice…"
                            rows={3}
                            aria-label="Note to the café"
                            className={cn(inputCls, 'h-auto resize-none py-3')}
                        />
                    </Step>

                    <Step n={hasPoints ? 8 : 7} title="Payment" icon={Wallet}>
                        <div className="flex items-center gap-3 rounded-2xl border border-shop-accent bg-shop-accent-soft/40 px-4 py-3.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-shop-accent">
                                <span className="h-2 w-2 rounded-full bg-shop-on-accent" />
                            </span>
                            <span className="font-semibold">{fulfillment === 'delivery' ? 'Cash on delivery' : 'Pay at pickup (cash, GCash or card)'}</span>
                        </div>
                        <p className="mt-2 text-xs text-shop-muted">Online payment with GCash is coming soon.</p>
                    </Step>
                </ol>

                <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="Order summary">
                    <Summary quote={quote} quoting={quoting} fulfillment={fulfillment} />
                    {quoteError && (
                        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-shop-danger-soft px-4 py-3 text-sm text-shop-danger" role="alert">
                            {quoteError}
                            <button type="button" onClick={() => setRetry((r) => r + 1)} className="flex cursor-pointer items-center gap-1 font-semibold">
                                <RefreshCw className="h-4 w-4" /> Retry
                            </button>
                        </div>
                    )}
                    <div className="mt-4 hidden lg:block">
                        <ShopButton size="lg" block onClick={placeOrder} disabled={!needsAddress && !canPlace} loading={placing} className="justify-between">
                            <span>{ctaLabel}</span>
                            {quote && <Price value={quote.total} />}
                        </ShopButton>
                        <p className="mt-2 text-center text-xs text-shop-muted">You can cancel until the café confirms your order.</p>
                    </div>
                </aside>
            </div>

            {/* Phone pay bar */}
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-shop-line bg-shop-bg/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
                <div className="mx-auto flex max-w-xl items-center gap-3">
                    <div className="min-w-0">
                        <p className="text-xs text-shop-muted">Total</p>
                        <p className="font-display text-xl leading-tight font-bold">{quote ? <Price value={quote.total} /> : '—'}</p>
                    </div>
                    <ShopButton size="lg" className="flex-1" onClick={placeOrder} disabled={!needsAddress && !canPlace} loading={placing || quoting}>
                        {ctaLabel}
                    </ShopButton>
                </div>
            </div>

            {/* Saved addresses */}
            <Sheet open={addressListOpen} onOpenChange={setAddressListOpen}>
                <SheetContent side="bottom" className="bc-shop max-h-[85dvh] overflow-y-auto rounded-t-[28px] border-shop-line bg-shop-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg">
                    <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-shop-line" aria-hidden />
                    <SheetTitle className="font-display text-2xl font-bold">Deliver to</SheetTitle>
                    <SheetDescription className="mb-4 text-shop-muted">Choose one of your saved Mabinay addresses.</SheetDescription>
                    <div className="space-y-2">
                        {addresses.map((a) => (
                            <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                    setAddressId(a.id);
                                    setAddressListOpen(false);
                                }}
                                className={cn(
                                    'bc-press flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-2 pr-4 text-left',
                                    a.id === addressId ? 'border-shop-accent bg-shop-accent-soft/40' : 'border-shop-line hover:bg-shop-sunken',
                                )}
                            >
                                <MapThumb lat={a.lat} lng={a.lng} className="h-16 w-16 shrink-0 rounded-xl" zoom={15} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold">
                                        {a.label}
                                        {a.is_default && <span className="ml-2 rounded-full bg-shop-sunken px-2 py-0.5 text-xs font-medium">Default</span>}
                                    </p>
                                    <p className="truncate text-sm text-shop-muted">{a.summary}</p>
                                </div>
                                {a.id === addressId && <Check className="h-5 w-5 text-shop-accent-ink" />}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setAddressListOpen(false);
                                setPickerOpen(true);
                            }}
                            className="bc-press flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-shop-line font-semibold text-shop-accent-ink"
                        >
                            <Plus className="h-5 w-5" /> Add a new address
                        </button>
                        <Link href="/account" className="flex items-center justify-center gap-1 py-2 text-sm font-medium text-shop-muted">
                            Manage addresses <ChevronRight className="h-4 w-4" />
                        </Link>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Map picker */}
            <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
                <SheetContent side="bottom" showCloseButton={false} className="bc-shop h-dvh gap-0 border-shop-line bg-shop-surface p-0 sm:mx-auto sm:h-[90dvh] sm:max-w-2xl sm:rounded-t-[28px]">
                    <SheetTitle className="sr-only">Pin your delivery location</SheetTitle>
                    <SheetDescription className="sr-only">Move the map so the pin sits on your house.</SheetDescription>
                    {pickerOpen && (
                        <Suspense
                            fallback={
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-shop-accent" />
                                </div>
                            }
                        >
                            <AddressPicker zone={zone} barangays={barangays} onClose={() => setPickerOpen(false)} onSaved={() => setPickerOpen(false)} />
                        </Suspense>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function Summary({ quote, quoting, fulfillment }: { quote: Quote | null; quoting: boolean; fulfillment: 'delivery' | 'pickup' }) {
    return (
        <div className="bc-ticket rounded-[26px] bg-shop-surface p-5 shadow-shop-md ring-1 ring-shop-line" style={{ ['--ticket-cut' as string]: '30%' }}>
            <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Summary</h2>
                {quoting && <Loader2 className="h-4 w-4 animate-spin text-shop-muted" aria-label="Updating" />}
            </div>
            <RouteLine className="mt-3 h-4" />
            <div className="bc-tear my-4" />
            {quote ? (
                <dl className="space-y-2 text-[15px]" aria-live="polite">
                    <Row label="Subtotal" value={<Price value={quote.subtotal} />} />
                    {quote.promo && (
                        <Row
                            label={`Promo · ${quote.promo.label}`}
                            value={
                                <span className="text-shop-success">
                                    −<Price value={quote.promo.discount} />
                                </span>
                            }
                        />
                    )}
                    {quote.vat > 0 && <Row label="VAT" value={<Price value={quote.vat} />} />}
                    {quote.loyalty.discount > 0 && (
                        <Row
                            label={`Points · ${quote.loyalty.points_to_redeem}`}
                            value={
                                <span className="text-shop-success">
                                    −<Price value={quote.loyalty.discount} />
                                </span>
                            }
                        />
                    )}
                    {fulfillment === 'delivery' && (
                        <Row label="Delivery fee" value={quote.delivery_fee > 0 ? <Price value={quote.delivery_fee} /> : <span className="text-shop-success">Free</span>} />
                    )}
                    <div className="mt-2 flex items-end justify-between border-t border-shop-line pt-3">
                        <dt className="font-semibold">Total</dt>
                        <dd className="font-display text-[28px] leading-none font-bold">
                            <Price value={quote.total} />
                        </dd>
                    </div>
                    {fulfillment === 'delivery' && quote.free_delivery_min > 0 && quote.delivery_fee > 0 && quote.subtotal < quote.free_delivery_min && (
                        <p className="pt-1 text-xs text-shop-muted">Add ₱{(quote.free_delivery_min - quote.subtotal).toLocaleString()} more for free delivery.</p>
                    )}
                </dl>
            ) : (
                <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-8 w-1/2" />
                </div>
            )}
        </div>
    );
}

function Step({
    n,
    title,
    children,
    icon: Icon,
    error,
    optional,
    action,
}: {
    n: number;
    title: string;
    children: React.ReactNode;
    icon?: React.ElementType;
    error?: string;
    optional?: boolean;
    action?: React.ReactNode;
}) {
    return (
        <li className={cn('rounded-[24px] bg-shop-surface p-4 ring-1 sm:p-5', error ? 'ring-shop-danger/50' : 'ring-shop-line')}>
            <div className="mb-3.5 flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-shop-ink text-xs font-bold text-shop-bg tabular-nums">{n}</span>
                <h2 className="font-display flex flex-1 items-center gap-2 text-lg font-semibold">
                    {title}
                    {Icon && <Icon className="h-4 w-4 text-shop-muted" />}
                    {optional && <span className="text-sm font-normal text-shop-muted">(optional)</span>}
                </h2>
                {action}
            </div>
            {children}
            {error && <InlineError>{error}</InlineError>}
        </li>
    );
}

function InlineError({ children }: { children: React.ReactNode }) {
    return (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-shop-danger-soft px-3 py-2.5 text-sm text-shop-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{children}</span>
        </p>
    );
}

function Notice({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
    return (
        <div className={cn('mb-4 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm', tone === 'warning' ? 'bg-shop-warning-soft text-shop-warning' : 'bg-shop-danger-soft text-shop-danger')} role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{children}</span>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="truncate text-shop-muted">{label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
        </div>
    );
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
                checked ? 'bg-shop-accent' : 'bg-shop-line',
            )}
        >
            <span className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-shop', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
        </button>
    );
}
