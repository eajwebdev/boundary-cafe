import { Link, router, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, Clock3, Gift, MapPin, Phone, Search, ShoppingBag, Store, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CartPanel, CartSheet } from '@/components/storefront/CartPanel';
import { CategoryChips, CategoryRail } from '@/components/storefront/CategoryNav';
import ProductCard from '@/components/storefront/ProductCard';
import ProductDetail from '@/components/storefront/ProductDetail';
import PromoRail from '@/components/storefront/PromoRail';
import { Pill, Price, RouteLine, useIsDesktop } from '@/components/storefront/ui';
import CustomerLayout, { useCustomerAuth } from '@/layouts/CustomerLayout';
import { CustomerSession, MenuProduct, StoreStatus, StorefrontPromo, useCart } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface PageProps {
    store: {
        name: string;
        logo: string | null;
        branch: { name: string; address: string | null; phone: string | null } | null;
        status: StoreStatus;
        settings: {
            delivery_fee: number;
            free_delivery_min: number;
            min_order: number;
            prep_minutes: number;
            delivery_minutes: number;
            delivery_enabled: boolean;
            pickup_enabled: boolean;
        };
    };
    categories: { id: number; name: string }[];
    products: MenuProduct[];
    storefrontPromos: StorefrontPromo[];
    loyaltyRules: { enabled: boolean; spend_per_point: number; birthday_bonus: number };
    activeOrder: { order_number: string; status: string; status_label: string; total: number } | null;
    customer: CustomerSession | null;
    barangays: string[];
    [key: string]: unknown;
}

const PENDING_ADD_KEY = 'bc-pending-add';
const FULFILLMENT_KEY = 'bc-fulfillment';

export default function Storefront() {
    const { props } = usePage<PageProps>();
    return (
        <CustomerLayout title="Order online" headerSlot={<AddressChip />} barangays={props.barangays} wide>
            <StorefrontBody />
        </CustomerLayout>
    );
}

function AddressChip() {
    const { props } = usePage<PageProps>();
    const { requireAuth } = useCustomerAuth();
    const place = props.customer?.barangay ? `${props.customer.barangay}, Mabinay` : 'Mabinay, Negros Oriental';
    const inner = (
        <>
            <MapPin className="h-4.5 w-4.5 shrink-0 text-shop-accent-ink" />
            <span className="min-w-0 text-left">
                <span className="block text-[11px] leading-none font-medium text-shop-muted">Deliver to</span>
                <span className="mt-0.5 flex items-center gap-0.5 text-sm leading-tight font-semibold">
                    <span className="truncate">{place}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-shop-muted" />
                </span>
            </span>
        </>
    );
    const cls = 'bc-press flex max-w-full cursor-pointer items-center gap-2 rounded-2xl px-2 py-1 hover:bg-shop-sunken';
    return props.customer ? (
        <Link href="/account" className={cls} aria-label={`Delivering to ${place}. Change address`}>
            {inner}
        </Link>
    ) : (
        <button type="button" className={cls} onClick={() => requireAuth('login')}>
            {inner}
        </button>
    );
}

