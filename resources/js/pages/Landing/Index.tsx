import { Link, router, usePage } from '@inertiajs/react';
import { Bike, ChevronDown, ChevronRight, Clock3, Gift, MapPin, Phone, Search, ShoppingBag, Store, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CartSheet } from '@/components/storefront/CartPanel';
import type { NavSection } from '@/components/storefront/CategoryNav';
import { CategoryChips, CategoryRail, CategoryTiles } from '@/components/storefront/CategoryNav';
import ProductCard from '@/components/storefront/ProductCard';
import ProductDetail from '@/components/storefront/ProductDetail';
import PromoRail from '@/components/storefront/PromoRail';
import { Pill, Price, useIsDesktop } from '@/components/storefront/ui';
import ShopAutoSkeleton from '@/components/ui/auto-skeleton';
import CustomerLayout, { useCustomerAuth } from '@/layouts/CustomerLayout';
import type { CustomerSession, MenuProduct, StoreStatus, StorefrontPromo } from '@/lib/customer';
import { useCart } from '@/lib/customer';
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
const STRIP_DISMISSED_KEY = 'bc-strip-dismissed';
const WELCOME_DISMISSED_KEY = 'bc-welcome-dismissed';

type Fulfillment = 'delivery' | 'pickup';
type Sort = 'menu' | 'price-asc' | 'price-desc' | 'name';
type Settings = PageProps['store']['settings'];

const SORTS: { value: Sort; label: string }[] = [
    { value: 'menu', label: 'Menu order' },
    { value: 'price-asc', label: 'Price: low to high' },
    { value: 'price-desc', label: 'Price: high to low' },
    { value: 'name', label: 'Name: A to Z' },
];

const SORTERS: Record<Exclude<Sort, 'menu'>, (a: MenuProduct, b: MenuProduct) => number> = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name),
};

function etaLabel(s: Settings, fulfillment: Fulfillment) {
    const from = fulfillment === 'delivery' ? s.prep_minutes + s.delivery_minutes : s.prep_minutes;
    return `${from}–${from + (fulfillment === 'delivery' ? 15 : 10)} min`;
}

/** A notice the visitor can close; it stays closed for the rest of the browser session. */
function useDismissed(key: string) {
    const [dismissed, setDismissed] = useState(() => {
        try {
            return window.sessionStorage.getItem(key) === '1';
        } catch {
            return false;
        }
    });
    const dismiss = () => {
        setDismissed(true);
        try {
            window.sessionStorage.setItem(key, '1');
        } catch {
            /* ignore */
        }
    };
    return [dismissed, dismiss] as const;
}

export default function Storefront() {
    const { props } = usePage<PageProps>();
    const { store, customer } = props;
    const cart = useCart(customer?.id);
    const [query, setQuery] = useState('');
    const [cartOpen, setCartOpen] = useState(false);
    const [fulfillment, setFulfillment] = useState<Fulfillment>(() => {
        try {
            const saved = window.sessionStorage.getItem(FULFILLMENT_KEY);
            if (saved === 'pickup' && store.settings.pickup_enabled) return 'pickup';
        } catch {
            /* ignore */
        }
        return store.settings.delivery_enabled ? 'delivery' : 'pickup';
    });

    useEffect(() => {
        try {
            window.sessionStorage.setItem(FULFILLMENT_KEY, fulfillment);
        } catch {
            /* ignore */
        }
    }, [fulfillment]);

    const orderForPickup = () => {
        setFulfillment('pickup');
        toast(`Pickup selected · ready in about ${etaLabel(store.settings, 'pickup')}`);
    };

    return (
        <CustomerLayout
            title="Order online"
            topStrip={<AnnouncementStrip onPickup={orderForPickup} />}
            headerSlot={<AddressChip />}
            headerEnd={<CartButton count={cart.count} onClick={() => setCartOpen(true)} />}
            subHeader={
                <div className="hidden h-14 items-stretch justify-between gap-6 lg:flex">
                    <ServiceTabs settings={store.settings} fulfillment={fulfillment} onFulfillment={setFulfillment} />
                    <SearchField value={query} onChange={setQuery} className="w-[380px] self-center" inputClassName="h-11 rounded-full border-transparent bg-shop-sunken text-[15px]" />
                </div>
            }
            barangays={props.barangays}
            wide
        >
            <StorefrontBody cart={cart} query={query} onQuery={setQuery} fulfillment={fulfillment} onFulfillment={setFulfillment} cartOpen={cartOpen} onCartOpen={setCartOpen} />
        </CustomerLayout>
    );
}

