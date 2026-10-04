'use client';
import { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Warehouse, Plus, Package, Edit2, Trash2, Power, ArrowLeftRight, TrendingUp } from 'lucide-react';
import ProductThumbnail from '@/components/ProductThumbnail';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WarehouseRecord {
    id: number;
    name: string;
    code: string;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    stocks_count: number;
    total_units: number;
}
interface StockRow {
    id: number;
    warehouse_id: number;
    warehouse_name: string;
    product_id: number;
    product_name: string;
    product_barcode: string | null;
    product_type: string;
    product_img: string | null;
    stock: number;
    capital: number;
    markup: number;
    price: number;
    status: string;
    expiry_date: string | null;
}
interface Product {
    id: number;
    name: string;
    barcode: string | null;
}
interface PageProps {
    warehouses: WarehouseRecord[];
    warehouse_stocks: StockRow[];
    products: Product[];
    message?: { type: string; text: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColor = (s: string) => {
    if (s === 'Out of Stock') return 'bg-red-500/15 text-red-400';
    if (s === 'Low Stock') return 'bg-yellow-500/15 text-yellow-400';
    if (s === 'Expired') return 'bg-orange-500/15 text-orange-400';
    return 'bg-emerald-500/15 text-emerald-400';
};

const inp = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary';
const textarea =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none';

// ─── Warehouse Form Modal ──────────────────────────────────────────────────────
function nextWarehouseCode(existing: WarehouseRecord[]): string {
    // Find highest WH-NNN number and increment
    let max = 0;
    for (const w of existing) {
        const m = w.code.match(/^WH-(\d+)$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'WH-' + String(max + 1).padStart(3, '0');
}

function WarehouseFormModal({
    open,
    onClose,
    warehouse,
    allWarehouses,
}: {
    open: boolean;
    onClose: () => void;
    warehouse: WarehouseRecord | null;
    allWarehouses: WarehouseRecord[];
}) {
    const isEdit = !!warehouse;
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const reset = () => {
        setName('');
        setCode('');
        setAddress('');
        setNotes('');
        setErrors({});
    };

    // Sync when modal opens or target warehouse changes
    const handleOpenChange = (v: boolean) => {
        if (!v) {
            reset();
            onClose();
        } else {
            setName(warehouse?.name ?? '');
            setCode(warehouse?.code ?? nextWarehouseCode(allWarehouses));
            setAddress(warehouse?.address ?? '');
            setNotes(warehouse?.notes ?? '');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        setErrors({});
        const data = { name, code, address: address || null, notes: notes || null };
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                setProcessing(false);
                reset();
                onClose();
            },
            onError: (errs: Record<string, string>) => {
                setErrors(errs);
                setProcessing(false);
            },
        };
        if (isEdit) {
            router.patch(routes.warehouses.update(warehouse!.id), data, opts);
        } else {
            router.post(routes.warehouses.store(), data, opts);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Warehouse className="h-5 w-5" />
                        {isEdit ? 'Edit Warehouse' : 'Add Warehouse'}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Name *</label>
                            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Warehouse" />
                            {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Code *</label>
                            <input
                                className={inp}
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="WH-001"
                                maxLength={20}
                            />
                            {errors.code && <p className="mt-1 text-xs text-red-400">{errors.code}</p>}
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Address</label>
                        <input className={inp} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
                        <textarea className={textarea} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
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
                        <Button type="submit" disabled={processing || !name || !code}>
                            {processing ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Warehouse'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Stock Adjust Modal ────────────────────────────────────────────────────────
function AdjustStockModal({
    open,
    onClose,
    warehouse,
    products,
}: {
    open: boolean;
    onClose: () => void;
    warehouse: WarehouseRecord | null;
    products: Product[];
}) {
    const [productId, setProductId] = useState('');
    const [qty, setQty] = useState('');
    const [capital, setCapital] = useState('');
    const [markup, setMarkup] = useState('');
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);

    const reset = () => {
        setProductId('');
        setQty('');
        setCapital('');
        setMarkup('');
        setNotes('');
        setErrors({});
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!warehouse) return;
        setProcessing(true);
        setErrors({});
        router.post(
            routes.warehouses.adjustStock(warehouse.id),
            {
                product_id: parseInt(productId),
                quantity: parseInt(qty),
                capital: capital ? parseFloat(capital) : undefined,
                markup: markup ? parseFloat(markup) : undefined,
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Adjust Warehouse Stock — {warehouse?.name}
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Product *</label>
                        <select className={inp + ' cursor-pointer'} value={productId} onChange={(e) => setProductId(e.target.value)}>
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
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Qty Change *</label>
                            <input type="number" className={inp} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="+10 or -5" />
                            {errors.quantity && <p className="mt-1 text-xs text-red-400">{errors.quantity}</p>}
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Capital (₱)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={inp}
                                value={capital}
                                onChange={(e) => setCapital(e.target.value)}
                                placeholder="optional"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-muted-foreground">Markup (%)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className={inp}
                                value={markup}
                                onChange={(e) => setMarkup(e.target.value)}
                                placeholder="optional"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-muted-foreground">Notes</label>
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
                        <Button type="submit" disabled={processing || !productId || !qty}>
                            {processing ? 'Saving…' : 'Update Stock'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WarehousesIndex({ warehouses, warehouse_stocks, products, message }: PageProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<WarehouseRecord | null>(null);
    const [adjustFor, setAdjustFor] = useState<WarehouseRecord | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [activeWH, setActiveWH] = useState<number | null>(warehouses[0]?.id ?? null);

    const openEdit = (w: WarehouseRecord) => {
        setEditTarget(w);
        setFormOpen(true);
    };
    const closeForm = () => {
        setFormOpen(false);
        setEditTarget(null);
    };

    const handleToggle = (id: number) => {
        router.patch(routes.warehouses.toggle(id), {}, { preserveScroll: true });
    };
    const handleDelete = (id: number) => {
        setDeleteId(null);
        router.delete(routes.warehouses.destroy(id), { preserveScroll: true });
    };

    const activeStocks = warehouse_stocks.filter((s) => s.warehouse_id === activeWH);

    return (
        <AdminLayout>
            <Head title="Warehouses" />

            <div className="space-y-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="mb-0.5 flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-foreground">Warehouses</h1>
                            <span className="rounded-full border border-purple-500/20 bg-purple-500/15 px-2 py-0.5 text-xs font-semibold text-purple-400">
                                Premium
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Manage warehouse locations and stock</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => router.visit(routes.stockTransfers.index())}>
                            <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Transfers
                        </Button>
                        <Button
                            onClick={() => {
                                setEditTarget(null);
                                setFormOpen(true);
                            }}
                        >
                            <Plus className="mr-1.5 h-4 w-4" /> Add Warehouse
                        </Button>
                    </div>
                </div>

                {/* Flash */}
                {message && (
                    <div
                        className={cn(
                            'rounded-xl border px-4 py-3 text-sm',
                            message.type === 'success'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : 'border-red-500/20 bg-red-500/10 text-red-400',
                        )}
                    >
                        {message.text}
                    </div>
                )}

                {warehouses.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-20 text-center">
                        <Warehouse className="mx-auto mb-3 h-12 w-12 text-muted-foreground/20" />
                        <p className="mb-4 text-muted-foreground">No warehouses yet</p>
                        <Button onClick={() => setFormOpen(true)}>
                            <Plus className="mr-1.5 h-4 w-4" /> Add First Warehouse
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Warehouse list */}
                        <div className="space-y-3">
                            {warehouses.map((w) => (
                                <div
                                    key={w.id}
                                    onClick={() => setActiveWH(w.id)}
                                    className={cn(
                                        'cursor-pointer rounded-xl border bg-card p-4 transition-all',
                                        activeWH === w.id ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/30',
                                        !w.is_active && 'opacity-60',
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <Warehouse className="h-4 w-4 shrink-0 text-purple-400" />
                                                <span className="truncate font-semibold text-foreground">{w.name}</span>
                                                {!w.is_active && (
                                                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Inactive</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 font-mono text-xs text-muted-foreground">{w.code}</div>
                                            {w.address && <div className="mt-1 truncate text-xs text-muted-foreground">{w.address}</div>}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-lg font-bold text-foreground">{w.total_units.toLocaleString()}</div>
                                            <div className="text-xs text-muted-foreground">units</div>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 flex-1 text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openEdit(w);
                                            }}
                                        >
                                            <Edit2 className="mr-1 h-3 w-3" /> Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-7 flex-1 text-xs"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setAdjustFor(w);
                                            }}
                                        >
                                            <TrendingUp className="mr-1 h-3 w-3" /> Stock
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 text-muted-foreground"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleToggle(w.id);
                                            }}
                                            title={w.is_active ? 'Deactivate' : 'Activate'}
                                        >
                                            <Power className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 text-destructive/60 hover:text-destructive"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeleteId(w.id);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Stock for selected warehouse */}
                        <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
                            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
                                <h3 className="text-sm font-semibold text-foreground">
                                    {warehouses.find((w) => w.id === activeWH)?.name ?? 'Select a warehouse'} — Stock
                                </h3>
                                <span className="text-xs text-muted-foreground">{activeStocks.length} SKUs</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Product</th>
                                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Stock</th>
                                            <th className="hidden px-4 py-2 text-right text-xs font-medium text-muted-foreground sm:table-cell">
                                                Price
                                            </th>
                                            <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                                            <th className="hidden px-4 py-2 text-left text-xs font-medium text-muted-foreground lg:table-cell">
                                                Expiry
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {activeStocks.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                                                    <Package className="mx-auto mb-2 h-6 w-6 opacity-20" />
                                                    No stock in this warehouse yet
                                                </td>
                                            </tr>
                                        ) : (
                                            activeStocks.map((s) => (
                                                <tr key={s.id} className="hover:bg-muted/20">
                                                    <td className="px-4 py-2.5">
                                                        <div className="flex items-center gap-3">
                                                            <ProductThumbnail
                                                                src={s.product_img}
                                                                name={s.product_name}
                                                                aspect="w-9 h-9 rounded-lg shrink-0 border border-border"
                                                                padding="p-0.5"
                                                            />
                                                            <div>
                                                                <div className="text-sm font-medium text-foreground">{s.product_name}</div>
                                                                {s.product_barcode && (
                                                                    <div className="font-mono text-xs text-muted-foreground">{s.product_barcode}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-bold tabular-nums">
                                                        <span
                                                            className={cn(
                                                                s.stock <= 0 ? 'text-red-400' : s.stock <= 5 ? 'text-yellow-400' : 'text-foreground',
                                                            )}
                                                        >
                                                            {s.stock.toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="hidden px-4 py-2.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                                                        ₱{s.price.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColor(s.status))}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground lg:table-cell">
                                                        {s.expiry_date ?? '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
            <WarehouseFormModal open={formOpen} onClose={closeForm} warehouse={editTarget} allWarehouses={warehouses} />
            <AdjustStockModal open={!!adjustFor} onClose={() => setAdjustFor(null)} warehouse={adjustFor} products={products} />

            {/* Delete confirm */}
            <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Warehouse?</DialogTitle>
                    </DialogHeader>
                    <p className="py-2 text-sm text-muted-foreground">This will permanently delete the warehouse. Cannot delete if it has stock.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteId(null)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
