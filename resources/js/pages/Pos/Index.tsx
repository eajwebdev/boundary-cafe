'use client';
import { Link, usePage, router } from '@inertiajs/react';
import {
    Search,
    X,
    Trash2,
    ShoppingCart,
    Tag,
    CreditCard,
    Banknote,
    Smartphone,
    CheckCircle2,
    AlertTriangle,
    History,
    ScanLine,
    RefreshCw,
    Zap,
    User,
    Wallet,
    Rows3,
    LayoutGrid,
    Clock,
} from 'lucide-react';
import { ClipboardList as PendingIcon } from 'lucide-react';
import { lazy, Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { confirmDialog, isConfirmDialogOpen } from '@/components/ConfirmDialog';
import ProductThumbnail, { getDefaultProductIcon } from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import FastRegister from './FastRegister';
import CategoryRail from './layouts/CategoryRail';
import OrderTicket from './OrderTicket';
import type { PendingTicket } from './PendingOrdersPanel';
import PendingOrdersPanel, { usePendingOrders } from './PendingOrdersPanel';
import type { Product, CartItem, Category, ActivePromo, CustomerOption } from './posTypes';
import { isWeightedKgItem } from './posTypes';
import ReceiptTemplate, { fmtMoney, fmtQty } from './ReceiptTemplate';
import type { ReceiptData } from './ReceiptTemplate';

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
        senior_pwd_discount?: number;
        default_payment: string;
        vat_enabled: boolean;
        vat_rate: number;
        vat_inclusive: boolean;
        require_cash_session: boolean;
        item_mode: 'products_and_services' | 'products_only' | 'services_only';
        require_customer_name: boolean;
        default_due_days: number;
        service_charge_enabled: boolean;
        service_charge_rate: number;
    } | null;
    app: { currency: string; name?: string };
    products: Product[];
    customers: CustomerOption[];
    categories: Category[];
    session: Session | null;
    stale_session: StaleSession | null;
    branch: Branch | null;
    preferred_layout: string;
    promos: ActivePromo[];
    [key: string]: unknown;
}
type PayMethod = 'cash' | 'gcash' | 'card' | 'others' | 'credit' | 'mixed';
type LayoutMode = 'grid' | 'tablet' | 'cafe' | 'mobile';
/** The legacy `onhelp` hook some kiosk browsers still fire for F1. */
type HelpKeyWindow = { onhelp: ((e: Event) => boolean | void) | null };

/** What SaleService::checkout() flashes back after a successful charge. */
interface PosResult {
    receipt_number?: string;
    total: number;
    change?: number;
    amount_paid?: number;
    balance_due?: number;
    payment_status?: string;
    due_date?: string | null;
    customer_name?: string | null;
    discount_amount?: number;
    promo_discount?: number;
    promo_name?: string | null;
    service_charge_amount: number;
    table_label?: string | null;
}
const LAYOUTS: LayoutMode[] = ['grid', 'tablet', 'cafe', 'mobile'];

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

/** localStorage key for the cashier's preferred register mode ("fast" | "visual"). */
const POS_MODE_KEY = 'pos-mode';

// ─── Lazy-loaded layout chunks ────────────────────────────────────────────────
const GridLayout = lazy(() => import('./layouts/GridLayout'));
const TabletLayout = lazy(() => import('./layouts/TabletLayout'));
const CafeLayout = lazy(() => import('./layouts/CafeLayout'));
const MobileLayout = lazy(() => import('./layouts/MobileLayout'));

/** A cashier's session from an earlier day that was never closed (counted and closed before today's opens). */
interface StaleSession {
    id: number;
    session_number: string;
    opened_at: string | null;
    opening_cash: number;
    expected_cash: number;
    sale_count: number;
    require_count: boolean;
}

