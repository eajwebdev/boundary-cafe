'use client';
import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePage, router } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import ReceiptTemplate, { fmtMoney, fmtQty, ReceiptData } from './ReceiptTemplate';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import {
    Search,
    X,
    Plus,
    Minus,
    Trash2,
    ShoppingCart,
    Tag,
    CreditCard,
    Banknote,
    Smartphone,
    CheckCircle2,
    AlertTriangle,
    Package,
    History,
    ScanLine,
    RefreshCw,
    Zap,
    User,
    ChevronDown,
    Wallet,
    Rows3,
    Calendar,
    Check,
    Scale,
    LayoutGrid,
    Clock,
    Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Product, CartItem, Category, ActivePromo, CustomerOption } from './posTypes';
import ProductThumbnail, { getDefaultProductIcon } from '@/components/ProductThumbnail';
import WeightAmountModal from './WeightAmountModal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Session {
    id: number;
    opening_cash: number;
    opened_at: string;
    status: string;
}
interface Branch {
    id: number;
    name: string;
    business_type: string;
    feature_flags: Record<string, boolean>;
}
interface PageProps {
    auth: { user: { fname: string; lname: string; role_label: string; is_cashier: boolean } | null };
    settings: {
        allow_discount: boolean;
        max_discount_percent: number;
        default_payment: string;
        vat_enabled: boolean;
        vat_rate: number;
        vat_inclusive: boolean;
        require_cash_session: boolean;
        item_mode: 'products_and_services' | 'products_only' | 'services_only';
        laundry_mode: 'auto' | 'enabled' | 'disabled';
        require_customer_name: boolean;
        default_due_days: number;
        service_charge_enabled: boolean;
        service_charge_rate: number;
    } | null;
    app: { currency: string };
    products: Product[];
    customers: CustomerOption[];
    categories: Category[];
    session: Session | null;
    branch: Branch | null;
    preferred_layout: string;
    promos: ActivePromo[];
    [key: string]: unknown;
}
type PayMethod = 'cash' | 'gcash' | 'card' | 'others' | 'credit' | 'mixed';
type LayoutMode = 'grid' | 'tablet' | 'grocery' | 'cafe' | 'salon' | 'kiosk' | 'mobile';

const METHODS: { value: PayMethod; label: string; icon: React.ElementType; desc: string }[] = [
    { value: 'cash', label: 'Cash', icon: Banknote, desc: 'Standard cash tender' },
    { value: 'gcash', label: 'GCash', icon: Smartphone, desc: 'E-wallet QR payment' },
    { value: 'card', label: 'Card / Debit', icon: CreditCard, desc: 'Terminal card swipe' },
    { value: 'others', label: 'Others', icon: Tag, desc: 'Vouchers & others' },
];

// Helper to determine image for retail items (Rice, Feeds, Groceries)
const getProductImage = (p: { product_img?: string | null; unit?: string | null; name: string; category?: { name: string } | null }) => {
    return p.product_img || getDefaultProductIcon(p.name, p.category?.name ?? '', p.unit ?? '');
};

// Helper to identify weighted / per-kg products (Rice, Feeds, Grains, etc.)
export const isWeightedKgItem = (unit?: string | null, name?: string | null): boolean => {
    const u = (unit || '').trim().toLowerCase();
    if (u === 'kg' || u === 'kilo' || u === 'kilogram') return true;
    if (u === 'sack' || u === 'bag' || u === 'pc' || u === 'pack' || u === 'can' || u === 'bottle' || u === 'box') return false;
    const n = (name || '').toLowerCase();
    if (n.includes('sack') || n.includes('bag') || n.includes('pack') || n.includes('can') || n.includes('bottle')) return false;
    return n.includes('rice') || n.includes('feed') || n.includes('palay') || n.includes('corn') || n.includes('grain');
};

// ─── Lazy-loaded layout chunks ────────────────────────────────────────────────
const GridLayout = lazy(() => import('./layouts/GridLayout'));
const TabletLayout = lazy(() => import('./layouts/TabletLayout'));
const GroceryLayout = lazy(() => import('./layouts/GroceryLayout'));
const CafeLayout = lazy(() => import('./layouts/CafeLayout'));
const SalonLayout = lazy(() => import('./layouts/SalonLayout'));
const KioskLayout = lazy(() => import('./layouts/KioskLayout'));
const MobileLayout = lazy(() => import('./layouts/MobileLayout'));

function CashSessionGate({ currency, branchName }: { currency: string; branchName: string }) {
    const [openingCash, setOpeningCash] = useState('0.00');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const todayLabel = new Intl.DateTimeFormat('en-PH', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date());

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const amount = Number(openingCash);

        if (!Number.isFinite(amount) || amount < 0) {
            setError('Enter a valid opening cash amount.');
            return;
        }

        setLoading(true);
        setError('');
        router.post(
            routes.pos.openSession(),
            {
                opening_cash: amount,
                notes: notes.trim() || null,
            },
            {
                preserveScroll: true,
                onError: (errors) => {
                    setError(String(Object.values(errors)[0] ?? 'Unable to open the cash session.'));
                    setLoading(false);
                },
                onFinish: () => setLoading(false),
            },
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
                <div className="border-b border-border bg-primary/5 px-6 py-6 text-center">
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                        <Wallet className="h-6 w-6" />
                    </span>
                    <h1 className="text-xl font-black text-foreground">Open today's cash session</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Start your register before using the POS. You can do it here without going to Cash Sessions.
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-5 p-6">
                    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                        <p className="font-bold text-foreground">{branchName}</p>
                        <p className="mt-0.5">{todayLabel}</p>
                    </div>

                    <div>
                        <label htmlFor="pos-opening-cash" className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Opening cash
                        </label>
                        <div className="relative">
                            <span className="absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold text-muted-foreground">{currency}</span>
                            <input
                                id="pos-opening-cash"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                autoFocus
                                value={openingCash}
                                onChange={(event) => setOpeningCash(event.target.value)}
                                className="h-14 w-full rounded-xl border border-border bg-background pr-4 pl-10 text-right text-2xl font-black text-foreground tabular-nums transition outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            Enter the physical cash currently in the drawer. Use 0 if the drawer starts empty.
                        </p>
                    </div>

                    <div>
                        <label htmlFor="pos-session-notes" className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                            Notes <span className="font-normal normal-case">(optional)</span>
                        </label>
                        <textarea
                            id="pos-session-notes"
                            rows={2}
                            maxLength={500}
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="e.g. Morning shift"
                            className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                        >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <Button type="submit" className="h-12 w-full gap-2 text-base font-black" disabled={loading}>
                        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                        {loading ? 'Opening session...' : 'Open Session & Start POS'}
                    </Button>
                </form>
            </div>
        </div>
    );
}

function LayoutSpinner() {
    return (
        <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        </div>
    );
}

