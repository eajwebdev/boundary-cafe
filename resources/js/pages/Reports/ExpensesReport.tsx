import { Head, router } from '@inertiajs/react';
import { Clock, CreditCard, Receipt, Tags, TrendingUp, Wallet } from 'lucide-react';

import { EmptyRow, Pager, Panel, Stat, StatStrip, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';

import { Footnote, PAYMENT_LABELS, PeriodFilterBar, RankedList, ReportHeader, SectionTitle, openPdf, peso, useReportVisit } from './kit';
import type { Paginated, ReportContext } from './kit';

interface Props extends ReportContext {
    report: {
        summary: { total: number; count: number; average: number; largest: number; not_approved_count: number; not_approved_amount: number };
        by_category: { name: string; count: number; amount: number; share: number }[];
        by_method: { key: string; count: number; amount: number }[];
    };
    register: Paginated<{
        id: number;
        date: string;
        reference: string | null;
        category: string;
        description: string | null;
        payment_label: string;
        recorded_by: string;
        amount: number;
    }>;
}

export default function ExpensesReport(props: Props) {
    const { report, register, filters } = props;
    const s = report.summary;
    const { loading, visit } = useReportVisit('reports.expenses');

    return (
        <AdminLayout>
            <Head title="Expense Report" />

            <div className="space-y-4">
                <ReportHeader
                    title="Expense Report"
                    context={props}
                    onPdf={() => openPdf('reports.expenses.pdf', { branch_id: filters.branch_id, from: filters.from, to: filters.to })}
                />

                <PeriodFilterBar context={props} loading={loading} onApply={visit} />

                <StatStrip count={4}>
                    <Stat icon={Wallet} label="Total expenses" value={peso(s.total)} tone={s.total > 0 ? 'warning' : 'muted'} />
                    <Stat icon={Receipt} label={`Entries · avg ${peso(s.average)}`} value={s.count.toLocaleString()} />
                    <Stat icon={TrendingUp} label="Largest single expense" value={peso(s.largest)} />
                    <Stat
                        icon={Clock}
                        label={`Not yet approved (${s.not_approved_count})`}
                        value={peso(s.not_approved_amount)}
                        tone={s.not_approved_count ? 'warning' : 'muted'}
                    />
                </StatStrip>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel flush icon={Tags} title={<SectionTitle no={1}>By category</SectionTitle>}>
                        <RankedList
                            empty="No approved expenses in this period."
                            rows={report.by_category.map((c) => ({
                                key: c.name,
                                label: c.name,
                                sub: `${c.count} entr${c.count === 1 ? 'y' : 'ies'}`,
                                value: peso(c.amount),
                                share: c.share,
                            }))}
                            total={s.count ? peso(s.total) : undefined}
                        />
                    </Panel>
                    <Panel flush icon={CreditCard} title={<SectionTitle no={2}>By payment method</SectionTitle>} className="self-start">
                        <RankedList
                            empty="No approved expenses in this period."
                            rows={report.by_method.map((m) => ({
                                key: m.key,
                                label: PAYMENT_LABELS[m.key] ?? m.key,
                                sub: `${m.count} entr${m.count === 1 ? 'y' : 'ies'}`,
                                value: peso(m.amount),
                                share: s.total > 0 ? (m.amount / s.total) * 100 : 0,
                            }))}
                        />
                    </Panel>
                </div>

                <Panel
                    flush
                    icon={Receipt}
                    title={<SectionTitle no={3}>Expense register</SectionTitle>}
                    actions={<span className="text-[11px] font-semibold text-muted-foreground">{register.total.toLocaleString()} entries</span>}
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Date</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Reference</th>
                                    <th className={thCls}>Category</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Description</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Paid by</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Recorded by</th>
                                    <th className={cn(thCls, 'text-right')}>Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {register.data.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={Receipt}>
                                        No approved expenses in this period.
                                    </EmptyRow>
                                ) : (
                                    register.data.map((e) => (
                                        <tr key={e.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                {fmtDate(`${e.date}T12:00:00+08:00`, 'MMM d, yyyy')}
                                            </td>
                                            <td className="hidden px-4 py-2 font-mono text-xs md:table-cell">{e.reference || '—'}</td>
                                            <td className="px-4 py-2 font-medium">{e.category}</td>
                                            <td className="hidden max-w-72 truncate px-4 py-2 text-muted-foreground md:table-cell">
                                                {e.description || '—'}
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs lg:table-cell">{e.payment_label}</td>
                                            <td className="hidden px-4 py-2 text-xs text-muted-foreground lg:table-cell">{e.recorded_by}</td>
                                            <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(e.amount)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {register.last_page > 1 && (
                        <Pager
                            from={register.from}
                            to={register.to}
                            total={register.total}
                            links={register.links}
                            onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                        />
                    )}
                </Panel>

                <Footnote>
                    Only approved expenses count toward the totals. Pending and rejected entries are shown in “Not yet approved” for information only.
                </Footnote>
            </div>
        </AdminLayout>
    );
}
