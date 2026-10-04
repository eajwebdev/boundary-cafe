import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { format, subDays, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { reportRoutes, getReportTitle, openLivePdfPreview } from './Files';
import { DateRangePicker } from '@/components/ui/date-range-picker';

import AdminLayout from '@/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FlaskConical, Building2, Calendar, Download, ChevronDown, ChevronRight } from 'lucide-react';

interface UsageItem {
    ingredient_id: number;
    ingredient_name: string;
    unit: string;
    total_used: number;
    recipes_used_in: Array<{
        product_name: string;
        quantity_per_unit: number;
        total_sold: number;
    }>;
}

interface Props {
    usage: UsageItem[];
    branches: Array<{ id: number; name: string }> | null;
}

const QUICK_RANGES: { label: string; range: () => DateRange }[] = [
    { label: 'Last 7 days', range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
    { label: 'Last 30 days', range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
    { label: 'This month', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: 'Last month', range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

export default function IngredientUsageReport({ usage, branches }: Props) {
    const today = new Date();

    const [branchId, setBranchId] = useState<number | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(today, 6),
        to: today,
    });
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const getParams = () => ({
        branch_id: branchId,
        from_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        to_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    });

    const handleGenerate = () => {
        setLoading(true);
        router.get(reportRoutes.ingredientUsage(), getParams(), {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setLoading(false),
        });
    };

    const handleViewPdf = () => {
        openLivePdfPreview('ingredient-usage', getParams());
    };

    const toggleExpand = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    return (
        <AdminLayout>
            <Head title={getReportTitle('ingredient-usage')} />

            <div className="mx-auto max-w-6xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                            <FlaskConical className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{getReportTitle('ingredient-usage')}</h1>
                            <p className="text-sm text-muted-foreground">Track how much of each ingredient was consumed by sales</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button onClick={handleViewPdf} variant="outline" className="gap-2" disabled={usage.length === 0}>
                            <Download className="h-4 w-4" />
                            PDF Preview
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Calendar className="h-4 w-4" /> Filters
                        </CardTitle>
                        <CardDescription>Select branch and date range to see ingredient consumption</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Quick range shortcuts */}
                        <div className="flex flex-wrap gap-2">
                            {QUICK_RANGES.map(({ label, range }) => (
                                <button
                                    key={label}
                                    onClick={() => setDateRange(range())}
                                    className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                            {branches && (
                                <div className="md:col-span-4">
                                    <Label className="flex items-center gap-1.5 text-xs font-medium">
                                        <Building2 className="h-3.5 w-3.5" /> Branch
                                    </Label>
                                    <Select
                                        value={branchId?.toString() || 'all'}
                                        onValueChange={(v) => setBranchId(v === 'all' ? undefined : Number(v))}
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

                            <div className="md:col-span-6">
                                <Label className="text-xs font-medium">Date Range</Label>
                                <div className="mt-1.5">
                                    <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                                </div>
                            </div>

                            <div className="flex items-end md:col-span-2">
                                <Button onClick={handleGenerate} disabled={loading || !dateRange?.from} className="h-10 w-full">
                                    {loading ? 'Loading...' : 'Generate'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary stat */}
                {usage.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <Card>
                            <CardContent className="p-5">
                                <p className="text-xs text-muted-foreground">Ingredients Used</p>
                                <p className="mt-2 text-3xl font-semibold tabular-nums">{usage.length}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <p className="text-xs text-muted-foreground">Most Consumed</p>
                                <p className="mt-2 truncate text-lg font-semibold">{usage[0]?.ingredient_name}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {Number(usage[0]?.total_used).toLocaleString(undefined, { maximumFractionDigits: 4 })} {usage[0]?.unit}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <p className="text-xs text-muted-foreground">Date Range</p>
                                <p className="mt-2 text-sm font-semibold">
                                    {dateRange?.from ? format(dateRange.from, 'MMM d, yyyy') : '—'}
                                    {' – '}
                                    {dateRange?.to ? format(dateRange.to, 'MMM d, yyyy') : '—'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Usage Table */}
                {usage.length > 0 ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Ingredient Consumption</CardTitle>
                            <CardDescription>Click a row to see which products consumed each ingredient</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-8"></TableHead>
                                        <TableHead>Ingredient</TableHead>
                                        <TableHead className="text-right">Total Used</TableHead>
                                        <TableHead className="text-right">Unit</TableHead>
                                        <TableHead className="text-right">Used In</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {usage.map((item, idx) => (
                                        <>
                                            <TableRow
                                                key={item.ingredient_id}
                                                className="cursor-pointer hover:bg-muted/50"
                                                onClick={() => toggleExpand(item.ingredient_id)}
                                            >
                                                <TableCell className="text-muted-foreground">
                                                    {expanded.has(item.ingredient_id) ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                                                <TableCell className="text-right font-semibold tabular-nums">
                                                    {Number(item.total_used).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="outline" className="text-xs">
                                                        {item.unit}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right text-xs text-muted-foreground">
                                                    {item.recipes_used_in.length} product{item.recipes_used_in.length !== 1 ? 's' : ''}
                                                </TableCell>
                                            </TableRow>

                                            {/* Breakdown sub-rows */}
                                            {expanded.has(item.ingredient_id) &&
                                                item.recipes_used_in.map((recipe) => (
                                                    <TableRow key={`${item.ingredient_id}-${recipe.product_name}`} className="bg-muted/30">
                                                        <TableCell />
                                                        <TableCell className="pl-8 text-sm text-muted-foreground">↳ {recipe.product_name}</TableCell>
                                                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                            {Number(recipe.quantity_per_unit).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                            <span className="ml-1 text-xs">{item.unit}/unit</span>
                                                        </TableCell>
                                                        <TableCell />
                                                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                            {Number(recipe.total_sold).toLocaleString()} sold
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                        </>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-dashed p-12 text-center">
                        <FlaskConical className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="font-medium text-muted-foreground">No data yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">Select a date range above and click Generate</p>
                    </Card>
                )}
            </div>
        </AdminLayout>
    );
}
