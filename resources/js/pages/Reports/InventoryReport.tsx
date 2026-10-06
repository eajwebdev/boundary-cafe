import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';

import { Package, AlertTriangle, Clock, Download } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminLayout from '@/layouts/AdminLayout';
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

    const handleViewPdf = () => {
        openLivePdfPreview('inventory', filters);
    };

    const lowStockCount = stocks.data.filter((s) => s.is_low_stock).length;
    const nearExpiryCount = stocks.data.filter((s) => s.is_near_expiry).length;

    return (
        <AdminLayout>
            <Head title={getReportTitle('inventory')} />

            <div className="mx-auto max-w-7xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                            <Package className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{getReportTitle('inventory')}</h1>
                            <p className="text-sm text-muted-foreground">Current stock levels by product type</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button onClick={handleViewPdf} variant="outline" className="gap-2">
                            <Download className="h-4 w-4" />
                            PDF Preview
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-base">Filters</CardTitle>
                        <CardDescription>Select branch and product type</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                            {branches && (
                                <div className="md:col-span-5">
                                    <Label className="text-xs font-medium">Branch</Label>
                                    <Select
                                        value={filters.branch_id?.toString() || 'all'}
                                        onValueChange={(v) => handleFilterChange('branch_id', v === 'all' ? undefined : Number(v))}
                                    >
                                        <SelectTrigger className="mt-1.5 h-10">
                                            <SelectValue placeholder="All Branches" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Branches</SelectItem>
                                            {branches.map((branch) => (
                                                <SelectItem key={branch.id} value={branch.id.toString()}>
                                                    {branch.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="md:col-span-5">
                                <Label className="text-xs font-medium">Product Type</Label>
                                <Select value={filters.type} onValueChange={(v) => handleFilterChange('type', v)}>
                                    <SelectTrigger className="mt-1.5 h-10">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Products</SelectItem>
                                        <SelectItem value="standard">Standard</SelectItem>
                                        <SelectItem value="variant">Variants</SelectItem>
                                        <SelectItem value="bundle">Bundles</SelectItem>
                                        <SelectItem value="made_to_order">Made to Order</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-end md:col-span-2">
                                <Button onClick={handleGenerate} disabled={loading} className="h-10 w-full">
                                    {loading ? 'Generating...' : 'Generate'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Card>
                        <CardContent className="p-5">
                            <p className="text-xs text-muted-foreground">Total Products</p>
                            <p className="mt-2 text-3xl font-semibold tabular-nums">{stocks.total}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> Low Stock
                            </p>
                            <p className="mt-2 text-3xl font-semibold text-orange-600 tabular-nums">{lowStockCount}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-5">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 text-amber-500" /> Near Expiry
                            </p>
                            <p className="mt-2 text-3xl font-semibold text-amber-600 tabular-nums">{nearExpiryCount}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Inventory Table */}
                <Card>
                    <CardHeader>
                        <CardTitle>Current Inventory Stock</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Current Stock</TableHead>
                                    <TableHead>Expiry Date</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {stocks.data.length > 0 ? (
                                    stocks.data.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell>{item.category_name || '—'}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {item.product_type === 'made_to_order'
                                                        ? 'Made to Order'
                                                        : item.product_type === 'bundle'
                                                          ? 'Bundle'
                                                          : item.product_type === 'variant'
                                                            ? 'Variant'
                                                            : 'Standard'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">
                                                {item.stock} <span className="text-xs font-normal text-muted-foreground">{item.unit || 'pcs'}</span>
                                            </TableCell>
                                            <TableCell>{item.expiry_date || '—'}</TableCell>
                                            <TableCell className="text-center">
                                                {item.is_low_stock && (
                                                    <Badge variant="destructive" className="text-xs">
                                                        Low Stock
                                                    </Badge>
                                                )}
                                                {item.is_near_expiry && !item.is_low_stock && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        Near Expiry
                                                    </Badge>
                                                )}
                                                {!item.is_low_stock && !item.is_near_expiry && (
                                                    <Badge variant="outline" className="text-xs">
                                                        Normal
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                                            No inventory data found for the selected filters.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Pagination - Exactly like Sales Report */}
                {stocks.last_page > 1 && (
                    <div className="flex items-center justify-between pt-4 text-sm">
                        <p className="text-muted-foreground">
                            Showing {stocks.from} to {stocks.to} of {stocks.total} items (15 per page)
                        </p>
                        <div className="flex gap-1">
                            {stocks.links.map((link, i) => (
                                <button
                                    key={i}
                                    onClick={() =>
                                        link.url &&
                                        router.get(
                                            link.url,
                                            {},
                                            {
                                                preserveState: true,
                                                preserveScroll: true,
                                            },
                                        )
                                    }
                                    disabled={!link.url}
                                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                                        link.active
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border hover:bg-muted disabled:opacity-50'
                                    }`}
                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
