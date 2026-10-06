import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { Download, Receipt, Tags, Wallet } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { BranchSelect, EmptyRow, FilterBar, PageHeader, Pager, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
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

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

    const categoriesOnPage = new Set(expenses.data.map((e) => e.category?.name ?? 'Uncategorised')).size;

    return (
        <AdminLayout>
            <Head title={getReportTitle('expenses')} />

            <div className="space-y-4">
                <PageHeader title={getReportTitle('expenses')} subtitle="Approved expenses in the period, by category and payment method.">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openLivePdfPreview('expenses', getParams())}>
                        <Download className="h-4 w-4" /> PDF preview
                    </Button>
                </PageHeader>

                <FilterBar onApply={handleGenerate} loading={loading} applyLabel="Show expenses">
                    <BranchSelect branches={branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
                    <div className="min-w-60">
                        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                    </div>
                </FilterBar>

                <StatStrip count={3}>
                    <Stat
                        icon={Wallet}
                        label="Total spent"
                        value={peso(Number(total_amount))}
                        tone={Number(total_amount) > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={Receipt} label="Expenses" value={expenses.total.toLocaleString()} />
                    <Stat icon={Tags} label="Categories · this page" value={categoriesOnPage.toLocaleString()} />
                </StatStrip>

                <Panel flush icon={Receipt} title="Expense transactions">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Date</th>
                                    <th className={thCls}>Category</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Description</th>
                                    <th className={cn(thCls, 'text-right')}>Amount</th>
                                    <th className={thCls}>Payment</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {expenses.data.length === 0 ? (
                                    <EmptyRow colSpan={5} icon={Receipt}>
                                        No expenses in this period.
                                    </EmptyRow>
                                ) : (
                                    expenses.data.map((expense) => (
                                        <tr key={expense.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                {new Date(expense.expense_date).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </td>
                                            <td className="px-4 py-2 font-semibold">{expense.category?.name || '—'}</td>
                                            <td className="hidden max-w-80 truncate px-4 py-2 text-muted-foreground md:table-cell">
                                                {expense.description || '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold tabular-nums">{peso(Number(expense.amount))}</td>
                                            <td className="px-4 py-2">
                                                <StatusPill tone="muted">{expense.payment_method.replace('_', ' ')}</StatusPill>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {expenses.last_page > 1 && (
                        <Pager
                            from={expenses.from}
                            to={expenses.to}
                            total={expenses.total}
                            links={expenses.links}
                            onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
