import { Link, router } from '@inertiajs/react';
import { ArrowLeft, Bike, Check, ChefHat, CircleX, Clock3, Gift, Loader2, PackageCheck, Phone, ReceiptText, Store } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import MapThumb from '@/components/storefront/MapThumb';
import { Pill, Price, RouteLine, ShopButton, STATUS_PILL } from '@/components/storefront/ui';
import { useRewardsName } from '@/hooks/use-business-name';
import CustomerLayout from '@/layouts/CustomerLayout';
import { jsonRequest, manilaTime } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface TrackedOrder {
    order_number: string;
    status: string;
    status_label: string;
    is_active: boolean;
    can_cancel: boolean;
    fulfillment_type: 'delivery' | 'pickup';
    payment_method: string;
    subtotal: number;
    promo_label: string | null;
    promo_discount: number;
    vat_amount: number;
    loyalty_points_redeemed: number;
    loyalty_discount: number;
    loyalty_points_to_earn: number;
    delivery_fee: number;
    total: number;
    contact_name: string;
    contact_number: string;
    address: string | null;
    landmark: string | null;
    notes_for_rider: string | null;
    lat: number | null;
    lng: number | null;
    customer_note: string | null;
    cancel_reason: string | null;
    cancelled_by: string | null;
    estimated_ready_at: string | null;
    created_at: string;
    updated_at: string;
    branch: { name: string | null; phone: string | null; address: string | null };
    steps: { key: string; label: string; at: string | null }[];
    items: { id: number; name: string; variant: string | null; quantity: number; price: number; total: number; note: string | null }[];
}

const STEP_ICON: Record<string, React.ElementType> = {
    pending: ReceiptText,
    accepted: Check,
    preparing: ChefHat,
    ready: PackageCheck,
    out_for_delivery: Bike,
    completed: Check,
};

const HEADLINE: Record<string, string> = {
    pending: 'Sending your order to the café…',
    accepted: 'Confirmed — salamat!',
    preparing: 'Your food is on the grill',
    ready: 'Packed and ready',
    out_for_delivery: 'Hatid na! Your rider is on the way',
    completed: 'Enjoy your meal!',
    cancelled: 'This order was cancelled',
    rejected: 'Sorry, the café couldn’t take this order',
};

