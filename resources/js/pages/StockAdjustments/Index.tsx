'use client';
import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Trash2,
    Plus,
    Search,
    X,
    TrendingDown,
    PackageX,
    Clock,
    ShieldAlert,
    RefreshCw,
    MoreHorizontal,
    Check,
    ChevronsUpDown,
} from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
    id: number;
    name: string;
    barcode: string | null;
    stock: number;
    unit_cost: number;
}
interface Adjustment {
    id: number;
    created_at: string;
    product: { id: number; name: string; barcode: string | null } | null;
    recordedBy: { id: number; fname: string; lname: string } | null;
    type: string;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    note: string | null;
}
interface Summary {
    count: number;
    total_qty: number;
    total_cost: string | number;
}
interface PageProps {
    adjustments: {
        data: Adjustment[];
        current_page: number;
        last_page: number;
        total: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    products: Product[];
    types: string[];
    summary: Record<string, Summary>;
    filters: { type?: string; from?: string; to?: string; search?: string; branch_id?: string };
    can_delete: boolean;
    app: { currency: string };
    message?: { type: string; text: string };
    branch_id?: number | null;
    [key: string]: unknown;
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    damage: { label: 'Damage', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: AlertTriangle },
    loss: { label: 'Loss', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20', icon: TrendingDown },
    expired: { label: 'Expired', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: Clock },
    theft: { label: 'Theft', color: 'text-purple-500 bg-purple-500/10 border-purple-500/20', icon: ShieldAlert },
    correction: { label: 'Correction', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: RefreshCw },
    other: { label: 'Other', color: 'text-muted-foreground bg-muted border-border', icon: MoreHorizontal },
};

function fmtMoney(n: number | string, currency: string) {
    return `${currency}${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TypeBadge({ type }: { type: string }) {
    const meta = TYPE_META[type] ?? TYPE_META.other;
    const Icon = meta.icon;
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', meta.color)}>
            <Icon className="h-3 w-3" />
            {meta.label}
        </span>
    );
}

// ─── Searchable product combobox ──────────────────────────────────────────────
function ProductCombobox({
    products,
    value,
    onChange,
    currency,
}: {
    products: Product[];
    value: number | '';
    onChange: (id: number | '') => void;
    currency: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return products.slice(0, 50);
        const q = search.toLowerCase();
        return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)).slice(0, 50);
    }, [products, search]);

    const selected = products.find((p) => p.id === value);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'flex h-9 w-full items-center justify-between rounded-xl border border-border bg-background px-3 pr-8 text-left text-sm focus:ring-1 focus:ring-primary focus:outline-none',
                    !selected && 'text-muted-foreground',
                )}
            >
                <span className="truncate">{selected ? `${selected.name} (${selected.stock} in stock)` : 'Select product…'}</span>
                <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                    <div className="flex items-center border-b border-border px-3">
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <input
                            autoFocus
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search product or barcode…"
                            className="h-9 flex-1 bg-transparent px-2 text-sm focus:outline-none"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">No products found.</p>
                        ) : (
                            filtered.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(p.id);
                                        setOpen(false);
                                        setSearch('');
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                                        value === p.id && 'bg-accent/60',
                                    )}
                                >
                                    <Check className={cn('h-3.5 w-3.5 shrink-0 text-primary', value === p.id ? 'opacity-100' : 'opacity-0')} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{p.name}</p>
                                        {p.barcode && <p className="text-[11px] text-muted-foreground">{p.barcode}</p>}
                                    </div>
                                    <span
                                        className={cn(
                                            'shrink-0 text-xs font-semibold',
                                            p.stock <= 0 ? 'text-destructive' : p.stock <= 5 ? 'text-amber-500' : 'text-muted-foreground',
                                        )}
                                    >
                                        {p.stock} stk · {fmtMoney(p.unit_cost, currency)}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Record Adjustment Modal ──────────────────────────────────────────────────
function RecordAdjustmentModal({
    open,
    onClose,
    products,
    types,
    branchId,
    currency,
}: {
    open: boolean;
    onClose: () => void;
    products: Product[];
    types: string[];
    branchId: number | null | undefined;
    currency: string;
}) {
    const [productId, setProductId] = useState<number | ''>('');
    const [type, setType] = useState('damage');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const selectedProduct = products.find((p) => p.id === productId);

    const reset = () => {
        setProductId('');
        setType('damage');
        setQty('');
        setNote('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!productId || !qty || parseInt(qty) < 1) return;
        setSubmitting(true);
        router.post(
            routes.stockAdjustments.store(),
            {
                product_id: productId,
                type,
                quantity: parseInt(qty),
                note: note.trim() || null,
                ...(branchId ? { branch_id: branchId } : {}),
            },
            {
                onSuccess: () => {
                    setSubmitting(false);
                    reset();
                    onClose();
                },
                onError: () => {
                    setSubmitting(false);
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record Stock Adjustment</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                    {/* Product */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Product *</label>
                        <ProductCombobox products={products} value={productId} onChange={setProductId} currency={currency} />
                        {selectedProduct && (
                            <p className="pl-1 text-[11px] text-muted-foreground">
                                Current stock: <span className="font-bold text-foreground">{selectedProduct.stock}</span>
                                {' · '}Unit cost: <span className="font-bold text-foreground">{fmtMoney(selectedProduct.unit_cost, currency)}</span>
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Reason */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Reason *</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            >
                                {types.map((t) => (
                                    <option key={t} value={t}>
                                        {TYPE_META[t]?.label ?? t}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Quantity *</label>
                            <input
                                type="number"
                                min={1}
                                max={selectedProduct?.stock ?? undefined}
                                value={qty}
                                onChange={(e) => setQty(e.target.value)}
                                required
                                placeholder="0"
                                className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            {selectedProduct && qty && parseInt(qty) > 0 && (
                                <p className="pl-1 text-[11px] font-medium text-destructive">
                                    Loss value: {fmtMoney(selectedProduct.unit_cost * parseInt(qty || '0'), currency)}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Note */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Note (optional)</label>
                        <input
                            type="text"
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Describe what happened…"
                            className="h-9 w-full rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting || !productId || !qty || parseInt(qty) < 1}>
                            {submitting ? 'Saving…' : 'Record Adjustment'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function StockAdjustmentsIndex() {
    const { adjustments, products, types, summary, filters, can_delete, app, message, branch_id } = usePage<PageProps>().props;
    const currency = app?.currency ?? '₱';

    const [showModal, setShowModal] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);

    // ── Filter state ──────────────────────────────────────────────────────────
    const [filterType, setFilterType] = useState(filters.type ?? '');
    const [filterFrom, setFilterFrom] = useState(filters.from ?? '');
    const [filterTo, setFilterTo] = useState(filters.to ?? '');
    const [filterSearch, setFilterSearch] = useState(filters.search ?? '');

    const applyFilters = useCallback(() => {
        router.get(
            routes.stockAdjustments.index(),
            {
                type: filterType || undefined,
                from: filterFrom || undefined,
                to: filterTo || undefined,
                search: filterSearch || undefined,
                branch_id: filters.branch_id || undefined,
            },
            { preserveState: true, preserveScroll: true },
        );
    }, [filterType, filterFrom, filterTo, filterSearch, filters.branch_id]);

    const clearFilters = () => {
        setFilterType('');
        setFilterFrom('');
        setFilterTo('');
        setFilterSearch('');
        router.get(routes.stockAdjustments.index(), {}, { preserveState: false });
    };

    const handleDelete = async (id: number) => {
        const confirmed = await confirmDialog({
            title: 'Delete this adjustment?',
            description: 'The stock it changed will be restored.',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        setDeleting(id);
        router.delete(routes.stockAdjustments.destroy(id), {
            onFinish: () => setDeleting(null),
        });
    };

    const totalLoss = Object.values(summary).reduce((s, v) => s + Number(v.total_cost), 0);
    const totalUnits = Object.values(summary).reduce((s, v) => s + v.total_qty, 0);
    const hasFilters = !!(filters.type || filters.from || filters.to || filters.search);

    return (
        <AdminLayout>
            <Head title="Losses / Damages" />
            <div className="mx-auto max-w-7xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Losses / Damages</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Record damages, losses, expired goods, theft, and corrections</p>
                    </div>
                    <Button onClick={() => setShowModal(true)} className="shrink-0">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Record Adjustment
                    </Button>
                </div>

                {/* Flash message */}
                {message && (
                    <div
                        className={cn(
                            'rounded-xl border px-4 py-3 text-sm font-medium',
                            message.type === 'success'
                                ? 'border-green-500/20 bg-green-500/10 text-green-600'
                                : 'border-destructive/20 bg-destructive/10 text-destructive',
                        )}
                    >
                        {message.text}
                    </div>
                )}

                {/* Summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {types.map((t) => {
                        const meta = TYPE_META[t] ?? TYPE_META.other;
                        const Icon = meta.icon;
                        const s = summary[t];
                        return (
                            <div key={t} className="space-y-1 rounded-xl border border-border bg-card p-3">
                                <div className={cn('inline-flex items-center gap-1 text-xs font-semibold', meta.color.split(' ')[0])}>
                                    <Icon className="h-3.5 w-3.5" />
                                    {meta.label}
                                </div>
                                <p className="text-xl font-black tabular-nums">{s ? s.total_qty.toLocaleString() : 0}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {s ? fmtMoney(Number(s.total_cost), currency) : fmtMoney(0, currency)}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* Total bar */}
                <div className="flex items-center gap-6 rounded-xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                    <div>
                        <p className="text-xs text-muted-foreground">Total Units Lost</p>
                        <p className="text-lg font-black tabular-nums">{totalUnits.toLocaleString()}</p>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                        <p className="text-xs text-muted-foreground">Total Loss Value</p>
                        <p className="text-lg font-black text-destructive tabular-nums">{fmtMoney(totalLoss, currency)}</p>
                    </div>
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={filterSearch}
                            onChange={(e) => setFilterSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                            placeholder="Search product…"
                            className="h-9 w-48 rounded-xl border border-border bg-background pr-3 pl-9 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                    >
                        <option value="">All types</option>
                        {types.map((t) => (
                            <option key={t} value={t}>
                                {TYPE_META[t]?.label ?? t}
                            </option>
                        ))}
                    </select>
                    <input
                        type="date"
                        value={filterFrom}
                        onChange={(e) => setFilterFrom(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <input
                        type="date"
                        value={filterTo}
                        onChange={(e) => setFilterTo(e.target.value)}
                        className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <Button variant="outline" size="sm" onClick={applyFilters} className="h-9">
                        <Search className="mr-1 h-3.5 w-3.5" />
                        Filter
                    </Button>
                    {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground">
                            <X className="mr-1 h-3.5 w-3.5" />
                            Clear
                        </Button>
                    )}
                    <a
                        href={routes.reports.stockLoss()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <PackageX className="h-3.5 w-3.5" />
                        View Report
                    </a>
                </div>

                {/* Table */}
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Product</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Type</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Qty</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Unit Cost</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Loss Value</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Note</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Recorded By</th>
                                    {can_delete && <th className="px-4 py-3" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {adjustments.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={can_delete ? 9 : 8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                            <PackageX className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                            No adjustments recorded yet
                                        </td>
                                    </tr>
                                ) : (
                                    adjustments.data.map((adj) => (
                                        <tr key={adj.id} className="transition-colors hover:bg-muted/20">
                                            <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                                                {new Date(adj.created_at).toLocaleDateString('en-PH', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                                <br />
                                                <span className="text-[11px] opacity-60">
                                                    {new Date(adj.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-foreground">{adj.product?.name ?? '—'}</p>
                                                {adj.product?.barcode && <p className="text-[11px] text-muted-foreground">{adj.product.barcode}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <TypeBadge type={adj.type} />
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold tabular-nums">{adj.quantity.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                                                {fmtMoney(adj.unit_cost, currency)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-destructive tabular-nums">
                                                {fmtMoney(adj.total_cost, currency)}
                                            </td>
                                            <td className="max-w-[180px] truncate px-4 py-3 text-xs text-muted-foreground">{adj.note ?? '—'}</td>
                                            <td className="px-4 py-3 text-xs text-muted-foreground">
                                                {adj.recordedBy ? `${adj.recordedBy.fname} ${adj.recordedBy.lname}` : '—'}
                                            </td>
                                            {can_delete && (
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => handleDelete(adj.id)}
                                                        disabled={deleting === adj.id}
                                                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                                        title="Delete and restore stock"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {adjustments.last_page > 1 && (
                        <div className="flex items-center justify-between border-t border-border px-4 py-3">
                            <p className="text-xs text-muted-foreground">
                                Page {adjustments.current_page} of {adjustments.last_page} · {adjustments.total} records
                            </p>
                            <div className="flex gap-1">
                                {adjustments.links.map((link, i) =>
                                    link.url ? (
                                        <button
                                            key={i}
                                            onClick={() => router.get(link.url!)}
                                            className={cn(
                                                'h-8 min-w-[32px] rounded-lg border px-2 text-xs transition-colors',
                                                link.active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                                            )}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ) : (
                                        <span
                                            key={i}
                                            className="flex h-8 min-w-[32px] items-center justify-center px-2 text-xs text-muted-foreground opacity-40"
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ),
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Record Adjustment Modal */}
            <RecordAdjustmentModal
                open={showModal}
                onClose={() => setShowModal(false)}
                products={products}
                types={types}
                branchId={branch_id}
                currency={currency}
            />
        </AdminLayout>
    );
}