/** Step 1 of the gate when yesterday's register was left open: count the drawer and close it. */
function CloseStaleSession({ session, currency }: { session: StaleSession; currency: string }) {
    const [counted, setCounted] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const openedLabel = session.opened_at
        ? new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
              new Date(session.opened_at),
          )
        : 'an earlier day';
    const countedAmount = counted.trim() === '' ? null : Number(counted);
    const overShort =
        countedAmount !== null && Number.isFinite(countedAmount) ? Math.round((countedAmount - session.expected_cash) * 100) / 100 : null;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (session.require_count && (countedAmount === null || !Number.isFinite(countedAmount) || countedAmount < 0)) {
            setError('Count the cash in the drawer and enter the amount.');
            return;
        }
        setLoading(true);
        setError('');
        router.post(
            routes.pos.closeSession(session.id),
            { counted_cash: countedAmount, notes: notes.trim() || 'Closed at the start of the next day (left open).' },
            {
                preserveScroll: true,
                onError: (errors) => {
                    setError(String(Object.values(errors)[0] ?? 'Unable to close the session.'));
                    setLoading(false);
                },
                onFinish: () => setLoading(false),
            },
        );
    };

    return (
        <>
            <div className="border-b border-border bg-amber-500/10 px-6 py-6 text-center">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                    <Clock className="h-6 w-6" />
                </span>
                <h1 className="text-xl font-black text-foreground">Yesterday&apos;s register is still open</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Session {session.session_number} was opened {openedLabel} and never closed. Count the drawer and close it, then open
                    today&apos;s session.
                </p>
            </div>

            <form onSubmit={submit} className="space-y-5 p-6">
                <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                        ['Opening cash', fmtMoney(session.opening_cash, currency)],
                        ['Sales', String(session.sale_count)],
                        ['Expected in drawer', fmtMoney(session.expected_cash, currency)],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-border bg-muted/30 px-2 py-2.5">
                            <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{label}</p>
                            <p className="mt-0.5 font-mono text-sm font-black text-foreground tabular-nums">{value}</p>
                        </div>
                    ))}
                </div>

                <div>
                    <label htmlFor="pos-stale-counted" className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Cash counted in the drawer {!session.require_count && <span className="font-normal normal-case">(optional)</span>}
                    </label>
                    <div className="relative">
                        <span className="absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold text-muted-foreground">{currency}</span>
                        <input
                            id="pos-stale-counted"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            autoFocus
                            value={counted}
                            onChange={(event) => setCounted(event.target.value)}
                            placeholder={session.expected_cash.toFixed(2)}
                            className="h-14 w-full rounded-xl border border-border bg-background pr-4 pl-10 text-right text-2xl font-black text-foreground tabular-nums transition outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                    </div>
                    {overShort !== null && (
                        <p
                            className={cn(
                                'mt-1.5 text-xs font-bold',
                                overShort === 0 ? 'text-emerald-600' : overShort > 0 ? 'text-amber-600' : 'text-destructive',
                            )}
                        >
                            {overShort === 0
                                ? 'Balanced'
                                : overShort > 0
                                  ? `Over by ${fmtMoney(overShort, currency)}`
                                  : `Short by ${fmtMoney(Math.abs(overShort), currency)}`}
                        </p>
                    )}
                </div>

                <div>
                    <label htmlFor="pos-stale-notes" className="mb-1.5 block text-xs font-bold tracking-wider text-muted-foreground uppercase">
                        Notes <span className="font-normal normal-case">(optional)</span>
                    </label>
                    <textarea
                        id="pos-stale-notes"
                        rows={2}
                        maxLength={1000}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="e.g. Forgot to close after the evening shift"
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
                    {loading ? 'Closing session...' : `Close session ${session.session_number}`}
                </Button>
            </form>
        </>
    );
}

