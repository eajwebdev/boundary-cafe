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
import { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { controlCls, EmptyRow, PageHeader, Pager, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
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
        from: number | null;
        to: number | null;
        links: { url: string | null; label: string; active: boolean }[];
    };
    products: Product[];
    types: string[];
    summary: Record<string, Summary>;
    filters: { type?: string; from?: string; to?: string; search?: string; branch_id?: string };
    can_delete: boolean;
    app: { currency: string };
    flash?: { message?: { type: string; text: string } };
    branch_id?: number | null;
    [key: string]: unknown;
}

const TYPE_META: Record<string, { label: string; tone: Tone; icon: React.ElementType }> = {
    damage: { label: 'Damage', tone: 'danger', icon: AlertTriangle },
    loss: { label: 'Loss', tone: 'warning', icon: TrendingDown },
    expired: { label: 'Expired', tone: 'warning', icon: Clock },
    theft: { label: 'Theft', tone: 'danger', icon: ShieldAlert },
    correction: { label: 'Correction', tone: 'info', icon: RefreshCw },
    other: { label: 'Other', tone: 'muted', icon: MoreHorizontal },
};

function fmtMoney(n: number | string, currency: string) {
    return `${currency}${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function TypeBadge({ type }: { type: string }) {
    const meta = TYPE_META[type] ?? TYPE_META.other;
    const Icon = meta.icon;
    return (
        <StatusPill tone={meta.tone}>
            <Icon className="h-3 w-3" /> {meta.label}
        </StatusPill>
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
    const { adjustments, products, types, summary, filters, can_delete, app, flash, branch_id } = usePage<PageProps>().props;
    const currency = app?.currency ?? '₱';

    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        const message = flash?.message;
        if (!message) return;
        if (message.type === 'success') toast.success(message.text);
        else toast.error(message.text);
    }, [flash]);
    const [deleting, setDeleting] = useState<number | null>(null);

    // ── Filter state ──────────────────────────────────────────────────────────
    const [filterType, setFilterType] = useState(filters.type ?? '');
    const [filterFrom, setFilterFrom] = useState(filters.from ?? '');
    const [filterTo, setFilterTo] = useState(filters.to ?? '');
    const [filterSearch, setFilterSearch] = useState(filters.search ?? '');

    const applyFilters = useCallback(
        (overrides: Record<string, unknown> = {}) => {
            router.get(
                routes.stockAdjustments.index(),
                {
                    type: filterType || undefined,
                    from: filterFrom || undefined,
                    to: filterTo || undefined,
                    search: filterSearch || undefined,
                    branch_id: filters.branch_id || undefined,
                    ...overrides,
                },
                { preserveState: true, preserveScroll: true },
            );
        },
        [filterType, filterFrom, filterTo, filterSearch, filters.branch_id],
    );

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

    const totalLoss = Object.values(summary).reduce((sum, v) => sum + Number(v.total_cost), 0);
    const totalUnits = Object.values(summary).reduce((sum, v) => sum + Number(v.total_qty), 0);
    const hasFilters = !!(filters.type || filters.from || filters.to || filters.search);
    const biggestCause = Object.entries(summary).sort(([, a], [, b]) => Number(b.total_cost) - Number(a.total_cost))[0];
    const scopeLabel = hasFilters ? 'matching filters' : 'all time';

    const filterByType = (type: string) => {
        const next = filterType === type ? '' : type;
        setFilterType(next);
        applyFilters({ type: next || undefined });
    };

    return (
        <AdminLayout>
            <Head title="Losses / Damages" />
            <div className="space-y-4">
                <PageHeader title="Losses / Damages" subtitle="Damaged, lost, expired or stolen stock, and count corrections.">
                    <a
                        href={routes.reports.stockLoss()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <PackageX className="h-4 w-4" /> Loss report
                    </a>
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => setShowModal(true)}>
                        <Plus className="h-4 w-4" /> Record adjustment
                    </Button>
                </PageHeader>

                <StatStrip count={4}>
                    <Stat icon={PackageX} label={`Records · ${scopeLabel}`} value={adjustments.total.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Units written off" value={totalUnits.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Loss value"
                        value={fmtMoney(totalLoss, currency)}
                        tone={totalLoss > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={ShieldAlert}
                        label="Biggest cause"
                        value={biggestCause ? (TYPE_META[biggestCause[0]]?.label ?? biggestCause[0]) : '—'}
                        tone={biggestCause ? undefined : 'muted'}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                    <Panel
                        flush
                        icon={PackageX}
                        title="Adjustments"
                        actions={
                            hasFilters && (
                                <button
                                    onClick={clearFilters}
                                    className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    <X className="h-3 w-3" /> Clear filters
                                </button>
                            )
                        }
                    >
                        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
                            <div className="relative min-w-44 flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={filterSearch}
                                    onChange={(e) => setFilterSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                                    placeholder="Search product, then Enter"
                                    className={cn(controlCls, 'w-full pl-8')}
                                />
                            </div>
                            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={controlCls} aria-label="Type">
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
                                className={controlCls}
                                aria-label="From"
                            />
                            <span className="text-xs text-muted-foreground">to</span>
                            <input
                                type="date"
                                value={filterTo}
                                onChange={(e) => setFilterTo(e.target.value)}
                                className={controlCls}
                                aria-label="To"
                            />
                            <Button variant="outline" size="sm" onClick={() => applyFilters()} className="h-8">
                                Apply
                            </Button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className={thCls}>Date</th>
                                        <th className={thCls}>Product</th>
                                        <th className={thCls}>Type</th>
                                        <th className={cn(thCls, 'text-right')}>Qty</th>
                                        <th className={cn(thCls, 'hidden text-right md:table-cell')}>Unit cost</th>
                                        <th className={cn(thCls, 'text-right')}>Loss</th>
                                        <th className={cn(thCls, 'hidden lg:table-cell')}>Note · by</th>
                                        {can_delete && <th className="w-10" />}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {adjustments.data.length === 0 ? (
                                        <EmptyRow colSpan={can_delete ? 8 : 7} icon={PackageX}>
                                            {hasFilters ? 'No adjustments match these filters.' : 'No adjustments recorded yet.'}
                                        </EmptyRow>
                                    ) : (
                                        adjustments.data.map((adj) => (
                                            <tr key={adj.id} className="hover:bg-muted/30">
                                                <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                    {new Date(adj.created_at).toLocaleDateString('en-PH', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                    })}
                                                    <span className="block text-[11px] text-muted-foreground">
                                                        {new Date(adj.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{adj.product?.name ?? '—'}</p>
                                                    {adj.product?.barcode && (
                                                        <p className="font-mono text-[11px] text-muted-foreground">{adj.product.barcode}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <TypeBadge type={adj.type} />
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold tabular-nums">{adj.quantity.toLocaleString()}</td>
                                                <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                                                    {fmtMoney(adj.unit_cost, currency)}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold text-red-700 tabular-nums dark:text-red-400">
                                                    {fmtMoney(adj.total_cost, currency)}
                                                </td>
                                                <td className="hidden max-w-56 px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                    <p className="truncate">{adj.note ?? '—'}</p>
                                                    <p className="text-[11px]">
                                                        {adj.recordedBy ? `${adj.recordedBy.fname} ${adj.recordedBy.lname}` : '—'}
                                                    </p>
                                                </td>
                                                {can_delete && (
                                                    <td className="px-2 py-2">
                                                        <button
                                                            onClick={() => handleDelete(adj.id)}
                                                            disabled={deleting === adj.id}
                                                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                                            title="Delete and restore stock"
                                                            aria-label="Delete and restore stock"
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

                        {adjustments.last_page > 1 && (
                            <Pager
                                from={adjustments.from}
                                to={adjustments.to}
                                total={adjustments.total}
                                links={adjustments.links}
                                onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                            />
                        )}
                    </Panel>

                    <Panel
                        flush
                        icon={TrendingDown}
                        title="By type"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">{scopeLabel}</span>}
                        className="self-start"
                    >
                        <ul className="divide-y divide-border">
                            {types.map((t) => {
                                const meta = TYPE_META[t] ?? TYPE_META.other;
                                const row = summary[t];
                                const value = row ? Number(row.total_cost) : 0;
                                const share = totalLoss > 0 ? (value / totalLoss) * 100 : 0;
                                return (
                                    <li key={t}>
                                        <button
                                            onClick={() => filterByType(t)}
                                            className={cn('w-full px-4 py-2 text-left text-sm hover:bg-muted/30', filterType === t && 'bg-primary/5')}
                                            title={filterType === t ? 'Show all types' : `Show only ${meta.label.toLowerCase()}`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <meta.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                                <span className="flex-1 font-semibold">{meta.label}</span>
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {row ? Number(row.total_qty).toLocaleString() : 0} u
                                                </span>
                                                <span className="w-24 text-right font-bold tabular-nums">{fmtMoney(value, currency)}</span>
                                            </span>
                                            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                                                <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </Panel>
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
