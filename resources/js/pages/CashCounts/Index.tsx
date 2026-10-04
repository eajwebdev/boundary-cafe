'use client';

import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Calculator,
    CheckCircle2,
    AlertTriangle,
    Banknote,
    Smartphone,
    CreditCard,
    CalendarClock,
    Minus,
    Plus,
    TrendingUp,
    Building2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenSession {
    id: number;
    session_number: string;
    cashier_name: string;
    is_mine: boolean;
    opened_at: string;
    opening_cash: number;
    pure_cash_sales: number;
    installment_dp: number;
    petty_cash_paid: number;
    expected_cash: number;
    gcash_system: number;
    card_system: number;
    bank_system: number;
}

interface Branch {
    id: number;
    name: string;
}

interface CashCount {
    id: number;
    count_type: string;
    system_total: number;
    expected_cash: number;
    counted_total: number;
    over_short: number;
    gcash_system: number | null;
    gcash_counted: number | null;
    gcash_over_short: number | null;
    card_system: number | null;
    card_counted: number | null;
    card_over_short: number | null;
    notes: string | null;
    created_at: string;
    cashSession?: { session_number: string; opened_at: string };
}

interface Denomination {
    denomination: number;
    quantity: number;
    subtotal: number;
    type: 'bill' | 'coin';
}

interface MissedCount {
    id: number;
    session_number: string;
    date: string;
    status: 'open' | 'closed';
    sale_count: number;
}

interface PageProps {
    open_sessions: OpenSession[];
    cash_counts: { data: CashCount[] };
    branches: Branch[];
    selected_branch_id: number;
    is_admin: boolean;
    missed_counts: MissedCount[];
    app?: { currency: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BILLS = [1000, 500, 200, 100, 50, 20];
const COINS = [20, 10, 5, 1, 0.25, 0.1, 0.05];

const fmt = (n: number, c = '₱') => c + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const overShortColor = (n: number) => (n === 0 ? 'text-emerald-600 dark:text-emerald-400' : n > 0 ? 'text-amber-500' : 'text-destructive');

const overShortLabel = (n: number) => (n === 0 ? 'Balanced' : n > 0 ? `Over ${fmt(Math.abs(n))}` : `Short ${fmt(Math.abs(n))}`);

function OverShortChip({ amount }: { amount: number }) {
    const cls = overShortColor(amount);
    const Icon = amount === 0 ? CheckCircle2 : AlertTriangle;
    return (
        <span className={cn('inline-flex items-center gap-1 text-xs font-bold', cls)}>
            <Icon className="h-3.5 w-3.5" />
            {overShortLabel(amount)}
        </span>
    );
}

// ─── Denomination Row ─────────────────────────────────────────────────────────

function DenomRow({ denom, onInc, onDec, onSet }: { denom: Denomination; onInc: () => void; onDec: () => void; onSet: (q: number) => void }) {
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 transition-colors',
                denom.quantity > 0 ? 'border border-primary/20 bg-primary/5' : 'border border-transparent bg-muted/40',
            )}
        >
            {/* Denomination label */}
            <div className="w-20 shrink-0">
                <p className="text-lg font-black text-foreground tabular-nums">₱{denom.denomination}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{denom.type}</p>
            </div>

