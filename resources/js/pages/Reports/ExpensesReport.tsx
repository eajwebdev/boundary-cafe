import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { Calendar, Building2, Download, Receipt } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-range-picker';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminLayout from '@/layouts/AdminLayout';
import { reportRoutes, getReportTitle, openLivePdfPreview, type ReportFilters } from './Files';

interface Props {
    expenses: {
        data: Array<{
            id: number;
            expense_date: string;
            amount: number;
            category: { id: number; name: string } | null;
            payment_method: string;
            description?: string;
            status: string;
        }>;
        current_page: number;
        last_page: number;
        total: number;
        from: number | null;
        to: number | null;
        links: Array<{ url: string | null; label: string; active: boolean }>;
    };
    branches: Array<{ id: number; name: string }> | null;
    filters: ReportFilters;
    total_amount: number;
}

export default function ExpensesReport({ expenses, branches, filters: initialFilters, total_amount }: Props) {
    const today = new Date().toISOString().split('T')[0];

    const [branchId, setBranchId] = useState<number | undefined>(initialFilters?.branch_id ? Number(initialFilters.branch_id) : undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: parseISO(initialFilters?.from_date || today),
        to: parseISO(initialFilters?.to_date || today),
    });
    const [loading, setLoading] = useState(false);

    const getParams = () => ({
        branch_id: branchId,
        from_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        to_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    });

    const handleGenerate = () => {
        setLoading(true);
        router.get(
            reportRoutes.expenses(),
            { ...getParams(), per_page: 10 },
            {
                preserveState: true,
                preserveScroll: true,
                onFinish: () => setLoading(false),
            },
        );
    };

    const handleViewPdf = () => {
        openLivePdfPreview('expenses', getParams());
    };

    return (
        <AdminLayout>
            <Head title={getReportTitle('expenses')} />

            <div className="mx-auto max-w-6xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                            <Receipt className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">{getReportTitle('expenses')}</h1>
                            <p className="text-sm text-muted-foreground">Approved expense transactions by date range</p>
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
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Calendar className="h-4 w-4" /> Filters
                        </CardTitle>
                        <CardDescription>Select branch and date range</CardDescription>
                    </CardHeader>
                    <CardContent>
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
                                <Button onClick={handleGenerate} disabled={loading} className="h-10 w-full">
                                    {loading ? 'Generating...' : 'Show Expenses'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Expenses Table */}
                {expenses.data.length > 0 ? (
                    <>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-base">Expense Transactions</CardTitle>
                                <div className="text-sm text-muted-foreground">
                                    Total:{' '}
                                    <span className="font-semibold text-destructive tabular-nums">
                                        ₱{Number(total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead className="text-center">Payment</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {expenses.data.map((expense) => (
                                            <TableRow key={expense.id}>
                                                <TableCell>
                                                    {new Date(expense.expense_date).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric',
                                                    })}
                                                </TableCell>
                                                <TableCell className="font-medium">{expense.category?.name || '—'}</TableCell>
                                                <TableCell className="text-muted-foreground">{expense.description || '—'}</TableCell>
                                                <TableCell className="text-right font-semibold text-destructive tabular-nums">
                                                    ₱{Number(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary">{expense.payment_method.toUpperCase()}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Pagination */}
                        {expenses.last_page > 1 && (
                            <div className="flex items-center justify-between pt-4 text-sm">
                                <p className="text-muted-foreground">
                                    Showing {expenses.from} to {expenses.to} of {expenses.total} expenses (10 per page)
                                </p>
                                <div className="flex gap-1">
                                    {expenses.links.map((link, i) => (
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
                    </>
                ) : (
                    <Card className="border-dashed p-12 text-center">
                        <p className="text-muted-foreground">No expenses found for the selected period</p>
                    </Card>
                )}
            </div>
        </AdminLayout>
    );
}