// ─── CategoryDropdown ─────────────────────────────────────────────────────────
function CategoryDropdown({
    categories,
    activeCat,
    onChange,
}: {
    categories: Category[];
    activeCat: number | null;
    onChange: (id: number | null) => void;
}) {
    if (!categories.length) return null;
    return (
        <div className="relative shrink-0">
            <select
                value={activeCat ?? ''}
                onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
                className={cn(
                    'h-9 max-w-[160px] min-w-[120px] cursor-pointer appearance-none truncate rounded-xl border bg-background pr-7 pl-3 text-xs transition-colors focus:ring-1 focus:ring-primary focus:outline-none sm:text-sm',
                    activeCat !== null ? 'border-primary/60 font-semibold text-foreground' : 'border-border text-muted-foreground',
                )}
            >
                <option value="">All Categories</option>
                {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            {activeCat !== null && (
                <button
                    onClick={() => onChange(null)}
                    className="absolute top-1/2 right-6 -translate-y-1/2 text-primary transition-colors hover:text-foreground"
                    title="Clear filter"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

// ─── VariantPicker ────────────────────────────────────────────────────────────
function VariantPicker({
    product,
    currency,
    onSelect,
    onClose,
}: {
    product: Product;
    currency: string;
    onSelect: (id: number | null, name: string | null) => void;
    onClose: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-sm animate-in overflow-hidden rounded-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95 fade-in">
                <div className="flex items-start justify-between border-b border-border bg-muted/20 px-5 pt-5 pb-3">
                    <div className="min-w-0 flex-1 pr-3">
                        <p className="leading-snug font-bold text-foreground">{product.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Select product variant</p>
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto p-4">
                    {product.variants
                        .filter((v) => v.is_available)
                        .map((v) => (
                            <button
                                key={v.id}
                                onClick={() => onSelect(v.id, v.name)}
                                disabled={v.stock <= 0}
                                className="flex flex-col items-start gap-1 rounded-xl border border-border bg-background p-3 text-left transition-all hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <span className="text-sm font-semibold text-foreground">{v.name}</span>
                                <span className="text-xs font-bold text-primary">
                                    {v.extra_price > 0 ? `+${fmtMoney(v.extra_price, currency)}` : fmtMoney(product.price, currency)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {v.stock > 0 ? `${fmtQty(v.stock)} in stock` : 'Out of stock'}
                                </span>
                            </button>
                        ))}
                </div>
            </div>
        </div>
    );
}

// ─── PaymentModal (SimSoft Cashier Tender & Customer Credit) ──────────────────
function PaymentModal({
    subtotal,
    settings,
    currency,
    customers,
    customerNameRequired,
    promos,
    cart,
    onConfirm,
    onClose,
    loading,
    serverError,
    initialMethod = 'cash',
    preselectedCustomerId = null,
}: {
    subtotal: number;
    settings: PageProps['settings'];
    currency: string;
    customers: CustomerOption[];
    customerNameRequired?: boolean;
    promos: ActivePromo[];
    cart: CartItem[];
    onConfirm: (d: {
        payment_method: PayMethod;
        payment_amount: number;
        customer_name: string;
        customer_id: number | null;
        due_date?: string | null;
        credit_notes?: string | null;
        discount_percent: number;
        promo_id: number | null;
        loyalty_points: number;
    }) => void;
    onClose: () => void;
    loading: boolean;
    serverError?: string | null;
    initialMethod?: PayMethod;
    preselectedCustomerId?: number | null;
}) {
    const defaultMethod =
        initialMethod || ((METHODS.some((m) => m.value === settings?.default_payment) ? settings?.default_payment : 'cash') as PayMethod);
    const [method, setMethod] = useState<PayMethod>(defaultMethod);
    const [tender, setTender] = useState('');
    const [customer, setCustomer] = useState('');
    const [customerId, setCustomerId] = useState(preselectedCustomerId ? String(preselectedCustomerId) : '');
    const [dueDate, setDueDate] = useState('');
    const [creditNotes, setCreditNotes] = useState('');
    const [discPct, setDiscPct] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<ActivePromo | null>(null);
    const [promoError, setPromoError] = useState('');
    const [showPromos, setShowPromos] = useState(false);
    const [loyaltyPoints, setLoyaltyPoints] = useState('0');

    const isCredit = method === 'credit';
    const isMixed = method === 'mixed';
    const isCash = method === 'cash';
    const needsRegisteredCustomer = isCredit || isMixed;

    const r2 = (v: number) => Math.round(v * 100) / 100;

    const disc = Math.min(parseFloat(discPct) || 0, settings?.max_discount_percent ?? 100);
    const discAmt = r2((subtotal * disc) / 100);
    const afterDisc = r2(subtotal - discAmt);

    const promoAppliesToCart = (p: ActivePromo) => {
        if (p.applies_to === 'all') return true;
        if (p.applies_to === 'specific_products') return cart.some((i) => p.product_ids.includes(i.product_id));
        return p.category_ids.length > 0;
    };
    const computePromoAmt = (p: ActivePromo | null) => {
        if (!p) return 0;
        if (p.minimum_purchase && afterDisc < p.minimum_purchase) return 0;
        return p.discount_type === 'percent' ? r2((afterDisc * p.discount_value) / 100) : Math.min(r2(p.discount_value), afterDisc);
    };
    const promoAmt = computePromoAmt(appliedPromo);
    const afterPromo = r2(afterDisc - promoAmt);

    const vatRate = settings?.vat_enabled && !settings?.vat_inclusive ? (settings.vat_rate ?? 0) : 0;
    const vatAmt = r2((afterPromo * vatRate) / 100);
    const svcRate = settings?.service_charge_enabled ? (settings.service_charge_rate ?? 0) : 0;
    const svcAmt = r2((afterPromo * svcRate) / 100);
    const selectedCustomer = customers.find((c) => String(c.id) === customerId) ?? null;
    const pointsRequested = Math.max(0, Math.floor(Number(loyaltyPoints) || 0));
    const pointsRedeemed =
        selectedCustomer && pointsRequested >= 10
            ? Math.min(pointsRequested, selectedCustomer.loyalty_points, Math.floor(afterPromo + vatAmt + svcAmt), 500)
            : 0;
    const total = r2(afterPromo + vatAmt + svcAmt - pointsRedeemed);

    const tenderN = parseFloat(tender) || 0;
    const change = Math.max(0, tenderN - total);

    const creditPaid = isCredit ? 0 : isMixed ? tenderN : total;
    const creditBalance = Math.max(0, r2(total - Math.min(total, creditPaid)));

    const canPay =
        total > 0 &&
        (!isCash || tenderN >= total) &&
        (!isMixed || (tenderN > 0 && tenderN < total)) &&
        (!needsRegisteredCustomer || !!customerId) &&
        (!customerNameRequired || customer.trim().length > 0);

    const append = (v: string) => setTender((p) => (p === '0' || p === '' ? v : p + v));
    const backspace = () => setTender((p) => p.slice(0, -1));

    const eligiblePromos = promos.filter(promoAppliesToCart);

    const applyPromoCode = () => {
        setPromoError('');
        const code = promoCode.trim().toUpperCase();
        if (!code) return;
        const found = promos.find((p) => p.code?.toUpperCase() === code);
        if (!found) {
            setPromoError('Promo code not found or expired.');
            return;
        }
        if (!promoAppliesToCart(found)) {
            setPromoError('This promo does not apply to any item in the cart.');
            return;
        }
        if (found.minimum_purchase && afterDisc < found.minimum_purchase) {
            setPromoError('Minimum purchase of ' + fmtMoney(found.minimum_purchase, currency) + ' required.');
            return;
        }
        if (computePromoAmt(found) <= 0) {
            setPromoError('This promo gives no discount on the current cart total.');
            return;
        }
        setAppliedPromo(found);
        setPromoError('');
        setShowPromos(false);
    };

    useEffect(() => {
        if (selectedCustomer) setCustomer(selectedCustomer.name);
    }, [selectedCustomer]);

    // Quick due date presets
    const setDueDateDays = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        setDueDate(d.toISOString().slice(0, 10));
    };

    useEffect(() => {
        if (!dueDate && (isCredit || isMixed)) {
            const days = (settings?.default_due_days ?? 0) > 0 ? settings!.default_due_days : 30;
            setDueDateDays(days);
        }
    }, [dueDate, isCredit, isMixed, settings?.default_due_days]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4">
            <div className="flex max-h-[94vh] w-full animate-in flex-col rounded-t-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95 fade-in sm:max-w-lg sm:rounded-2xl">
                {/* Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <div>
                            <p className="text-base font-black tracking-tight text-foreground">Boundary Cafe Tender</p>
                            <p className="text-[11px] text-muted-foreground">Select payment method or charge to credit</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    {/* Big Digital Total Due Banner */}
                    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 text-white shadow-inner">
                        <div>
                            <span className="block text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Total Amount Due</span>
                            <span className="font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{fmtMoney(total, currency)}</span>
                        </div>
                        <div className="space-y-1 text-right font-mono text-xs text-slate-300">
                            <div>Subtotal: {fmtMoney(subtotal, currency)}</div>
                            {disc > 0 && <div className="text-emerald-400">Discount: −{fmtMoney(discAmt, currency)}</div>}
                            {promoAmt > 0 && <div className="text-emerald-400">Promo: −{fmtMoney(promoAmt, currency)}</div>}
                            {vatAmt > 0 && <div>VAT: +{fmtMoney(vatAmt, currency)}</div>}
                        </div>
                    </div>

                    {/* Payment Method Selector */}
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Payment Method</label>
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                            {METHODS.map((m) => {
                                const Icon = m.icon;
                                const isSel = method === m.value;
                                return (
                                    <button
                                        key={m.value}
                                        onClick={() => setMethod(m.value)}
                                        className={cn(
                                            'flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2.5 text-center transition-all select-none',
                                            isSel
                                                ? 'border-primary bg-primary font-bold text-primary-foreground shadow-sm ring-2 ring-primary/20'
                                                : 'border-border font-medium text-foreground hover:border-primary/40 hover:bg-accent',
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        <span className="text-[11px] leading-tight">{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Customer Selection (Always available, required for credit/mixed) */}
                    <div
                        className={cn(
                            'rounded-xl border p-3 transition-all',
                            needsRegisteredCustomer ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-muted/20',
                        )}
                    >
                        <div className="mb-1.5 flex items-center justify-between">
                            <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-foreground uppercase">
                                <User className="h-3.5 w-3.5 text-primary" />
                                Customer{' '}
                                {needsRegisteredCustomer ? <span className="font-black text-destructive">* Required for Credit</span> : '(Optional)'}
                            </label>
                            {selectedCustomer && (
                                <span
                                    className={cn(
                                        'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                        selectedCustomer.credit_balance > 0
                                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                                            : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
                                    )}
                                >
                                    Existing Balance: {fmtMoney(selectedCustomer.credit_balance, currency)}
                                </span>
                            )}
                        </div>

                        <div className="space-y-2">
                            <select
                                value={customerId}
                                onChange={(e) => {
                                    setCustomerId(e.target.value);
                                    const c = customers.find((x) => String(x.id) === e.target.value);
                                    if (c) setCustomer(c.name);
                                }}
                                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                            >
                                <option value="">-- Choose Registered Customer --</option>
                                {customers.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} {c.contact_number ? `(${c.contact_number})` : ''}{' '}
                                        {c.credit_balance > 0 ? `· Bal: ${fmtMoney(c.credit_balance, currency)}` : '· Clean Bal'}
                                    </option>
                                ))}
                            </select>

                            {!needsRegisteredCustomer && (
                                <div className="relative">
                                    <User className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        value={customer}
                                        onChange={(e) => {
                                            setCustomer(e.target.value);
                                            if (customerId) setCustomerId('');
                                        }}
                                        placeholder="Or type walk-in customer name…"
                                        className="h-9 w-full rounded-xl border border-border bg-background pr-3 pl-9 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none sm:text-sm"
                                    />
                                </div>
                            )}
                        </div>
                        {selectedCustomer && (
                            <div className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-black text-blue-700 dark:text-blue-300">Boundary Rewards</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {selectedCustomer.customer_number} · {selectedCustomer.loyalty_points} points available
                                        </p>
                                    </div>
                                    <input
                                        aria-label="Points to redeem"
                                        value={loyaltyPoints}
                                        onChange={(e) => setLoyaltyPoints(e.target.value)}
                                        type="number"
                                        min="0"
                                        max={selectedCustomer.loyalty_points}
                                        className="h-9 w-24 rounded-lg border border-border bg-background px-2 text-right text-sm font-bold"
                                    />
                                </div>
                                {pointsRedeemed > 0 && (
                                    <p className="mt-2 text-xs font-semibold text-emerald-600">
                                        Redeeming {pointsRedeemed} points for {fmtMoney(pointsRedeemed, currency)} off.
                                    </p>
                                )}
                                {pointsRequested > 0 && pointsRequested < 10 && (
                                    <p className="mt-2 text-xs text-amber-600">Minimum redemption is 10 points.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Customer Credit / Utang Details Panel */}
                    {(isCredit || isMixed) && (
                        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                            <div className="flex items-center justify-between">
                                <p className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-amber-700 uppercase dark:text-amber-400">
                                    <Wallet className="h-4 w-4" />{' '}
                                    {isMixed ? 'Partial Payment with Credit' : 'Charge to Customer Account (Full Credit)'}
                                </p>
                                <span className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                    AR CREDIT
                                </span>
                            </div>

                            {/* Downpayment for Mixed */}
                            {isMixed && (
                                <div>
                                    <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Cash Downpayment Collected Now <span className="text-destructive">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                                            {currency}
                                        </span>
                                        <input
                                            value={tender}
                                            onChange={(e) => setTender(e.target.value)}
                                            type="number"
                                            min="0.01"
                                            max={total - 0.01}
                                            step="any"
                                            placeholder="Enter cash downpayment amount…"
                                            className="h-10 w-full rounded-xl border border-border bg-background pr-3 pl-8 font-mono text-base font-bold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                                        />
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {[100, 200, 500, 1000]
                                            .filter((v) => v < total)
                                            .map((v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => setTender(String(v))}
                                                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                                                >
                                                    {currency}
                                                    {v}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Breakdown of Credit Balances */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl border border-border bg-background p-2.5">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Collected Now</p>
                                    <p className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                                        {fmtMoney(Math.min(total, creditPaid), currency)}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-amber-500/30 bg-background p-2.5">
                                    <p className="text-[10px] font-bold text-amber-700 uppercase dark:text-amber-400">New Credit Balance</p>
                                    <p className="font-mono text-base font-black text-amber-700 dark:text-amber-400">
                                        {fmtMoney(creditBalance, currency)}
                                    </p>
                                </div>
                            </div>

                            {/* Due Date with Quick Presets */}
                            <div>
                                <div className="mb-1 flex items-center justify-between">
                                    <label className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Promised Due Date
                                    </label>
                                    <div className="flex gap-1">
                                        {[7, 15, 30].map((days) => (
                                            <button
                                                key={days}
                                                type="button"
                                                onClick={() => setDueDateDays(days)}
                                                className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-foreground transition-colors hover:border-primary/50"
                                            >
                                                +{days}d
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <input
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    type="date"
                                    className="h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none sm:text-sm"
                                />
                            </div>

                            {/* Credit Notes */}
                            <div>
                                <label className="mb-1 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                    Credit Notes / Terms (Optional)
                                </label>
                                <input
                                    value={creditNotes}
                                    onChange={(e) => setCreditNotes(e.target.value)}
                                    placeholder="e.g. Pay after palay harvest / salary payday…"
                                    className="h-9 w-full rounded-xl border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none sm:text-sm"
                                />
                            </div>
                        </div>
                    )}

                    {/* Cash Tender Panel & Quick Presets */}
                    {isCash && (
                        <div className="space-y-3">
                            <div>
                                <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                    Cash Tendered
                                </label>
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-bold text-muted-foreground">{currency}</span>
                                        <span className="font-mono text-3xl font-black text-foreground tabular-nums sm:text-4xl">
                                            {parseFloat(tender || '0').toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    {tenderN >= total && total > 0 && (
                                        <div className="shrink-0 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-right">
                                            <p className="text-[10px] font-bold text-green-700 uppercase dark:text-green-400">Change</p>
                                            <p className="font-mono text-xl font-black text-green-600 tabular-nums dark:text-green-400">
                                                {fmtMoney(change, currency)}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Quick Tender Bills */}
                            <div className="flex flex-wrap gap-1.5">
                                {[total, 50, 100, 200, 500, 1000, 2000]
                                    .filter((v, i) => i === 0 || v >= total)
                                    .slice(0, 6)
                                    .map((v, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setTender(v.toFixed(2))}
                                            className={cn(
                                                'rounded-xl border px-3 py-1.5 text-xs font-bold transition-all',
                                                i === 0
                                                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                                                    : 'border-border text-foreground hover:border-primary/40 hover:bg-accent',
                                            )}
                                        >
                                            {i === 0 ? 'Exact Amount' : fmtMoney(v, currency)}
                                        </button>
                                    ))}
                            </div>

                            {/* Cash Numpad */}
                            <div className="grid grid-cols-3 gap-2">
                                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '⌫'].map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => (k === '⌫' ? backspace() : append(k))}
                                        className="h-11 rounded-xl border border-border bg-background text-base font-bold transition-all hover:border-primary/30 hover:bg-accent active:scale-95"
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Discounts & Promos Dropdown/Accordions */}
                    {settings?.allow_discount && (
                        <div className="border-t border-border/60 pt-2">
                            <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                Senior / PWD / Promo Discount
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                <input
                                    value={discPct}
                                    onChange={(e) => setDiscPct(e.target.value)}
                                    placeholder="0%"
                                    type="number"
                                    min="0"
                                    max={settings.max_discount_percent}
                                    className="h-8 w-20 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                                {[5, 10, 20]
                                    .filter((v) => v <= (settings.max_discount_percent ?? 100))
                                    .map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => setDiscPct(String(v))}
                                            className={cn(
                                                'h-8 rounded-lg border px-2.5 text-xs font-semibold transition-all',
                                                disc === v
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border hover:border-primary/40',
                                            )}
                                        >
                                            {v}%
                                        </button>
                                    ))}
                                {disc > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setDiscPct('')}
                                        className="h-8 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirm Action Button */}
                <div className="shrink-0 border-t border-border bg-muted/10 px-4 pt-3 pb-5">
                    {serverError && (
                        <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{serverError}</span>
                        </div>
                    )}

                    {needsRegisteredCustomer && !customerId && (
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Please select a registered customer to record credit ledger.
                        </p>
                    )}

                    <Button
                        className="h-12 w-full gap-2 text-base font-black tracking-tight shadow-md"
                        disabled={!canPay || loading}
                        onClick={() =>
                            onConfirm({
                                payment_method: method,
                                payment_amount: isCash ? tenderN : isCredit ? 0 : isMixed ? tenderN : total,
                                customer_name: customer,
                                customer_id: customerId ? Number(customerId) : null,
                                due_date: dueDate || null,
                                credit_notes: creditNotes || null,
                                discount_percent: disc,
                                promo_id: appliedPromo?.id ?? null,
                                loyalty_points: pointsRedeemed,
                            })
                        }
                    >
                        {loading ? (
                            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        ) : isCredit ? (
                            <>
                                <Wallet className="h-4 w-4" />
                                Charge {fmtMoney(total, currency)} to Customer Account
                            </>
                        ) : isMixed ? (
                            <>
                                <Banknote className="h-4 w-4" />
                                Collect {fmtMoney(tenderN, currency)} & Credit {fmtMoney(creditBalance, currency)}
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4" />
                                Complete Sale · {fmtMoney(total, currency)}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── SaleSuccessModal ─────────────────────────────────────────────────────────
function SaleSuccessModal({ receipt, currency, onNewSale }: { receipt: ReceiptData; currency: string; onNewSale: () => void }) {
    const isCredit = receipt.payment_method === 'credit' || receipt.payment_method === 'mixed';
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full animate-in flex-col rounded-t-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95 fade-in sm:max-w-md sm:rounded-2xl">
                <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/20 px-5 py-4">
                    <div
                        className={cn(
                            'rounded-full p-2',
                            isCredit
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400',
                        )}
                    >
                        {isCredit ? <Wallet className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <div>
                        <p className="text-base font-black text-foreground">{isCredit ? 'Customer Credit Recorded' : 'Transaction Completed'}</p>
                        <p className="font-mono text-xs font-semibold text-muted-foreground">{receipt.receipt_number}</p>
                    </div>
                </div>

                {/* Credit Summary Card */}
                {isCredit && (
                    <div className="mx-4 mt-4 space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs">
                        <div className="flex justify-between font-bold text-amber-800 dark:text-amber-300">
                            <span>Customer: {receipt.customer_name}</span>
                            <span className="uppercase">{receipt.payment_status}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Amount Paid Now:</span>
                            <span className="font-semibold text-foreground">{fmtMoney(receipt.amount_paid ?? 0, currency)}</span>
                        </div>
                        <div className="flex justify-between border-t border-amber-500/20 pt-1 text-sm font-black text-amber-700 dark:text-amber-400">
                            <span>Balance Due (Utang):</span>
                            <span>{fmtMoney(receipt.balance_due ?? 0, currency)}</span>
                        </div>
                        {receipt.due_date && (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3" /> Due Date: {receipt.due_date}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-4">
                    <ReceiptTemplate sale={receipt} currency={currency} showActions={true} />
                </div>
                <div className="shrink-0 border-t border-border px-4 pt-3 pb-5">
                    <Button className="h-11 w-full gap-2 font-black shadow-md" onClick={onNewSale}>
                        <ShoppingCart className="h-4 w-4" />
                        New Transaction [Enter]
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── VoidCartModal ────────────────────────────────────────────────────────────
function VoidCartModal({
    cart,
    subtotal,
    itemCount,
    currency,
    onConfirm,
    onClose,
}: {
    cart: CartItem[];
    subtotal: number;
    itemCount: number;
    currency: string;
    onConfirm: () => void;
    onClose: () => void;
}) {
    // Keyboard listener: Escape to cancel, Enter to confirm void
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onClose, onConfirm]);

    const uniqueCount = cart.length;

    return (
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-150 fade-in">
            <div className="flex w-full max-w-md animate-in flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
                            <Trash2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold tracking-tight text-foreground">Void Active Transaction</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">Clear all items in current register sale</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Cancel (Esc)"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body Content */}
                <div className="space-y-4 p-5">
                    {/* Cart Summary Card */}
                    <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Active Items</span>
                            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-bold text-foreground">
                                {uniqueCount} item{uniqueCount > 1 ? 's' : ''} ({itemCount} pcs)
                            </span>
                        </div>

                        {/* Item preview list */}
                        <div className="max-h-36 divide-y divide-border/50 overflow-y-auto rounded-lg border border-border/60 bg-background/50 px-3">
                            {cart.map((item) => (
                                <div key={item.key} className="flex items-center justify-between py-2 text-xs">
                                    <div className="min-w-0 flex-1 pr-3">
                                        <p className="truncate font-semibold text-foreground">{item.name}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {item.qty} {item.unit} × {fmtMoney(item.price, currency)}
                                            {item.variant_name ? ` · ${item.variant_name}` : ''}
                                        </p>
                                    </div>
                                    <span className="shrink-0 font-mono font-bold text-foreground">{fmtMoney(item.price * item.qty, currency)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Total Due Row */}
                        <div className="flex items-center justify-between border-t border-border/80 pt-1">
                            <span className="text-xs font-bold text-foreground">Transaction Total</span>
                            <span className="font-mono text-base font-black text-destructive">{fmtMoney(subtotal, currency)}</span>
                        </div>
                    </div>

                    {/* Warning Callout */}
                    <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                            <span className="font-bold">Are you sure?</span> This will clear all scanned products from the register and reset the
                            active cart. This action cannot be undone.
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex shrink-0 items-center gap-3 border-t border-border bg-muted/10 px-5 py-3.5">
                    <Button type="button" variant="outline" className="h-10 flex-1 cursor-pointer gap-1.5 text-xs font-semibold" onClick={onClose}>
                        <span>Keep Transaction</span>
                        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                            Esc
                        </kbd>
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        className="h-10 flex-1 cursor-pointer gap-1.5 text-xs font-bold shadow-sm"
                        onClick={onConfirm}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Yes, Void Transaction</span>
                        <kbd className="hidden rounded bg-destructive-foreground/20 px-1.5 py-0.5 font-mono text-[10px] text-destructive-foreground/80 sm:inline">
                            Enter
                        </kbd>
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── SimSoft Cashier Table View (Fast Cashiering Mode) ────────────────────────
function SimSoftCashierTable({
    cart,
    currency,
    onUpdateQty,
    onSetExactQty,
    onOpenCalc,
    onRemove,
    onClear,
    onCharge,
    onCustomerCredit,
    lastScanned,
}: {
    cart: CartItem[];
    currency: string;
    onUpdateQty: (key: string, delta: number) => void;
    onSetExactQty: (key: string, qty: number) => void;
    onOpenCalc?: (item: CartItem) => void;
    onRemove: (key: string) => void;
    onClear: () => void;
    onCharge: () => void;
    onCustomerCredit: () => void;
    lastScanned: { name: string; qty: number; unit: string; price: number; total: number; targetAmount?: number } | null;
}) {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {/* ── SimSoft Digital LED Total Board ───────────────────────────── */}
            <div className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 text-white shadow-inner select-none">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        <span className="font-mono text-[11px] font-bold tracking-widest text-emerald-400 uppercase">SimSoft Register Display</span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-4xl font-black tracking-tight text-white lg:text-5xl">
                        {fmtMoney(subtotal, currency)}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                    <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Total Items / Weight</div>
                        <div className="font-mono text-lg font-black whitespace-nowrap text-emerald-300">
                            {cart.length} lines · {fmtQty(totalQty)} units
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            onClick={onCharge}
                            disabled={cart.length === 0}
                            className="h-12 gap-2 bg-emerald-600 px-6 text-sm font-black tracking-wide whitespace-nowrap text-white shadow-lg hover:bg-emerald-500"
                        >
                            <Zap className="h-4 w-4" /> Tender [F9]
                        </Button>
                    </div>
                </div>
            </div>

            {/* Last Scanned Item Banner */}
            {lastScanned && (
                <div className="flex shrink-0 items-center justify-between border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5 font-bold">
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Last scanned: {lastScanned.name}
                        {lastScanned.targetAmount && (
                            <span className="ml-1 rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                Auto-detected from ₱{lastScanned.targetAmount.toFixed(2)}
                            </span>
                        )}
                    </span>
                    <span className="font-mono">
                        {fmtQty(lastScanned.qty)} {lastScanned.unit} @ {fmtMoney(lastScanned.price, currency)} ={' '}
                        <strong>{fmtMoney(lastScanned.total, currency)}</strong>
                    </span>
                </div>
            )}

            {/* ── Transaction Table ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto">
                {cart.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                        <Scale className="h-14 w-14 text-primary opacity-20" />
                        <div>
                            <p className="text-base font-bold text-foreground">Transaction Register Ready</p>
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                                Scan barcodes or enter multiplier{' '}
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold text-primary">1.4*BARCODE</code> or amount{' '}
                                <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold text-amber-600">50p*BARCODE</code> for weighted
                                Rice & Feeds.
                            </p>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F1 Scan</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F3 Credit</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F4 Visual</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F9 Pay</span>
                        </div>
                    </div>
                ) : (
                    <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 text-[10px] font-bold tracking-wider text-muted-foreground uppercase backdrop-blur-xs">
                            <tr>
                                <th className="w-10 px-3 py-2.5 text-center">#</th>
                                <th className="min-w-[180px] px-3 py-2.5">Item Description</th>
                                <th className="w-20 px-3 py-2.5 text-center">Unit</th>
                                <th className="w-24 px-3 py-2.5 text-right">Price</th>
                                <th className="w-56 px-3 py-2.5 text-center whitespace-nowrap">Quantity & Presyo</th>
                                <th className="w-28 px-3 py-2.5 text-right">Total</th>
                                <th className="w-12 px-3 py-2.5 text-center">Del</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {cart.map((item, idx) => {
                                const rawUnit = item.unit || '';
                                const isKg = isWeightedKgItem(rawUnit, item.name);
                                const unit = rawUnit || (isKg ? 'kg' : 'pc');
                                return (
                                    <tr key={item.key} className="group transition-colors hover:bg-muted/40">
                                        <td className="px-3 py-2.5 text-center font-mono font-semibold text-muted-foreground">{idx + 1}</td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <ProductThumbnail
                                                    src={item.product_img}
                                                    name={item.name}
                                                    unit={item.unit}
                                                    className="h-8 w-8 shrink-0 rounded-lg border border-border"
                                                    padding="p-0.5"
                                                    aspect="aspect-square"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm leading-snug font-bold text-foreground">{item.name}</p>
                                                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                                                        {item.barcode && <span>{item.barcode}</span>}
                                                        {item.variant_name && (
                                                            <span className="font-semibold text-primary">[{item.variant_name}]</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <span
                                                className={cn(
                                                    'rounded-md px-2 py-0.5 text-[10px] font-black uppercase',
                                                    isKg
                                                        ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                        : unit === 'sack' || unit === 'bag'
                                                          ? 'border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                          : 'bg-muted text-muted-foreground',
                                                )}
                                            >
                                                {unit.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                                            {fmtMoney(item.price, currency)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? -0.25 : -1)}
                                                    title={isKg ? '-0.25 kg' : '-1'}
                                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background font-bold hover:bg-muted"
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </button>

                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0.001"
                                                    value={item.qty}
                                                    onChange={(e) => onSetExactQty(item.key, parseFloat(e.target.value) || 0)}
                                                    className="h-7 w-16 rounded-lg border border-border bg-background text-center font-mono text-sm font-black text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                                />

                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? 0.25 : 1)}
                                                    title={isKg ? '+0.25 kg' : '+1'}
                                                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background font-bold hover:bg-muted"
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </button>

                                                {onOpenCalc && isKg && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenCalc(item)}
                                                        title="Timbang & Presyo Calculator (₱ / kg)"
                                                        className="flex h-7 items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 text-xs font-bold text-primary shadow-xs hover:bg-primary/20"
                                                    >
                                                        <Calculator className="h-3.5 w-3.5" />
                                                        <span>Calc</span>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-primary">
                                            {fmtMoney(item.price * item.qty, currency)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center">
                                            <button
                                                onClick={() => onRemove(item.key)}
                                                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Table Footer & Fast Action Bar ─────────────────────────────── */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                    {cart.length > 0 && (
                        <button
                            onClick={onClear}
                            className="flex h-9 items-center gap-1.5 rounded-xl border border-destructive/30 px-3 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10"
                        >
                            <Trash2 className="h-3.5 w-3.5" /> Clear All [F8]
                        </button>
                    )}
                    <button
                        onClick={onCustomerCredit}
                        disabled={cart.length === 0}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-30 dark:text-amber-300"
                    >
                        <Wallet className="h-3.5 w-3.5" /> Credit / Utang [F3]
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="block text-[10px] font-bold text-muted-foreground uppercase">Subtotal</span>
                        <span className="font-mono text-xl font-black text-foreground">{fmtMoney(subtotal, currency)}</span>
                    </div>

                    <Button onClick={onCharge} disabled={cart.length === 0} className="h-10 gap-2 px-5 text-sm font-black shadow-sm">
                        <Zap className="h-4 w-4" /> Charge [F9]
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Standard Cart Panel (Used in Visual Grid Mode) ───────────────────────────
function CartPanel({
    cart,
    subtotal,
    itemCount,
    currency,
    error,
    onUpdateQty,
    onSetExactQty,
    onOpenCalc,
    onRemove,
    onClear,
    onCharge,
}: {
    cart: CartItem[];
    subtotal: number;
    itemCount: number;
    currency: string;
    error: string | null;
    onUpdateQty: (key: string, d: number) => void;
    onSetExactQty: (key: string, qty: number) => void;
    onOpenCalc?: (item: CartItem) => void;
    onRemove: (key: string) => void;
    onClear: () => void;
    onCharge: () => void;
}) {
    return (
        <div className="flex h-full flex-col bg-card">
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    <span className="text-sm font-bold">Active Cart</span>
                    {itemCount > 0 && (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                            {fmtQty(itemCount)}
                        </span>
                    )}
                </div>
                {cart.length > 0 && (
                    <button
                        onClick={onClear}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
                    >
                        <Trash2 className="h-3 w-3" />
                        Clear
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                {cart.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted-foreground">
                        <ShoppingCart className="h-10 w-10 opacity-15" />
                        <div>
                            <p className="text-sm font-bold text-foreground">Cart is empty</p>
                            <p className="mt-1 text-xs opacity-60">
                                Select a product or scan barcode
                                <br />
                                Press F9 to tender
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-border/50 px-3 py-2">
                        {cart.map((item) => {
                            const rawUnit = item.unit || '';
                            const isKg = isWeightedKgItem(rawUnit, item.name);
                            const unit = rawUnit || (isKg ? 'kg' : 'pc');
                            return (
                                <div key={item.key} className="group space-y-1.5 py-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs leading-snug font-bold break-words text-foreground">{item.name}</p>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                <span
                                                    className={cn(
                                                        'py-0.2 rounded px-1.5 text-[9px] font-black uppercase',
                                                        isKg
                                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                            : 'bg-muted text-muted-foreground',
                                                    )}
                                                >
                                                    {unit.toUpperCase()}
                                                </span>
                                                <span className="text-xs font-bold text-primary tabular-nums">
                                                    {fmtMoney(item.price, currency)}/{unit}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => onRemove(item.key)}
                                            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all group-hover:opacity-100 hover:text-destructive"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    {/* Quantity editor row */}
                                    <div className="flex flex-col gap-1 pt-0.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? -0.25 : -1)}
                                                    title={isKg ? '-0.25 kg' : '-1'}
                                                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                                                >
                                                    <Minus className="h-2.5 w-2.5" />
                                                </button>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    min="0.001"
                                                    value={item.qty}
                                                    onChange={(e) => onSetExactQty(item.key, parseFloat(e.target.value) || 0)}
                                                    className="h-6 w-14 rounded-md border border-border bg-background text-center font-mono text-xs font-bold"
                                                />
                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? 0.25 : 1)}
                                                    title={isKg ? '+0.25 kg' : '+1'}
                                                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                                                >
                                                    <Plus className="h-2.5 w-2.5" />
                                                </button>

                                                {onOpenCalc && isKg && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenCalc(item)}
                                                        title="Timbang & Presyo Calculator (₱ / kg)"
                                                        className="flex h-6 items-center gap-0.5 rounded-md border border-primary/40 bg-primary/10 px-1.5 text-[9px] font-bold text-primary hover:bg-primary/20"
                                                    >
                                                        <Calculator className="h-2.5 w-2.5" />
                                                    </button>
                                                )}
                                            </div>

                                            <span className="font-mono text-xs font-black text-foreground tabular-nums">
                                                {fmtMoney(item.price * item.qty, currency)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {cart.length > 0 && (
                <div className="shrink-0 space-y-3 border-t border-border bg-muted/10 p-4">
                    <div className="flex items-end justify-between">
                        <span className="text-xs text-muted-foreground">{fmtQty(itemCount)} unit(s)</span>
                        <div className="text-right">
                            <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Subtotal</p>
                            <p className="font-mono text-2xl font-black text-foreground tabular-nums">{fmtMoney(subtotal, currency)}</p>
                        </div>
                    </div>
                    <Button className="h-12 w-full gap-2 text-base font-black shadow-sm" onClick={onCharge}>
                        <Zap className="h-4 w-4" />
                        Charge [F9]
                    </Button>
                    {error && (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main POS Component ───────────────────────────────────────────────────────
export default function PosIndex() {
    const { props } = usePage<PageProps>();
    const { products, customers = [], categories, session, branch, settings, app } = props;
    const promos = (props.promos as ActivePromo[]) ?? [];
    const user = props.auth?.user;
    const currency = app?.currency ?? '₱';
    const layout = (props.preferred_layout ?? 'grid') as LayoutMode;

    const [cart, setCart] = useState<CartItem[]>([]);
    const [search, setSearch] = useState('');
    const [activeCat, setActiveCat] = useState<number | null>(null);
    const [showPayment, setShowPayment] = useState(false);
    const [paymentMethodPreset, setPaymentMethodPreset] = useState<PayMethod>('cash');
    const [receipt, setReceipt] = useState<ReceiptData | null>(null);
    const [fastMode, setFastMode] = useState(true); // Default to SimSoft Fast Cashiering table!
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [variantFor, setVariantFor] = useState<Product | null>(null);
    const [lastScanned, setLastScanned] = useState<{
        name: string;
        qty: number;
        unit: string;
        price: number;
        total: number;
        targetAmount?: number;
    } | null>(null);
    const [calcItem, setCalcItem] = useState<CartItem | null>(null);
    const [showVoidConfirm, setShowVoidConfirm] = useState(false);

    const visualLayout = layout === 'grocery' ? 'grid' : layout;
    const searchRef = useRef<HTMLInputElement>(null);

    // Auto-focus barcode scanner on mount
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const refocus = useCallback((delay = 0) => {
        setTimeout(() => searchRef.current?.focus(), delay);
    }, []);

    const filtered = useMemo(() => {
        let list = products.filter((p) => p.product_type !== 'ingredient');
        if (activeCat) list = list.filter((p) => p.category?.id === activeCat);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q));
        }
        return list;
    }, [products, activeCat, search]);

    const quickPickProducts = useMemo(() => {
        let list = products.filter((p) => p.product_type !== 'ingredient');
        if (activeCat) {
            list = list.filter((p) => p.category?.id === activeCat);
        } else if (search.trim() && filtered.length > 0) {
            return filtered;
        }
        return list;
    }, [products, activeCat, search, filtered]);

    const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

    const laundryMode = settings?.laundry_mode ?? 'auto';
    const isLaundryMode = laundryMode === 'enabled' || (laundryMode === 'auto' && branch?.business_type === 'laundry');
    const requireCustomerName = !!settings?.require_customer_name || branch?.business_type === 'salon' || isLaundryMode;

    // Helper to parse multiplier or peso amount:
    // "1.4*4806511010012" -> qty: 1.4, term: "4806511010012"
    // "50p*4806511010012" -> targetAmount: 50, term: "4806511010012" (Auto-detects kg from ₱50)
    // "p50*DINORADO"      -> targetAmount: 50, term: "DINORADO"
    // "500g*4806511010012"-> qty: 0.5, term: "4806511010012"
    const parseBarcodeMultiplier = (input: string): { qty: number; targetAmount?: number; term: string } => {
        let trimmed = input.trim();
        // If QR code scanned was a URL (e.g. http://localhost:8000/products/76 or .../15545992), extract last segment
        if (trimmed.includes('http://') || trimmed.includes('https://')) {
            const urlParts = trimmed.split('/').filter(Boolean);
            trimmed = urlParts[urlParts.length - 1] || trimmed;
        }

        if (trimmed.includes('*')) {
            const parts = trimmed.split('*');
            const prefix = parts[0].trim().toLowerCase();
            const term = parts.slice(1).join('*').trim();

            // Check for peso amount prefix: "50p", "p50", "₱50", "50php"
            if (prefix.startsWith('p') || prefix.startsWith('₱') || prefix.endsWith('p') || prefix.endsWith('php')) {
                const cleanAmt = parseFloat(prefix.replace(/[p₱php]/gi, ''));
                if (!isNaN(cleanAmt) && cleanAmt > 0) {
                    return { qty: 1, targetAmount: cleanAmt, term };
                }
            }

            // Check for grams prefix: "500g", "250g"
            if (prefix.endsWith('g') && !prefix.endsWith('kg')) {
                const grams = parseFloat(prefix.replace(/g/gi, ''));
                if (!isNaN(grams) && grams > 0) {
                    return { qty: Math.round((grams / 1000) * 1000) / 1000, term };
                }
            }

            // Weight prefix: e.g. "1.4", "1.5k", "0.75"
            const cleanWeight = parseFloat(prefix.replace(/k|kg/gi, ''));
            return {
                qty: !isNaN(cleanWeight) && cleanWeight > 0 ? cleanWeight : 1,
                term,
            };
        }

        // Space separated syntax: e.g. "50p dinorado", "p50 feeds", "1.5k dinorado"
        const spaceMatch = trimmed.match(/^([p₱]?\d+(\.\d+)?[p]?|(\d+(\.\d+)?)k?g?)\s+(.+)$/i);
        if (spaceMatch) {
            const prefix = spaceMatch[1].toLowerCase();
            const term = spaceMatch[5].trim();

            if (prefix.startsWith('p') || prefix.startsWith('₱') || prefix.endsWith('p')) {
                const cleanAmt = parseFloat(prefix.replace(/[p₱]/gi, ''));
                if (!isNaN(cleanAmt) && cleanAmt > 0) {
                    return { qty: 1, targetAmount: cleanAmt, term };
                }
            }

            if (prefix.endsWith('g') && !prefix.endsWith('kg')) {
                const grams = parseFloat(prefix.replace(/g/gi, ''));
                if (!isNaN(grams) && grams > 0) {
                    return { qty: Math.round((grams / 1000) * 1000) / 1000, term };
                }
            }

            const cleanWeight = parseFloat(prefix.replace(/k|kg/gi, ''));
            if (!isNaN(cleanWeight) && cleanWeight > 0 && (prefix.includes('.') || prefix.includes('k'))) {
                return { qty: cleanWeight, term };
            }
        }

        return { qty: 1, term: trimmed };
    };

    // Add item with fractional quantity support (e.g. 1.4 kg Rice, 0.5 kg Feeds, or auto-calculated from ₱50)
    const addItem = useCallback(
        (
            product: Product,
            qtyToAdd: number = 1,
            variantId: number | null = null,
            variantName: string | null = null,
            targetAmount: number | null = null,
        ) => {
            const selectedVariant = variantId ? product.variants.find((v) => v.id === variantId) : null;
            const extra = selectedVariant?.extra_price ?? 0;
            const price = product.price + extra;
            const key = `${product.id}-${variantId ?? 'base'}`;
            const rawStock = selectedVariant?.stock ?? product.stock;
            const stockLim =
                product.product_type === 'bundle' || product.product_type === 'made_to_order' ? 999999 : rawStock > 0 ? rawStock : 999999;
            const isKg = isWeightedKgItem(product.unit, product.name);
            const unit = product.unit || (isKg ? 'kg' : 'pc');

            setCart((prev) => {
                const ex = prev.find((i) => i.key === key);
                if (ex) {
                    const nextQty = Math.round((ex.qty + qtyToAdd) * 1000) / 1000;
                    return prev.map((i) => (i.key === key ? { ...i, qty: nextQty } : i));
                }
                const initialQty = Math.max(0.001, qtyToAdd);
                return [
                    ...prev,
                    {
                        key,
                        product_id: product.id,
                        variant_id: variantId,
                        name: product.name,
                        unit,
                        barcode: product.barcode,
                        product_img: getProductImage(product),
                        variant_name: variantName,
                        price,
                        qty: initialQty,
                        stock: stockLim,
                        product_type: product.product_type,
                        bundle_items: product.bundle_items ?? null,
                        recipe_items: product.recipe_items ?? null,
                    },
                ];
            });

            setLastScanned({
                name: product.name,
                qty: qtyToAdd,
                unit,
                price,
                total: price * qtyToAdd,
                targetAmount: targetAmount ?? undefined,
            });
        },
        [],
    );

    const handleProductClick = useCallback(
        (p: Product, qty: number = 1, targetAmount: number | null = null) => {
            if (p.has_variants && p.variants.filter((v) => v.is_available).length > 0) {
                setVariantFor(p);
                return;
            }

            // If targetAmount is provided (e.g. ₱50), compute exact kg from product price
            let effectiveQty = qty;
            if (targetAmount && targetAmount > 0 && p.price > 0) {
                effectiveQty = Math.round((targetAmount / p.price) * 1000) / 1000;
            }

            addItem(p, effectiveQty, null, null, targetAmount);
            setSearch('');
            refocus();
        },
        [addItem, refocus],
    );

    // Enter key: Exact barcode or product ID or name or multiplier
    const handleSearchKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const parsed = parseBarcodeMultiplier(search);
            if (!parsed.term) return;

            const term = parsed.term.trim().toLowerCase();

            const executeMatch = (matchedProduct: Product) => {
                setError(null);
                const finalQty =
                    parsed.targetAmount && matchedProduct.price > 0
                        ? Math.round((parsed.targetAmount / matchedProduct.price) * 1000) / 1000
                        : parsed.qty;
                handleProductClick(matchedProduct, finalQty, parsed.targetAmount ?? null);
                setSearch('');
            };

            // Priority 1: Exact barcode (case-insensitive)
            const byBarcode = products.find((p) => (p.barcode ?? '').trim().toLowerCase() === term);
            if (byBarcode) {
                executeMatch(byBarcode);
                return;
            }

            // Priority 2: Product ID
            const byId = products.find((p) => String(p.id) === term);
            if (byId) {
                executeMatch(byId);
                return;
            }

            // Priority 3: Exact name match
            const byName = products.find((p) => p.name.trim().toLowerCase() === term);
            if (byName) {
                executeMatch(byName);
                return;
            }

            // Priority 4: Only 1 matching filtered item
            const matches = products.filter((p) => p.name.toLowerCase().includes(term) || (p.barcode ?? '').toLowerCase().includes(term));
            if (matches.length === 1) {
                executeMatch(matches[0]);
                return;
            }

            if (matches.length === 0) {
                setError(`Barcode or product "${parsed.term}" not found.`);
            }
        },
        [search, products, handleProductClick],
    );

    const updateQty = (key: string, delta: number) => {
        setCart((prev) =>
            prev.flatMap((i) => {
                if (i.key !== key) return [i];
                const nq = Math.round((i.qty + delta) * 1000) / 1000;
                if (nq <= 0) return [];
                return [{ ...i, qty: nq }];
            }),
        );
    };

    const setExactQty = (key: string, newQty: number) => {
        setCart((prev) =>
            prev.flatMap((i) => {
                if (i.key !== key) return [i];
                if (newQty <= 0) return [];
                const safeQty = Math.round(newQty * 1000) / 1000;
                return [{ ...i, qty: safeQty }];
            }),
        );
    };

    const removeItem = (key: string) => setCart((prev) => prev.filter((i) => i.key !== key));
    const clearCart = () => {
        if (cart.length === 0) return;
        setShowVoidConfirm(true);
    };

    const confirmVoidCart = () => {
        setCart([]);
        setLastScanned(null);
        setShowVoidConfirm(false);
        refocus();
    };

    // Checkout Confirmation
    const handleConfirm = (payData: {
        payment_method: PayMethod;
        payment_amount: number;
        customer_name: string;
        customer_id: number | null;
        due_date?: string | null;
        credit_notes?: string | null;
        discount_percent: number;
        promo_id: number | null;
        loyalty_points: number;
    }) => {
        if (!cart.length) return;
        setLoading(true);
        setError(null);
        router.post(
            routes.pos.store(),
            {
                items: cart.map((i) => ({ id: i.product_id, qty: i.qty, variant_id: i.variant_id })),
                payment_method: payData.payment_method,
                payment_amount: payData.payment_amount,
                customer_name: payData.customer_name || null,
                customer_id: payData.customer_id,
                due_date: payData.due_date ?? null,
                credit_notes: payData.credit_notes ?? null,
                discount_percent: payData.discount_percent,
                promo_id: payData.promo_id ?? null,
                loyalty_points: payData.loyalty_points,
                cash_session_id: session?.id ?? null,
            },
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const flash = (page.props as any).flash ?? {};
                    if (!flash.pos_result) {
                        setError(flash.errors?.error ?? 'Checkout failed — please verify customer or items.');
                        setLoading(false);
                        return;
                    }
                    const r = flash.pos_result;
                    const disc = r.discount_amount ?? 0;
                    const pd = r.promo_discount ?? 0;
                    setReceipt({
                        receipt_number: r.receipt_number ?? '—',
                        status: 'completed',
                        payment_method: payData.payment_method,
                        payment_amount: payData.payment_amount,
                        amount_paid: r.amount_paid ?? payData.payment_amount,
                        balance_due: r.balance_due ?? 0,
                        payment_status: r.payment_status ?? 'paid',
                        due_date: r.due_date ?? payData.due_date ?? null,
                        change_amount: r.change ?? 0,
                        discount_amount: disc + pd,
                        total: r.total,
                        customer_name: r.customer_name ?? (payData.customer_name || null),
                        notes:
                            [
                                payData.discount_percent > 0 ? `Discount ${payData.discount_percent}%` : null,
                                r.promo_name ? `Promo: ${r.promo_name}` : null,
                                r.service_charge_amount > 0 ? `Service charge ${fmtMoney(r.service_charge_amount, currency)}` : null,
                            ]
                                .filter(Boolean)
                                .join(' | ') || null,
                        created_at: new Date().toISOString(),
                        cashier: user ? `${user.fname} ${user.lname}` : '—',
                        branch_name: branch?.name,
                        table_label: null,
                        business_type: branch?.business_type,
                        items: cart.map((i) => ({
                            product_name: i.name,
                            variant_name: i.variant_name,
                            quantity: i.qty,
                            price: i.price,
                            unit: i.unit,
                            total: i.price * i.qty,
                        })),
                    });
                    setShowPayment(false);
                    setCart([]);
                    setLastScanned(null);
                    setLoading(false);
                },
                onError: (errors) => {
                    setError((Object.values(errors)[0] as string) ?? 'Transaction failed.');
                    setLoading(false);
                },
            },
        );
    };

    // Global Hardware Scanner Listener: Catches barcode & QR scanner bursts even if search input lost focus
    const scannerBufferRef = useRef<string>('');
    const lastKeyTimeRef = useRef<number>(0);

    useEffect(() => {
        const handleGlobalScan = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Tab', 'Escape'].includes(e.key)) return;

            const now = Date.now();
            const diff = now - lastKeyTimeRef.current;
            lastKeyTimeRef.current = now;

            const activeTag = document.activeElement?.tagName?.toLowerCase();
            const isInsideInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

            // If user is already focused inside an input (like search input), let the input handle it
            if (isInsideInput) {
                scannerBufferRef.current = '';
                return;
            }

            if (e.key === 'Enter') {
                const scannedBuffer = scannerBufferRef.current.trim();
                scannerBufferRef.current = '';

                if (scannedBuffer.length >= 2) {
                    const parsed = parseBarcodeMultiplier(scannedBuffer);
                    const term = parsed.term.trim().toLowerCase();
                    const matched = products.find((p) => (p.barcode ?? '').trim().toLowerCase() === term || String(p.id) === term);
                    if (matched) {
                        e.preventDefault();
                        e.stopPropagation();
                        const finalQty =
                            parsed.targetAmount && matched.price > 0 ? Math.round((parsed.targetAmount / matched.price) * 1000) / 1000 : parsed.qty;
                        handleProductClick(matched, finalQty, parsed.targetAmount ?? null);
                        setSearch('');
                        refocus();
                        return;
                    }
                }
            } else if (e.key.length === 1) {
                // If keys arrive in fast sequence (<100ms), it's a scanner typing burst
                if (diff > 100) {
                    scannerBufferRef.current = e.key;
                } else {
                    scannerBufferRef.current += e.key;
                }
            }
        };

        window.addEventListener('keydown', handleGlobalScan);
        return () => window.removeEventListener('keydown', handleGlobalScan);
    }, [products, handleProductClick, refocus]);

    // ── POS System Hotkeys ──────────────────────────────────────────────────────
    // Overrides PC & browser shortcuts (e.g. F1 Help, F3 Find, F4/F6 URL bar, F7 Caret, F10 Menu)
    // to strictly prioritize the POS system's custom cashier actions.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = (e.key || '').toUpperCase();
            const code = (e.code || '').toUpperCase();
            const isKey = (name: string) => key === name || code === name;

            // Intercept all function keys (F1-F12) to prevent browser/PC default actions
            if (/^F([1-9]|1[0-2])$/.test(key) || /^F([1-9]|1[0-2])$/.test(code)) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }
            }

            // F1 / F2: Focus and select Barcode & Product Search input
            if (isKey('F1') || isKey('F2')) {
                searchRef.current?.focus();
                searchRef.current?.select();
                return;
            }

            // F3: Customer Credit / Utang
            if (isKey('F3')) {
                if (cart.length > 0) {
                    setError(null);
                    setPaymentMethodPreset('credit');
                    setShowPayment(true);
                } else {
                    searchRef.current?.focus();
                }
                return;
            }

            // F4: Toggle Fast Cashiering Mode vs Visual Catalog
            if (isKey('F4')) {
                if (!showPayment && !calcItem) {
                    setFastMode((v) => !v);
                }
                return;
            }

            // F5: Prevent accidental reload during cashier transaction
            if (isKey('F5')) {
                if (cart.length > 0) {
                    return; // Protect active transaction
                } else {
                    window.location.reload();
                    return;
                }
            }

            // F8: Void / Clear Transaction (opens confirmation modal)
            if (isKey('F8')) {
                if (cart.length > 0 && !showPayment) {
                    clearCart();
                }
                return;
            }

            // F9: Charge / Cash Tender
            if (isKey('F9')) {
                if (cart.length > 0 && !showPayment) {
                    setError(null);
                    setPaymentMethodPreset('cash');
                    setShowPayment(true);
                }
                return;
            }

            // Escape: Dismiss active modal or clear search
            if (isKey('ESCAPE') || isKey('ESC')) {
                e.preventDefault();
                e.stopPropagation();
                setShowPayment(false);
                setShowVoidConfirm(false);
                setVariantFor(null);
                setCalcItem(null);
                setSearch('');
                refocus();
                return;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = (e.key || '').toUpperCase();
            const code = (e.code || '').toUpperCase();
            if (/^F([1-9]|1[0-2])$/.test(key) || /^F([1-9]|1[0-2])$/.test(code)) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === 'function') {
                    e.stopImmediatePropagation();
                }
            }
        };

        const handleHelp = (e: Event) => {
            e.preventDefault();
            return false;
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
        window.addEventListener('keyup', handleKeyUp, { capture: true, passive: false });
        window.addEventListener('help', handleHelp, { capture: true, passive: false });
        (window as any).onhelp = handleHelp;

        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            window.removeEventListener('keyup', handleKeyUp, { capture: true });
            window.removeEventListener('help', handleHelp, { capture: true });
            (window as any).onhelp = null;
        };
    }, [cart, clearCart, showPayment, calcItem, refocus]);

    // Protect active cashier transaction from accidental tab close or page navigation
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (cart.length > 0) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [cart.length]);

    // Combined search input
    const searchInput = (
        <div className="relative max-w-sm flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                    setError(null);
                    setSearch(e.target.value);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Scan or type 1.4*BARCODE… (F1/F2)"
                className="h-9 w-full rounded-xl border border-border bg-background pr-8 pl-9 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:outline-none sm:text-sm"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-gramm="false"
            />
            {search ? (
                <button
                    onClick={() => {
                        setSearch('');
                        refocus();
                    }}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            ) : (
                <ScanLine className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            )}
        </div>
    );

    const cashierNeedsSession = user?.is_cashier === true && !session;
    const noSessionOverlay = cashierNeedsSession ? <CashSessionGate currency={currency} branchName={branch?.name ?? 'Assigned branch'} /> : null;

    // ── Kiosk Layout ─────────────────────────────────────────────────────────
    if (layout === 'kiosk') {
        return (
            <div className="fixed relative inset-0 flex flex-col overflow-hidden bg-background text-foreground">
                <div className="flex shrink-0 items-center gap-3 bg-primary px-5 py-3.5">
                    <span className="shrink-0 text-xl font-black tracking-tight text-primary-foreground">{branch?.name ?? 'POS'}</span>
                    <div className="relative max-w-sm flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => {
                                setError(null);
                                setSearch(e.target.value);
                            }}
                            onKeyDown={handleSearchKeyDown}
                            placeholder="Search or scan… (F1)"
                            className="h-10 w-full rounded-xl border-0 bg-white pr-8 pl-9 text-sm shadow-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-white/50 focus:outline-none dark:bg-background"
                        />
                    </div>
                    <CategoryDropdown categories={categories} activeCat={activeCat} onChange={setActiveCat} />
                    <button
                        onClick={() => window.location.reload()}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-primary-foreground transition-colors hover:bg-white/25"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <Suspense fallback={<LayoutSpinner />}>
                        <KioskLayout
                            filtered={filtered}
                            cart={cart}
                            currency={currency}
                            onProductClick={handleProductClick}
                            onCharge={() => {
                                setError(null);
                                setShowPayment(true);
                            }}
                            subtotal={subtotal}
                            itemCount={itemCount}
                            onClear={clearCart}
                        />
                    </Suspense>
                </div>

                {variantFor && (
                    <VariantPicker
                        product={variantFor}
                        currency={currency}
                        onSelect={(vid, vname) => {
                            addItem(variantFor, 1, vid, vname);
                            setVariantFor(null);
                            refocus(50);
                        }}
                        onClose={() => {
                            setVariantFor(null);
                            refocus(50);
                        }}
                    />
                )}
                {showPayment && (
                    <PaymentModal
                        subtotal={subtotal}
                        settings={settings}
                        currency={currency}
                        customers={customers}
                        customerNameRequired={requireCustomerName}
                        promos={promos}
                        cart={cart}
                        onConfirm={handleConfirm}
                        onClose={() => {
                            setShowPayment(false);
                            setError(null);
                            refocus(50);
                        }}
                        loading={loading}
                        serverError={error}
                        initialMethod={paymentMethodPreset}
                    />
                )}
                {receipt && (
                    <SaleSuccessModal
                        receipt={receipt}
                        currency={currency}
                        onNewSale={() => {
                            setReceipt(null);
                            refocus(100);
                        }}
                    />
                )}
                {noSessionOverlay}
            </div>
        );
    }

    // ── Standard & SimSoft Fast Cashier POS Layout ─────────────────────────────
    return (
        <AdminLayout defaultSidebarOpen={false} title="POS / Cashier">
            <div className="relative flex h-[calc(100vh-4rem)] w-full min-w-[850px] flex-col overflow-hidden">
                {/* ── Top Bar ─────────────────────────────────────────────── */}
                <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2 whitespace-nowrap">
                    <div
                        className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                            session
                                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                        )}
                    >
                        <span className={cn('h-1.5 w-1.5 rounded-full', session ? 'bg-green-500' : 'bg-emerald-500')} />
                        <span>{session ? 'Register Open' : 'Register Ready'}</span>
                    </div>

                    <span className="block max-w-[150px] shrink-0 truncate text-sm font-black text-foreground">{branch?.name ?? 'Retail POS'}</span>

                    {/* Combined Search & Barcode Input */}
                    {searchInput}

                    {/* Category Filter */}
                    <CategoryDropdown categories={categories} activeCat={activeCat} onChange={setActiveCat} />

                    <div className="min-w-[8px] flex-1" />

                    {/* SimSoft Fast Mode vs Visual Toggle */}
                    <button
                        onClick={() => setFastMode((v) => !v)}
                        className={cn(
                            'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold whitespace-nowrap shadow-xs transition-all',
                            fastMode ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted',
                        )}
                        title="Toggle Fast Cashiering Mode (F4)"
                    >
                        {fastMode ? <Rows3 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
                        <span className="inline">{fastMode ? 'Fast Cashiering' : 'Visual Catalog'}</span>
                        <span className="ml-1 font-mono text-[10px] opacity-70">F4</span>
                    </button>

                    <a
                        href={routes.sales.history()}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <History className="h-3.5 w-3.5" />
                        <span className="inline">History</span>
                    </a>

                    <button
                        onClick={() => window.location.reload()}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* ── Main Workspace ───────────────────────────────────────── */}
                <div className="flex flex-1 overflow-hidden">
                    {fastMode ? (
                        /* Fast Cashiering Workspace: Main Table + Quick Catalog */
                        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
                            <div className="flex-1 overflow-hidden">
                                <SimSoftCashierTable
                                    cart={cart}
                                    currency={currency}
                                    onUpdateQty={updateQty}
                                    onSetExactQty={setExactQty}
                                    onOpenCalc={setCalcItem}
                                    onRemove={removeItem}
                                    onClear={clearCart}
                                    onCharge={() => {
                                        setError(null);
                                        setPaymentMethodPreset('cash');
                                        setShowPayment(true);
                                    }}
                                    onCustomerCredit={() => {
                                        setError(null);
                                        setPaymentMethodPreset('credit');
                                        setShowPayment(true);
                                    }}
                                    lastScanned={lastScanned}
                                />
                            </div>

                            {/* Quick Tap Catalog Drawer for fast cashiering without barcode scanner */}
                            <div className="flex h-40 min-h-[140px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-2.5 shadow-xs">
                                <div className="flex shrink-0 items-center justify-between border-b border-border/50 px-1 pb-1.5 text-[11px] font-bold text-muted-foreground">
                                    <span>Quick Pick Retail Products ({quickPickProducts.length})</span>
                                    <span>Click to add · Auto ₱ amount & kg for Rice & Feeds</span>
                                </div>
                                <div className="flex flex-1 items-stretch gap-2 overflow-x-auto overflow-y-hidden pt-2">
                                    {quickPickProducts.map((p) => {
                                        const rawUnit = p.unit || '';
                                        const isKg = isWeightedKgItem(rawUnit, p.name);
                                        const unit = rawUnit || (isKg ? 'kg' : 'pc');
                                        const inCart = cart.find((i) => i.product_id === p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                onClick={() => handleProductClick(p, 1)}
                                                className={cn(
                                                    'relative flex h-full w-32 shrink-0 cursor-pointer flex-col justify-between rounded-xl border p-2 text-left shadow-xs transition-all hover:scale-[1.02] active:scale-95',
                                                    inCart
                                                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                                        : 'border-border bg-background hover:border-primary/50',
                                                )}
                                            >
                                                <div className="flex w-full items-center justify-between">
                                                    <span
                                                        className={cn(
                                                            'rounded px-1 text-[9px] font-black uppercase',
                                                            isKg
                                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                                : 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        {unit}
                                                    </span>
                                                    {isKg && (
                                                        <span
                                                            className="rounded bg-amber-500/10 px-1 text-[9px] font-bold text-amber-600 dark:text-amber-400"
                                                            title="₱50 purchase equivalent"
                                                        >
                                                            ₱50={Math.round((50 / p.price) * 1000) / 1000}k
                                                        </span>
                                                    )}
                                                    {inCart && (
                                                        <span className="rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground">
                                                            {fmtQty(inCart.qty)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="my-0.5 flex h-10 w-full items-center justify-center">
                                                    <ProductThumbnail
                                                        src={p.product_img}
                                                        name={p.name}
                                                        categoryName={p.category?.name}
                                                        unit={p.unit}
                                                        aspect="aspect-auto"
                                                        className="h-full w-full bg-transparent dark:bg-transparent"
                                                        padding="p-0.5"
                                                    />
                                                </div>
                                                <div className="w-full">
                                                    <p className="truncate text-[11px] leading-tight font-bold text-foreground">{p.name}</p>
                                                    <p className="mt-0.5 font-mono text-xs font-black text-primary">{fmtMoney(p.price, currency)}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Visual Grid Workspace + Cart Panel */
                        <div className="flex flex-1 overflow-hidden">
                            <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
                                <div className="flex-1 overflow-y-auto p-3">
                                    <Suspense fallback={<LayoutSpinner />}>
                                        {visualLayout === 'grid' && (
                                            <GridLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />
                                        )}
                                        {visualLayout === 'tablet' && (
                                            <TabletLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />
                                        )}
                                        {visualLayout === 'cafe' && (
                                            <CafeLayout
                                                filtered={filtered}
                                                allProducts={products}
                                                categories={categories}
                                                activeCat={activeCat}
                                                onCatChange={setActiveCat}
                                                cart={cart}
                                                currency={currency}
                                                onProductClick={handleProductClick}
                                            />
                                        )}
                                        {visualLayout === 'salon' && (
                                            <SalonLayout filtered={filtered} cart={cart} currency={currency} onProductClick={handleProductClick} />
                                        )}
                                        {visualLayout === 'mobile' && (
                                            <MobileLayout
                                                filtered={filtered}
                                                cart={cart}
                                                currency={currency}
                                                onProductClick={handleProductClick}
                                                onCharge={() => {
                                                    setError(null);
                                                    setPaymentMethodPreset('cash');
                                                    setShowPayment(true);
                                                }}
                                                subtotal={subtotal}
                                                itemCount={itemCount}
                                                onClear={clearCart}
                                                onUpdateQty={updateQty}
                                                onSetExactQty={setExactQty}
                                                onRemove={removeItem}
                                            />
                                        )}
                                    </Suspense>
                                </div>
                            </div>

                            {/* Cart Sidebar */}
                            <div className="flex w-72 shrink-0 flex-col border-l border-border lg:w-80 xl:w-96">
                                <CartPanel
                                    cart={cart}
                                    subtotal={subtotal}
                                    itemCount={itemCount}
                                    currency={currency}
                                    error={error}
                                    onUpdateQty={updateQty}
                                    onSetExactQty={setExactQty}
                                    onOpenCalc={setCalcItem}
                                    onRemove={removeItem}
                                    onClear={clearCart}
                                    onCharge={() => {
                                        setError(null);
                                        setPaymentMethodPreset('cash');
                                        setShowPayment(true);
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ── SimSoft Cashier Action Strip ────────────────────────── */}
                <div className="flex shrink-0 items-center justify-between overflow-x-auto border-t border-border bg-muted/70 px-4 py-1.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground select-none">
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                searchRef.current?.focus();
                                searchRef.current?.select();
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Focus Barcode/Search Input (F1/F2)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F1/F2</kbd>
                            <span>Search/Scan</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (cart.length > 0) {
                                    setError(null);
                                    setPaymentMethodPreset('credit');
                                    setShowPayment(true);
                                } else {
                                    searchRef.current?.focus();
                                }
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Customer Credit / Utang (F3)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F3</kbd>
                            <span>Credit</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setFastMode((v) => !v)}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Toggle Fast Cashiering / Visual Catalog (F4)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F4</kbd>
                            <span>Fast/Visual</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (cart.length > 0) clearCart();
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Void / Clear Active Transaction (F8)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F8</kbd>
                            <span>Void/Clear</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                if (cart.length > 0) {
                                    setError(null);
                                    setPaymentMethodPreset('cash');
                                    setShowPayment(true);
                                }
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Tender Cash / Pay (F9)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F9</kbd>
                            <span>Tender/Pay</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setShowPayment(false);
                                setShowVoidConfirm(false);
                                setVariantFor(null);
                                setCalcItem(null);
                                setSearch('');
                                refocus();
                            }}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Close / Cancel (Esc)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">Esc</kbd>
                            <span>Close</span>
                        </button>
                    </div>
                    <div className="ml-4 block shrink-0 font-mono text-[10px] text-muted-foreground/80">
                        SimSoft Retail POS · Multiplier: <code className="font-bold text-primary">1.4*BARCODE</code> or Amount:{' '}
                        <code className="font-bold text-amber-600">50p*BARCODE</code> ·{' '}
                        <kbd className="rounded border border-border bg-background px-1 py-0.5">Ctrl+B</kbd> Toggle Sidebar
                    </div>
                </div>
            </div>

            {variantFor && (
                <VariantPicker
                    product={variantFor}
                    currency={currency}
                    onSelect={(vid, vname) => {
                        addItem(variantFor, 1, vid, vname);
                        setVariantFor(null);
                        refocus(50);
                    }}
                    onClose={() => {
                        setVariantFor(null);
                        refocus(50);
                    }}
                />
            )}

            {calcItem && (
                <WeightAmountModal
                    item={calcItem}
                    currency={currency}
                    onApply={(newQty) => {
                        setExactQty(calcItem.key, newQty);
                        setCalcItem(null);
                        refocus(50);
                    }}
                    onClose={() => {
                        setCalcItem(null);
                        refocus(50);
                    }}
                />
            )}

            {showPayment && (
                <PaymentModal
                    subtotal={subtotal}
                    settings={settings}
                    currency={currency}
                    customers={customers}
                    customerNameRequired={requireCustomerName}
                    promos={promos}
                    cart={cart}
                    onConfirm={handleConfirm}
                    onClose={() => {
                        setShowPayment(false);
                        setError(null);
                        refocus(50);
                    }}
                    loading={loading}
                    serverError={error}
                    initialMethod={paymentMethodPreset}
                />
            )}

            {showVoidConfirm && (
                <VoidCartModal
                    cart={cart}
                    subtotal={subtotal}
                    itemCount={itemCount}
                    currency={currency}
                    onConfirm={confirmVoidCart}
                    onClose={() => {
                        setShowVoidConfirm(false);
                        refocus(50);
                    }}
                />
            )}

            {receipt && (
                <SaleSuccessModal
                    receipt={receipt}
                    currency={currency}
                    onNewSale={() => {
                        setReceipt(null);
                        refocus(100);
                    }}
                />
            )}
            {noSessionOverlay}
        </AdminLayout>
    );
}