function CashSessionGate({ currency, branchName, staleSession }: { currency: string; branchName: string; staleSession: StaleSession | null }) {
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

    if (staleSession) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm">
                <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
                    <CloseStaleSession session={staleSession} currency={currency} />
                </div>
            </div>
        );
    }

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
        /** Senior Citizen / PWD discount (counted on its own line in the Z-reading). */
        discount_type: 'senior_pwd' | 'manual' | null;
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
    const [seniorPwd, setSeniorPwd] = useState(false);
    const seniorPwdRate = Math.min(settings?.senior_pwd_discount ?? 20, settings?.max_discount_percent ?? 100);
    // Promo-code entry has no controls in this dialog yet. Its state and helpers are kept, unused, until it is wired in.
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const [promoCode, setPromoCode] = useState('');
    const [appliedPromo, setAppliedPromo] = useState<ActivePromo | null>(null);
    const [promoError, setPromoError] = useState('');
    const [showPromos, setShowPromos] = useState(false);
    /* eslint-enable @typescript-eslint/no-unused-vars */
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

    // Not wired to any control yet — see the promo-code note on the state above.
    /* eslint-disable @typescript-eslint/no-unused-vars */
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
    /* eslint-enable @typescript-eslint/no-unused-vars */

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
            <div className={cn('flex max-h-[94dvh] w-full animate-in flex-col rounded-t-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95 fade-in sm:max-w-lg sm:rounded-2xl', isCash && 'lg:max-w-4xl')}>
                {/* Modal Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        <div>
                            <p className="text-base font-black tracking-tight text-foreground">Tender</p>
                            <p className="text-[11px] text-muted-foreground">Choose a payment method and, optionally, a rewards member</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 lg:p-5">
                    <div className={cn('space-y-4', isCash && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0')}>
                        {/* Left: amount, method, customer, credit, discount */}
                        <div className="space-y-4">
                            {/* Big Digital Total Due Banner */}
                            <div className="flex items-center justify-between rounded-xl border border-[var(--pos-display-line)] bg-[var(--pos-display)] p-4 text-white shadow-inner">
                                <div>
                                    <span className="block text-[10px] font-bold tracking-widest text-[var(--pos-display-accent)] uppercase">
                                        Total Amount Due
                                    </span>
                                    <span className="font-mono text-3xl font-black tracking-tight text-white tabular-nums sm:text-4xl">
                                        {fmtMoney(total, currency)}
                                    </span>
                                </div>
                                <div className="space-y-1 text-right font-mono text-xs text-[var(--pos-display-muted)]">
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
                                        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                            {(selectedCustomer.loyalty_points ?? 0).toLocaleString()} pts
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
                                                {c.name} {c.contact_number ? `(${c.contact_number})` : ''} · {(c.loyalty_points ?? 0).toLocaleString()} pts
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
                                                <p className="text-xs font-black text-blue-700 dark:text-blue-300">Rewards</p>
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

                            {/* Discounts & Promos Dropdown/Accordions */}
                            {settings?.allow_discount && (
                                <div className="border-t border-border/60 pt-2">
                                    <label className="mb-1 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                        Senior / PWD / Promo Discount
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDiscPct(String(seniorPwdRate));
                                                setSeniorPwd(true);
                                            }}
                                            className={cn(
                                                'h-8 rounded-lg border px-2.5 text-xs font-bold transition-all',
                                                seniorPwd && disc > 0
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border hover:border-primary/40',
                                            )}
                                            title="Senior Citizen / PWD discount"
                                        >
                                            Senior/PWD {seniorPwdRate}%
                                        </button>
                                        <input
                                            value={discPct}
                                            onChange={(e) => {
                                                setDiscPct(e.target.value);
                                                setSeniorPwd(false);
                                            }}
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
                                                    onClick={() => {
                                                        setDiscPct(String(v));
                                                        setSeniorPwd(false);
                                                    }}
                                                    className={cn(
                                                        'h-8 rounded-lg border px-2.5 text-xs font-semibold transition-all',
                                                        disc === v && !seniorPwd
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
                                                onClick={() => {
                                                    setDiscPct('');
                                                    setSeniorPwd(false);
                                                }}
                                                className="h-8 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right (lg): cash tendered + keypad */}
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
                                                    'h-10 rounded-xl border px-3 text-xs font-bold transition-all pointer-coarse:h-11',
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
                                            className="h-12 rounded-xl border border-border bg-background text-lg font-bold shadow-xs transition-all hover:border-primary/30 hover:bg-accent active:scale-95 pointer-coarse:h-14"
                                        >
                                            {k}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
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
                                discount_type: disc > 0 ? (seniorPwd ? 'senior_pwd' : 'manual') : null,
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
    // Fast Cashiering (default) or Visual Catalog, remembered per device.
    const [fastMode, setFastModeState] = useState<boolean>(() => {
        try {
            return window.localStorage.getItem(POS_MODE_KEY) !== 'visual';
        } catch {
            return true;
        }
    });
    const setFastMode = useCallback((next: boolean | ((current: boolean) => boolean)) => {
        setFastModeState((current) => {
            const value = typeof next === 'function' ? next(current) : next;
            try {
                window.localStorage.setItem(POS_MODE_KEY, value ? 'fast' : 'visual');
            } catch {
                /* storage blocked: the choice just isn't remembered */
            }
            return value;
        });
    }, []);
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
    const [showVoidConfirm, setShowVoidConfirm] = useState(false);

    // ── Pending dine-in tickets (sent by servers) + online pickups ──
    const pending = usePendingOrders(true);
    const [pendingOpen, setPendingOpen] = useState(false);
    /** Visual mode below lg: the cart slides in from the right instead of taking a fixed column. */
    const [cartSheetOpen, setCartSheetOpen] = useState(false);
    /** Fast view: which search result Enter adds (moved with the arrow keys). */
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [activeTicket, setActiveTicket] = useState<PendingTicket | null>(null);

    const visualLayout: LayoutMode = LAYOUTS.includes(layout) ? layout : 'grid';
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

    /** Fast register: what the search box finds (any category), listed in its dropdown. */
    const searchResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!fastMode || q === '') return [];
        return products
            .filter((p) => p.product_type !== 'ingredient' && (p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)))
            .slice(0, 8);
    }, [fastMode, search, products]);
    const highlightedProduct = searchResults[Math.min(highlightIndex, searchResults.length - 1)] ?? null;

    const subtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);

    const requireCustomerName = !!settings?.require_customer_name;

    /** Load a waiter's table ticket into the cart so the cashier can charge it. */
    const loadTicket = async (ticket: PendingTicket) => {
        if (cart.length > 0 && activeTicket?.id !== ticket.id) {
            const confirmed = await confirmDialog({
                title: 'Replace the current cart?',
                description: 'The items in the cart will be swapped for this table ticket.',
                confirmLabel: 'Replace cart',
            });
            if (!confirmed) return;
        }
        const merged: CartItem[] = [];
        for (const i of ticket.items) {
            const key = `${i.product_id}-${i.variant_id ?? 'base'}`;
            const existing = merged.find((m) => m.key === key);
            if (existing) {
                existing.qty += i.quantity;
                continue;
            }
            const product = products.find((p) => p.id === i.product_id);
            merged.push({
                key,
                product_id: i.product_id,
                variant_id: i.variant_id,
                name: i.name,
                unit: i.unit,
                barcode: product?.barcode ?? null,
                product_img: i.product_img ?? product?.product_img ?? null,
                variant_name: i.variant_name,
                price: i.price,
                qty: i.quantity,
                stock: 999999,
                product_type: product?.product_type ?? 'standard',
                bundle_items: product?.bundle_items ?? null,
                recipe_items: product?.recipe_items ?? null,
            });
        }
        setCart(merged);
        setActiveTicket(ticket);
        setLastScanned(null);
        setError(null);
    };

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
            if (highlightedProduct && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                setHighlightIndex((i) => Math.max(0, Math.min(searchResults.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))));
                return;
            }
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

            // Priority 5 (Fast view): several matches — add the highlighted tile
            if (highlightedProduct && matches.length > 1) {
                executeMatch(highlightedProduct);
                return;
            }

            if (matches.length === 0) {
                setError(`Barcode or product "${parsed.term}" not found.`);
            }
        },
        [search, products, handleProductClick, highlightedProduct, searchResults.length],
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
        setActiveTicket(null);
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
        discount_type: 'senior_pwd' | 'manual' | null;
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
                discount_type: payData.discount_type,
                promo_id: payData.promo_id ?? null,
                loyalty_points: payData.loyalty_points,
                cash_session_id: session?.id ?? null,
                table_order_id: activeTicket?.id ?? null,
            },
            {
                preserveScroll: true,
                onSuccess: (page) => {
                    const flash = (page.props as { flash?: { pos_result?: PosResult | null; errors?: { error?: string } } }).flash ?? {};
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
                        table_label: r.table_label ?? (activeTicket ? `Table ${activeTicket.table_number}` : null),
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
                    setActiveTicket(null);
                    setLastScanned(null);
                    setLoading(false);
                    pending.refresh();
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
            if (e.ctrlKey || e.altKey || e.metaKey || isConfirmDialogOpen()) return;
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
                        setError(null);
                        const finalQty =
                            parsed.targetAmount && matched.price > 0 ? Math.round((parsed.targetAmount / matched.price) * 1000) / 1000 : parsed.qty;
                        handleProductClick(matched, finalQty, parsed.targetAmount ?? null);
                        setSearch('');
                        refocus();
                        return;
                    }
                    // A scanned code we don't know: report it, and keep Enter from pressing the focused button.
                    if (scannedBuffer.length >= 4) {
                        e.preventDefault();
                        e.stopPropagation();
                        setError(`Barcode "${scannedBuffer}" not found.`);
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

    // ── Leaving or reloading with an unfinished sale ────────────────────────────
    const leaveConfirmed = useRef(false);

    const confirmLeave = useCallback(
        (intent: 'leave' | 'reload') =>
            confirmDialog({
                title: intent === 'reload' ? 'Reload the register?' : 'Leave the register?',
                description: `The cart has ${itemCount} ${itemCount === 1 ? 'item' : 'items'} that ${itemCount === 1 ? 'has' : 'have'} not been charged. ${
                    intent === 'reload' ? 'Reloading' : 'Leaving'
                } clears the cart.`,
                confirmLabel: intent === 'reload' ? 'Reload' : 'Leave',
                cancelLabel: 'Stay',
                tone: 'danger',
            }),
        [itemCount],
    );

    const reloadRegister = useCallback(async () => {
        if (cart.length > 0 && !(await confirmLeave('reload'))) return;
        leaveConfirmed.current = true;
        window.location.reload();
    }, [cart.length, confirmLeave]);

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

            // A confirm modal owns the keyboard while it is open (Enter / Escape answer it).
            if (isConfirmDialogOpen()) return;

            // Ctrl/Cmd+R: reload, asking first when a sale is in progress
            if ((e.ctrlKey || e.metaKey) && isKey('R') && cart.length > 0) {
                e.preventDefault();
                reloadRegister();
                return;
            }

            // F1 / F2: Focus and select Barcode & Product Search input
            if (isKey('F1') || isKey('F2')) {
                searchRef.current?.focus();
                searchRef.current?.select();
                return;
            }

            // F3: Pending orders (table tickets + online pickups)
            if (isKey('F3')) {
                setPendingOpen((v) => !v);
                return;
            }

            // F4: Toggle Fast Cashiering Mode vs Visual Catalog
            if (isKey('F4')) {
                if (!showPayment) {
                    setFastMode((v) => !v);
                }
                return;
            }

            // F5: Reload, asking first when a sale is in progress
            if (isKey('F5')) {
                reloadRegister();
                return;
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
        (window as unknown as HelpKeyWindow).onhelp = handleHelp;

        return () => {
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
            window.removeEventListener('keyup', handleKeyUp, { capture: true });
            window.removeEventListener('help', handleHelp, { capture: true });
            (window as unknown as HelpKeyWindow).onhelp = null;
        };
    }, [cart, clearCart, showPayment, refocus, reloadRegister, setFastMode]);

    // Protect an unfinished sale from being lost by leaving the register
    useEffect(() => {
        if (cart.length === 0) return;

        // Moving to another page inside the app (History, sidebar, Alt+number shortcuts): ask with our own modal.
        const stopGuarding = router.on('before', (event) => {
            const { visit } = event.detail;
            const staysOnRegister = visit.method !== 'get' || visit.prefetch || visit.url.pathname === window.location.pathname;
            if (leaveConfirmed.current || staysOnRegister) return;

            confirmLeave('leave').then((confirmed) => {
                if (!confirmed) return;
                leaveConfirmed.current = true;
                router.visit(visit.url, { onFinish: () => (leaveConfirmed.current = false) });
            });
            return false;
        });

        // Closing the tab, the browser's own reload button or a typed address can only show the
        // browser's built-in prompt — no page is allowed to replace it — so it stays as the last resort.
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (leaveConfirmed.current) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            stopGuarding();
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [cart.length, confirmLeave]);

    /** A scan that started in a quantity box: carry what it typed over to the search box, where the rest lands. */
    const redirectScanToSearch = (typed: string) => {
        setError(null);
        setSearch(typed);
        setHighlightIndex(0);
        searchRef.current?.focus();
    };

    const openTender = () => {
        setError(null);
        setPaymentMethodPreset('cash');
        setShowPayment(true);
    };

    const orderTicketProps = {
        cart,
        subtotal,
        itemCount,
        currency,
        error,
        lastAddedName: lastScanned?.name ?? null,
        ticket: activeTicket,
        pendingCount: pending.data.count,
        onUpdateQty: updateQty,
        onSetExactQty: setExactQty,
        onScannerBurst: redirectScanToSearch,
        onRemove: removeItem,
        onClear: clearCart,
        onCharge: openTender,
        onDetachTicket: () => {
            setActiveTicket(null);
            setCart([]);
        },
        onOpenPending: () => setPendingOpen(true),
    };

    // Combined search input
    const searchInput = (
        <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                ref={searchRef}
                value={search}
                onChange={(e) => {
                    setError(null);
                    setSearch(e.target.value);
                    setHighlightIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search menu or scan… (F1/F2)"
                className="h-10 w-full rounded-xl border border-border bg-background pr-9 pl-9 font-mono text-sm shadow-xs placeholder:font-sans placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none pointer-coarse:h-11"
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
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            ) : (
                <ScanLine className="pointer-events-none absolute top-1/2 right-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            )}
            {searchResults.length > 0 && (
                <div className="absolute top-full right-0 left-0 z-40 mt-1.5 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">
                    <ul className="max-h-[min(26rem,60vh)] overflow-y-auto p-1.5" role="listbox" aria-label="Search results">
                        {searchResults.map((p, i) => {
                            const inCartQty = cart.filter((c) => c.product_id === p.id).reduce((sum, c) => sum + c.qty, 0);
                            const isActive = p.id === highlightedProduct?.id;
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={isActive}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onMouseEnter={() => setHighlightIndex(i)}
                                        onClick={() => handleProductClick(p)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors pointer-coarse:py-3',
                                            isActive ? 'bg-primary/10' : 'hover:bg-muted',
                                        )}
                                    >
                                        <ProductThumbnail
                                            src={p.product_img}
                                            name={p.name}
                                            categoryName={p.category?.name}
                                            unit={p.unit}
                                            className="h-9 w-9 shrink-0 rounded-lg border border-border"
                                            padding="p-0.5"
                                            aspect="aspect-square"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                                            <span className="block truncate font-sans text-[11px] text-muted-foreground">
                                                {p.category?.name ?? 'Menu'}
                                                {p.barcode ? ` · ${p.barcode}` : ''}
                                            </span>
                                        </span>
                                        {inCartQty > 0 && (
                                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-sans text-[10px] font-bold text-primary">
                                                {fmtQty(inCartQty)} in order
                                            </span>
                                        )}
                                        <span className="shrink-0 font-mono text-sm font-black text-primary tabular-nums">{fmtMoney(p.price, currency)}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="border-t border-border px-3 py-1.5 font-sans text-[11px] text-muted-foreground pointer-coarse:hidden">
                        ↑↓ to choose · Enter to add · Esc to close
                    </p>
                </div>
            )}
        </div>
    );

    const cashierNeedsSession = user?.is_cashier === true && !session;
    const noSessionOverlay = cashierNeedsSession ? (
        <CashSessionGate currency={currency} branchName={branch?.name ?? 'Assigned branch'} staleSession={props.stale_session ?? null} />
    ) : null;

    // ── Standard & SimSoft Fast Cashier POS Layout ─────────────────────────────
    return (
        <AdminLayout defaultSidebarOpen={false} title="POS / Cashier">
            <div className="relative flex h-[calc(100dvh-3rem)] w-full min-w-0 flex-col overflow-hidden bg-muted/30">
                {/* ── Top Bar ─────────────────────────────────────────────── */}
                <div className="relative z-30 flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-sm lg:px-4">
                    <div
                        className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                            session
                                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
                        )}
                        title={session ? 'Register open' : 'Register ready'}
                    >
                        <span className={cn('h-2 w-2 rounded-full', session ? 'bg-green-500' : 'bg-emerald-500')} />
                        <span className="hidden xl:inline">{session ? 'Register Open' : 'Register Ready'}</span>
                    </div>

                    {/* Combined Search & Barcode Input */}
                    {searchInput}

                    {/* Register mode: Fast Cashiering (scan + table) or Visual Catalog (tap cards) — F4 switches */}
                    <div
                        className="flex shrink-0 items-center rounded-xl border border-border bg-muted/60 p-0.5"
                        role="radiogroup"
                        aria-label="Register mode (F4)"
                    >
                        {[
                            { fast: true, label: 'Fast', icon: Rows3, hint: 'Fast Cashiering: scan or search, line-item table' },
                            { fast: false, label: 'Visual', icon: LayoutGrid, hint: 'Visual Catalog: tap product cards' },
                        ].map(({ fast, label, icon: Icon, hint }) => (
                            <button
                                key={label}
                                type="button"
                                role="radio"
                                aria-checked={fastMode === fast}
                                onClick={() => setFastMode(fast)}
                                title={`${hint} (F4)`}
                                aria-label={label}
                                className={cn(
                                    'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold whitespace-nowrap transition-colors pointer-coarse:h-9 lg:px-3',
                                    fastMode === fast
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden lg:inline">{label}</span>
                            </button>
                        ))}
                        <kbd className="mx-1.5 hidden font-mono text-[10px] text-muted-foreground xl:inline pointer-coarse:hidden">F4</kbd>
                    </div>

                    <button
                        type="button"
                        onClick={() => setPendingOpen(true)}
                        className={cn(
                            'relative flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold whitespace-nowrap transition-colors pointer-coarse:h-10 lg:px-3',
                            pending.data.count > 0
                                ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted',
                        )}
                        title="Pending table tickets & online pickups (F3)"
                        aria-label={`Pending orders${pending.data.count > 0 ? ` (${pending.data.count})` : ''}`}
                    >
                        <PendingIcon className="h-4 w-4" />
                        <span className="hidden lg:inline">Pending</span>
                        {pending.data.count > 0 && (
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-white">
                                {pending.data.count}
                            </span>
                        )}
                    </button>

                    <Link
                        href={routes.sales.history()}
                        aria-label="Sales history"
                        title="Sales history"
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-10 lg:px-3"
                    >
                        <History className="h-4 w-4" />
                        <span className="hidden lg:inline">History</span>
                    </Link>

                    <button
                        onClick={reloadRegister}
                        title="Reload the register"
                        aria-label="Reload the register"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:h-10 pointer-coarse:w-10"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>

                {/* ── Workspace ─────────────────────────────────────────────────────────
                     Fast: the order fills the screen; items come in through the search box.
                     Visual: photo cards + the order ticket. */}
                {fastMode ? (
                    <div className="flex min-h-0 flex-1 overflow-hidden p-2.5 lg:p-3">
                        <div className="min-w-0 flex-1">
                            <FastRegister
                                cart={cart}
                                currency={currency}
                                ticket={activeTicket}
                                onUpdateQty={updateQty}
                                onSetExactQty={setExactQty}
                                onScannerBurst={redirectScanToSearch}
                                onRemove={removeItem}
                                onClear={clearCart}
                                onCharge={openTender}
                                onDetachTicket={orderTicketProps.onDetachTicket}
                                onPendingOrders={() => setPendingOpen(true)}
                                pendingCount={pending.data.count}
                                lastScanned={lastScanned}
                                error={error}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                            {visualLayout !== 'cafe' && (
                                <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 lg:px-4">
                                    <CategoryRail categories={categories} products={products} activeCat={activeCat} onChange={setActiveCat} />
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto p-3 lg:p-4">
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
                                    {visualLayout === 'mobile' && (
                                        <MobileLayout
                                            filtered={filtered}
                                            cart={cart}
                                            currency={currency}
                                            onProductClick={handleProductClick}
                                            onCharge={openTender}
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

                            {/* Tablets (below lg): order bar — total, view order, charge */}
                            {visualLayout !== 'mobile' && (
                                <div className="shrink-0 border-t border-border bg-card p-2.5 lg:hidden">
                                    <div className="flex items-center gap-2 rounded-2xl bg-[var(--pos-display)] p-2 pl-3 text-white shadow-lg">
                                        <button
                                            type="button"
                                            onClick={() => setCartSheetOpen(true)}
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                            aria-label="View the current order"
                                        >
                                            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                                                <ShoppingCart className="h-5 w-5" />
                                                {itemCount > 0 && (
                                                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-primary-foreground ring-2 ring-[var(--pos-display)]">
                                                        {fmtQty(itemCount)}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-[10px] font-bold tracking-widest text-[var(--pos-display-accent)] uppercase">
                                                    {activeTicket
                                                        ? `Table ${activeTicket.table_number} · View order`
                                                        : cart.length === 0
                                                          ? 'No items yet'
                                                          : `${cart.length} line${cart.length === 1 ? '' : 's'} · View order`}
                                                </span>
                                                <span className="block truncate font-mono text-2xl font-black tabular-nums">{fmtMoney(subtotal, currency)}</span>
                                            </span>
                                        </button>
                                        <Button
                                            onClick={openTender}
                                            disabled={cart.length === 0}
                                            className="h-12 shrink-0 gap-2 rounded-xl px-5 text-sm font-black shadow-md disabled:opacity-40"
                                        >
                                            <Zap className="h-4 w-4" /> Charge
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Order ticket (lg and up) */}
                        <div className="hidden w-[22rem] shrink-0 flex-col border-l border-border lg:flex xl:w-[25rem]">
                            <OrderTicket {...orderTicketProps} />
                        </div>

                        {/* Tablets (below lg): the same ticket in a slide-in sheet */}
                        <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
                            <SheetContent side="right" showCloseButton={false} className="w-[min(26rem,92vw)] gap-0 p-0 sm:max-w-none lg:hidden">
                                <SheetTitle className="sr-only">Current order</SheetTitle>
                                <SheetDescription className="sr-only">Items in the order, quantities and the charge button.</SheetDescription>
                                <OrderTicket
                                    {...orderTicketProps}
                                    onClose={() => setCartSheetOpen(false)}
                                    onCharge={() => {
                                        setCartSheetOpen(false);
                                        openTender();
                                    }}
                                />
                            </SheetContent>
                        </Sheet>
                    </div>
                )}

                {/* ── SimSoft Cashier Action Strip ────────────────────────── */}
                <div className="hidden shrink-0 items-center justify-between overflow-x-auto border-t border-border bg-muted/70 px-4 py-1.5 font-mono text-[11px] whitespace-nowrap text-muted-foreground select-none lg:flex pointer-coarse:hidden">
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
                            onClick={() => setPendingOpen(true)}
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-2 py-0.5 transition-colors hover:border-border hover:bg-background hover:text-foreground"
                            title="Pending table tickets & online pickups (F3)"
                        >
                            <kbd className="py-0.2 rounded border border-border bg-background px-1.5 font-bold text-foreground">F3</kbd>
                            <span>Pending</span>
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
                        {app?.name ?? 'POS'} · <kbd className="rounded border border-border bg-background px-1 py-0.5">F3</kbd> Pending orders ·{' '}
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
                    preselectedCustomerId={activeTicket?.customer?.id ?? null}
                />
            )}

            <PendingOrdersPanel
                open={pendingOpen}
                onClose={() => {
                    setPendingOpen(false);
                    refocus(50);
                }}
                currency={currency}
                pending={pending}
                activeTicketId={activeTicket?.id ?? null}
                onLoad={loadTicket}
            />

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
