import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { Download, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { BranchSelect, EmptyRow, FilterBar, PageHeader, Pager, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import AdminLayout from '@/layouts/AdminLayout';
import { manilaTodayStr, toDateStr, fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { reportRoutes, getReportTitle, openLivePdfPreview, type ReportFilters } from './Files';

interface Props {
    sales: {
        data: Array<{
            id: number;
            receipt_number: string;
            created_at: string;
            user?: { full_name: string };
            customer_name?: string;
            customer?: { id: number; name: string } | null;
            total: number;
            amount_paid: number;
            balance_due: number;
            payment_status: string;
            payment_method: string;
            discount_amount: number;
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
}

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SalesReport({ sales, branches, filters: initialFilters }: Props) {
    const today = manilaTodayStr();

    const [branchId, setBranchId] = useState<number | undefined>(initialFilters?.branch_id ? Number(initialFilters.branch_id) : undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: new Date((initialFilters?.from_date || today) + 'T00:00:00+08:00'),
        to: new Date((initialFilters?.to_date || today) + 'T00:00:00+08:00'),
    });
    const [loading, setLoading] = useState(false);

    const getParams = () => ({
        branch_id: branchId,
        from_date: dateRange?.from ? toDateStr(dateRange.from) : undefined,
        to_date: dateRange?.to ? toDateStr(dateRange.to) : undefined,
    });

    const handleGenerate = () => {
        setLoading(true);
        router.get(
            reportRoutes.sales(),
            { ...getParams(), per_page: 10 },
            {
                preserveState: true,
                preserveScroll: true,
                onFinish: () => setLoading(false),
            },
        );
    };

    const pageCollected = sales.data.reduce((sum, sale) => sum + Number(sale.amount_paid ?? sale.total), 0);
    const pageDiscounts = sales.data.reduce((sum, sale) => sum + Number(sale.discount_amount ?? 0), 0);
    const pageBalance = sales.data.reduce((sum, sale) => sum + Number(sale.balance_due ?? 0), 0);

    return (
        <AdminLayout>
            <Head title={getReportTitle('sales')} />

            <div className="space-y-4">
                <PageHeader title={getReportTitle('sales')} subtitle="Every sale in the period, with who rang it up and how it was paid.">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openLivePdfPreview('sales', getParams())}>
                        <Download className="h-4 w-4" /> PDF preview
                    </Button>
                </PageHeader>

                <FilterBar onApply={handleGenerate} loading={loading} applyLabel="Show sales">
                    <BranchSelect branches={branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
                    <div className="min-w-60">
                        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                    </div>
                </FilterBar>

                <StatStrip count={4}>
                    <Stat icon={Receipt} label="Transactions" value={sales.total.toLocaleString()} />
                    <Stat icon={TrendingUp} label="Collected · this page" value={peso(pageCollected)} tone="success" />
                    <Stat icon={Wallet} label="Unpaid balance · this page" value={peso(pageBalance)} tone={pageBalance > 0 ? 'warning' : undefined} />
                    <Stat icon={Receipt} label="Discounts · this page" value={peso(pageDiscounts)} />
                </StatStrip>

                <Panel flush icon={Receipt} title="Sales transactions">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Receipt</th>
                                    <th className={thCls}>Date</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Cashier</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Customer</th>
                                    <th className={cn(thCls, 'text-right')}>Total</th>
                                    <th className={cn(thCls, 'text-right')}>Collected</th>
                                    <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Balance</th>
                                    <th className={thCls}>Payment</th>
                                    <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Discount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {sales.data.length === 0 ? (
                                    <EmptyRow colSpan={9} icon={Receipt}>
                                        No sales in this period.
                                    </EmptyRow>
                                ) : (
                                    sales.data.map((sale) => (
                                        <tr key={sale.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-2 font-mono text-xs font-bold">{sale.receipt_number}</td>
                                            <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(sale.created_at, 'MMM d, h:mm a')}</td>
                                            <td className="hidden px-4 py-2 text-muted-foreground md:table-cell">{sale.user?.full_name || '—'}</td>
                                            <td className="hidden px-4 py-2 md:table-cell">
                                                {sale.customer?.name || sale.customer_name || <span className="text-muted-foreground">Walk-in</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold tabular-nums">{peso(Number(sale.total))}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(Number(sale.amount_paid ?? sale.total))}</td>
                                            <td
                                                className={cn(
                                                    'hidden px-4 py-2 text-right tabular-nums lg:table-cell',
                                                    Number(sale.balance_due ?? 0) > 0
                                                        ? 'font-bold text-amber-700 dark:text-amber-400'
                                                        : 'text-muted-foreground',
                                                )}
                                            >
                                                {Number(sale.balance_due ?? 0) > 0 ? peso(Number(sale.balance_due)) : '—'}
                                            </td>
                                            <td className="px-4 py-2">
                                                <StatusPill tone={sale.payment_status === 'paid' ? 'muted' : 'warning'}>
                                                    {sale.payment_method.toUpperCase()}
                                                    {sale.payment_status !== 'paid' && ` · ${sale.payment_status}`}
                                                </StatusPill>
                                            </td>
                                            <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums lg:table-cell">
                                                {sale.discount_amount > 0 ? `−${peso(Number(sale.discount_amount))}` : '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {sales.last_page > 1 && (
                        <Pager
                            from={sales.from}
                            to={sales.to}
                            total={sales.total}
                            links={sales.links}
                            onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
