import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';

import { CreditCard, Download, FileText, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { BranchSelect, controlCls, FilterBar, Line, PageHeader, Panel, Stat, StatStrip } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { reportRoutes, getReportTitle, getDefaultFilters, openLivePdfPreview, type ReportFilters, type DailySummaryData } from './Files';

interface Props {
    dailySummary?: DailySummaryData;
    branches: Array<{ id: number; name: string }> | null;
    currentBranchId?: number;
}

const peso = (n: number | string | null | undefined) =>
    '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DailySummary({ dailySummary, branches, currentBranchId }: Props) {
    const [filters, setFilters] = useState<ReportFilters>(getDefaultFilters('daily', currentBranchId));
    const [loading, setLoading] = useState(false);

    const handleFilterChange = (name: string, value: string | number | undefined) => {
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleGenerate = () => {
        setLoading(true);
        router.get(reportRoutes.daily(), { ...filters }, {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setLoading(false),
        });
    };

    const netSales = dailySummary ? Number(dailySummary.gross_sales) - Number(dailySummary.total_refunds) : 0;
    const overShort = Number(dailySummary?.over_short ?? 0);

    return (
        <AdminLayout>
            <Head title={getReportTitle('daily')} />

            <div className="space-y-4">
                <PageHeader title={getReportTitle('daily')} subtitle="One day's sales, cash drawer and expenses for a branch.">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openLivePdfPreview('daily', filters)}>
                        <Download className="h-4 w-4" /> PDF preview
                    </Button>
                </PageHeader>

                <FilterBar onApply={handleGenerate} loading={loading} applyLabel="Show day">
                    <BranchSelect
                        branches={branches}
                        value={filters.branch_id}
                        onChange={(v) => handleFilterChange('branch_id', v ? Number(v) : undefined)}
                    />
                    <input
                        type="date"
                        value={filters.date || ''}
                        onChange={(e) => handleFilterChange('date', e.target.value)}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Report date"
                    />
                </FilterBar>

                {dailySummary ? (
                    <>
                        <StatStrip count={5}>
                            <Stat icon={Wallet} label="Net income" value={peso(dailySummary.net_income)} tone="success" />
                            <Stat icon={TrendingUp} label="Gross sales" value={peso(dailySummary.gross_sales)} />
                            <Stat icon={Receipt} label="Net sales" value={peso(netSales)} />
                            <Stat icon={TrendingDown} label="Expenses" value={peso(dailySummary.total_expenses)} tone="warning" />
                            <Stat icon={FileText} label="Transactions" value={Number(dailySummary.total_transactions).toLocaleString()} />
                        </StatStrip>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <Panel
                                icon={Wallet}
                                title="Cash drawer"
                                actions={
                                    <span className="text-[11px] font-semibold text-muted-foreground">
                                        {new Date(dailySummary.summary_date).toLocaleDateString('en-US', {
                                            weekday: 'long',
                                            month: 'short',
                                            day: 'numeric',
                                        })}
                                    </span>
                                }
                            >
                                <div>
                                    <Line label="Opening cash" value={peso(dailySummary.opening_cash)} />
                                    <Line label="Expected cash" value={peso(dailySummary.expected_cash)} />
                                    <Line
                                        label="Counted cash"
                                        value={dailySummary.counted_cash !== null ? peso(dailySummary.counted_cash) : 'Not counted'}
                                    />
                                    <Line
                                        strong
                                        label={overShort >= 0 ? 'Over' : 'Short'}
                                        value={`${overShort >= 0 ? '+' : '−'}${peso(Math.abs(overShort))}`}
                                        tone={overShort < 0 ? 'danger' : overShort > 0 ? 'success' : undefined}
                                    />
                                </div>
                            </Panel>

                            <Panel icon={CreditCard} title="Payments received">
                                <div>
                                    <Line label="Cash" value={peso(dailySummary.cash_sales)} />
                                    <Line label="GCash" value={peso(dailySummary.gcash_sales)} />
                                    <Line label="Card" value={peso(dailySummary.card_sales)} />
                                    <Line label="Other" value={peso(dailySummary.other_sales)} />
                                    <Line strong label="Gross sales" value={peso(dailySummary.gross_sales)} />
                                </div>
                            </Panel>
                        </div>
                    </>
                ) : (
                    <div className="rounded-xl border border-dashed border-border bg-card py-14 text-center text-sm text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-8 w-8 opacity-20" />
                        Pick a branch and date, then press <span className="font-semibold text-foreground">Show day</span>.
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
