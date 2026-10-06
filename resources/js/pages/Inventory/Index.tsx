'use client';
import { Head, router } from '@inertiajs/react';
import { Package, Warehouse, ArrowLeftRight, AlertTriangle, TrendingDown, Search, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useState, useCallback } from 'react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockRow {
    id: number;
    location_type: 'branch' | 'warehouse';
    location_id: number;
    location_name: string;
    location_code: string;
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
    batch_number: string | null;
}
interface Stats {
    total_sku: number;
    low_stock: number;
    out_of_stock: number;
    expired: number;
    warehouse_units: number;
}
interface Branch {
    id: number;
    name: string;
    code: string;
}
interface Pagination {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
}
interface PageProps {
    branch_stocks: StockRow[];
    branch_pagination: Pagination;
    warehouse_stocks: StockRow[];
    stats: Stats;
    branches: Branch[];
    filters: { search: string; branch_id: number | null; status: string; per_page: number };
    is_admin: boolean;
    message?: { type: string; text: string };
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const statusColor = (s: string) => {
    if (s === 'Out of Stock') return 'bg-red-500/15 text-red-400 border border-red-500/20';
    if (s === 'Low Stock') return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20';
    if (s === 'Expired') return 'bg-orange-500/15 text-orange-400 border border-orange-500/20';
    if (s === 'Near Expiry') return 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
    return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
};

const locationBadge = (type: string) => (type === 'warehouse' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400');

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryIndex({
    branch_stocks,
    branch_pagination,
    warehouse_stocks,
    stats,
    branches,
    filters,
    is_admin,
    message,
}: PageProps) {
    const [tab, setTab] = useState<'branch' | 'warehouse'>('branch');
    const [search, setSearch] = useState(filters.search || '');
    const [status, setStatus] = useState(filters.status || '');
    const [branch, setBranch] = useState(filters.branch_id?.toString() || '');
    const [loading, setLoading] = useState(false);

    const applyFilters = useCallback(
        (overrides: Record<string, unknown> = {}) => {
            setLoading(true);
            router.get(
                routes.inventory.index(),
                {
                    search: search || undefined,
                    status: status || undefined,
                    branch_id: branch || undefined,
                    per_page: filters.per_page,
                    ...overrides,
                },
                {
                    preserveScroll: true,
                    preserveState: true,
                    onFinish: () => setLoading(false),
                },
            );
        },
        [search, status, branch, filters.per_page],
    );

    const goPage = (page: number) => applyFilters({ page });

    const inp = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary';
    const sel = inp + ' cursor-pointer';

    const rows = tab === 'branch' ? branch_stocks : warehouse_stocks;

    return (
        <AdminLayout>
            <Head title="Inventory" />

            <div className="space-y-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Stock levels across all locations</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => router.visit(routes.stockTransfers.index())}>
                            <ArrowLeftRight className="mr-1.5 h-4 w-4" /> Stock Transfers
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

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                        { label: 'Total SKUs', value: stats.total_sku, icon: Package, color: 'text-blue-400' },
                        { label: 'Low Stock', value: stats.low_stock, icon: AlertTriangle, color: 'text-yellow-400' },
                        { label: 'Out of Stock', value: stats.out_of_stock, icon: TrendingDown, color: 'text-red-400' },
                        { label: 'Expired', value: stats.expired, icon: AlertTriangle, color: 'text-orange-400' },
                        { label: 'Warehouse Units', value: stats.warehouse_units, icon: Warehouse, color: 'text-purple-400' },
                    ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                            <s.icon className={cn('mb-2 h-5 w-5', s.color)} />
                            <div className="text-2xl font-bold text-foreground">{s.value.toLocaleString()}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div className="flex w-fit gap-1 rounded-xl bg-muted/30 p-1">
                    <button
                        onClick={() => setTab('branch')}
                        className={cn(
                            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                            tab === 'branch' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        Branch Stock ({branch_pagination.total})
                    </button>
                    <button
                        onClick={() => setTab('warehouse')}
                        className={cn(
                            'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                            tab === 'warehouse' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Warehouse className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
                        Warehouse Stock ({warehouse_stocks.length})
                    </button>
                </div>

                {/* Filters */}
                {tab === 'branch' && (
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
                                    className="absolute top-1/2 right-2 -translate-y-1/2"
                                >
                                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                            )}
                        </div>
                        {is_admin && (
                            <select
                                className={cn(sel, 'w-40')}
                                value={branch}
                                onChange={(e) => {
                                    setBranch(e.target.value);
                                    applyFilters({ branch_id: e.target.value || undefined });
                                }}
                            >
                                <option value="">All Branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <select
                            className={cn(sel, 'w-40')}
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value);
                                applyFilters({ status: e.target.value || undefined });
                            }}
                        >
                            <option value="">All Status</option>
                            <option value="in_stock">In Stock</option>
                            <option value="low_stock">Low Stock</option>
                            <option value="out_of_stock">Out of Stock</option>
                            <option value="expired">Expired</option>
                            <option value="near_expiry">Near Expiry</option>
                        </select>
                        <Button variant="ghost" size="sm" onClick={() => applyFilters()} disabled={loading}>
                            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        </Button>
                    </div>
                )}

                {/* Table */}
                <div className={cn('overflow-hidden rounded-xl border border-border bg-card', loading && 'pointer-events-none opacity-60')}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Product
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Location
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Stock
                                    </th>
                                    <th className="hidden px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase md:table-cell">
                                        Price
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Status
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:table-cell">
                                        Expiry
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-16 text-center text-muted-foreground">
                                            <Package className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                            No stock records found
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={`${r.location_type}-${r.id}`} className="transition-colors hover:bg-muted/20">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <ProductThumbnail
                                                        src={r.product_img}
                                                        name={r.product_name}
                                                        aspect="w-9 h-9 rounded-lg shrink-0 border border-border"
                                                        padding="p-0.5"
                                                    />
                                                    <div>
                                                        <div className="font-medium text-foreground">{r.product_name}</div>
                                                        {r.product_barcode && (
                                                            <div className="font-mono text-xs text-muted-foreground">{r.product_barcode}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', locationBadge(r.location_type))}>
                                                    {r.location_type === 'warehouse' && <Warehouse className="-mt-0.5 mr-1 inline h-3 w-3" />}
                                                    {r.location_name}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold tabular-nums">
                                                <span
                                                    className={cn(
                                                        r.stock <= 0 ? 'text-red-400' : r.stock <= 5 ? 'text-yellow-400' : 'text-foreground',
                                                    )}
                                                >
                                                    {r.stock.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="hidden px-4 py-3 text-right text-muted-foreground tabular-nums md:table-cell">
                                                ₱{r.price.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColor(r.status))}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">{r.expiry_date ?? '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination (branch tab only) */}
                {tab === 'branch' && branch_pagination.last_page > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                            {branch_pagination.from}–{branch_pagination.to} of {branch_pagination.total}
                        </span>
                        <div className="flex gap-1">
                            <button
                                disabled={branch_pagination.current_page <= 1}
                                onClick={() => goPage(branch_pagination.current_page - 1)}
                                className="rounded-lg border border-border p-1.5 hover:bg-muted/30 disabled:opacity-40"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="rounded-lg border border-border px-3 py-1.5 tabular-nums">
                                {branch_pagination.current_page} / {branch_pagination.last_page}
                            </span>
                            <button
                                disabled={branch_pagination.current_page >= branch_pagination.last_page}
                                onClick={() => goPage(branch_pagination.current_page + 1)}
                                className="rounded-lg border border-border p-1.5 hover:bg-muted/30 disabled:opacity-40"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