export default function OrderTrack({ order: initial }: { order: TrackedOrder }) {
    const rewardsName = useRewardsName();
    const [order, setOrder] = useState(initial);
    const [updatedAt, setUpdatedAt] = useState(Date.now());
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState('');
    const prevStatus = useRef(initial.status);

    useEffect(() => setOrder(initial), [initial]);

    // ── Live updates: poll every 10s while active; pause when the tab is hidden ──
    useEffect(() => {
        if (!order.is_active) return;
        let timer: number | undefined;
        const tick = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const fresh = await jsonRequest<TrackedOrder>(`/account/orders/${order.order_number}/status`);
                    setOrder(fresh);
                    setUpdatedAt(Date.now());
                    if (fresh.status !== prevStatus.current && 'vibrate' in navigator) navigator.vibrate?.(120);
                    prevStatus.current = fresh.status;
                } catch {
                    /* keep last known state; retry next tick */
                }
            }
            timer = window.setTimeout(tick, 10000);
        };
        timer = window.setTimeout(tick, 10000);
        const onVisible = () => document.visibilityState === 'visible' && tick();
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [order.is_active, order.order_number]);

    const failed = order.status === 'cancelled' || order.status === 'rejected';
    const currentIndex = Math.max(0, order.steps.findIndex((s) => s.key === order.status));
    const progress = order.steps.length > 1 ? currentIndex / (order.steps.length - 1) : 0;
    const eta = order.estimated_ready_at ? manilaTime(order.estimated_ready_at) : null;

    const cancel = () => {
        setCancelling(true);
        router.post(
            `/account/orders/${order.order_number}/cancel`,
            { reason: reason || null },
            {
                preserveScroll: true,
                onFinish: () => {
                    setCancelling(false);
                    setCancelOpen(false);
                },
            },
        );
    };

    return (
        <CustomerLayout title={`Order ${order.order_number}`}>
            <div className="mx-auto max-w-5xl px-4 pt-4 lg:px-6 lg:pt-8">
                <Link href="/account/orders" className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-shop-muted hover:text-shop-ink">
                    <ArrowLeft className="h-4 w-4" /> My orders
                </Link>

                <div className="mt-2 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="space-y-5">
                        {/* Status hero */}
                        <section className={cn('overflow-hidden rounded-[28px] p-5 sm:p-7', failed ? 'bg-shop-danger-soft' : 'bg-shop-surface shadow-shop-md ring-1 ring-shop-line')}>
                            <div className="flex flex-wrap items-center gap-2">
                                <Pill tone={STATUS_PILL[order.status] ?? 'neutral'}>{order.status_label}</Pill>
                                <span className="font-mono text-xs text-shop-muted">{order.order_number}</span>
                            </div>
                            <h1 className="font-display mt-3 text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.05] font-bold text-balance" aria-live="polite">
                                {HEADLINE[order.status] ?? order.status_label}
                            </h1>
                            {!failed && order.is_active && eta && (
                                <p className="mt-2 flex items-center gap-2 text-base">
                                    <Clock3 className="h-5 w-5 text-shop-accent-ink" />
                                    {order.fulfillment_type === 'delivery' ? 'Arriving around' : 'Ready around'} <span className="font-display text-xl font-bold">{eta}</span>
                                </p>
                            )}
                            {failed && order.cancel_reason && <p className="mt-2 text-shop-danger">Reason: {order.cancel_reason}</p>}

                            {!failed && (
                                <div className="mt-6">
                                    <RouteLine progress={progress} animate className="h-8" />
                                    <div className="mt-1 flex justify-between text-[11px] font-medium tracking-[0.12em] text-shop-muted uppercase">
                                        <span>Café</span>
                                        <span>{order.fulfillment_type === 'delivery' ? 'Your door' : 'Pickup counter'}</span>
                                    </div>
                                </div>
                            )}

                            {order.is_active && (
                                <p className="mt-4 flex items-center gap-2 text-xs text-shop-muted">
                                    <span className="relative flex h-2 w-2 text-shop-success">
                                        <span className="bc-pulse absolute inset-0 rounded-full" />
                                        <span className="relative h-2 w-2 rounded-full bg-current" />
                                    </span>
                                    Live · updated {new Date(updatedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                                </p>
                            )}
                        </section>

                        {/* Stepper */}
                        {!failed && (
                            <section className="rounded-[24px] bg-shop-surface p-5 ring-1 ring-shop-line" aria-label="Order progress">
                                <ol>
                                    {order.steps.map((s, i) => {
                                        const done = i <= currentIndex;
                                        const current = i === currentIndex && order.is_active;
                                        const Icon = STEP_ICON[s.key] ?? Check;
                                        return (
                                            <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
                                                {i < order.steps.length - 1 && (
                                                    <span className={cn('absolute top-10 left-4.75 h-[calc(100%-2.5rem)] w-0.5', i < currentIndex ? 'bg-shop-accent' : 'bg-shop-line')} aria-hidden />
                                                )}
                                                <span
                                                    className={cn(
                                                        'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                                        done ? 'bg-shop-accent text-shop-on-accent' : 'bg-shop-sunken text-shop-muted',
                                                        current && 'ring-4 ring-shop-accent/25',
                                                    )}
                                                >
                                                    {current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                                                </span>
                                                <div className="pt-2">
                                                    <p className={cn('font-semibold', !done && 'text-shop-muted')}>{s.label}</p>
                                                    {s.at && <p className="text-sm text-shop-muted">{manilaTime(s.at)}</p>}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ol>
                            </section>
                        )}

                        {/* Where */}
                        <section className="overflow-hidden rounded-[24px] bg-shop-surface ring-1 ring-shop-line">
                            {order.fulfillment_type === 'delivery' && order.lat && order.lng && (
                                <MapThumb lat={order.lat} lng={order.lng} className="h-36 w-full" label="Map of the delivery address" />
                            )}
                            <div className="p-5">
                                {order.fulfillment_type === 'delivery' ? (
                                    <>
                                        <p className="text-xs font-semibold tracking-[0.14em] text-shop-muted uppercase">Delivering to</p>
                                        <p className="mt-1 font-semibold">{order.address}</p>
                                        {order.landmark && <p className="text-sm text-shop-muted">Landmark: {order.landmark}</p>}
                                        {order.notes_for_rider && <p className="text-sm text-shop-muted">Note: {order.notes_for_rider}</p>}
                                    </>
                                ) : (
                                    <div className="flex gap-3">
                                        <Store className="mt-0.5 h-5 w-5 text-shop-accent-ink" />
                                        <div>
                                            <p className="font-semibold">Pick up at {order.branch.name}</p>
                                            <p className="text-sm text-shop-muted">{order.branch.address}</p>
                                        </div>
                                    </div>
                                )}
                                {order.branch.phone && (
                                    <a href={`tel:${order.branch.phone}`} className="bc-press mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl border border-shop-line font-semibold hover:bg-shop-sunken">
                                        <Phone className="h-4 w-4" /> Call the café
                                    </a>
                                )}
                            </div>
                        </section>
                    </div>

                    {/* Receipt */}
                    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                        <section className="bc-ticket rounded-[26px] bg-shop-surface p-5 shadow-shop-md ring-1 ring-shop-line" style={{ ['--ticket-cut' as string]: '22%' }}>
                            <div className="flex items-center justify-between">
                                <h2 className="font-display text-lg font-bold">Receipt</h2>
                                <span className="font-mono text-xs text-shop-muted">{manilaTime(order.created_at, true)}</span>
                            </div>
                            <p className="mt-1 font-mono text-sm text-shop-muted">{order.order_number}</p>
                            <div className="bc-tear my-4" />
                            <ul className="space-y-2.5">
                                {order.items.map((i) => (
                                    <li key={i.id} className="flex gap-3 text-[15px]">
                                        <span className="w-7 shrink-0 font-semibold text-shop-accent-ink tabular-nums">{i.quantity}×</span>
                                        <div className="min-w-0 flex-1">
                                            <p>{i.name}</p>
                                            {i.variant && <p className="text-sm text-shop-muted">{i.variant}</p>}
                                            {i.note && <p className="text-xs text-shop-muted italic">“{i.note}”</p>}
                                        </div>
                                        <Price value={i.total} />
                                    </li>
                                ))}
                            </ul>
                            <dl className="mt-4 space-y-1.5 border-t border-dashed border-shop-line pt-4 text-sm">
                                <Line label="Subtotal" value={<Price value={order.subtotal} />} />
                                {order.promo_discount > 0 && <Line label={`Promo${order.promo_label ? ` · ${order.promo_label}` : ''}`} value={<>−<Price value={order.promo_discount} /></>} />}
                                {order.vat_amount > 0 && <Line label="VAT" value={<Price value={order.vat_amount} />} />}
                                {order.loyalty_discount > 0 && <Line label={`Points · ${order.loyalty_points_redeemed}`} value={<>−<Price value={order.loyalty_discount} /></>} />}
                                {order.fulfillment_type === 'delivery' && <Line label="Delivery" value={order.delivery_fee > 0 ? <Price value={order.delivery_fee} /> : 'Free'} />}
                                <div className="flex items-end justify-between pt-2">
                                    <dt className="font-semibold">{order.payment_method === 'cod' ? 'Pay the rider' : 'Pay at pickup'}</dt>
                                    <dd className="font-display text-2xl font-bold">
                                        <Price value={order.total} />
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        {order.loyalty_points_to_earn > 0 && !failed && (
                            <div className="flex items-center gap-3 rounded-2xl bg-shop-navy p-4 text-shop-navy-ink">
                                <Gift className="h-6 w-6 shrink-0 text-shop-accent" />
                                <p className="text-sm">
                                    {order.status === 'completed' ? (
                                        <>
                                            You earned <span className="font-bold">{order.loyalty_points_to_earn} points</span>. See you again!
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-bold">{order.loyalty_points_to_earn} points</span> will land in your {rewardsName} when this order is completed.
                                        </>
                                    )}
                                </p>
                            </div>
                        )}

                        {order.can_cancel &&
                            (cancelOpen ? (
                                <div className="space-y-3 rounded-2xl bg-shop-danger-soft p-4">
                                    <p className="font-semibold text-shop-danger">Cancel this order?</p>
                                    <input
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Reason (optional)"
                                        aria-label="Reason for cancelling"
                                        className="h-12 w-full rounded-2xl border border-shop-line bg-shop-surface px-4 text-base outline-none focus:border-shop-accent"
                                    />
                                    <div className="flex gap-2">
                                        <ShopButton variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
                                            Keep order
                                        </ShopButton>
                                        <ShopButton variant="danger" className="flex-1" onClick={cancel} loading={cancelling}>
                                            Yes, cancel
                                        </ShopButton>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <ShopButton variant="secondary" block onClick={() => setCancelOpen(true)} className="text-shop-danger">
                                        <CircleX className="h-4 w-4" /> Cancel order
                                    </ShopButton>
                                    <p className="mt-2 text-center text-xs text-shop-muted">You can cancel until the café confirms.</p>
                                </div>
                            ))}

                        {!order.is_active && (
                            <Link href="/" className="bc-press flex h-14 items-center justify-center rounded-2xl bg-shop-accent font-semibold text-shop-on-accent shadow-shop-md">
                                Order again
                            </Link>
                        )}
                    </aside>
                </div>
            </div>
        </CustomerLayout>
    );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-3">
            <dt className="truncate text-shop-muted">{label}</dt>
            <dd className="shrink-0 tabular-nums">{value}</dd>
        </div>
    );
}