function StorefrontBody() {
    const { props } = usePage<PageProps>();
    const { store, categories, products, storefrontPromos, loyaltyRules, activeOrder, customer } = props;
    const { requireAuth } = useCustomerAuth();
    const cart = useCart(customer?.id);
    const isDesktop = useIsDesktop();

    const [query, setQuery] = useState('');
    const [activeCat, setActiveCat] = useState<number | null>(categories[0]?.id ?? null);
    const [selected, setSelected] = useState<MenuProduct | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [cartOpen, setCartOpen] = useState(false);
    const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>(() => {
        try {
            const saved = window.sessionStorage.getItem(FULFILLMENT_KEY);
            if (saved === 'pickup' && store.settings.pickup_enabled) return 'pickup';
        } catch {
            /* ignore */
        }
        return store.settings.delivery_enabled ? 'delivery' : 'pickup';
    });
    const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
    const toolbarRef = useRef<HTMLDivElement>(null);
    const clickScroll = useRef(false);

    const isOpen = store.status.is_open;

    useEffect(() => {
        try {
            window.sessionStorage.setItem(FULFILLMENT_KEY, fulfillment);
        } catch {
            /* ignore */
        }
    }, [fulfillment]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) : products;
    }, [products, query]);

    const sections = useMemo(
        () => categories.map((c) => ({ ...c, items: filtered.filter((p) => p.category_id === c.id) })).filter((s) => s.items.length > 0),
        [categories, filtered],
    );
    const navSections = useMemo(() => sections.map((s) => ({ id: s.id, name: s.name, count: s.items.length })), [sections]);

    const qtyByProduct = useMemo(() => {
        const total: Record<number, number> = {};
        const base: Record<number, number> = {};
        cart.lines.forEach((l) => {
            total[l.product_id] = (total[l.product_id] ?? 0) + l.quantity;
            if (!l.variant_id && !l.note) base[l.product_id] = (base[l.product_id] ?? 0) + l.quantity;
        });
        return { total, base };
    }, [cart.lines]);

    // ── Guests must log in before ordering; the add resumes after login ──
    const guard = useCallback(
        (p: MenuProduct) => {
            if (customer) return true;
            try {
                window.sessionStorage.setItem(PENDING_ADD_KEY, String(p.id));
            } catch {
                /* ignore */
            }
            requireAuth('login');
            return false;
        },
        [customer, requireAuth],
    );

    const openProduct = useCallback(
        (p: MenuProduct) => {
            if (p.sold_out || !guard(p)) return;
            setSelected(p);
            setDetailOpen(true);
        },
        [guard],
    );

    const quickAdd = useCallback(
        (p: MenuProduct) => {
            if (p.sold_out || !guard(p)) return;
            if (!isOpen) {
                toast(store.status.message ?? 'We are closed for online orders right now.');
                return;
            }
            cart.add({ product_id: p.id, variant_id: null, name: p.name, variant_name: null, image: p.image, unit_price: p.price, quantity: 1, note: '' });
        },
        [guard, isOpen, cart, store.status.message],
    );

    const quickRemove = useCallback((p: MenuProduct) => cart.setQuantity(`${p.id}-base-`, (qtyByProduct.base[p.id] ?? 0) - 1), [cart, qtyByProduct.base]);

    useEffect(() => {
        if (!customer) return;
        let pending: string | null = null;
        try {
            pending = window.sessionStorage.getItem(PENDING_ADD_KEY);
            window.sessionStorage.removeItem(PENDING_ADD_KEY);
        } catch {
            /* ignore */
        }
        const p = pending ? products.find((x) => x.id === Number(pending)) : null;
        if (p && !p.sold_out) {
            setSelected(p);
            setDetailOpen(true);
        }
    }, [customer, products]);

    // ── Scroll-spy ──
    const stickyOffset = () => (isDesktop ? 64 : 56) + (toolbarRef.current?.offsetHeight ?? 0) + 12;
    // The active category is the last section whose heading has scrolled past the sticky toolbar.
    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            if (clickScroll.current) return;
            const line = stickyOffset() + 8;
            let current: number | null = sections[0]?.id ?? null;
            for (const s of sections) {
                const el = sectionRefs.current[s.id];
                if (el && el.getBoundingClientRect().top - line <= 0) current = s.id;
            }
            setActiveCat(current);
        };
        const onScroll = () => {
            if (!frame) frame = window.requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
            if (frame) window.cancelAnimationFrame(frame);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sections, isDesktop]);

    const jumpTo = (id: number) => {
        const el = sectionRefs.current[id];
        if (!el) return;
        setActiveCat(id);
        clickScroll.current = true;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - stickyOffset(), behavior: reduce ? 'auto' : 'smooth' });
        window.setTimeout(() => (clickScroll.current = false), 800);
    };

    const goCheckout = () => {
        if (!customer) {
            requireAuth('login');
            return;
        }
        setCartOpen(false);
        router.visit(`/checkout?fulfillment=${fulfillment}`);
    };

    const panelProps = {
        lines: cart.lines,
        subtotal: cart.subtotal,
        count: cart.count,
        onQuantity: cart.setQuantity,
        onClear: cart.clear,
        settings: store.settings,
        fulfillment,
        onFulfillment: setFulfillment,
        isOpen,
        closedReason: store.status.message,
        onCheckout: goCheckout,
    };

    return (
        <>
            <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)_minmax(320px,360px)] lg:gap-8 lg:px-6 lg:pt-6">
                {/* ── Left rail (desktop) ─────────────────────────── */}
                <aside className="hidden lg:block">
                    <div className="sticky top-22 space-y-6">
                        <CategoryRail sections={navSections} active={activeCat} onSelect={jumpTo} />
                        <StoreCard store={store} />
                    </div>
                </aside>

                {/* ── Centre ───────────────────────────────────────── */}
                <div className="min-w-0">
                    <StatusStrip isOpen={isOpen} status={store.status} activeOrder={activeOrder} />
                    <Hero customer={customer} store={store} />
                    <PromoRail promos={storefrontPromos} className="mt-7" />

                    {/* Sticky search + chips */}
                    <div ref={toolbarRef} className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mt-6 bg-shop-bg/95 backdrop-blur-md lg:top-16 lg:pt-2">
                        <div className="px-4 pt-2 lg:px-0 lg:pt-0">
                            <label className="relative block">
                                <span className="sr-only">Search the menu</span>
                                <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-shop-muted" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search burgers, frappes, sulit meals…"
                                    className="h-12 w-full rounded-2xl border border-shop-line bg-shop-surface pr-12 pl-12 text-base text-shop-ink shadow-shop-sm outline-none placeholder:text-shop-muted/80 focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15"
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery('')}
                                        className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </label>
                        </div>
                        <div className="lg:hidden">
                            <CategoryChips sections={navSections} active={activeCat} onSelect={jumpTo} />
                        </div>
                        <div className="h-px bg-shop-line lg:mt-3" />
                    </div>

                    {/* Menu */}
                    <div className="px-4 lg:px-0">
                        {sections.length === 0 && (
                            <div className="flex flex-col items-center py-20 text-center">
                                <Search className="h-8 w-8 text-shop-muted" />
                                <p className="font-display mt-3 text-xl font-semibold">{products.length === 0 ? 'The menu is being updated' : `Nothing matches “${query}”`}</p>
                                <p className="mt-1 text-sm text-shop-muted">{products.length === 0 ? 'Please check back in a little while.' : 'Try “burger”, “frappe” or “meal”.'}</p>
                                {query && (
                                    <button type="button" onClick={() => setQuery('')} className="mt-4 cursor-pointer text-sm font-semibold text-shop-accent-ink underline underline-offset-4">
                                        Clear search
                                    </button>
                                )}
                            </div>
                        )}
                        {sections.map((s) => (
                            <section
                                key={s.id}
                                data-cat={s.id}
                                aria-labelledby={`cat-${s.id}`}
                                ref={(el) => {
                                    sectionRefs.current[s.id] = el;
                                }}
                                className="pt-8"
                            >
                                <div className="mb-3 flex items-baseline justify-between">
                                    <h2 id={`cat-${s.id}`} className="font-display text-2xl font-bold">
                                        {s.name}
                                    </h2>
                                    <span className="text-sm text-shop-muted tabular-nums">{s.items.length} items</span>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                                    {s.items.map((p) => (
                                        <ProductCard
                                            key={p.id}
                                            product={p}
                                            baseQty={qtyByProduct.base[p.id] ?? 0}
                                            totalQty={qtyByProduct.total[p.id] ?? 0}
                                            disabled={!isOpen && !!customer}
                                            onOpen={() => openProduct(p)}
                                            onQuickAdd={() => quickAdd(p)}
                                            onQuickRemove={() => quickRemove(p)}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}

                        <div className="mt-12 lg:hidden">
                            <StoreCard store={store} />
                        </div>
                        {loyaltyRules.enabled && <RewardsTeaser customer={customer} rules={loyaltyRules} onJoin={() => requireAuth('register')} />}
                        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-shop-line py-6 text-xs text-shop-muted">
                            <span>© {new Date().getFullYear()} Boundary Café · Taste of Negros</span>
                            <Link href="/login" className="underline underline-offset-4 hover:text-shop-ink">
                                Staff login
                            </Link>
                        </footer>
                    </div>
                </div>

                {/* ── Right rail: persistent cart (desktop) ───────── */}
                <aside className="hidden lg:block" aria-label="Your order">
                    <div className="sticky top-22 h-[calc(100dvh-112px)]">
                        <CartPanel {...panelProps} variant="rail" />
                    </div>
                </aside>
            </div>

            {/* ── Floating cart bar (phones & tablets) ───────────── */}
            {cart.count > 0 && !isDesktop && (
                <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-4">
                    <button
                        type="button"
                        onClick={() => setCartOpen(true)}
                        className="bc-press bc-slide-up mx-auto flex h-14 w-full max-w-lg cursor-pointer items-center justify-between gap-3 rounded-2xl bg-shop-ink px-3 pr-4 text-shop-bg shadow-shop-lg"
                        aria-label={`View order: ${cart.count} items`}
                    >
                        <span className="flex items-center gap-3">
                            <span key={cart.count} className="bc-bump flex h-9 min-w-9 items-center justify-center rounded-xl bg-shop-accent px-2 text-sm font-bold text-shop-on-accent tabular-nums">
                                {cart.count}
                            </span>
                            <span className="text-base font-semibold">View order</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-base font-bold">
                            <Price value={cart.subtotal} />
                            <ChevronRight className="h-5 w-5 opacity-70" />
                        </span>
                    </button>
                </div>
            )}

            <ProductDetail
                product={selected}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                disabled={!isOpen}
                disabledReason="Closed for online orders"
                onAdd={(line) => {
                    cart.add(line);
                    toast.success(`Added ${line.quantity} × ${line.name}`);
                }}
            />
            {!isDesktop && <CartSheet open={cartOpen} onOpenChange={setCartOpen} {...panelProps} />}
        </>
    );
}

function StatusStrip({ isOpen, status, activeOrder }: { isOpen: boolean; status: StoreStatus; activeOrder: PageProps['activeOrder'] }) {
    if (activeOrder) {
        return (
            <div className="px-4 pt-4 lg:px-0 lg:pt-0 lg:pb-4">
                <Link
                    href={`/account/orders/${activeOrder.order_number}`}
                    className="bc-press flex items-center gap-3 rounded-2xl bg-shop-navy p-3 pr-4 text-shop-navy-ink shadow-shop-md"
                >
                    <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                        <span className="bc-pulse absolute inset-2.5 rounded-full text-shop-accent" />
                        <span className="relative h-2.5 w-2.5 rounded-full bg-shop-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs opacity-80">Order {activeOrder.order_number}</p>
                        <p className="truncate font-semibold">{activeOrder.status_label} · track it live</p>
                    </div>
                    <ChevronRight className="h-5 w-5 opacity-80" />
                </Link>
            </div>
        );
    }
    if (!isOpen) {
        return (
            <div className="px-4 pt-4 lg:px-0 lg:pt-0 lg:pb-4">
                <div className="flex items-start gap-3 rounded-2xl bg-shop-warning-soft p-4 text-shop-warning" role="status">
                    <Store className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-semibold">Closed for online orders</p>
                        <p className="text-sm">
                            {status.message ?? `We open at ${status.opens_at}.`} Browse now and order when we open.
                        </p>
                    </div>
                </div>
            </div>
        );
    }
    return null;
}

function Hero({ customer, store }: { customer: CustomerSession | null; store: PageProps['store'] }) {
    const s = store.settings;
    const eta = `${s.prep_minutes + s.delivery_minutes}–${s.prep_minutes + s.delivery_minutes + 15} min`;
    return (
        <section className="px-4 pt-4 lg:px-0 lg:pt-0" aria-label="Welcome">
            <div className="relative overflow-hidden rounded-[28px] bg-shop-surface p-5 shadow-shop-sm ring-1 ring-shop-line sm:p-7">
                <div className="relative z-10 max-w-[64%] sm:max-w-[58%]">
                    <p className="text-sm font-medium text-shop-accent-ink">{customer ? `Magandang araw, ${customer.first_name}!` : 'Boundary Café · Mabinay'}</p>
                    <h1 className="font-display mt-1.5 text-[clamp(1.45rem,4.6vw,2.6rem)] leading-[1.06] font-bold text-balance">
                        {customer ? 'What’s your Boundary order today?' : 'Boundary favourites, delivered in Mabinay.'}
                    </h1>
                    <div className="mt-3.5 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
                        <Pill>
                            <Clock3 className="h-3.5 w-3.5" /> {eta}
                        </Pill>
                        <Pill className="hidden sm:inline-flex">
                            {s.delivery_fee > 0 ? (
                                <>
                                    Delivery ₱{s.delivery_fee}
                                    {s.free_delivery_min > 0 ? ` · free from ₱${s.free_delivery_min}` : ''}
                                </>
                            ) : (
                                'Free delivery'
                            )}
                        </Pill>
                        {store.status.is_open && (
                            <Pill tone="success">
                                <span className="h-1.5 w-1.5 rounded-full bg-current" /> Open until {store.status.closes_at}
                            </Pill>
                        )}
                    </div>
                </div>
                {/* Photo: a plate breaking out past the card edge */}
                <div className="absolute top-1/2 -right-12 h-40 w-40 -translate-y-1/2 sm:-right-6 sm:h-65 sm:w-65 lg:h-70 lg:w-70">
                    <img
                        src="/uploads/optimized/boundary_burger.webp"
                        alt=""
                        fetchPriority="high"
                        className="h-full w-full rounded-full object-cover object-[50%_42%] shadow-shop-lg ring-8 ring-shop-bg"
                    />
                    <img
                        src="/uploads/optimized/strawberry_sparkle.webp"
                        alt=""
                        className="absolute -bottom-2 left-0 hidden h-24 w-24 rounded-full object-cover shadow-shop-md ring-4 ring-shop-bg sm:block"
                    />
                </div>
                <RouteLine className="relative z-10 mt-4 max-w-[60%] sm:mt-5 sm:max-w-[52%]" />
                <p className="relative z-10 mt-1 max-w-[60%] text-[10px] font-medium tracking-[0.14em] text-shop-muted uppercase sm:max-w-[52%] sm:text-[11px]">Tagukon → Mabinay</p>
            </div>
        </section>
    );
}

function StoreCard({ store }: { store: PageProps['store'] }) {
    return (
        <div className="rounded-[22px] bg-shop-surface p-4 ring-1 ring-shop-line">
            <p className="font-display font-semibold">{store.branch?.name ?? 'Boundary Café – Mabinay'}</p>
            <p className="mt-0.5 text-sm text-shop-muted">{store.branch?.address ?? 'Mabinay, Negros Oriental'}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-shop-muted" /> {store.status.opens_at} – {store.status.closes_at}
                </li>
                <li className="flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4 text-shop-muted" /> Min. order ₱{store.settings.min_order} · COD or pay at pickup
                </li>
                {store.branch?.phone && (
                    <li className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-shop-muted" />
                        <a href={`tel:${store.branch.phone}`} className="font-semibold text-shop-accent-ink">
                            {store.branch.phone}
                        </a>
                    </li>
                )}
            </ul>
        </div>
    );
}

function RewardsTeaser({ customer, rules, onJoin }: { customer: CustomerSession | null; rules: PageProps['loyaltyRules']; onJoin: () => void }) {
    return (
        <section className="relative mt-4 overflow-hidden rounded-[26px] bg-shop-navy p-6 text-shop-navy-ink">
            <div className="relative z-10 max-w-md">
                <p className="flex items-center gap-2 text-sm font-semibold text-white/80">
                    <Gift className="h-4 w-4" /> Boundary Rewards
                </p>
                <p className="font-display mt-2 text-2xl leading-tight font-bold">1 point for every ₱{rules.spend_per_point}. Delivery, pickup or dine-in.</p>
                <p className="mt-2 text-sm text-white/75">
                    Use points as cash at checkout{rules.birthday_bonus > 0 ? `, plus ${rules.birthday_bonus} bonus points in your birthday month` : ''}.
                </p>
                {customer ? (
                    <Link href="/account/rewards" className="bc-press mt-4 inline-flex h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-shop-navy">
                        {customer.loyalty_points.toLocaleString()} points · open my card
                    </Link>
                ) : (
                    <button type="button" onClick={onJoin} className="bc-press mt-4 inline-flex h-11 cursor-pointer items-center rounded-xl bg-shop-accent px-4 text-sm font-semibold text-shop-on-accent">
                        Join free
                    </button>
                )}
            </div>
            <svg viewBox="0 0 320 40" className="pointer-events-none absolute -right-10 bottom-6 w-[70%] opacity-40" aria-hidden>
                <path d="M4 30 C 34 30, 40 8, 74 10 S 112 34, 146 26 S 196 4, 236 14 S 280 34, 316 18" fill="none" stroke="#ff6a1f" strokeWidth="2.5" strokeDasharray="1.5 6" strokeLinecap="round" />
            </svg>
        </section>
    );
}

