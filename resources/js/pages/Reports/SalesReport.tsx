import { Head, router } from '@inertiajs/react';
import { Banknote, CalendarDays, CreditCard, Receipt, Trophy, Users, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';

import { EmptyRow, Line, Pager, Panel, Stat, StatStrip, StatusPill, controlCls, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';

import {
    CHANNEL_LABELS,
    Footnote,
    PAYMENT_LABELS,
    PeriodFilterBar,
    RankedList,
    ReportHeader,
    SectionTitle,
    openPdf,
    peso,
    qty,
    useReportVisit,
} from './kit';
import type { Paginated, ReportContext } from './kit';

interface Group {
    key: string;
    count: number;
    amount: number;
    collected: number;
}

interface Props extends ReportContext {
    payment_method: string | null;
    report: {
        summary: {
            transactions: number;
            gross_sales: number;
            discounts: number;
            net_sales: number;
            average_sale: number;
            collected: number;
            outstanding: number;
            collections_count: number;
            collections: number;
            cash_in: number;
            void_count: number;
            void_amount: number;
        };
        by_method: Group[];
        by_channel: Group[];
        by_day: { date: string; count: number; discounts: number; amount: number }[];
        by_cashier: { name: string; count: number; amount: number }[];
        top_items: { name: string; quantity: number; amount: number }[];
    };
    register: Paginated<{
        id: number;
        receipt_number: string;
        created_at: string;
        cashier: string;
        customer: string | null;
        channel: string;
        payment_label: string;
        discount: number;
        total: number;
        collected: number;
        balance: number;
    }>;
}

export default function SalesReport(props: Props) {
    const { report, register, filters } = props;
    const s = report.summary;
    const [method, setMethod] = useState(props.payment_method ?? '');
    const { loading, visit } = useReportVisit('reports.sales');
    const current = { branch_id: filters.branch_id, from: filters.from, to: filters.to, payment_method: props.payment_method };
    const share = (amount: number) => (s.net_sales > 0 ? (amount / s.net_sales) * 100 : 0);

    return (
        <AdminLayout>
            <Head title="Sales Report" />

            <div className="space-y-4">
                <ReportHeader title="Sales Report" context={props} onPdf={() => openPdf('reports.sales.pdf', current)} />

                <PeriodFilterBar context={props} loading={loading} onApply={(p) => visit({ ...p, payment_method: method })}>
                    <select
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Payment method in register"
                    >
                        <option value="">All payment methods</option>
                        {Object.entries(PAYMENT_LABELS)
                            .filter(([k]) => k !== 'bank')
                            .map(([k, label]) => (
                                <option key={k} value={k}>
                                    {label}
                                </option>
                            ))}
                    </select>
                </PeriodFilterBar>

                <StatStrip count={5}>
                    <Stat icon={Wallet} label="Net sales" value={peso(s.net_sales)} tone="success" />
                    <Stat icon={Receipt} label={`Transactions · avg ${peso(s.average_sale)}`} value={s.transactions.toLocaleString()} />
                    <Stat icon={Banknote} label="Cash received" value={peso(s.cash_in)} />
                    <Stat icon={CreditCard} label="Outstanding credit" value={peso(s.outstanding)} tone={s.outstanding > 0 ? 'warning' : 'muted'} />
                    <Stat icon={XCircle} label={`Voided (${s.void_count})`} value={peso(s.void_amount)} tone={s.void_count ? 'warning' : 'muted'} />
                </StatStrip>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Panel icon={Wallet} title={<SectionTitle no={1}>Summary</SectionTitle>}>
                        <div>
                            <Line label="Gross sales" value={peso(s.gross_sales)} />
                            <Line label="Less discounts, promos & loyalty" value={`(${peso(s.discounts)})`} />
                            <Line strong label="Net sales" value={peso(s.net_sales)} />
                            <Line label="Collected on these sales" value={peso(s.collected)} />
                            <Line label={`Collections on account (${s.collections_count})`} value={peso(s.collections)} />
                            <Line strong label="Total cash received" value={peso(s.cash_in)} />
                            {s.outstanding > 0 && <Line label="Unpaid on these sales" value={peso(s.outstanding)} tone="warning" />}
                        </div>
                    </Panel>

                    <Panel flush icon={CreditCard} title={<SectionTitle no={2}>By payment method</SectionTitle>}>
                        <RankedList
                            empty="No sales in this period."
                            rows={report.by_method.map((m) => ({
                                key: m.key,
                                label: PAYMENT_LABELS[m.key] ?? m.key,
                                sub: `${m.count} sale${m.count === 1 ? '' : 's'}${m.collected !== m.amount ? ` · ${peso(m.collected)} collected` : ''}`,
                                value: peso(m.amount),
                                share: share(m.amount),
                            }))}
                        />
                    </Panel>

                    <div className="space-y-4">
                        <Panel flush icon={Receipt} title={<SectionTitle no={3}>By channel</SectionTitle>}>
                            <RankedList
                                empty="No sales in this period."
                                rows={report.by_channel.map((c) => ({
                                    key: c.key,
                                    label: CHANNEL_LABELS[c.key] ?? c.key,
                                    sub: `${c.count} sale${c.count === 1 ? '' : 's'}`,
                                    value: peso(c.amount),
                                    share: share(c.amount),
                                }))}
                            />
                        </Panel>
                        <Panel flush icon={Users} title={<SectionTitle no={4}>By cashier</SectionTitle>}>
                            <RankedList
                                empty="No sales in this period."
                                rows={report.by_cashier.map((c) => ({
                                    key: c.name,
                                    label: c.name,
                                    sub: `${c.count} sale${c.count === 1 ? '' : 's'}`,
                                    value: peso(c.amount),
                                }))}
                            />
                        </Panel>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    <Panel flush icon={CalendarDays} title={<SectionTitle no={6}>Daily sales</SectionTitle>}>
                        <div className="max-h-105 overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 border-b border-border bg-card">
                                    <tr>
                                        <th className={thCls}>Date</th>
                                        <th className={cn(thCls, 'text-right')}>Sales</th>
                                        <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Average</th>
                                        <th className={cn(thCls, 'hidden text-right md:table-cell')}>Discounts</th>
                                        <th className={cn(thCls, 'text-right')}>Net sales</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {report.by_day.length === 0 ? (
                                        <EmptyRow colSpan={5} icon={CalendarDays}>
                                            No sales in this period.
                                        </EmptyRow>
                                    ) : (
                                        report.by_day.map((d) => (
                                            <tr key={d.date}>
                                                <td className="px-4 py-1.5">{fmtDate(`${d.date}T12:00:00+08:00`, 'EEE, MMM d')}</td>
                                                <td className="px-4 py-1.5 text-right tabular-nums">{d.count}</td>
                                                <td className="hidden px-4 py-1.5 text-right text-muted-foreground tabular-nums sm:table-cell">
                                                    {peso(d.count ? d.amount / d.count : 0)}
                                                </td>
                                                <td className="hidden px-4 py-1.5 text-right text-muted-foreground tabular-nums md:table-cell">
                                                    {peso(d.discounts)}
                                                </td>
                                                <td className="px-4 py-1.5 text-right font-semibold tabular-nums">{peso(d.amount)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {report.by_day.length > 1 && (
                                    <tfoot className="sticky bottom-0 border-t border-border bg-card font-bold">
                                        <tr>
                                            <td className="px-4 py-2">Total</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{s.transactions}</td>
                                            <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{peso(s.average_sale)}</td>
                                            <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{peso(s.discounts)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(s.net_sales)}</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={Trophy} title={<SectionTitle no={5}>Best sellers</SectionTitle>}>
                        <RankedList
                            empty="No items sold."
                            rows={report.top_items.map((i, n) => ({
                                key: i.name,
                                label: `${n + 1}. ${i.name}`,
                                sub: `${qty(i.quantity)} sold`,
                                value: peso(i.amount),
                            }))}
                        />
                    </Panel>
                </div>

                <Panel
                    flush
                    icon={Receipt}
                    title={
                        <SectionTitle no={7}>
                            Transaction register
                            {props.payment_method ? ` · ${PAYMENT_LABELS[props.payment_method] ?? props.payment_method} only` : ''}
                        </SectionTitle>
                    }
                    actions={<span className="text-[11px] font-semibold text-muted-foreground">{register.total.toLocaleString()} sales</span>}
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Receipt</th>
                                    <th className={thCls}>Date &amp; time</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Cashier</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Customer</th>
                                    <th className={thCls}>Payment</th>
                                    <th className={cn(thCls, 'hidden text-right lg:table-cell')}>Discount</th>
                                    <th className={cn(thCls, 'text-right')}>Total</th>
                                    <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {register.data.length === 0 ? (
                                    <EmptyRow colSpan={8} icon={Receipt}>
                                        No sales in this period.
                                    </EmptyRow>
                                ) : (
                                    register.data.map((row) => (
                                        <tr key={row.id} className="hover:bg-muted/30">
                                            <td className="px-4 py-2 font-mono text-xs font-semibold">{row.receipt_number}</td>
                                            <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                {fmtDate(row.created_at, 'MMM d, h:mm a')}
                                                <span className="block text-[11px] text-muted-foreground">{row.channel}</span>
                                            </td>
                                            <td className="hidden px-4 py-2 md:table-cell">{row.cashier}</td>
                                            <td className="hidden px-4 py-2 lg:table-cell">
                                                {row.customer || <span className="text-muted-foreground">Walk-in</span>}
                                            </td>
                                            <td className="px-4 py-2">
                                                <StatusPill tone={row.balance > 0 ? 'warning' : 'muted'}>{row.payment_label}</StatusPill>
                                            </td>
                                            <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums lg:table-cell">
                                                {row.discount > 0 ? peso(row.discount) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-semibold tabular-nums">{peso(row.total)}</td>
                                            <td
                                                className={cn(
                                                    'hidden px-4 py-2 text-right tabular-nums sm:table-cell',
                                                    row.balance > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                                )}
                                            >
                                                {row.balance > 0 ? peso(row.balance) : '—'}
                                            </td>
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
                    Net sales = gross sales less discounts, promos and loyalty points; voided sales are excluded and shown separately. Cash received
                    counts only what was paid at the counter on charge, mixed and installment sales, plus payments collected on older balances.
                    Best-seller amounts are before order-level discounts.
                </Footnote>
            </div>
        </AdminLayout>
    );
}
