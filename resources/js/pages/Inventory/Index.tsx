'use client';
import { Head, router } from '@inertiajs/react';
import { AlertTriangle, ArrowLeftRight, Boxes, CalendarX, Package, RefreshCw, Search, TrendingDown, Warehouse, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Chip, controlCls, EmptyRow, PageHeader, Panel, SimplePager, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
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
    [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_TONE: Record<string, Tone> = {
    'Out of Stock': 'danger',
    'Low Stock': 'warning',
    Expired: 'danger',
    'Near Expiry': 'warning',
};

const STATUS_FILTERS = [
    { value: '', label: 'All' },
    { value: 'in_stock', label: 'In stock' },
    { value: 'low_stock', label: 'Low' },
    { value: 'out_of_stock', label: 'Out' },
    { value: 'near_expiry', label: 'Near expiry' },
    { value: 'expired', label: 'Expired' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryIndex({ branch_stocks, branch_pagination, warehouse_stocks, stats, branches, filters, is_admin }: PageProps) {
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

    const rows = tab === 'branch' ? branch_stocks : warehouse_stocks;

    return (
        <AdminLayout>
            <Head title="Inventory" />

            <div className="space-y-4">
                <PageHeader title="Inventory" subtitle="Stock on hand at every branch and the warehouse.">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => router.visit(routes.stockTransfers.index())}>
                        <ArrowLeftRight className="h-4 w-4" /> Stock transfers
                    </Button>
                </PageHeader>

                <StatStrip count={5}>
                    <Stat icon={Package} label="Stocked items" value={stats.total_sku.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Low stock"
                        value={stats.low_stock.toLocaleString()}
                        tone={stats.low_stock > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={TrendingDown}
                        label="Out of stock"
                        value={stats.out_of_stock.toLocaleString()}
                        tone={stats.out_of_stock > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={CalendarX} label="Expired" value={stats.expired.toLocaleString()} tone={stats.expired > 0 ? 'warning' : undefined} />
                    <Stat icon={Warehouse} label="Warehouse units" value={stats.warehouse_units.toLocaleString()} />
                </StatStrip>

                <Panel
                    flush
                    icon={Boxes}
                    title="Stock levels"
                    className={cn(loading && 'pointer-events-none opacity-60')}
                    actions={
                        <div className="flex gap-1">
                            <Chip active={tab === 'branch'} onClick={() => setTab('branch')}>
                                Branch <span className="opacity-60">{branch_pagination.total}</span>
                            </Chip>
                            <Chip active={tab === 'warehouse'} onClick={() => setTab('warehouse')}>
                                Warehouse <span className="opacity-60">{warehouse_stocks.length}</span>
                            </Chip>
                        </div>
                    }
                >
                    {tab === 'branch' && (
                        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2">
                            <div className="relative min-w-44 flex-1 sm:max-w-xs">
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
                            {is_admin && (
                                <select
                                    className={controlCls}
                                    value={branch}
                                    onChange={(e) => {
                                        setBranch(e.target.value);
                                        applyFilters({ branch_id: e.target.value || undefined });
                                    }}
                                    aria-label="Branch"
                                >
                                    <option value="">All branches</option>
                                    {branches.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            {b.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <div className="flex flex-wrap gap-1">
                                {STATUS_FILTERS.map((option) => (
                                    <Chip
                                        key={option.value}
                                        active={status === option.value}
                                        onClick={() => {
                                            setStatus(option.value);
                                            applyFilters({ status: option.value || undefined });
                                        }}
                                    >
                                        {option.label}
                                    </Chip>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => applyFilters()}
                                disabled={loading}
                                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Refresh"
                            >
                                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                            </button>
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Product</th>
                                    <th className={thCls}>Location</th>
                                    <th className={cn(thCls, 'text-right')}>Stock</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Price</th>
                                    <th className={thCls}>Status</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Expiry</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rows.length === 0 ? (
                                    <EmptyRow colSpan={6} icon={Package}>
                                        No stock records found.
                                    </EmptyRow>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={`${r.location_type}-${r.id}`} className="hover:bg-muted/30">
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2.5">
                                                    <ProductThumbnail
                                                        src={r.product_img}
                                                        name={r.product_name}
                                                        aspect="w-8 h-8 rounded-lg shrink-0 border border-border"
                                                        padding="p-0.5"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold">{r.product_name}</p>
                                                        {r.product_barcode && (
                                                            <p className="font-mono text-[11px] text-muted-foreground">{r.product_barcode}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    {r.location_type === 'warehouse' && <Warehouse className="h-3 w-3" />}
                                                    {r.location_name}
                                                </span>
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-4 py-2 text-right font-bold tabular-nums',
                                                    r.stock <= 0
                                                        ? 'text-red-700 dark:text-red-400'
                                                        : r.stock <= 5 && 'text-amber-700 dark:text-amber-400',
                                                )}
                                            >
                                                {r.stock.toLocaleString()}
                                            </td>
                                            <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums md:table-cell">
                                                ₱{r.price.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <StatusPill tone={STATUS_TONE[r.status] ?? 'success'}>{r.status}</StatusPill>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs text-muted-foreground tabular-nums lg:table-cell">
                                                {r.expiry_date ?? '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {tab === 'branch' && branch_pagination.last_page > 1 && (
                        <SimplePager
                            from={branch_pagination.from}
                            to={branch_pagination.to}
                            total={branch_pagination.total}
                            page={branch_pagination.current_page}
                            lastPage={branch_pagination.last_page}
                            onPage={(page) => applyFilters({ page })}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
