import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import {
    CalendarClock,
    Phone,
    User,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Clock,
    ArrowLeft,
    Banknote,
    Smartphone,
    CreditCard,
    Plus,
    RefreshCw,
    Receipt,
    Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Types ─────────────────────────────────────────────────────────────────────

type Provider = 'home_credit' | 'skyro' | 'other';

interface Remittance {
    id: number;
    sequence: number;
    amount: string;
    payment_date: string;
    payment_method: string;
    notes: string | null;
    receiver: { id: number; fname: string; lname: string } | null;
    created_at: string;
}

interface Plan {
    id: number;
    sale: { id: number; receipt_number: string; created_at: string; total: string; payment_method: string };
    user: { id: number; fname: string; lname: string };
    provider: Provider;
    reference_number: string | null;
    customer_name: string;
    customer_phone: string | null;
    total_amount: string;
    down_payment: string;
    balance: string;
    installment_amount: string;
    total_paid: string;
    installments_count: number;
    paid_count: number;
    status: 'active' | 'completed' | 'cancelled';
    notes: string | null;
    created_at: string;
    payments: Remittance[];
}

interface PageProps {
    plan: Plan;
    app: { currency: string };
    flash?: { message?: { type: string; text: string } | null };
    [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v: number | string, currency = '₱') {
    return currency + Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

const PROVIDER_LABEL: Record<Provider, string> = {
    home_credit: 'Home Credit',
    skyro: 'Skyro',
    other: 'Other',
};

const PROVIDER_COLOR: Record<Provider, string> = {
    home_credit: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    skyro: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    other: 'bg-muted text-muted-foreground border-border',
};

function PayMethodIcon({ method }: { method: string }) {
    if (method === 'gcash') return <Smartphone className="h-3.5 w-3.5" />;
    if (method === 'card') return <CreditCard className="h-3.5 w-3.5" />;
    return <Banknote className="h-3.5 w-3.5" />;
}

// ── Record Remittance Modal ───────────────────────────────────────────────────

function RecordRemittanceModal({ plan, currency, onClose }: { plan: Plan; currency: string; onClose: () => void }) {
    const remaining = Math.max(0, parseFloat(plan.balance) - parseFloat(plan.total_paid));
    const [amount, setAmount] = useState(remaining.toFixed(2));
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [method, setMethod] = useState<'gcash' | 'card' | 'bank'>('bank');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const amtN = parseFloat(amount) || 0;
    const canSubmit = amtN > 0 && amtN <= remaining + 0.01 && date;

    const submit = () => {
        if (!canSubmit) return;
        setLoading(true);
        setError('');
        router.post(
            `/installments/${plan.id}/pay`,
            {
                amount,
                payment_date: date,
                payment_method: method,
                notes: notes || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setLoading(false);
                    onClose();
                },
                onError: (errs) => {
                    setError((Object.values(errs)[0] as string) ?? 'Failed to record remittance.');
                    setLoading(false);
                },
            },
        );
    };

    const PMETHODS = [
        { value: 'gcash' as const, label: 'GCash', icon: Smartphone },
        { value: 'card' as const, label: 'Card', icon: CreditCard },
        { value: 'bank' as const, label: 'Bank/Check', icon: CreditCard },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-sm sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="font-bold">Record Remittance</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Payment from {PROVIDER_LABEL[plan.provider]} to your store</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                        ✕
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    {/* Pending amount */}
                    <div className="rounded-xl bg-muted/30 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Pending from {PROVIDER_LABEL[plan.provider]}</p>
                        <p className="text-2xl font-black text-foreground">{fmtMoney(remaining, currency)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {plan.installments_count} month terms · ≈ {fmtMoney(parseFloat(plan.installment_amount), currency)}/month
                        </p>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Amount Received</label>
                        <div className="relative">
                            <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                            <input
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                type="number"
                                min="0.01"
                                step="0.01"
                                className="h-11 w-full rounded-xl border border-border bg-background pr-3 pl-8 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                        <div className="mt-1.5 flex gap-2">
                            <button onClick={() => setAmount(remaining.toFixed(2))} className="text-[10px] text-primary hover:underline">
                                Full balance
                            </button>
                            <button
                                onClick={() => setAmount(parseFloat(plan.installment_amount).toFixed(2))}
                                className="text-[10px] text-primary hover:underline"
                            >
                                Monthly amount
                            </button>
                        </div>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Date Received</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    {/* How provider paid */}
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">How Received</label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {PMETHODS.map((m) => {
                                const Icon = m.icon;
                                return (
                                    <button
                                        key={m.value}
                                        onClick={() => setMethod(m.value as any)}
                                        className={cn(
                                            'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-all',
                                            method === m.value
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border text-foreground hover:border-primary/40 hover:bg-accent',
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {m.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="mb-1.5 block text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Notes (optional)</label>
                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="e.g. partial remittance, batch no…"
                            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    {error && (
                        <p className="flex items-center gap-1.5 text-xs text-destructive">
                            <AlertTriangle className="h-3 w-3" />
                            {error}
                        </p>
                    )}
                </div>
                <div className="px-5 pb-5">
                    <Button className="h-11 w-full gap-2 font-bold" disabled={!canSubmit || loading} onClick={submit}>
                        {loading ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        ) : (
                            <>
                                <Plus className="h-4 w-4" />
                                Record {fmtMoney(amtN, currency)} Remittance
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InstallmentsShow() {
    const { plan, app } = usePage<PageProps>().props;
    const currency = app.currency ?? '₱';
    const [showPay, setShowPay] = useState(false);

    const dp = parseFloat(plan.down_payment);
    const financed = parseFloat(plan.balance);
    const remitted = parseFloat(plan.total_paid);
    const remaining = Math.max(0, financed - remitted);
    const paidPct = financed > 0 ? Math.min(100, (remitted / financed) * 100) : 100;

    const handleCancel = () => {
        if (!confirm('Cancel this financing record? This cannot be undone.')) return;
        router.post(`/installments/${plan.id}/cancel`, {}, { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title={`${PROVIDER_LABEL[plan.provider]} — ${plan.customer_name}`} />
            <div className="mx-auto max-w-2xl space-y-5">
                {/* Back */}
                <Link
                    href="/installments"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Financing Records
                </Link>

                {/* Summary card */}
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                        <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span
                                    className={cn(
                                        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold tracking-wide uppercase',
                                        PROVIDER_COLOR[plan.provider],
                                    )}
                                >
                                    {PROVIDER_LABEL[plan.provider]}
                                </span>
                                {plan.status === 'completed' && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Fully Remitted
                                    </span>
                                )}
                                {plan.status === 'cancelled' && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                                        <XCircle className="h-3.5 w-3.5" /> Cancelled
                                    </span>
                                )}
                                {plan.status === 'active' && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                                        <Clock className="h-3.5 w-3.5" /> Pending Remittance
                                    </span>
                                )}
                            </div>
                            <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {plan.customer_name}
                            </h1>
                            {plan.customer_phone && (
                                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5" />
                                    {plan.customer_phone}
                                </p>
                            )}
                            {plan.reference_number && (
                                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                                    <Hash className="h-3.5 w-3.5" />
                                    Ref: {plan.reference_number}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
                        {[
                            { label: 'Sale Total', value: fmtMoney(plan.total_amount, currency) },
                            { label: 'Down Payment', value: dp > 0 ? fmtMoney(dp, currency) : 'No DP' },
                            { label: 'Financed Amount', value: fmtMoney(financed, currency) },
                            { label: 'Monthly Remittance', value: fmtMoney(plan.installment_amount, currency) },
                            { label: 'Terms', value: `${plan.installments_count} months` },
                            { label: 'Remittances', value: `${plan.paid_count} of ${plan.installments_count}` },
                        ].map((d) => (
                            <div key={d.label} className="bg-card px-4 py-3">
                                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">{d.label}</p>
                                <p className="mt-0.5 text-sm font-bold text-foreground">{d.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Progress */}
                    {financed > 0 && (
                        <div className="border-t border-border px-5 py-4">
                            <div className="mb-2 flex justify-between text-sm">
                                <span className="text-muted-foreground">Remitted by {PROVIDER_LABEL[plan.provider]}</span>
                                <span className="font-bold text-foreground">
                                    {fmtMoney(remitted, currency)} / {fmtMoney(financed, currency)}
                                </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn('h-full rounded-full transition-all', plan.status === 'completed' ? 'bg-green-500' : 'bg-primary')}
                                    style={{ width: `${paidPct}%` }}
                                />
                            </div>
                            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                                <span>{Math.round(paidPct)}% remitted</span>
                                <span>Pending {fmtMoney(remaining, currency)}</span>
                            </div>
                        </div>
                    )}

                    {/* Sale reference + notes */}
                    <div className="flex items-center justify-between gap-3 border-t border-border px-5 pt-4 pb-4">
                        <Link href={`/pos/${plan.sale?.id}`} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                            <Receipt className="h-3.5 w-3.5" />
                            Receipt #{plan.sale?.receipt_number}
                        </Link>
                        {plan.notes && <p className="max-w-[60%] truncate text-xs text-muted-foreground italic">"{plan.notes}"</p>}
                    </div>
                </div>

                {/* Action buttons */}
                {plan.status === 'active' && (
                    <div className="flex gap-2">
                        <Button className="h-11 flex-1 gap-2 font-semibold" onClick={() => setShowPay(true)}>
                            <Plus className="h-4 w-4" /> Record Remittance
                        </Button>
                        <Button
                            variant="outline"
                            size="default"
                            className="h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>
                    </div>
                )}

                {/* Remittance history */}
                <div className="space-y-2">
                    <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-foreground uppercase">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /> Remittance History
                    </h2>

                    {/* Down payment row (if any) */}
                    {dp > 0 && (
                        <div className="rounded-xl border border-border bg-card p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="rounded-lg bg-primary/10 p-1.5">
                                        <Banknote className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">Down Payment</p>
                                        <p className="text-xs text-muted-foreground">{fmtDate(plan.created_at)} · Collected at POS</p>
                                    </div>
                                </div>
                                <p className="font-bold text-foreground">{fmtMoney(dp, currency)}</p>
                            </div>
                        </div>
                    )}

                    {plan.payments.length === 0 && dp === 0 && (
                        <div className="rounded-xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
                            No remittances recorded yet.
                        </div>
                    )}

                    {plan.payments.map((r) => (
                        <div key={r.id} className="rounded-xl border border-border bg-card p-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="rounded-lg bg-muted p-1.5">
                                        <PayMethodIcon method={r.payment_method} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            Remittance #{r.sequence}
                                            <span className="ml-1.5 text-xs font-normal text-muted-foreground capitalize">{r.payment_method}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {fmtDate(r.payment_date)}
                                            {r.receiver && ` · Recorded by ${r.receiver.fname} ${r.receiver.lname}`}
                                        </p>
                                        {r.notes && <p className="mt-0.5 text-xs text-muted-foreground/70 italic">"{r.notes}"</p>}
                                    </div>
                                </div>
                                <p className="font-bold text-foreground">{fmtMoney(r.amount, currency)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showPay && <RecordRemittanceModal plan={plan} currency={currency} onClose={() => setShowPay(false)} />}
        </AdminLayout>
    );
}