/** Brand-colour strip above the header with the two things worth shouting about. */
function AnnouncementStrip({ onPickup }: { onPickup: () => void }) {
    const { props } = usePage<PageProps>();
    const { customer, loyaltyRules, store } = props;
    const { requireAuth } = useCustomerAuth();
    const [dismissed, dismiss] = useDismissed(STRIP_DISMISSED_KEY);

    const showAccount = !customer || loyaltyRules.enabled;
    const showPickup = store.settings.pickup_enabled;
    if (dismissed || (!showAccount && !showPickup)) return null;

    const action =
        'bc-press inline-flex h-9 cursor-pointer items-center rounded-md border border-current px-3 text-xs font-bold tracking-wide whitespace-nowrap uppercase hover:bg-black/10 sm:h-10 sm:px-3.5 sm:text-[13px]';

    return (
        <div className="relative bg-shop-accent text-shop-on-accent">
            <div className="mx-auto flex min-h-14 max-w-[1320px] items-center justify-center gap-3 py-2 pr-12 pl-4 lg:gap-5">
                <Bike className="hidden h-7 w-7 sm:block" strokeWidth={1.75} aria-hidden />
                {customer
                    ? loyaltyRules.enabled && (
                          <Link href="/account/rewards" className={action}>
                              My Boundary Rewards card
                          </Link>
                      )
                    : (
                          <button type="button" onClick={() => requireAuth('register')} className={action}>
                              {loyaltyRules.enabled ? 'Sign up for Boundary Rewards' : 'Create a free account'}
                          </button>
                      )}
                {showPickup && (
                    <button type="button" onClick={onPickup} className={cn(action, showAccount && 'hidden sm:inline-flex')}>
                        Order ahead for pickup
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={dismiss}
                className="bc-press absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-black/10"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

/** Where the order is going: a compact chip in the desktop header, a full-width row under the header on phones. */
function AddressChip({ variant = 'chip' }: { variant?: 'chip' | 'bar' }) {
    const { props } = usePage<PageProps>();
    const { requireAuth } = useCustomerAuth();
    const place = props.customer?.barangay ? `${props.customer.barangay}, Mabinay` : 'Mabinay, Negros Oriental';
    const inner =
        variant === 'bar' ? (
            <>
                <MapPin className="h-4.5 w-4.5 shrink-0 text-shop-accent-ink" />
                <span className="shrink-0 text-shop-muted">Deliver to</span>
                <span className="truncate font-semibold">{place}</span>
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-shop-muted" />
            </>
        ) : (
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
    const cls =
        variant === 'bar'
            ? 'flex h-11 w-full cursor-pointer items-center gap-2 px-4 text-left text-sm hover:bg-shop-sunken'
            : 'bc-press hidden max-w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1 hover:bg-shop-sunken lg:flex';
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

/** Desktop header: opens the order in a side sheet. Phones use the floating "View order" bar. */
function CartButton({ count, onClick }: { count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="bc-press relative hidden h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-shop-sunken text-shop-ink hover:bg-shop-accent-soft lg:flex"
            aria-label={count > 0 ? `View order: ${count} items` : 'View order'}
        >
            <ShoppingBag className="h-4.5 w-4.5" />
            {count > 0 && (
                <span key={count} className="bc-bump absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-shop-accent px-1 text-[11px] font-bold text-shop-on-accent tabular-nums">
                    {count}
                </span>
            )}
        </button>
    );
}

/** Delivery / pickup as underlined tabs. */
function ServiceTabs({ settings, fulfillment, onFulfillment }: { settings: Settings; fulfillment: Fulfillment; onFulfillment: (f: Fulfillment) => void }) {
    return (
        <div className="flex items-stretch" role="radiogroup" aria-label="Delivery or pickup">
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
                            'flex cursor-pointer items-center gap-2 border-b-[3px] px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                            fulfillment === f ? 'border-shop-ink text-shop-ink' : 'border-transparent text-shop-muted hover:text-shop-ink',
                        )}
                    >
                        <Icon className="h-4.5 w-4.5" />
                        {f === 'delivery' ? 'Delivery' : 'Pickup'}
                    </button>
                );
            })}
        </div>
    );
}

