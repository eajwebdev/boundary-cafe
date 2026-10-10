import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowLeft, Calendar, Download, History, Receipt, User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type React from 'react';
import { useRewardsName } from '@/hooks/use-business-name';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

interface Customer {
    id: number;
    name: string;
    contact_number: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    total_purchases: number;
    has_online_account?: boolean;
    online_orders_count?: number;
    barangay?: string | null;
    last_login_at?: string | null;
    customer_number: string;
    loyalty_token: string;
    loyalty_points: number;
    lifetime_points_earned: number;
    lifetime_points_redeemed: number;
}
interface SaleRow {
    id: number;
    receipt_number: string;
    created_at: string;
    total: number;
    amount_paid: number;
    balance_due: number;
    payment_method: string;
    payment_status: string;
    due_date: string | null;
    notes: string | null;
    cashier: string | null;
    items: { name: string; variant_name: string | null; qty: number; total: number }[];
}
interface PaymentRow {
    id: number;
    sale_id: number | null;
    receipt_number: string | null;
    payment_date: string;
    amount: number;
    payment_method: string;
    notes: string | null;
    received_by: string | null;
}
interface CreditRow {
    id: number;
    receipt_number: string;
    total: number;
    amount_paid: number;
    balance_due: number;
    payment_status: string;
    due_date: string | null;
}
interface LedgerRow {
    date: string;
    type: 'credit' | 'payment';
    reference: string | null;
    debit: number;
    credit: number;
    balance: number | null;
    notes: string | null;
}
interface PageProps {
    customer: Customer;
    sales: { data: SaleRow[] };
    payments: PaymentRow[];
    openCredits: CreditRow[];
    ledger: LedgerRow[];
    currency: string;
    loyaltyTransactions: {
        id: number;
        type: string;
        points: number;
        balance_after: number;
        reason: string | null;
        created_at: string;
        branch: string | null;
        user: string | null;
    }[];
    [key: string]: unknown;
}

export default function CustomerShow() {
    const { props } = usePage<PageProps>();
    const { customer, sales, currency, loyaltyTransactions } = props;
    const rewardsName = useRewardsName();
    const fmt = (n: number) => `${currency}${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <AdminLayout>
            <Head title={customer.name} />
            <div className="mx-auto max-w-[1400px] space-y-5">
                <div className="flex items-center gap-3">
                    <Link href={routes.customers.index()}>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                            <ArrowLeft className="h-3.5 w-3.5" />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-foreground">{customer.name}</h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">{customer.contact_number || customer.email || 'Registered customer'}</p>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                    <div className="rounded-2xl bg-[var(--boundary-blue)] p-5 text-white shadow-lg">
                        <div className="flex items-center justify-between">
                            <p className="font-black uppercase">{rewardsName}</p>
                            <span className="text-xs text-white/60">{customer.customer_number}</span>
                        </div>
                        <div className="mt-4 rounded-xl bg-white p-4">
                            <QRCodeSVG value={customer.loyalty_token} size={180} level="H" className="mx-auto max-w-full" />
                        </div>
                        <div className="mt-4 flex items-end justify-between">
                            <div>
                                <p className="text-3xl font-black">{customer.loyalty_points}</p>
                                <p className="text-xs text-white/65">available points</p>
                            </div>
                            <a
                                href={`/loyalty/card/${customer.loyalty_token}`}
                                target="_blank"
                                className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-xs font-bold"
                            >
                                <Download size={14} /> Open card
                            </a>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold">Loyalty activity</h2>
                            <p className="text-xs text-muted-foreground">
                                Earned {customer.lifetime_points_earned} · Redeemed {customer.lifetime_points_redeemed}
                            </p>
                        </div>
                        <div className="mt-4 divide-y divide-border">
                            {loyaltyTransactions.length === 0 ? (
                                <p className="py-8 text-center text-sm text-muted-foreground">No loyalty activity yet.</p>
                            ) : (
                                loyaltyTransactions.map((entry) => (
                                    <div key={entry.id} className="flex items-center justify-between gap-4 py-3">
                                        <div>
                                            <p className="text-sm font-semibold capitalize">{entry.type}</p>
                                            <p className="text-xs text-muted-foreground">{entry.reason ?? entry.branch ?? rewardsName}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={cn('font-black', entry.points >= 0 ? 'text-emerald-600' : 'text-orange-600')}>
                                                {entry.points >= 0 ? '+' : ''}
                                                {entry.points}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">Balance {entry.balance_after}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Total purchases', value: fmt(customer.total_purchases), icon: Receipt },
                        { label: 'Online account', value: customer.has_online_account ? 'Registered' : 'Walk-in only', icon: User },
                        { label: 'Online orders', value: String(customer.online_orders_count ?? 0), icon: History },
                        { label: 'Barangay', value: customer.barangay ?? '—', icon: Calendar },
                    ].map((card) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.label} className="rounded-xl border border-border bg-card p-4">
                                <Icon className="mb-2 h-4 w-4 text-primary" />
                                <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{card.label}</p>
                                <p className="mt-0.5 text-lg font-bold text-foreground tabular-nums">{card.value}</p>
                            </div>
                        );
                    })}
                </div>

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Receipt className="h-4 w-4 text-primary" />
                        <h2 className="text-sm font-semibold">Purchase History</h2>
                        {customer.last_login_at && (
                            <span className="ml-auto text-xs text-muted-foreground">Last online login {new Date(customer.last_login_at).toLocaleString()}</span>
                        )}
                    </div>
                    <div className="divide-y divide-border">
                        {sales.data.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No purchases yet.</p>
                        ) : (
                            sales.data.map((sale) => (
                                <div key={sale.id} className="flex items-start justify-between gap-3 px-4 py-3">
                                    <div>
                                        <p className="font-mono text-sm font-semibold">{sale.receipt_number}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(sale.created_at).toLocaleString()} · {sale.payment_method}
                                            {sale.cashier ? ` · ${sale.cashier}` : ''}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {sale.items.map((i) => `${i.qty}× ${i.name}${i.variant_name ? ` (${i.variant_name})` : ''}`).join(', ')}
                                        </p>
                                    </div>
                                    <p className="font-bold tabular-nums">{fmt(sale.total)}</p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </AdminLayout>
    );
}
