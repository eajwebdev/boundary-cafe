'use client';
import { Head, router } from '@inertiajs/react';
import { ArrowLeftRight, ArrowRight, Plus, CheckCircle2, XCircle, Clock, Warehouse, Building2, Package, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Chip, controlCls, EmptyRow, PageHeader, Panel, SimplePager, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
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
    stats: { pending: number; completed_month: number; units_month: number; cancelled_month: number };
    flash?: { message?: { type: string; text: string } };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusMeta: Record<Transfer['status'], { label: string; tone: Tone; icon: React.ElementType }> = {
    pending: { label: 'Pending', tone: 'warning', icon: Clock },
    completed: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', tone: 'muted', icon: XCircle },
};

function LocationIcon({ type }: { type: 'branch' | 'warehouse' }) {
    return type === 'warehouse' ? (
        <Warehouse className="h-3 w-3 shrink-0 text-muted-foreground" />
    ) : (
        <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
    );
}

const STATUS_FILTERS = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
];

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
export default function StockTransfersIndex({ transfers, pagination, branches, warehouses, products, filters, stats, flash }: PageProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || '');
    const [statusFilter, setStatus] = useState(filters.status || '');
    const [completing, setCompleting] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState<number | null>(null);

    useEffect(() => {
        const message = flash?.message;
        if (!message) return;
        if (message.type === 'success') toast.success(message.text);
        else if (message.type === 'warning') toast.warning(message.text);
        else toast.error(message.text);
    }, [flash]);

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

    const pageFrom = pagination.total === 0 ? 0 : (pagination.current_page - 1) * pagination.per_page + 1;
    const pageTo = Math.min(pagination.current_page * pagination.per_page, pagination.total);

    return (
        <AdminLayout>
            <Head title="Stock Transfers" />

            <div className="space-y-4">
                <PageHeader title="Stock Transfers" subtitle="Move stock between branches and the warehouse.">
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4" /> New transfer
                    </Button>
                </PageHeader>

                <StatStrip count={4}>
                    <Stat
                        icon={Clock}
                        label="Waiting to move"
                        value={stats.pending.toLocaleString()}
                        tone={stats.pending > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={CheckCircle2} label="Completed · this month" value={stats.completed_month.toLocaleString()} tone="success" />
                    <Stat icon={Package} label="Units moved · this month" value={stats.units_month.toLocaleString()} />
                    <Stat
                        icon={XCircle}
                        label="Cancelled · this month"
                        value={stats.cancelled_month.toLocaleString()}
                        tone={stats.cancelled_month > 0 ? 'muted' : undefined}
                    />
                </StatStrip>

                <Panel
                    flush
                    icon={ArrowLeftRight}
                    title="Transfers"
                    actions={
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                className={cn(controlCls, 'w-full pr-8 pl-8')}
                                placeholder="Search product, then Enter"
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
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear search"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    }
                >
                    <div className="flex flex-wrap gap-1 border-b border-border bg-muted/20 px-4 py-2">
                        {STATUS_FILTERS.map((option) => (
                            <Chip
                                key={option.value}
                                active={statusFilter === option.value}
                                onClick={() => {
                                    setStatus(option.value);
                                    applyFilters({ status: option.value || undefined, page: undefined });
                                }}
                            >
                                {option.label}
                                {option.value === 'pending' && stats.pending > 0 && <span className="opacity-60"> {stats.pending}</span>}
                            </Chip>
                        ))}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Transfer</th>
                                    <th className={thCls}>Product</th>
                                    <th className={thCls}>From → To</th>
                                    <th className={cn(thCls, 'text-right')}>Qty</th>
                                    <th className={thCls}>Status</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Requested</th>
                                    <th className="w-36" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {transfers.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={ArrowLeftRight}>
                                        No transfers found.
                                    </EmptyRow>
                                ) : (
                                    transfers.map((t) => {
                                        const meta = statusMeta[t.status];
                                        return (
                                            <tr key={t.id} className={cn('hover:bg-muted/30', t.status === 'cancelled' && 'opacity-60')}>
                                                <td className="px-4 py-2 font-mono text-xs font-bold whitespace-nowrap">{t.transfer_number}</td>
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{t.product_name}</p>
                                                    {(t.product_barcode || t.notes) && (
                                                        <p className="max-w-64 truncate text-[11px] text-muted-foreground">
                                                            {t.product_barcode && <span className="font-mono">{t.product_barcode}</span>}
                                                            {t.product_barcode && t.notes && ' · '}
                                                            {t.notes && <span className="italic">{t.notes}</span>}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-xs">
                                                    <span className="flex items-center gap-1 whitespace-nowrap">
                                                        <LocationIcon type={t.from_type} />
                                                        <span className="font-semibold">{t.from_name}</span>
                                                        <ArrowRight className="mx-0.5 h-3 w-3 text-muted-foreground" />
                                                        <LocationIcon type={t.to_type} />
                                                        <span className="font-semibold">{t.to_name}</span>
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold tabular-nums">{t.quantity.toLocaleString()}</td>
                                                <td className="px-4 py-2">
                                                    <StatusPill tone={meta.tone}>
                                                        <meta.icon className="h-3 w-3" /> {meta.label}
                                                    </StatusPill>
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                    <p>{t.requested_by}</p>
                                                    <p className="text-[11px]">{fmtDate(t.created_at)}</p>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {t.status === 'pending' && (
                                                        <div className="flex justify-end gap-1">
                                                            <Button
                                                                size="sm"
                                                                className="h-7 gap-1 px-2.5 text-xs"
                                                                disabled={completing === t.id}
                                                                onClick={() => handleComplete(t.id)}
                                                            >
                                                                {completing === t.id ? (
                                                                    '…'
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Move stock
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <button
                                                                disabled={cancelling === t.id}
                                                                onClick={() => handleCancel(t.id)}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                                                aria-label={`Cancel ${t.transfer_number}`}
                                                            >
                                                                <XCircle className="h-3.5 w-3.5" />
                                                            </button>
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

                    {pagination.last_page > 1 && (
                        <SimplePager
                            from={pageFrom}
                            to={pageTo}
                            total={pagination.total}
                            page={pagination.current_page}
                            lastPage={pagination.last_page}
                            onPage={(page) => applyFilters({ page })}
                        />
                    )}
                </Panel>
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