            {/* −  quantity  + */}
            <div className="flex flex-1 items-center gap-2">
                <button
                    onClick={onDec}
                    disabled={denom.quantity === 0}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted disabled:opacity-30"
                >
                    <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                    type="number"
                    min="0"
                    value={denom.quantity || ''}
                    placeholder="0"
                    onChange={(e) => onSet(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-9 flex-1 rounded-lg border border-border bg-background text-center text-lg font-bold text-foreground tabular-nums focus:ring-1 focus:ring-primary focus:outline-none"
                />
                <button
                    onClick={onInc}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Subtotal */}
            <div className="w-28 shrink-0 text-right">
                <p className={cn('font-mono text-sm font-bold tabular-nums', denom.quantity > 0 ? 'text-primary' : 'text-muted-foreground/40')}>
                    {fmt(denom.subtotal)}
                </p>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CashCountsIndex() {
    const { open_sessions, cash_counts, branches, selected_branch_id, is_admin, missed_counts, app } = usePage<PageProps>().props;
    const currency = app?.currency ?? '₱';

    const handleBranchChange = (branchId: number) => {
        router.get('/cash-counts', { branch: branchId }, { preserveScroll: false, replace: true });
    };

    // Pre-select the first missed session if any are open and need counting
    const firstMissedOpen = missed_counts.find((m) => m.status === 'open');
    const initialSession = firstMissedOpen
        ? (open_sessions.find((s) => s.id === firstMissedOpen.id) ?? open_sessions[0] ?? null)
        : (open_sessions[0] ?? null);
    const [sessionId, setSessionId] = useState<number | null>(initialSession?.id ?? null);
    const [countType, setCountType] = useState<'closing' | 'midshift'>(initialSession?.is_mine !== false ? 'closing' : 'midshift');
    const [gcashCounted, setGcashCounted] = useState('');
    const [cardCounted, setCardCounted] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    const [denoms, setDenoms] = useState<Denomination[]>([
        ...BILLS.map((d) => ({ denomination: d, quantity: 0, subtotal: 0, type: 'bill' as const })),
        ...COINS.map((d) => ({ denomination: d, quantity: 0, subtotal: 0, type: 'coin' as const })),
    ]);

    const session = open_sessions.find((s) => s.id === sessionId) ?? null;

    // If selected session is not mine, force countType to midshift
    const effectiveCountType: 'closing' | 'midshift' = session && !session.is_mine ? 'midshift' : countType;

    const updateDenom = (i: number, qty: number) => {
        setDenoms((prev) => prev.map((d, idx) => (idx === i ? { ...d, quantity: qty, subtotal: Math.round(d.denomination * qty * 100) / 100 } : d)));
    };

    const reset = () => {
        setDenoms((prev) => prev.map((d) => ({ ...d, quantity: 0, subtotal: 0 })));
        setGcashCounted('');
        setCardCounted('');
        setNotes('');
    };

    // Totals
    const cashCounted = denoms.reduce((s, d) => s + d.subtotal, 0);
    const expectedCash = session?.expected_cash ?? 0;
    const cashOverShort = cashCounted - expectedCash;

    const gcashSystem = session?.gcash_system ?? 0;
    const cardSystem = session?.card_system ?? 0;
    const gcashCountedN = parseFloat(gcashCounted) || 0;
    const cardCountedN = parseFloat(cardCounted) || 0;
    const gcashOverShort = gcashCounted ? gcashCountedN - gcashSystem : null;
    const cardOverShort = cardCounted ? cardCountedN - cardSystem : null;

    const bills = denoms.filter((d) => d.type === 'bill');
    const coins = denoms.filter((d) => d.type === 'coin');
    const billsTotal = bills.reduce((s, d) => s + d.subtotal, 0);
    const coinsTotal = coins.reduce((s, d) => s + d.subtotal, 0);

    const canSubmit = !!sessionId && open_sessions.length > 0;

    const handleSubmit = () => {
        if (!sessionId) return;
        setLoading(true);
        router.post(
            '/cash-counts',
            {
                cash_session_id: sessionId,
                count_type: effectiveCountType,
                denominations: denoms.filter((d) => d.quantity > 0).map((d) => ({ denomination: d.denomination, quantity: d.quantity })),
                gcash_counted: gcashCounted ? gcashCountedN : null,
                card_counted: cardCounted ? cardCountedN : null,
                notes: notes || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    reset();
                    setLoading(false);
                },
                onError: () => setLoading(false),
            },
        );
    };

    return (
        <AdminLayout>
            <Head title="Cash Counts" />

            <div className="mx-auto max-w-5xl space-y-6">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
                            <Calculator className="h-5 w-5 text-primary" /> Cash Counts
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Count cash denominations and reconcile GCash / Card before closing the session.
                        </p>
                    </div>
                    {is_admin && branches.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <select
                                value={selected_branch_id}
                                onChange={(e) => handleBranchChange(Number(e.target.value))}
                                className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* ── Missed cash count warning ── */}
                {missed_counts.length > 0 && (
                    <div className="space-y-2 rounded-2xl border border-destructive/30 bg-destructive/8 p-4">
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <p className="text-sm font-bold">
                                {missed_counts.length === 1 ? '1 day missing a cash count' : `${missed_counts.length} days missing cash counts`}
                            </p>
                        </div>
                        <p className="pl-6 text-xs text-muted-foreground">
                            The following sessions had transactions but no closing count was recorded. A daily cash count is required for days with
                            transactions.
                        </p>
                        <div className="space-y-1.5 pt-1 pl-6">
                            {missed_counts.map((m) => (
                                <div
                                    key={m.id}
                                    className="flex items-center justify-between rounded-lg border border-destructive/20 bg-background px-3 py-2 text-xs"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-foreground">{m.session_number}</span>
                                        <span className="text-muted-foreground">
                                            {new Date(m.date).toLocaleDateString('en-PH', {
                                                timeZone: 'Asia/Manila',
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </span>
                                        <span className="text-muted-foreground">
                                            · {m.sale_count} transaction{m.sale_count !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span
                                            className={cn(
                                                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                                m.status === 'open'
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {m.status === 'open' ? '● Open' : 'Closed'}
                                        </span>
                                        {m.status === 'open' && open_sessions.find((s) => s.id === m.id) && (
                                            <button onClick={() => setSessionId(m.id)} className="text-[10px] font-bold text-primary hover:underline">
                                                Count now →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-5">
                    {/* ── LEFT: Form ── */}
                    <div className="space-y-5 lg:col-span-3">
                        {/* Session + type selectors */}
                        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                        Session
                                    </label>
                                    <select
                                        value={sessionId ?? ''}
                                        onChange={(e) => {
                                            const id = Number(e.target.value);
                                            setSessionId(id);
                                            const sel = open_sessions.find((s) => s.id === id);
                                            if (sel && !sel.is_mine && countType === 'closing') setCountType('midshift');
                                        }}
                                        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                    >
                                        {open_sessions.length === 0 ? (
                                            <option value="">No open sessions</option>
                                        ) : (
                                            open_sessions.map((s) => {
                                                const isMissed = missed_counts.some((m) => m.id === s.id);
                                                return (
                                                    <option key={s.id} value={s.id}>
                                                        {isMissed ? '⚠ ' : ''}
                                                        {s.session_number} — {s.cashier_name}
                                                        {s.is_mine ? ' (you)' : ''}
                                                        {isMissed ? ' (count required)' : ''}
                                                    </option>
                                                );
                                            })
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                        Count Type
                                    </label>
                                    <select
                                        value={countType}
                                        onChange={(e) => setCountType(e.target.value as any)}
                                        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                    >
                                        {open_sessions.find((s) => s.id === sessionId)?.is_mine === true && (
                                            <option value="closing">Closing Count (closes session)</option>
                                        )}
                                        <option value="midshift">Mid-shift Count</option>
                                    </select>
                                </div>
                            </div>

                            {/* Expected cash breakdown */}
                            {session && (
                                <div className="space-y-1.5 rounded-xl bg-muted/30 p-3.5 text-sm">
                                    <p className="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                        Expected Cash in Drawer
                                    </p>
                                    <div className="flex justify-between text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <Banknote className="h-3 w-3" />
                                            Opening cash
                                        </span>
                                        <span className="font-medium text-foreground tabular-nums">{fmt(session.opening_cash, currency)}</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <TrendingUp className="h-3 w-3" />
                                            Cash sales
                                        </span>
                                        <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                            +{fmt(session.pure_cash_sales, currency)}
                                        </span>
                                    </div>
                                    {session.installment_dp > 0 && (
                                        <div className="flex justify-between text-muted-foreground">
                                            <span className="flex items-center gap-1.5">
                                                <CalendarClock className="h-3 w-3" />
                                                Installment DP
                                                <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-500">
                                                    DP only
                                                </span>
                                            </span>
                                            <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                                                +{fmt(session.installment_dp, currency)}
                                            </span>
                                        </div>
                                    )}
                                    {session.petty_cash_paid > 0 && (
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Petty cash paid out</span>
                                            <span className="font-medium text-destructive tabular-nums">
                                                −{fmt(session.petty_cash_paid, currency)}
                                            </span>
                                        </div>
                                    )}
                                    <div className="mt-1 flex justify-between border-t border-border pt-2">
                                        <span className="font-bold text-foreground">Expected in drawer</span>
                                        <span className="font-black text-primary tabular-nums">{fmt(expectedCash, currency)}</span>
                                    </div>

                                    {/* Non-cash payments — for reference only */}
                                    {(gcashSystem > 0 || cardSystem > 0 || session.bank_system > 0 || (session.remittance_bank ?? 0) > 0) && (
                                        <>
                                            <p className="mb-1 border-t border-border pt-3 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                                Not in drawer (reconcile separately)
                                            </p>
                                            {gcashSystem > 0 && (
                                                <div className="flex justify-between text-muted-foreground/70">
                                                    <span className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400">
                                                        <Smartphone className="h-3 w-3" />
                                                        GCash
                                                    </span>
                                                    <span className="text-blue-500 tabular-nums dark:text-blue-400">
                                                        {fmt(gcashSystem, currency)}
                                                    </span>
                                                </div>
                                            )}
                                            {cardSystem > 0 && (
                                                <div className="flex justify-between text-muted-foreground/70">
                                                    <span className="flex items-center gap-1.5 text-purple-500 dark:text-purple-400">
                                                        <CreditCard className="h-3 w-3" />
                                                        Card
                                                    </span>
                                                    <span className="text-purple-500 tabular-nums dark:text-purple-400">
                                                        {fmt(cardSystem, currency)}
                                                    </span>
                                                </div>
                                            )}
                                            {session.bank_system > 0 && (
                                                <div className="flex justify-between text-muted-foreground/70">
                                                    <span className="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400">
                                                        <Building2 className="h-3 w-3" />
                                                        Bank / Check
                                                    </span>
                                                    <span className="text-indigo-500 tabular-nums dark:text-indigo-400">
                                                        {fmt(session.bank_system, currency)}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Cash denominations ── */}
                        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                            <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                <Banknote className="h-3.5 w-3.5" /> Bills
                            </p>
                            <div className="space-y-1.5">
                                {bills.map((d, i) => (
                                    <DenomRow
                                        key={d.denomination}
                                        denom={d}
                                        onInc={() => updateDenom(i, d.quantity + 1)}
                                        onDec={() => updateDenom(i, d.quantity - 1)}
                                        onSet={(q) => updateDenom(i, q)}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                                <span>Bills subtotal</span>
                                <span className="font-bold text-foreground tabular-nums">{fmt(billsTotal, currency)}</span>
                            </div>

                            <p className="flex items-center gap-1.5 pt-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                <Banknote className="h-3.5 w-3.5" /> Coins
                            </p>
                            <div className="space-y-1.5">
                                {coins.map((d, i) => (
                                    <DenomRow
                                        key={d.denomination}
                                        denom={d}
                                        onInc={() => updateDenom(bills.length + i, d.quantity + 1)}
                                        onDec={() => updateDenom(bills.length + i, d.quantity - 1)}
                                        onSet={(q) => updateDenom(bills.length + i, q)}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                                <span>Coins subtotal</span>
                                <span className="font-bold text-foreground tabular-nums">{fmt(coinsTotal, currency)}</span>
                            </div>

                            {/* Cash total vs expected */}
                            <div
                                className={cn(
                                    'rounded-2xl border-2 p-4 transition-all',
                                    cashCounted === 0
                                        ? 'border-border bg-muted/20'
                                        : cashOverShort === 0
                                          ? 'border-emerald-500/40 bg-emerald-500/5'
                                          : Math.abs(cashOverShort) > 100
                                            ? 'border-destructive/40 bg-destructive/5'
                                            : 'border-amber-500/40 bg-amber-500/5',
                                )}
                            >
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">Total Counted</p>
                                        <p
                                            className={cn(
                                                'text-4xl font-black tabular-nums',
                                                cashCounted === 0
                                                    ? 'text-muted-foreground'
                                                    : cashOverShort === 0
                                                      ? 'text-emerald-600 dark:text-emerald-400'
                                                      : 'text-foreground',
                                            )}
                                        >
                                            {fmt(cashCounted, currency)}
                                        </p>
                                    </div>
                                    {session && (
                                        <div className="text-right">
                                            <p className="mb-1 text-[10px] tracking-widest text-muted-foreground uppercase">Expected</p>
                                            <p className="text-xl font-bold text-foreground tabular-nums">{fmt(expectedCash, currency)}</p>
                                            {cashCounted > 0 && (
                                                <p className={cn('mt-0.5 text-sm font-bold tabular-nums', overShortColor(cashOverShort))}>
                                                    {overShortLabel(cashOverShort)}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── GCash reconciliation ── */}
                        {gcashSystem > 0 && (
                            <div className="space-y-3 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-blue-600 uppercase dark:text-blue-400">
                                    <Smartphone className="h-3.5 w-3.5" /> GCash Reconciliation
                                </p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        System GCash total
                                        {(session?.remittance_gcash ?? 0) > 0 && (
                                            <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                                                POS + remittance
                                            </span>
                                        )}
                                    </span>
                                    <span className="font-bold text-blue-600 tabular-nums dark:text-blue-400">{fmt(gcashSystem, currency)}</span>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Enter GCash Merchant App Total
                                    </label>
                                    <div className="relative">
                                        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={gcashCounted}
                                            onChange={(e) => setGcashCounted(e.target.value)}
                                            placeholder={gcashSystem.toFixed(2)}
                                            className="h-10 w-full rounded-xl border border-blue-500/30 bg-background pr-3 pl-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {gcashOverShort !== null && (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold',
                                            gcashOverShort === 0
                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                : 'bg-amber-500/10 text-amber-500',
                                        )}
                                    >
                                        {gcashOverShort === 0 ? (
                                            <>
                                                <CheckCircle2 className="h-4 w-4" />
                                                GCash balanced
                                            </>
                                        ) : (
                                            <>
                                                <AlertTriangle className="h-4 w-4" />
                                                {overShortLabel(gcashOverShort)}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Card / Bank reconciliation ── */}
                        {cardSystem > 0 && (
                            <div className="space-y-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-purple-600 uppercase dark:text-purple-400">
                                    <CreditCard className="h-3.5 w-3.5" /> Card / Bank Reconciliation
                                </p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        System card total
                                        {(session?.remittance_card ?? 0) > 0 && (
                                            <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                                                POS + remittance
                                            </span>
                                        )}
                                    </span>
                                    <span className="font-bold text-purple-600 tabular-nums dark:text-purple-400">{fmt(cardSystem, currency)}</span>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        Enter Terminal / Bank Batch Total
                                    </label>
                                    <div className="relative">
                                        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={cardCounted}
                                            onChange={(e) => setCardCounted(e.target.value)}
                                            placeholder={cardSystem.toFixed(2)}
                                            className="h-10 w-full rounded-xl border border-purple-500/30 bg-background pr-3 pl-8 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-purple-500 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                {cardOverShort !== null && (
                                    <div
                                        className={cn(
                                            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold',
                                            cardOverShort === 0
                                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                : 'bg-amber-500/10 text-amber-500',
                                        )}
                                    >
                                        {cardOverShort === 0 ? (
                                            <>
                                                <CheckCircle2 className="h-4 w-4" />
                                                Card balanced
                                            </>
                                        ) : (
                                            <>
                                                <AlertTriangle className="h-4 w-4" />
                                                {overShortLabel(cardOverShort)}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Notes + Submit */}
                        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
                            <div>
                                <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                                    Notes (optional)
                                </label>
                                <input
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Discrepancies, remarks…"
                                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            <div className="flex gap-3">
                                <Button variant="outline" className="h-11 flex-1" onClick={reset}>
                                    Clear All
                                </Button>
                                <Button className="h-11 flex-1 gap-2 text-base font-bold" disabled={!canSubmit || loading} onClick={handleSubmit}>
                                    {loading ? (
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                                    ) : (
                                        <Calculator className="h-4 w-4" />
                                    )}
                                    {effectiveCountType === 'closing' ? 'Count & Close Session' : 'Save Count'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ── RIGHT: History ── */}
                    <div className="lg:col-span-2">
                        <div className="sticky top-4 overflow-hidden rounded-2xl border border-border bg-card">
                            <div className="border-b border-border px-5 py-4">
                                <p className="text-sm font-bold text-foreground">Recent Counts</p>
                            </div>
                            <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
                                {cash_counts.data.length === 0 ? (
                                    <div className="py-12 text-center text-sm text-muted-foreground">No counts yet</div>
                                ) : (
                                    cash_counts.data.map((c) => (
                                        <Link
                                            key={c.id}
                                            href={`/cash-counts/${c.id}`}
                                            className="block space-y-2 px-5 py-4 transition-colors hover:bg-muted/30"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="font-mono text-xs font-bold text-foreground">{c.cashSession?.session_number}</p>
                                                    <p className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                                                        {c.count_type} ·{' '}
                                                        {new Date(c.created_at).toLocaleDateString('en-PH', {
                                                            timeZone: 'Asia/Manila',
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="font-mono text-sm font-bold text-foreground">{fmt(c.counted_total)}</p>
                                                    <OverShortChip amount={c.over_short} />
                                                </div>
                                            </div>

                                            {/* GCash row */}
                                            {c.gcash_counted !== null && c.gcash_system !== null && (
                                                <div className="flex items-center justify-between rounded-lg bg-blue-500/5 px-2.5 py-1.5 text-xs">
                                                    <span className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                                                        <Smartphone className="h-3 w-3" />
                                                        GCash
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {fmt(c.gcash_counted)} / {fmt(c.gcash_system)}
                                                        {c.gcash_over_short !== null && Math.abs(c.gcash_over_short) >= 0.005 && (
                                                            <span className={cn('ml-1.5 font-bold', overShortColor(c.gcash_over_short))}>
                                                                ({overShortLabel(c.gcash_over_short)})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Card row */}
                                            {c.card_counted !== null && c.card_system !== null && (
                                                <div className="flex items-center justify-between rounded-lg bg-purple-500/5 px-2.5 py-1.5 text-xs">
                                                    <span className="flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400">
                                                        <CreditCard className="h-3 w-3" />
                                                        Card
                                                    </span>
                                                    <span className="text-muted-foreground tabular-nums">
                                                        {fmt(c.card_counted)} / {fmt(c.card_system)}
                                                        {c.card_over_short !== null && Math.abs(c.card_over_short) >= 0.005 && (
                                                            <span className={cn('ml-1.5 font-bold', overShortColor(c.card_over_short))}>
                                                                ({overShortLabel(c.card_over_short)})
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
