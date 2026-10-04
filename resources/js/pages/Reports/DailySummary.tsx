import { useState } from 'react';
import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { reportRoutes, getReportTitle, getDefaultFilters, openLivePdfPreview, type ReportFilters, type DailySummaryData } from './Files';

import AdminLayout from '@/layouts/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { Calendar, Building2, TrendingUp, DollarSign, CreditCard, FileText, Download } from 'lucide-react';

interface Props {
    dailySummary?: DailySummaryData;
    branches: Array<{ id: number; name: string }> | null;
    currentBranchId?: number;
}

export default function DailySummary({ dailySummary, branches, currentBranchId }: Props) {
    const [filters, setFilters] = useState<ReportFilters>(getDefaultFilters('daily', currentBranchId));
    const [loading, setLoading] = useState(false);

    const handleFilterChange = (name: string, value: string | number | undefined) => {
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleGenerate = () => {
        setLoading(true);
        router.get(reportRoutes.daily(), filters, {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setLoading(false),
        });
    };

    const handleViewPdf = () => {
        openLivePdfPreview('daily', filters);
    };

    const netSales = dailySummary ? Number(dailySummary.gross_sales) - Number(dailySummary.total_refunds) : 0;

    return (
        <AdminLayout>
            <Head title={getReportTitle('daily')} />

            <div className="mx-auto max-w-5xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary/10 p-2">
                            <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{getReportTitle('daily')}</h1>
                            <p className="text-sm text-muted-foreground">Daily performance & cash reconciliation</p>
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
                            <Calendar className="h-4 w-4" />
                            Filters
                        </CardTitle>
                        <CardDescription>Select branch and date</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                            {branches && (
                                <div className="md:col-span-5">
                                    <Label className="flex items-center gap-1.5 text-xs font-medium">
                                        <Building2 className="h-3.5 w-3.5" /> Branch
                                    </Label>
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
                                <Label className="text-xs font-medium">Report Date</Label>
                                <input
                                    type="date"
                                    value={filters.date || ''}
                                    onChange={(e) => handleFilterChange('date', e.target.value)}
                                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-4 text-sm focus-visible:ring-2 focus-visible:ring-primary"
                                />
                            </div>

                            <div className="flex items-end md:col-span-2">
                                <Button onClick={handleGenerate} disabled={loading} className="h-10 w-full">
                                    {loading ? 'Generating...' : 'Generate'}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Report Content */}
                {dailySummary ? (
                    <div className="space-y-6">
                        {/* Net Income Highlight */}
                        <Card className="overflow-hidden border-primary/10">
                            <CardContent className="bg-gradient-to-r from-primary/5 to-transparent p-6">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">NET INCOME</p>
                                        <p className="mt-1 text-4xl font-bold tracking-tighter text-foreground tabular-nums">
                                            ₱{Number(dailySummary.net_income).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-right text-sm text-muted-foreground">
                                        {new Date(dailySummary.summary_date).toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <Card>
                                <CardContent className="p-5">
                                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <TrendingUp className="h-3.5 w-3.5" /> Gross Sales
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">₱{Number(dailySummary.gross_sales).toLocaleString()}</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-5">
                                    <p className="text-xs text-muted-foreground">Net Sales</p>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">₱{netSales.toLocaleString()}</p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-5">
                                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <DollarSign className="h-3.5 w-3.5" /> Expenses
                                    </p>
                                    <p className="mt-2 text-2xl font-semibold text-destructive tabular-nums">
                                        ₱{Number(dailySummary.total_expenses).toLocaleString()}
                                    </p>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-5">
                                    <p className="text-xs text-muted-foreground">Transactions</p>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums">{dailySummary.total_transactions}</p>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            {/* Cash Management */}
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <DollarSign className="h-4 w-4" /> Cash Management
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Opening Cash</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.opening_cash).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Expected Cash</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.expected_cash).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Counted Cash</span>
                                        <span className="tabular-nums">
                                            {dailySummary.counted_cash !== null ? `₱${Number(dailySummary.counted_cash).toLocaleString()}` : '—'}
                                        </span>
                                    </div>
                                    <Separator />
                                    <div className="flex items-center justify-between font-medium">
                                        <span>Over / Short</span>
                                        <Badge variant={dailySummary.over_short >= 0 ? 'default' : 'destructive'}>
                                            {dailySummary.over_short >= 0 ? '+' : ''}₱{Math.abs(Number(dailySummary.over_short)).toLocaleString()}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Payment Breakdown */}
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <CreditCard className="h-4 w-4" /> Payment Breakdown
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Cash</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.cash_sales).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">GCash</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.gcash_sales).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Card</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.card_sales).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Other</span>
                                        <span className="tabular-nums">₱{Number(dailySummary.other_sales).toLocaleString()}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                ) : (
                    <Card className="border-dashed p-12 text-center">
                        <p className="text-muted-foreground">Select a branch and date to generate the daily summary</p>
                    </Card>
                )}
            </div>
        </AdminLayout>
    );
}