function SearchField({ value, onChange, className, inputClassName }: { value: string; onChange: (value: string) => void; className?: string; inputClassName?: string }) {
    return (
        <label className={cn('relative block', className)}>
            <span className="sr-only">Search the menu</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-shop-muted" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Search burgers, frappes, sulit meals…"
                className={cn(
                    'w-full border pr-12 pl-12 text-shop-ink outline-none placeholder:text-shop-muted/80 focus:border-shop-accent focus:ring-4 focus:ring-shop-accent/15',
                    inputClassName,
                )}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken"
                    aria-label="Clear search"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </label>
    );
}

interface BodyProps {
    cart: ReturnType<typeof useCart>;
    query: string;
    onQuery: (query: string) => void;
    fulfillment: Fulfillment;
    onFulfillment: (f: Fulfillment) => void;
    cartOpen: boolean;
    onCartOpen: (open: boolean) => void;
}

function StorefrontBody({ cart, query, onQuery, fulfillment, onFulfillment, cartOpen, onCartOpen }: BodyProps) {
    const { props } = usePage<PageProps>();
    const { store, categories, products, storefrontPromos, loyaltyRules, activeOrder, customer } = props;
    const { requireAuth } = useCustomerAuth();
    const isDesktop = useIsDesktop();

    const [activeCat, setActiveCat] = useState<number | null>(categories[0]?.id ?? null);
    const [selected, setSelected] = useState<MenuProduct | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [sort, setSort] = useState<Sort>('menu');
    const [availableOnly, setAvailableOnly] = useState(false);
    const [filtering, setFiltering] = useState(false);
    const [welcomeDismissed, dismissWelcome] = useDismissed(WELCOME_DISMISSED_KEY);
    const sectionRefs = useRef<Record<number, HTMLElement | null>>({});
    const toolbarRef = useRef<HTMLDivElement>(null);
    const clickScroll = useRef(false);

    const isOpen = store.status.is_open;
    const searching = query.trim() !== '';
    const showWelcome = !customer && !welcomeDismissed;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        let list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)) : products;
        if (availableOnly) list = list.filter((p) => !p.sold_out);
        return sort === 'menu' ? list : [...list].sort(SORTERS[sort]);
    }, [products, query, availableOnly, sort]);

    const sections = useMemo(
        () => categories.map((c) => ({ ...c, items: filtered.filter((p) => p.category_id === c.id) })).filter((s) => s.items.length > 0),
        [categories, filtered],
    );
    const navSections = useMemo<NavSection[]>(
        () =>
            sections.map((s) => ({
                id: s.id,
                name: s.name,
                count: s.items.length,
                image: (s.items.find((p) => p.image && !p.image.endsWith('.svg')) ?? s.items[0])?.image ?? null,
            })),
        [sections],
    );

    // ── Brief skeleton flash while search / sort / filter re-renders the grid ──
    // Search + sort + availableOnly are client-side (useMemo), so there is no
    // server round-trip to bind to. A short pulse keeps large re-renders from
    // flashing and shows off the auto skeleton. Skipped on first mount.
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true;
            return;
        }
        setFiltering(true);
        const t = window.setTimeout(() => setFiltering(false), 280);
        return () => window.clearTimeout(t);
    }, [query, sort, availableOnly]);

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
    const stickyOffset = () => (document.getElementById('shop-header')?.offsetHeight ?? (isDesktop ? 120 : 56)) + (toolbarRef.current?.offsetHeight ?? 0) + 12;
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
        onCartOpen(false);
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
        onFulfillment,
        isOpen,
        closedReason: store.status.message,
        onCheckout: goCheckout,
    };

    const clearFilters = () => {
        onQuery('');
        setAvailableOnly(false);
    };

    return (
        <>
            {/* ── Address + delivery / pickup tabs (phones & tablets; desktop has them in the header) ── */}
            <div className="border-b border-shop-line bg-shop-surface lg:hidden">
                <AddressChip variant="bar" />
                <div className="flex h-11 items-stretch border-t border-shop-line px-1">
                    <ServiceTabs settings={store.settings} fulfillment={fulfillment} onFulfillment={onFulfillment} />
                </div>
            </div>

            <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:pt-6">
                {/* ── Left rail (desktop) ─────────────────────────── */}
                <aside className="hidden lg:block">
                    <div className={cn('sticky top-34 flex flex-col gap-5', showWelcome ? 'max-h-[calc(100dvh-13.5rem)]' : 'max-h-[calc(100dvh-9.5rem)]')}>
                        <RewardsCard customer={customer} rules={loyaltyRules} onJoin={() => requireAuth('register')} onLogin={() => requireAuth('login')} />
                        <FiltersCard
                            sort={sort}
                            onSort={setSort}
                            availableOnly={availableOnly}
                            onAvailableOnly={setAvailableOnly}
                            sections={navSections}
                            active={activeCat}
                            onSelect={jumpTo}
                        />
                    </div>
                </aside>

                {/* ── Main ─────────────────────────────────────────── */}
                <div className="min-w-0">
                    <StatusStrip isOpen={isOpen} status={store.status} activeOrder={activeOrder} />
                    {/* A desktop search swaps the discovery blocks for results */}
                    <div className={cn(searching && 'lg:hidden')}>
                        <Hero customer={customer} store={store} fulfillment={fulfillment} onJoin={() => requireAuth('register')} />
                        <CategoryTiles sections={navSections} onSelect={jumpTo} className="mt-8" />
                        <PromoRail promos={storefrontPromos} className="mt-8" />
                    </div>

                    {/* Sticky search + chips (phones & tablets) */}
                    <div ref={toolbarRef} className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mt-6 bg-shop-bg/95 backdrop-blur-md lg:hidden">
                        <div className="px-4 pt-2">
                            <SearchField value={query} onChange={onQuery} inputClassName="h-12 rounded-2xl border-shop-line bg-shop-surface text-base shadow-shop-sm" />
                        </div>
                        <CategoryChips sections={navSections} active={activeCat} onSelect={jumpTo} />
                        <div className="h-px bg-shop-line" />
                    </div>

                    {/* Menu */}
                    <div className="px-4 lg:px-0">
                        {sections.length === 0 && (
                            <div className="flex flex-col items-center py-20 text-center">
                                <Search className="h-8 w-8 text-shop-muted" />
                                <p className="font-display mt-3 text-xl font-semibold">
                                    {products.length === 0 ? 'The menu is being updated' : searching ? `Nothing matches “${query}”` : 'Everything is sold out right now'}
                                </p>
                                <p className="mt-1 text-sm text-shop-muted">
                                    {products.length === 0 ? 'Please check back in a little while.' : searching ? 'Try “burger”, “frappe” or “meal”.' : 'Show the full menu to see what is coming back.'}
                                </p>
                                {(searching || availableOnly) && (
                                    <button type="button" onClick={clearFilters} className="mt-4 cursor-pointer text-sm font-semibold text-shop-accent-ink underline underline-offset-4">
                                        {searching ? 'Clear search' : 'Show the full menu'}
                                    </button>
                                )}
                            </div>
                        )}
                        {sections.length > 0 && (
                            <ShopAutoSkeleton loading={filtering}>
                                <div>
                                    {sections.map((s) => (
                                        <section
                                            key={s.id}
                                            data-cat={s.id}
                                            aria-labelledby={`cat-${s.id}`}
                                            ref={(el) => {
                                                sectionRefs.current[s.id] = el;
                                            }}
                                            className="pt-9"
                                        >
                                            <div className="mb-4 flex items-baseline justify-between">
                                                <h2 id={`cat-${s.id}`} className="font-display text-2xl font-semibold tracking-tight lg:text-[28px]">
                                                    {s.name}
                                                </h2>
                                                <span className="text-sm text-shop-muted tabular-nums">{s.items.length} items</span>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
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
                                </div>
                            </ShopAutoSkeleton>
                        )}

                        <div className="mt-12 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                            <StoreCard store={store} />
                            {loyaltyRules.enabled && <RewardsTeaser customer={customer} rules={loyaltyRules} onJoin={() => requireAuth('register')} />}
                        </div>
                        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-shop-line py-6 text-xs text-shop-muted">
                            <span>© {new Date().getFullYear()} Boundary Café · Taste of Negros</span>
                            <Link href="/login" className="underline underline-offset-4 hover:text-shop-ink">
                                Staff login
                            </Link>
                        </footer>
                        {showWelcome && <div className="hidden h-12 lg:block" aria-hidden />}
                    </div>
                </div>
            </div>

            {/* ── Floating cart bar (phones & tablets) ───────────── */}
            {cart.count > 0 && !isDesktop && (
                <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 px-4">
                    <button
                        type="button"
                        onClick={() => onCartOpen(true)}
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

            {showWelcome && <WelcomeBar settings={store.settings} rules={loyaltyRules} onJoin={() => requireAuth('register')} onDismiss={dismissWelcome} />}

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
            <CartSheet open={cartOpen} onOpenChange={onCartOpen} {...panelProps} />
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

function Hero({ customer, store, fulfillment, onJoin }: { customer: CustomerSession | null; store: PageProps['store']; fulfillment: Fulfillment; onJoin: () => void }) {
    const s = store.settings;
    return (
        <section className="px-4 pt-4 lg:px-0 lg:pt-0" aria-label="Welcome">
            <div className="relative isolate overflow-hidden rounded-2xl bg-shop-accent-soft p-4 sm:p-7">
                {/* Lighter sweep behind the plate */}
                <div className="absolute inset-y-0 right-0 -z-10 w-[48%] rounded-l-full bg-white/45 dark:bg-white/5" aria-hidden />
                <p className="text-[13px] font-semibold text-shop-accent-ink sm:max-w-[60%] sm:text-sm">{customer ? `Magandang araw, ${customer.first_name}!` : 'Boundary Café · Mabinay'}</p>
                <div className="mt-1 flex items-center gap-3 sm:block sm:max-w-[60%]">
                    <h1 className="font-display min-w-0 flex-1 text-[clamp(1.3rem,6.4vw,1.75rem)] leading-[1.08] font-extrabold text-balance sm:text-[clamp(1.75rem,4.4vw,2.25rem)]">
                        {customer ? 'What’s your Boundary order today?' : 'Boundary favourites, delivered in Mabinay.'}
                    </h1>
                    {/* Plate: beside the headline on phones, out on the right edge from tablets up */}
                    <div className="relative size-[30vw] max-h-32 max-w-32 shrink-0 sm:absolute sm:top-1/2 sm:right-8 sm:size-44 sm:max-h-none sm:max-w-none sm:-translate-y-1/2 lg:right-14">
                        <img
                            src="/uploads/optimized/boundary_burger.webp"
                            alt=""
                            fetchPriority="high"
                            className="h-full w-full rounded-full object-cover object-[50%_42%] shadow-shop-lg ring-4 ring-shop-surface"
                        />
                        <img
                            src="/uploads/optimized/strawberry_sparkle.webp"
                            alt=""
                            className="absolute -bottom-1 -left-8 hidden h-20 w-20 rounded-full object-cover shadow-shop-md ring-4 ring-shop-surface sm:block"
                        />
                    </div>
                </div>
                <div className="mt-3.5 flex flex-wrap items-center gap-1.5 sm:mt-4 sm:max-w-[60%] sm:gap-2">
                    {!customer && (
                        <>
                            <button type="button" onClick={onJoin} className="bc-press h-9 cursor-pointer rounded-lg bg-shop-accent px-4 text-sm font-semibold text-shop-on-accent hover:brightness-[1.04] sm:mr-1">
                                Sign up
                            </button>
                            {/* Phones: the pills get a row of their own under the button */}
                            <span className="basis-full sm:hidden" aria-hidden />
                        </>
                    )}
                    <Pill className="bg-shop-surface">
                        <Clock3 className="h-3.5 w-3.5" /> {etaLabel(s, fulfillment)}
                    </Pill>
                    {fulfillment === 'delivery' && (
                        <Pill className="hidden bg-shop-surface sm:inline-flex">
                            {s.delivery_fee > 0 ? (
                                <>
                                    Delivery ₱{s.delivery_fee}
                                    {s.free_delivery_min > 0 ? ` · free from ₱${s.free_delivery_min}` : ''}
                                </>
                            ) : (
                                'Free delivery'
                            )}
                        </Pill>
                    )}
                    {store.status.is_open && (
                        <Pill tone="success">
                            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Open until {store.status.closes_at}
                        </Pill>
                    )}
                </div>
            </div>
        </section>
    );
}

/** Sidebar: the rewards programme as a dark card with the logo breaking out of the top edge. */
function RewardsCard({ customer, rules, onJoin, onLogin }: { customer: CustomerSession | null; rules: PageProps['loyaltyRules']; onJoin: () => void; onLogin: () => void }) {
    if (customer && !rules.enabled) return null;

    const action = 'bc-press flex h-9 cursor-pointer items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-shop-navy';

    return (
        <div className="relative mt-9 shrink-0 rounded-2xl bg-shop-navy px-4 pt-12 pb-4 text-center text-shop-navy-ink">
            <img
                src="/uploads/optimized/logo.webp"
                alt=""
                width={72}
                height={72}
                className="absolute -top-9 left-1/2 h-18 w-18 -translate-x-1/2 rounded-full bg-white ring-4 ring-shop-navy"
            />
            {customer ? (
                <>
                    <p className="font-display text-2xl leading-none font-bold tabular-nums">{customer.loyalty_points.toLocaleString()} points</p>
                    <p className="mt-1.5 text-sm text-white/75">1 point for every ₱{rules.spend_per_point} you spend.</p>
                    <Link href="/account/rewards" className={cn(action, 'mt-3')}>
                        Open my card
                    </Link>
                </>
            ) : (
                <>
                    <p className="font-display text-base leading-snug font-semibold text-balance">
                        {rules.enabled ? `Earn 1 point for every ₱${rules.spend_per_point}. Join Boundary Rewards.` : 'Create an account to order for delivery or pickup.'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={onJoin} className={action}>
                            {rules.enabled ? 'Join free' : 'Sign up'}
                        </button>
                        <button type="button" onClick={onLogin} className={action}>
                            Log in
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

/** Sidebar: sort, quick filters and the category list. Scrolls inside itself when the menu is long. */
function FiltersCard({
    sort,
    onSort,
    availableOnly,
    onAvailableOnly,
    sections,
    active,
    onSelect,
}: {
    sort: Sort;
    onSort: (sort: Sort) => void;
    availableOnly: boolean;
    onAvailableOnly: (on: boolean) => void;
    sections: NavSection[];
    active: number | null;
    onSelect: (id: number) => void;
}) {
    return (
        <div className="min-h-0 overflow-y-auto overscroll-contain rounded-2xl bg-shop-surface p-5 ring-1 ring-shop-line">
            <h2 className="font-display text-lg font-bold">Filters</h2>

            <fieldset className="mt-4">
                <legend className="text-sm font-medium text-shop-muted">Sort by</legend>
                <div className="mt-1.5">
                    {SORTS.map((o) => (
                        <label key={o.value} className="flex h-9 cursor-pointer items-center gap-3 text-[15px]">
                            <input type="radio" name="menu-sort" value={o.value} checked={sort === o.value} onChange={() => onSort(o.value)} className="peer sr-only" />
                            <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-shop-muted/60 transition-colors peer-checked:border-shop-ink peer-checked:bg-shop-ink peer-focus-visible:ring-2 peer-focus-visible:ring-shop-accent peer-focus-visible:ring-offset-2 after:h-2 after:w-2 after:rounded-full after:bg-shop-surface after:opacity-0 peer-checked:after:opacity-100"
                                aria-hidden
                            />
                            {o.label}
                        </label>
                    ))}
                </div>
            </fieldset>

            <div className="mt-4">
                <p className="text-sm font-medium text-shop-muted">Quick filters</p>
                <button
                    type="button"
                    aria-pressed={availableOnly}
                    onClick={() => onAvailableOnly(!availableOnly)}
                    className={cn(
                        'bc-press mt-2 h-8 cursor-pointer rounded-full px-3 text-sm font-medium ring-1',
                        availableOnly ? 'bg-shop-ink text-shop-bg ring-shop-ink' : 'text-shop-ink ring-shop-line hover:bg-shop-sunken',
                    )}
                >
                    Available now
                </button>
            </div>

            <div className="mt-5">
                <CategoryRail sections={sections} active={active} onSelect={onSelect} />
            </div>
        </div>
    );
}

/** Guests on desktop: a welcome bar pinned to the bottom of the window. */
function WelcomeBar({ settings, rules, onJoin, onDismiss }: { settings: Settings; rules: PageProps['loyaltyRules']; onJoin: () => void; onDismiss: () => void }) {
    const perk = !settings.delivery_enabled
        ? null
        : settings.delivery_fee <= 0
          ? 'free delivery'
          : settings.free_delivery_min > 0
            ? `free delivery from ₱${settings.free_delivery_min.toLocaleString()}`
            : null;
    const highlight = 'text-shop-accent dark:text-shop-accent-ink';

    return (
        <div className="fixed inset-x-0 bottom-0 z-30 hidden lg:block">
            <div className="relative flex h-16 items-center justify-center gap-4 rounded-t-2xl bg-shop-navy px-16 text-shop-navy-ink shadow-shop-lg">
                <img src="/uploads/optimized/logo.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-full bg-white" />
                <p className="font-display text-[17px] font-semibold">
                    {perk ? (
                        <>
                            Welcome! Enjoy <span className={highlight}>{perk}</span>
                            {rules.enabled ? ' and points on every order.' : ' on your order.'}
                        </>
                    ) : rules.enabled ? (
                        <>
                            Welcome! Earn <span className={highlight}>points on every order</span> with Boundary Rewards.
                        </>
                    ) : (
                        'Welcome! Order online for delivery or pickup in Mabinay.'
                    )}
                </p>
                <button type="button" onClick={onJoin} className="bc-press h-9 cursor-pointer rounded-lg bg-white px-4 text-sm font-semibold text-shop-navy">
                    Sign up
                </button>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="bc-press absolute top-1/2 right-4 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full hover:bg-white/10"
                    aria-label="Dismiss"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

function StoreCard({ store }: { store: PageProps['store'] }) {
    return (
        <div className="rounded-2xl bg-shop-surface p-4 ring-1 ring-shop-line">
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
        <section className="relative overflow-hidden rounded-2xl bg-shop-navy p-6 text-shop-navy-ink">
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

