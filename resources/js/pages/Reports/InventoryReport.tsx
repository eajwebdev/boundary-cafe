import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';

import { AlertTriangle, Clock, Download, Package } from 'lucide-react';
import { useState } from 'react';
import { BranchSelect, controlCls, EmptyRow, FilterBar, PageHeader, Pager, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { reportRoutes, getReportTitle, openLivePdfPreview } from './Files';

interface Props {
    stocks: {
        data: Array<{
            id: number;
            name: string;
            category_name?: string;
            product_type: string;
            stock: number;
            unit?: string;
            expiry_date?: string;
            is_low_stock: boolean;
            is_near_expiry: boolean;
        }>;
        current_page: number;
        last_page: number;
        total: number;
        from: number | null;
        to: number | null;
        links: Array<{ url: string | null; label: string; active: boolean }>;
    };
    branches: Array<{ id: number; name: string }> | null;
    currentBranchId?: number;
}

const TYPE_LABEL: Record<string, string> = {
    made_to_order: 'Made to order',
    bundle: 'Bundle',
    variant: 'Variant',
    ingredient: 'Ingredient',
    standard: 'Stocked',
};

export default function InventoryReport({ stocks, branches, currentBranchId }: Props) {
    const [filters, setFilters] = useState({
        branch_id: currentBranchId || undefined,
        type: 'all',
    });

    const [loading, setLoading] = useState(false);

    const handleFilterChange = (name: string, value: string | number | undefined) => {
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleGenerate = () => {
        setLoading(true);
        router.get(
            reportRoutes.inventory(),
            {
                ...filters,
                per_page: 15,
            },
            {
                preserveState: true,
                preserveScroll: true,
                onFinish: () => setLoading(false),
            },
        );
    };

    const lowStockCount = stocks.data.filter((s) => s.is_low_stock).length;
    const nearExpiryCount = stocks.data.filter((s) => s.is_near_expiry).length;

    return (
        <AdminLayout>
            <Head title={getReportTitle('inventory')} />

            <div className="space-y-4">
                <PageHeader title={getReportTitle('inventory')} subtitle="Stock on hand right now, by product type.">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openLivePdfPreview('inventory', filters)}>
                        <Download className="h-4 w-4" /> PDF preview
                    </Button>
                </PageHeader>

                <FilterBar onApply={handleGenerate} loading={loading} applyLabel="Show stock">
                    <BranchSelect
                        branches={branches}
                        value={filters.branch_id}
                        onChange={(v) => handleFilterChange('branch_id', v ? Number(v) : undefined)}
                    />
                    <select
                        value={filters.type}
                        onChange={(e) => handleFilterChange('type', e.target.value)}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Product type"
                    >
                        <option value="all">All products</option>
                        <option value="standard">Stocked</option>
                        <option value="variant">Variants</option>
                        <option value="bundle">Bundles</option>
                        <option value="made_to_order">Made to order</option>
                    </select>
                </FilterBar>

                <StatStrip count={3}>
                    <Stat icon={Package} label="Items" value={stocks.total.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Low stock · this page"
                        value={lowStockCount.toLocaleString()}
                        tone={lowStockCount > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={Clock}
                        label="Near expiry · this page"
                        value={nearExpiryCount.toLocaleString()}
                        tone={nearExpiryCount > 0 ? 'warning' : undefined}
                    />
                </StatStrip>

                <Panel flush icon={Package} title="Current stock">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Product</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Type</th>
                                    <th className={cn(thCls, 'text-right')}>Stock</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Expiry</th>
                                    <th className={thCls}>Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {stocks.data.length === 0 ? (
                                    <EmptyRow colSpan={5} icon={Package}>
                                        No stock for these filters.
                                    </EmptyRow>
                                ) : (
                                    stocks.data.map((item) => (
                                        <tr key={item.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-2">
                                                <p className="font-semibold">{item.name}</p>
                                                <p className="text-[11px] text-muted-foreground">{item.category_name || 'Uncategorised'}</p>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs text-muted-foreground md:table-cell">
                                                {TYPE_LABEL[item.product_type] ?? item.product_type}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold tabular-nums">
                                                {Number(item.stock).toLocaleString()}{' '}
                                                <span className="text-xs font-normal text-muted-foreground">{item.unit || 'pcs'}</span>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs text-muted-foreground tabular-nums md:table-cell">
                                                {item.expiry_date || '—'}
                                            </td>
                                            <td className="px-4 py-2">
                                                {item.is_low_stock ? (
                                                    <StatusPill tone="danger">Low stock</StatusPill>
                                                ) : item.is_near_expiry ? (
                                                    <StatusPill tone="warning">Near expiry</StatusPill>
                                                ) : (
                                                    <StatusPill tone="success">OK</StatusPill>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {stocks.last_page > 1 && (
                        <Pager
                            from={stocks.from}
                            to={stocks.to}
                            total={stocks.total}
                            links={stocks.links}
                            onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
