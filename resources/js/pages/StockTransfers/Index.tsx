'use client';
import { Head, router } from '@inertiajs/react';
import { ArrowLeftRight, Plus, CheckCircle2, XCircle, Clock, Warehouse, Building2, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Transfer {
    id: number;
    transfer_number: string;
    from_type: 'branch' | 'warehouse';
    from_id: number;
    from_name: string;
    to_type: 'branch' | 'warehouse';
    to_id: number;
    to_name: string;
    product_id: number;
    product_name: string;
    product_barcode: string | null;
    quantity: number;
    status: 'pending' | 'completed' | 'cancelled';
    notes: string | null;
    requested_by: string;
    completed_by: string | null;
    completed_at: string | null;
    created_at: string;
}
interface Branch {
    id: number;
    name: string;
    code: string;
}
interface Warehouse {
    id: number;
    name: string;
    code: string;
}
interface Product {
    id: number;
    name: string;
    barcode: string | null;
}
interface Pagination {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
}
interface PageProps {
    transfers: Transfer[];
    pagination: Pagination;
    branches: Branch[];
    warehouses: Warehouse[];
    products: Product[];
    filters: { status: string; search: string; per_page: number };
    is_admin: boolean;
    message?: { type: string; text: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusMeta = {
    pending: { label: 'Pending', color: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20', icon: Clock },
    completed: { label: 'Completed', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', color: 'bg-red-500/15 text-red-400 border border-red-500/20', icon: XCircle },
};

function LocationIcon({ type }: { type: 'branch' | 'warehouse' }) {
    return type === 'warehouse' ? (
        <Warehouse className="-mt-0.5 mr-1 inline h-3.5 w-3.5 text-purple-400" />
    ) : (
        <Building2 className="-mt-0.5 mr-1 inline h-3.5 w-3.5 text-blue-400" />
    );
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const inp = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary';
const sel = inp + ' cursor-pointer';
const textarea =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none';

// ─── Create Transfer Modal ────────────────────────────────────────────────────
function CreateTransferModal({
    open,
    onClose,
    branches,
    warehouses,
    products,
}: {
    open: boolean;
    onClose: () => void;
    branches: Branch[];
    warehouses: Warehouse[];
    products: Product[];
}) {
    const [fromType, setFromType] = useState<'branch' | 'warehouse'>('branch');
    const [fromId, setFromId] = useState('');
    const [toType, setToType] = useState<'branch' | 'warehouse'>('branch');
    const [toId, setToId] = useState('');
    const [productId, setProductId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const reset = () => {
        setFromType('branch');
        setFromId('');
        setToType('branch');
        setToId('');
        setProductId('');
        setQuantity('');
        setNotes('');
        setErrors({});
    };

    const fromOptions = fromType === 'branch' ? branches : warehouses;
    const toOptions = toType === 'branch' ? branches : warehouses;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        setErrors({});
        router.post(
            routes.stockTransfers.store(),
            {
                from_type: fromType,
                from_id: parseInt(fromId),
                to_type: toType,
                to_id: parseInt(toId),
                product_id: parseInt(productId),
                quantity: parseInt(quantity),
                notes: notes || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setProcessing(false);
                    reset();
                    onClose();
                },
                onError: (errs) => {
                    setErrors(errs);
                    setProcessing(false);
                },
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    reset();
                    onClose();
                }
            }}
        >
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowLeftRight className="h-5 w-5" /> New Stock Transfer
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {/* From */}
                    <div className="space-y-3 rounded-xl bg-muted/20 p-4">
                        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">From (Source)</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                                <select
                                    className={sel}
                                    value={fromType}
                                    onChange={(e) => {
                                        setFromType(e.target.value as 'branch' | 'warehouse');
                                        setFromId('');
                                    }}
                                >
                                    <option value="branch">Branch</option>
                                    <option value="warehouse">Warehouse</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-muted-foreground">{fromType === 'branch' ? 'Branch' : 'Warehouse'}</label>
                                <select className={sel} value={fromId} onChange={(e) => setFromId(e.target.value)}>
                                    <option value="">Select…</option>
                                    {fromOptions.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.from_id && <p className="mt-1 text-xs text-red-400">{errors.from_id}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex items-center justify-center">
                        <div className="flex flex-col items-center gap-1 text-muted-foreground">
                            <ArrowLeftRight className="h-5 w-5 rotate-90" />
                            <span className="text-xs">Transfer to</span>
                        </div>
                    </div>

                    {/* To */}
                    <div className="space-y-3 rounded-xl bg-muted/20 p-4">
                        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">To (Destination)</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                                <select
                                    className={sel}
                                    value={toType}
                                    onChange={(e) => {
                                        setToType(e.target.value as 'branch' | 'warehouse');
                                        setToId('');
                                    }}
                                >
                                    <option value="branch">Branch</option>
                                    <option value="warehouse">Warehouse</option>
                                </select>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-muted-foreground">{toType === 'branch' ? 'Branch' : 'Warehouse'}</label>
                                <select className={sel} value={toId} onChange={(e) => setToId(e.target.value)}>
                                    <option value="">Select…</option>
                                    {toOptions.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.name}
                                        </option>
                                    ))}
                                </select>
                                {errors.to_id && <p className="mt-1 text-xs text-red-400">{errors.to_id}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Product + Qty */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Product</label>
                            <select className={sel} value={productId} onChange={(e) => setProductId(e.target.value)}>
                                <option value="">Select product…</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                        {p.barcode ? ` (${p.barcode})` : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.product_id && <p className="mt-1 text-xs text-red-400">{errors.product_id}</p>}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Quantity</label>
                            <input
                                type="number"
                                min="1"
                                className={inp}
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                                placeholder="0"
                            />
                            {errors.quantity && <p className="mt-1 text-xs text-red-400">{errors.quantity}</p>}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Notes (optional)</label>
                        <textarea className={textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    {errors.error && <p className="text-sm text-red-400">{errors.error}</p>}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                reset();
                                onClose();
                            }}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing || !fromId || !toId || !productId || !quantity}>
                            {processing ? 'Creating…' : 'Create Transfer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StockTransfersIndex({ transfers, pagination, branches, warehouses, products, filters, message }: PageProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || '');
    const [statusFilter, setStatus] = useState(filters.status || '');
    const [completing, setCompleting] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState<number | null>(null);

    const applyFilters = (overrides: Record<string, unknown> = {}) => {
        router.get(
            routes.stockTransfers.index(),
            {
                search: search || undefined,
                status: statusFilter || undefined,
                ...overrides,
            },
            { preserveScroll: true, preserveState: true },
        );
    };

    const handleComplete = (id: number) => {
        setCompleting(id);
        router.post(
            routes.stockTransfers.complete(id),
            {},
            {
                preserveScroll: true,
                onFinish: () => setCompleting(null),
            },
        );
    };

    const handleCancel = async (id: number) => {
        const confirmed = await confirmDialog({
            title: 'Cancel this transfer?',
            confirmLabel: 'Cancel transfer',
            cancelLabel: 'Keep it',
            tone: 'danger',
        });
        if (!confirmed) return;
        setCancelling(id);
        router.post(
            routes.stockTransfers.cancel(id),
            {},
            {
                preserveScroll: true,
                onFinish: () => setCancelling(null),
            },
        );
    };

    return (
        <AdminLayout>
            <Head title="Stock Transfers" />

            <div className="space-y-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Stock Transfers</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Move stock between branches and warehouses</p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 h-4 w-4" /> New Transfer
                    </Button>
                </div>

                {/* Flash */}
                {message && (
                    <div
                        className={cn(
                            'rounded-xl border px-4 py-3 text-sm',
                            message.type === 'success'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : message.type === 'warning'
                                  ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-400'
                                  : 'border-red-500/20 bg-red-500/10 text-red-400',
                        )}
                    >
                        {message.text}
                    </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative max-w-xs min-w-[180px] flex-1">
                        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            className={cn(inp, 'pl-9')}
                            placeholder="Search product…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                        />
                        {search && (
                            <button
                                onClick={() => {
                                    setSearch('');
                                    applyFilters({ search: undefined });
                                }}
                            >
                                <X className="absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <select
                        className={cn(sel, 'w-36')}
                        value={statusFilter}
                        onChange={(e) => {
                            setStatus(e.target.value);
                            applyFilters({ status: e.target.value || undefined });
                        }}
                    >
                        <option value="">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Transfer #
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        From → To
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Product
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">Qty</th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Status
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:table-cell">
                                        Requested By
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:table-cell">
                                        Date
                                    </th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {transfers.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-16 text-center text-muted-foreground">
                                            <ArrowLeftRight className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                            No transfers found
                                        </td>
                                    </tr>
                                ) : (
                                    transfers.map((t) => {
                                        const meta = statusMeta[t.status];
                                        return (
                                            <tr key={t.id} className="transition-colors hover:bg-muted/20">
                                                <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{t.transfer_number}</td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-0.5 text-xs">
                                                        <div>
                                                            <LocationIcon type={t.from_type} />
                                                            <span className="font-medium text-foreground">{t.from_name}</span>
                                                        </div>
                                                        <div className="pl-4 text-muted-foreground">↓</div>
                                                        <div>
                                                            <LocationIcon type={t.to_type} />
                                                            <span className="font-medium text-foreground">{t.to_name}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-foreground">{t.product_name}</div>
                                                    {t.product_barcode && (
                                                        <div className="font-mono text-xs text-muted-foreground">{t.product_barcode}</div>
                                                    )}
                                                    {t.notes && <div className="mt-0.5 text-xs text-muted-foreground italic">{t.notes}</div>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold tabular-nums">{t.quantity.toLocaleString()}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                                                            meta.color,
                                                        )}
                                                    >
                                                        <meta.icon className="h-3 w-3" />
                                                        {meta.label}
                                                    </span>
                                                </td>
                                                <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">{t.requested_by}</td>
                                                <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                                                    {fmtDate(t.created_at)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {t.status === 'pending' && (
                                                        <div className="flex justify-end gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="default"
                                                                disabled={completing === t.id}
                                                                onClick={() => handleComplete(t.id)}
                                                            >
                                                                {completing === t.id ? (
                                                                    '…'
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                                                        Transfer
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={cancelling === t.id}
                                                                onClick={() => handleCancel(t.id)}
                                                            >
                                                                {cancelling === t.id ? '…' : <XCircle className="h-3.5 w-3.5" />}
                                                            </Button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                {pagination.last_page > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            Page {pagination.current_page} of {pagination.last_page} ({pagination.total} transfers)
                        </span>
                        <div className="flex gap-1">
                            <button
                                disabled={pagination.current_page <= 1}
                                onClick={() => applyFilters({ page: pagination.current_page - 1 })}
                                className="rounded-lg border border-border p-1.5 hover:bg-muted/30 disabled:opacity-40"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                disabled={pagination.current_page >= pagination.last_page}
                                onClick={() => applyFilters({ page: pagination.current_page + 1 })}
                                className="rounded-lg border border-border p-1.5 hover:bg-muted/30 disabled:opacity-40"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <CreateTransferModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                branches={branches}
                warehouses={warehouses}
                products={products}
            />
        </AdminLayout>
    );
}
