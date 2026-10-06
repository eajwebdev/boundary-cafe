import { Head, usePage, router, Link } from '@inertiajs/react';
import { formatDistanceToNow } from 'date-fns';
import {
    Plus,
    X,
    Lock,
    Unlock,
    Eye,
    AlertTriangle,
    RefreshCw,
    Banknote,
    Smartphone,
    CreditCard,
    TrendingUp,
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
    CalendarClock,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashSession {
    id: number;
    session_number: string;
    status: 'open' | 'closed';
    opening_cash: number;
    expected_cash: number | null;
    counted_cash: number | null;
    over_short: number | null;
    over_short_status: 'pending' | 'balanced' | 'over' | 'short';
    notes: string | null;
    opened_at: string;
    closed_at: string | null;
    cashier: string;
    // full=true extras
    pure_cash_sales?: number; // cash method sales only
    installment_dp?: number; // installment down-payments collected
    petty_cash_paid?: number; // petty cash paid out
    cash_sales_total?: number; // net cash in drawer = pure_cash + dp - petty
    gcash_system?: number;
    card_system?: number;
    total_sales?: number;
    sale_count?: number;
    computed_expected?: number;
    // formatted
    formatted_opening_cash: string;
    formatted_expected_cash: string;
    formatted_counted_cash: string;
    formatted_over_short: string;
}

interface PaginatedHistory {
    data: CashSession[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

interface PageProps {
    open_sessions: CashSession[];
    my_session: CashSession | null;
    history: PaginatedHistory;
    require_count: boolean;
    over_short_alert: number;
    is_admin: boolean;
    app: { currency: string };
    flash?: { message?: { type: string; text: string } | null };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = '₱') => `${currency}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inp =
    'w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all';

const overShortCls = (status: string) =>
    ({
        balanced: 'text-emerald-600 dark:text-emerald-400',
        over: 'text-amber-500',
        short: 'text-destructive',
        pending: 'text-muted-foreground',
    })[status] ?? 'text-muted-foreground';

// ─── Open Session Modal ───────────────────────────────────────────────────────

function OpenSessionModal({ currency, onClose }: { currency: string; onClose: () => void }) {
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const val = parseFloat(amount) || 0;
    const append = (v: string) => setAmount((p) => (p === '0' || p === '' ? v : p + v));
    const bksp = () => setAmount((p) => p.slice(0, -1) || '');

    const handleOpen = () => {
        if (val < 0) {
            setError('Enter a valid amount.');
            return;
        }
        setLoading(true);
        setError('');
        router.post(
            routes.cashSessions.open(),
            { opening_cash: val, notes: notes || null },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setLoading(false);
                    onClose();
                },
                onError: (e) => {
                    setError((Object.values(e)[0] as string) ?? 'Failed.');
                    setLoading(false);
                },
            },
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-sm sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="flex items-center gap-2 font-bold text-foreground">
                            <Unlock className="h-4 w-4 text-emerald-500" /> Open Cash Session
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Enter physical cash in the drawer</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-4 p-5">
                    {/* Big display */}
                    <div className="rounded-2xl border-2 border-primary/20 bg-background px-5 py-4 text-center">
                        <p className="mb-1 text-xs tracking-widest text-muted-foreground uppercase">Opening Cash</p>
                        <p className="text-4xl font-black text-foreground tabular-nums">
                            {currency}
                            {val.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </p>
                    </div>

                    {error && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {error}
                        </p>
                    )}

                    {/* Quick amounts */}
                    <div className="grid grid-cols-4 gap-1.5">
                        {[500, 1000, 2000, 5000].map((v) => (
                            <button
                                key={v}
                                onClick={() => setAmount(String(v))}
                                className={cn(
                                    'rounded-xl border py-2 text-xs font-bold transition-all',
                                    val === v
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border hover:border-primary/40 hover:bg-accent',
                                )}
                            >
                                {currency}
                                {v.toLocaleString()}
                            </button>
                        ))}
                    </div>

                    {/* Numpad */}
                    <div className="grid grid-cols-3 gap-2">
                        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '⌫'].map((k) => (
                            <button
                                key={k}
                                onClick={() => (k === '⌫' ? bksp() : append(k))}
                                className="h-12 rounded-xl border border-border text-base font-semibold transition-all hover:border-primary/30 hover:bg-accent active:scale-95"
                            >
                                {k}
                            </button>
                        ))}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Morning shift, petty cash breakdown…"
                            className={inp + ' resize-none'}
                        />
                    </div>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <Button variant="outline" className="h-10 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button className="h-10 flex-1 gap-2 font-bold" onClick={handleOpen} disabled={loading || val < 0}>
                        {loading && (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        )}
                        <Unlock className="h-4 w-4" /> Open Session
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Close Session Modal ──────────────────────────────────────────────────────

function CloseSessionModal({
    session,
    requireCount,
    overShortAlert,
    currency,
    onClose,
}: {
    session: CashSession;
    requireCount: boolean;
    overShortAlert: number;
    currency: string;
    onClose: () => void;
}) {
    const [counted, setCounted] = useState('');
    const [gcashCounted, setGcashCounted] = useState('');
    const [cardCounted, setCardCounted] = useState('');
    const [notes, setNotes] = useState(session.notes ?? '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const expected = session.computed_expected ?? 0;
    const gcashSystem = session.gcash_system ?? 0;
    const cardSystem = session.card_system ?? 0;
    const pureCash = session.pure_cash_sales ?? 0;
    const installmentDp = session.installment_dp ?? 0;
    const pettyCash = session.petty_cash_paid ?? 0;

    const countedNum = parseFloat(counted) || 0;
    const gcashCountedNum = parseFloat(gcashCounted) || 0;
    const cardCountedNum = parseFloat(cardCounted) || 0;

    const cashOverShort = counted ? countedNum - expected : null;
    const gcashOverShort = gcashCounted ? gcashCountedNum - gcashSystem : null;
    const cardOverShort = cardCounted ? cardCountedNum - cardSystem : null;

    const isAlert = cashOverShort !== null && Math.abs(cashOverShort) > overShortAlert;
    const append = (v: string) => setCounted((p) => (p === '0' || p === '' ? v : p + v));
    const bksp = () => setCounted((p) => p.slice(0, -1) || '');

    const handleClose = () => {
        if (requireCount && !counted.trim()) {
            setError('Enter the counted cash amount.');
            return;
        }
        setLoading(true);
        setError('');
        router.post(
            routes.cashSessions.close(session.id),
            {
                counted_cash: requireCount ? countedNum : undefined,
                gcash_counted: gcashCounted ? gcashCountedNum : undefined,
                card_counted: cardCounted ? cardCountedNum : undefined,
                notes: notes || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setLoading(false);
                    onClose();
                },
                onError: (e) => {
                    setError((Object.values(e)[0] as string) ?? 'Failed.');
                    setLoading(false);
                },
            },
        );
    };

    const OverShortLine = ({ amount, label }: { amount: number; label: string }) => {
        if (amount === 0) return <span className="font-bold text-emerald-600 dark:text-emerald-400">✓ {label} balanced</span>;
        if (amount > 0) return <span className="font-bold text-amber-500">+{fmt(Math.abs(amount), currency)} over</span>;
        return <span className="font-bold text-destructive">{fmt(amount, currency)} short</span>;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:rounded-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="flex items-center gap-2 font-bold text-foreground">
                            <Lock className="h-4 w-4 text-amber-500" /> Close Session
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{session.session_number}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    <div className="space-y-1.5 rounded-2xl bg-muted/30 p-4 text-sm">
                        <p className="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            Expected Cash in Drawer — Breakdown
                        </p>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Opening cash</span>
                            <span className="font-medium text-foreground tabular-nums">{fmt(session.opening_cash, currency)}</span>
                        </div>
                        <div className="pt-1 pb-0.5">
                            <p className="text-[10px] tracking-wide text-muted-foreground/60 uppercase">+ Cash collected today</p>
                        </div>
                        <div className="flex justify-between pl-3">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                                <Banknote className="h-3 w-3" /> Cash sales
                            </span>
                            <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">+{fmt(pureCash, currency)}</span>
                        </div>
                        {installmentDp > 0 && (
                            <div className="flex justify-between pl-3">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                    <CalendarClock className="h-3 w-3" /> Installment down-payments
                                    <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-600 dark:text-orange-400">
                                        DP only
                                    </span>
                                </span>
                                <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                    +{fmt(installmentDp, currency)}
                                </span>
                            </div>
                        )}
                        {pettyCash > 0 && (
                            <div className="flex justify-between pl-3">
                                <span className="text-muted-foreground">Petty cash paid out</span>
                                <span className="font-medium text-destructive tabular-nums">−{fmt(pettyCash, currency)}</span>
                            </div>
                        )}
                        {(gcashSystem > 0 || cardSystem > 0) && (
                            <>
                                <div className="pt-1 pb-0.5">
                                    <p className="text-[10px] tracking-wide text-muted-foreground/60 uppercase">Not in drawer (digital / terminal)</p>
                                </div>
                                {gcashSystem > 0 && (
                                    <div className="flex justify-between pl-3 opacity-60">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <Smartphone className="h-3 w-3" /> GCash
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">{fmt(gcashSystem, currency)}</span>
                                    </div>
                                )}
                                {cardSystem > 0 && (
                                    <div className="flex justify-between pl-3 opacity-60">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <CreditCard className="h-3 w-3" /> Card / Bank
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">{fmt(cardSystem, currency)}</span>
                                    </div>
                                )}
                            </>
                        )}
                        <div className="mt-2 flex justify-between border-t-2 border-border pt-2.5">
                            <span className="font-bold text-foreground">
                                Expected in drawer
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                    (Opening + Cash + DP{pettyCash > 0 ? ' − Petty' : ''})
                                </span>
                            </span>
                            <span className="text-base font-black text-primary tabular-nums">{fmt(expected, currency)}</span>
                        </div>
                        <div className="pt-0.5 text-[10px] text-muted-foreground/60">
                            {session.sale_count ?? 0} transactions · GCash and Card amounts are reconciled separately below
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                            <Banknote className="h-3.5 w-3.5" /> Count Cash in Drawer
                        </p>
                        {requireCount ? (
                            <div className="space-y-3">
                                <div
                                    className={cn(
                                        'rounded-2xl border-2 px-5 py-4 text-center transition-all',
                                        cashOverShort === null
                                            ? 'border-border bg-background'
                                            : cashOverShort === 0
                                              ? 'border-emerald-500/40 bg-emerald-500/5'
                                              : isAlert
                                                ? 'border-destructive/40 bg-destructive/5'
                                                : 'border-amber-500/40 bg-amber-500/5',
                                    )}
                                >
                                    <p className="mb-1 text-xs tracking-widest text-muted-foreground uppercase">Counted Cash</p>
                                    <p
                                        className={cn(
                                            'text-4xl font-black tabular-nums',
                                            cashOverShort === null
                                                ? 'text-foreground'
                                                : cashOverShort === 0
                                                  ? 'text-emerald-600 dark:text-emerald-400'
                                                  : isAlert
                                                    ? 'text-destructive'
                                                    : 'text-amber-500',
                                        )}
                                    >
                                        {currency}
                                        {countedNum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                    </p>
                                    {cashOverShort !== null && (
                                        <p
                                            className={cn(
                                                'mt-1 text-sm font-bold tabular-nums',
                                                cashOverShort === 0
                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                    : cashOverShort > 0
                                                      ? 'text-amber-500'
                                                      : 'text-destructive',
                                            )}
                                        >
                                            {cashOverShort === 0
                                                ? '✓ Balanced'
                                                : cashOverShort > 0
                                                  ? `+${fmt(cashOverShort, currency)} over`
                                                  : `${fmt(cashOverShort, currency)} short`}
                                        </p>
                                    )}
                                </div>
                                {isAlert && (
                                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-600 dark:text-amber-400">
                                        <AlertTriangle className="h-4 w-4 shrink-0" />
                                        Over/short exceeds the ₱{overShortAlert.toFixed(2)} alert threshold.
                                    </div>
                                )}
                                {error && <p className="text-xs text-destructive">{error}</p>}
                                <button
                                    onClick={() => setCounted(expected.toFixed(2))}
                                    className="w-full rounded-xl border border-primary/30 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                                >
                                    Fill expected ({fmt(expected, currency)})
                                </button>
                                <div className="grid grid-cols-3 gap-2">
                                    {['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', '⌫'].map((k) => (
                                        <button
                                            key={k}
                                            onClick={() => (k === '⌫' ? bksp() : append(k))}
                                            className="h-11 rounded-xl border border-border text-sm font-semibold transition-all hover:border-primary/30 hover:bg-accent active:scale-95"
                                        >
                                            {k}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                                Cash count not required — session will close with expected cash recorded automatically.
                            </div>
                        )}
                    </div>

                    {gcashSystem > 0 && (
                        <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-blue-600 uppercase dark:text-blue-400">
                                <Smartphone className="h-3.5 w-3.5" /> GCash — Enter Merchant App Total
                            </p>
                            <div className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">System GCash total</span>
                                    <span className="font-bold text-blue-600 tabular-nums dark:text-blue-400">{fmt(gcashSystem, currency)}</span>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={gcashCounted}
                                    onChange={(e) => setGcashCounted(e.target.value)}
                                    placeholder={`Enter GCash app total (expected ${fmt(gcashSystem, currency)})`}
                                    className={inp}
                                />
                                {gcashOverShort !== null && (
                                    <p className="text-xs">
                                        <OverShortLine amount={gcashOverShort} label="GCash" />
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {cardSystem > 0 && (
                        <div>
                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-purple-600 uppercase dark:text-purple-400">
                                <CreditCard className="h-3.5 w-3.5" /> Card / Bank — Enter Terminal Batch Total
                            </p>
                            <div className="space-y-2 rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">System card total</span>
                                    <span className="font-bold text-purple-600 tabular-nums dark:text-purple-400">{fmt(cardSystem, currency)}</span>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={cardCounted}
                                    onChange={(e) => setCardCounted(e.target.value)}
                                    placeholder={`Enter terminal batch total (expected ${fmt(cardSystem, currency)})`}
                                    className={inp}
                                />
                                {cardOverShort !== null && (
                                    <p className="text-xs">
                                        <OverShortLine amount={cardOverShort} label="Card" />
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Short due to price adjustment…"
                            className={inp + ' resize-none'}
                        />
                    </div>
                </div>

                <div className="flex shrink-0 gap-3 border-t border-border px-5 pt-3 pb-5">
                    <Button variant="outline" className="h-10 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        className={cn('h-10 flex-1 gap-2 font-bold', isAlert ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-600' : '')}
                        onClick={handleClose}
                        disabled={loading || (requireCount && !counted)}
                    >
                        {loading && (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        )}
                        <Lock className="h-4 w-4" /> Close Session
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Active Session Panel ─────────────────────────────────────────────────────

function ActiveSessionPanel({
    session,
    requireCount,
    overShortAlert,
    currency,
}: {
    session: CashSession;
    requireCount: boolean;
    overShortAlert: number;
    currency: string;
}) {
    const [showClose, setShowClose] = useState(false);
    const ago = formatDistanceToNow(new Date(session.opened_at), { addSuffix: false });

    const cashLabel = (session.installment_dp ?? 0) > 0 ? 'Cash + DP' : 'Cash Sales';
    const cashAmount = (session.pure_cash_sales ?? 0) + (session.installment_dp ?? 0);

    const stats = [
        { label: 'Opening Cash', val: session.formatted_opening_cash, color: 'text-foreground', icon: Banknote },
        { label: cashLabel, val: fmt(cashAmount, currency), color: 'text-emerald-600 dark:text-emerald-400', icon: TrendingUp },
        { label: 'Total Collected', val: fmt(session.total_sales ?? 0, currency), color: 'text-foreground', icon: TrendingUp },
        { label: 'Transactions', val: String(session.sale_count ?? 0), color: 'text-foreground', icon: CheckCircle2 },
    ];

    return (
        <>
            <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-emerald-500/15 px-5 py-4">
                    <div className="flex items-center gap-3">
                        <div className="relative h-3 w-3">
                            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-50" />
                            <span className="relative block h-3 w-3 rounded-full bg-emerald-500" />
                        </div>
                        <div>
                            <p className="font-bold text-foreground">Session Open</p>
                            <p className="font-mono text-xs text-muted-foreground">{session.session_number}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => router.reload({ preserveScroll: true })}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                        <Link href={routes.cashSessions.show(session.id)}>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                                <Eye className="h-3.5 w-3.5" /> Details
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 divide-x divide-y divide-emerald-500/10 sm:grid-cols-4 sm:divide-y-0">
                    {stats.map((s) => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label} className="px-5 py-4 text-center">
                                <Icon className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                                <p className={cn('text-xl font-black tabular-nums', s.color)}>{s.val}</p>
                                <p className="mt-0.5 text-[10px] tracking-wide text-muted-foreground uppercase">{s.label}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-emerald-500/15 px-5 py-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {ago} · {session.cashier} · Opened {fmtDate(session.opened_at, 'h:mm a, MMM d')}
                    </span>
                    <span>
                        Expected: <strong className="text-foreground">{fmt(session.computed_expected ?? session.opening_cash, currency)}</strong>
                    </span>
                </div>
            </div>
            {showClose && (
                <CloseSessionModal
                    session={session}
                    requireCount={requireCount}
                    overShortAlert={overShortAlert}
                    currency={currency}
                    onClose={() => setShowClose(false)}
                />
            )}
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashSessionsIndex() {
    const { open_sessions, my_session, history, require_count, over_short_alert, app, flash } = usePage<PageProps>().props;

    const currency = app?.currency ?? '₱';
    const [showOpen, setShowOpen] = useState(false);
    const [toast, setToast] = useState(flash?.message ?? null);

    return (
        <AdminLayout>
            <Head title="Cash Sessions" />

            {/* Toast */}
            {toast && (
                <div
                    className={cn(
                        'fixed top-4 right-4 z-[9999] flex max-w-sm items-center gap-3 rounded-xl border px-5 py-3.5 text-sm font-medium shadow-2xl',
                        toast.type === 'success'
                            ? 'border-emerald-500/40 bg-[#0b1a10] text-emerald-300'
                            : toast.type === 'warning'
                              ? 'border-amber-500/40 bg-[#1a150b] text-amber-300'
                              : 'border-red-500/40 bg-[#1a0b0b] text-red-300',
                    )}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : toast.type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                    ) : (
                        <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{toast.text}</span>
                    <button onClick={() => setToast(null)} className="opacity-50 hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            <div className="mx-auto max-w-[1100px] space-y-6">
                {/* Page header */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-foreground">Cash Sessions</h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {open_sessions.length > 0
                                ? `${open_sessions.length} active session${open_sessions.length > 1 ? 's' : ''} · ${my_session ? 'Your session is open' : 'You have no open session'}`
                                : 'No active sessions — open one to start the day'}
                        </p>
                    </div>
                    {!my_session && (
                        <Button className="h-9 gap-2 font-semibold" onClick={() => setShowOpen(true)}>
                            <Plus className="h-4 w-4" /> Open Session
                        </Button>
                    )}
                </div>

                {/* My active session */}
                {my_session ? (
                    <ActiveSessionPanel session={my_session} requireCount={require_count} overShortAlert={over_short_alert} currency={currency} />
                ) : (
                    <div className="flex flex-col items-center gap-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-8 text-center sm:flex-row sm:text-left">
                        <div className="shrink-0 rounded-2xl bg-amber-500/10 p-4">
                            <Banknote className="h-7 w-7 text-amber-500" />
                        </div>
                        <div className="flex-1">
                            <p className="text-base font-bold text-foreground">No open session</p>
                            <p className="mt-1 text-sm text-muted-foreground">Open a cash session to begin tracking sales and cash flow for today.</p>
                        </div>
                        <Button className="shrink-0 gap-2" onClick={() => setShowOpen(true)}>
                            <Unlock className="h-4 w-4" /> Open Session
                        </Button>
                    </div>
                )}

                {/* Other open sessions from other cashiers */}
                {open_sessions.filter((s) => s.id !== my_session?.id).length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Other Open Sessions</p>
                        {open_sessions
                            .filter((s) => s.id !== my_session?.id)
                            .map((s) => (
                                <div key={s.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">{s.cashier}</p>
                                            <p className="font-mono text-xs text-muted-foreground">{s.session_number}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                        <span>
                                            Opening: <strong className="text-foreground">{s.formatted_opening_cash}</strong>
                                        </span>
                                        <Link href={routes.cashSessions.show(s.id)}>
                                            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                                                <Eye className="h-3 w-3" /> View
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {/* Session history */}
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-foreground">
                            Session History
                            <span className="ml-2 text-xs font-normal text-muted-foreground">{history.total} total</span>
                        </h2>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        {history.data.length === 0 ? (
                            <div className="py-16 text-center text-muted-foreground">
                                <Clock className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                <p className="text-sm">No sessions yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/30">
                                            <th className="px-4 py-3 text-left text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                                Session
                                            </th>
                                            <th className="hidden px-4 py-3 text-left text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:table-cell">
                                                Date
                                            </th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                                Opening
                                            </th>
                                            <th className="hidden px-4 py-3 text-right text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:table-cell">
                                                Expected
                                            </th>
                                            <th className="hidden px-4 py-3 text-right text-[10px] font-bold tracking-widest text-muted-foreground uppercase md:table-cell">
                                                Counted
                                            </th>
                                            <th className="px-4 py-3 text-right text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                                Over/Short
                                            </th>
                                            <th className="px-4 py-3 text-center text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                                Status
                                            </th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {history.data.map((s) => {
                                            const isOpen = s.status === 'open';
                                            const durationStr = s.closed_at
                                                ? (() => {
                                                      const mins = Math.round(
                                                          (new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 60000,
                                                      );
                                                      return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                                                  })()
                                                : null;

                                            return (
                                                <tr key={s.id} className="group transition-colors hover:bg-muted/20">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className={cn(
                                                                    'h-2 w-2 shrink-0 rounded-full',
                                                                    isOpen ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/20',
                                                                )}
                                                            />
                                                            <span className="font-mono text-xs font-bold text-foreground">{s.session_number}</span>
                                                        </div>
                                                        <p className="mt-0.5 pl-4 text-[11px] text-muted-foreground">{s.cashier}</p>
                                                    </td>
                                                    <td className="hidden px-4 py-3 sm:table-cell">
                                                        <p className="text-sm text-foreground">{fmtDate(s.opened_at, 'MMM d, yyyy')}</p>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {fmtDate(s.opened_at, 'h:mm a')}
                                                            {durationStr && <span className="ml-1 opacity-60">· {durationStr}</span>}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm font-medium text-foreground tabular-nums">
                                                        {s.formatted_opening_cash}
                                                    </td>
                                                    <td className="hidden px-4 py-3 text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                                                        {s.expected_cash !== null ? s.formatted_expected_cash : '—'}
                                                    </td>
                                                    <td className="hidden px-4 py-3 text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                                                        {s.counted_cash !== null ? s.formatted_counted_cash : '—'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {s.over_short !== null ? (
                                                            <span className={cn('text-sm font-bold tabular-nums', overShortCls(s.over_short_status))}>
                                                                {s.formatted_over_short}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span
                                                            className={cn(
                                                                'rounded-full px-2.5 py-1 text-[10px] font-bold',
                                                                isOpen
                                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                                    : 'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            {isOpen ? '● Open' : 'Closed'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <Link
                                                            href={routes.cashSessions.show(s.id)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                                                        >
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Pagination */}
                        {history.last_page > 1 && (
                            <div className="flex items-center justify-between border-t border-border bg-muted/10 px-4 py-3">
                                <p className="text-xs text-muted-foreground">
                                    {history.from}–{history.to} of {history.total}
                                </p>
                                <div className="flex items-center gap-1">
                                    {history.links.map((link, i) => (
                                        <button
                                            key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                            className={cn(
                                                'h-7 min-w-[28px] rounded-md border px-2 text-xs font-medium transition-all',
                                                link.active
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'border-border text-muted-foreground hover:bg-muted disabled:opacity-30',
                                            )}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showOpen && <OpenSessionModal currency={currency} onClose={() => setShowOpen(false)} />}
        </AdminLayout>
    );
}
