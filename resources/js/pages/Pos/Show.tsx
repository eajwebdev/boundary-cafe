'use client';

import { usePage, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import ReceiptTemplate, { ReceiptData } from './ReceiptTemplate';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import { ArrowLeft, Edit2, XCircle, AlertTriangle, CheckCircle2, ShoppingCart, Calendar, User, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate } from '@/lib/date';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PageProps {
    sale: ReceiptData & { id: number };
    app: { currency: string };
    auth: { user: { is_admin: boolean; is_super_admin: boolean; fname: string } | null };
    [key: string]: unknown;
}

// ─── Void confirm dialog ──────────────────────────────────────────────────────
function VoidDialog({ onConfirm, onClose, loading }: { onConfirm: (reason: string) => void; onClose: () => void; loading: boolean }) {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl">
                <div className="flex items-center gap-3">
                    <div className="rounded-full bg-destructive/10 p-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                        <p className="font-semibold text-foreground">Void this sale?</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Stock will be restored automatically.</p>
                    </div>
                </div>
                <div>
                    <label className="mb-1.5 block text-xs font-semibold tracking-widest text-muted-foreground uppercase">Reason (optional)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Customer changed mind, Wrong item scanned…"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-9 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="destructive" className="h-9 flex-1 gap-2" onClick={() => onConfirm(reason)} disabled={loading}>
                        {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                        Void sale
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Show page ────────────────────────────────────────────────────────────────
export default function PosShow() {
    const { props } = usePage<PageProps>();
    const { sale, app, auth } = props;
    const currency = app?.currency ?? '₱';
    const user = auth?.user;

    const [showVoid, setShowVoid] = useState(false);
    const [voidLoading, setVoidLoading] = useState(false);
    const [voidError, setVoidError] = useState<string | null>(null);

    const isVoided = sale.status === 'voided';
    const canVoid = !isVoided && (user?.is_admin || user?.is_super_admin);
    const canEdit = !isVoided;

    const handleVoid = (reason: string) => {
        setVoidLoading(true);
        setVoidError(null);
        router.post(
            routes.pos.void(sale.id),
            { reason },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setShowVoid(false);
                    setVoidLoading(false);
                },
                onError: (e) => {
                    setVoidError(Object.values(e)[0] as string);
                    setVoidLoading(false);
                },
            },
        );
    };

    return (
        <AdminLayout>
            <div className="mx-auto max-w-xl space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href={routes.sales.history()}>
                            <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                <ArrowLeft className="h-3.5 w-3.5" />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-bold text-foreground">Receipt</h1>
                            <p className="mt-0.5 font-mono text-xs text-muted-foreground">{sale.receipt_number}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {canEdit && (
                            <Link href={routes.pos.edit(sale.id)}>
                                <Button variant="outline" size="sm" className="h-8 gap-2">
                                    <Edit2 className="h-3.5 w-3.5" />
                                    Edit
                                </Button>
                            </Link>
                        )}
                        {canVoid && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                                onClick={() => setShowVoid(true)}
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                Void
                            </Button>
                        )}
                    </div>
                </div>

                {/* Void error */}
                {voidError && (
                    <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        {voidError}
                    </div>
                )}

                {/* Status banner */}
                <div
                    className={cn(
                        'flex items-center gap-3 rounded-xl border px-4 py-3',
                        isVoided
                            ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20'
                            : 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-950/20',
                    )}
                >
                    {isVoided ? (
                        <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                    ) : (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                    )}
                    <div>
                        <p className={cn('text-sm font-semibold', isVoided ? 'text-destructive' : 'text-green-800 dark:text-green-300')}>
                            {isVoided ? 'This sale has been voided' : 'Sale completed'}
                        </p>
                        <p className={cn('mt-0.5 text-xs', isVoided ? 'text-destructive/70' : 'text-green-600 dark:text-green-500')}>
                            {fmtDate(sale.created_at, 'MMMM d, yyyy · h:mm a')}
                        </p>
                    </div>
                </div>

                {/* Meta info row */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { icon: ShoppingCart, label: 'Items', value: `${sale.items.length} item${sale.items.length !== 1 ? 's' : ''}` },
                        { icon: User, label: 'Cashier', value: sale.cashier },
                        { icon: CreditCard, label: 'Method', value: sale.payment_method.charAt(0).toUpperCase() + sale.payment_method.slice(1) },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
                            <div className="mb-1.5 flex justify-center">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</p>
                            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
                        </div>
                    ))}
                </div>

                {/* Receipt */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <ReceiptTemplate sale={sale} currency={currency} showActions={true} />
                </div>
            </div>

            {showVoid && <VoidDialog onConfirm={handleVoid} onClose={() => setShowVoid(false)} loading={voidLoading} />}
        </AdminLayout>
    );
}
