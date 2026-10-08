import { Head, Link } from '@inertiajs/react';
import { Banknote, Clock, CreditCard, Lock, Receipt, ShoppingBag, Trophy, Wallet } from 'lucide-react';
import { useState } from 'react';

import { BranchSelect, EmptyRow, FilterBar, Line, Panel, Stat, StatStrip, StatusPill, controlCls, thCls } from '@/components/AdminKit';
import AdminLayout from '@/layouts/AdminLayout';
import { manilaTodayStr } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

import {
    CHANNEL_LABELS,
    Footnote,
    PAYMENT_LABELS,
    RankedList,
    ReportHeader,
    SectionTitle,
    openPdf,
    overShortLabel,
    peso,
    qty,
    useReportVisit,
} from './kit';
import type { ReportContext } from './kit';

interface Session {
    id: number;
    session_number: string;
    cashier: string;
    status: 'open' | 'closed';
    opened_at: string | null;
    closed_at: string | null;
    opening_cash: number;
    expected_cash: number;
    counted_cash: number;
    over_short: number;
}

interface Props extends ReportContext {
    report: {
        figures: {
            first_receipt: string | null;
            last_receipt: string | null;
            transaction_count: number;
            items_sold: number;
            gross_sales: number;
            discount_total: number;
            loyalty_discount_total: number;
            net_sales: number;
            delivery_fees: number;
            unpaid_total: number;
            void_count: number;
            void_amount: number;
            vat_enabled: boolean;
            vat_rate: number;
            vatable_sales: number;
            vat_amount: number;
            vat_exempt_sales: number;
            collections_total: number;
            collections_count: number;
            opening_cash: number;
            expected_cash: number;
            counted_cash: number;
            over_short: number;
            payments: { method: string; count: number; amount: number }[];
            channels: { channel: string; count: number; amount: number }[];
            sessions: Session[];
        };
        open_sessions: number;
        expenses: { total: number; count: number; by_category: { name: string; count: number; amount: number; share: number }[] };
        sales_less_expenses: number;
        top_items: { name: string; quantity: number; amount: number }[];
        by_hour: { hour: number; count: number; amount: number }[];
        z_reading: { id: number; z_number: number } | null;
    };
}

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—';

export default function DailySummary(props: Props) {
    const { report, branches, filters } = props;
    const f = report.figures;
    const date = filters.from ?? '';
    const [day, setDay] = useState(date);
    const [branchId, setBranchId] = useState<number | undefined>(filters.branch_id ?? undefined);
    const { loading, visit } = useReportVisit('reports.daily');
    const params = { date, branch_id: filters.branch_id };
    const peakHour = report.by_hour.reduce<Props['report']['by_hour'][number] | null>(
        (best, h) => (!best || h.amount > best.amount ? h : best),
        null,
    );

    return (
        <AdminLayout>
            <Head title="Daily Summary" />

            <div className="space-y-4">
                <ReportHeader title="Daily Sales Summary" context={props} onPdf={() => openPdf('reports.daily.pdf', params)}>
                    {report.z_reading ? (
                        <Link href={routes.zReadings.show(report.z_reading.id)}>
                            <StatusPill tone="success" className="h-7 px-2.5">
                                <Lock className="h-3 w-3" /> Closed · Z-{String(report.z_reading.z_number).padStart(4, '0')}
                            </StatusPill>
                        </Link>
                    ) : (
                        filters.branch_id && (
                            <StatusPill tone="muted" className="h-7 px-2.5">
                                Day not yet closed
                            </StatusPill>
                        )
                    )}
                </ReportHeader>

                <FilterBar loading={loading} applyLabel="Show day" onApply={() => visit({ date: day, branch_id: branchId })}>
                    <BranchSelect branches={branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
                    <input
                        type="date"
                        value={day}
                        max={manilaTodayStr()}
                        onChange={(e) => setDay(e.target.value)}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Business day"
                    />
                </FilterBar>

                <StatStrip count={4}>
                    <Stat icon={Wallet} label="Net sales" value={peso(f.net_sales)} tone="success" />
                    <Stat
                        icon={Receipt}
                        label="Expenses"
                        value={peso(report.expenses.total)}
                        tone={report.expenses.total > 0 ? 'warning' : 'muted'}
                    />
                    <Stat icon={ShoppingBag} label="Sales less expenses" value={peso(report.sales_less_expenses)} />
                    <Stat
                        icon={Banknote}
                        label="Cash over / short"
                        value={f.sessions.length ? overShortLabel(f.over_short) : 'No sessions'}
                        tone={!f.sessions.length ? 'muted' : Math.abs(f.over_short) < 0.005 ? 'success' : 'warning'}
                    />
                </StatStrip>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel icon={ShoppingBag} title={<SectionTitle no={1}>Sales</SectionTitle>}>
                        <div>
                            <Line label="Gross sales" value={peso(f.gross_sales)} />
                            <Line label="Less discounts & promos" value={`(${peso(f.discount_total)})`} />
                            {f.loyalty_discount_total > 0 && <Line label="Less loyalty points" value={`(${peso(f.loyalty_discount_total)})`} />}
                            <Line strong label="Net sales" value={peso(f.net_sales)} />
                            {f.delivery_fees > 0 && <Line label="Includes delivery fees" value={peso(f.delivery_fees)} />}
                            <Line label="Transactions" value={f.transaction_count.toLocaleString()} />
                            <Line label="Average sale" value={peso(f.transaction_count ? f.net_sales / f.transaction_count : 0)} />
                            <Line label="Items sold" value={qty(f.items_sold)} />
                            <Line label={`Voided sales (${f.void_count})`} value={peso(f.void_amount)} tone={f.void_count ? 'warning' : undefined} />
                            {f.first_receipt && (
                                <Line
                                    label="Receipt range"
                                    value={
                                        <span className="font-mono text-xs">
                                            {f.first_receipt} – {f.last_receipt}
                                        </span>
                                    }
                                />
                            )}
                        </div>
                        {f.vat_enabled && (
                            <div className="border-t border-border pt-2">
                                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">VAT ({f.vat_rate}%)</p>
                                <Line label="VATable sales" value={peso(f.vatable_sales)} />
                                <Line label="VAT amount" value={peso(f.vat_amount)} />
                                <Line label="VAT-exempt sales" value={peso(f.vat_exempt_sales)} />
                            </div>
                        )}
                    </Panel>

                    <Panel icon={CreditCard} title={<SectionTitle no={2}>Payments &amp; channels</SectionTitle>}>
                        {f.payments.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No sales on this day.</p>
                        ) : (
                            <div>
                                {f.payments.map((p) => (
                                    <Line key={p.method} label={`${PAYMENT_LABELS[p.method] ?? p.method} (${p.count})`} value={peso(p.amount)} />
                                ))}
                                <Line strong label="Total" value={peso(f.net_sales)} />
                                {f.unpaid_total > 0 && <Line label="Still unpaid (on credit)" value={peso(f.unpaid_total)} tone="warning" />}
                                {f.collections_count > 0 && (
                                    <Line label={`Collections on account (${f.collections_count})`} value={peso(f.collections_total)} />
                                )}
                                <div className="mt-2 border-t border-border pt-2">
                                    {f.channels.map((c) => (
                                        <Line
                                            key={c.channel}
                                            label={`${CHANNEL_LABELS[c.channel] ?? c.channel} (${c.count})`}
                                            value={peso(c.amount)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </Panel>
                </div>

                <Panel flush icon={Banknote} title={<SectionTitle no={3}>Cash drawer</SectionTitle>}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Cashier</th>
                                    <th className={cn(thCls, 'hidden sm:table-cell')}>Hours</th>
                                    <th className={cn(thCls, 'hidden text-right md:table-cell')}>Opening</th>
                                    <th className={cn(thCls, 'text-right')}>Expected</th>
                                    <th className={cn(thCls, 'text-right')}>Counted</th>
                                    <th className={cn(thCls, 'text-right')}>Over / short</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {f.sessions.length === 0 ? (
                                    <EmptyRow colSpan={6} icon={Banknote}>
                                        No cash sessions on this day.
                                    </EmptyRow>
                                ) : (
                                    f.sessions.map((s) => (
                                        <tr key={s.id}>
                                            <td className="px-4 py-2">
                                                <p className="font-semibold">{s.cashier}</p>
                                                <p className="font-mono text-[11px] text-muted-foreground">{s.session_number}</p>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs sm:table-cell">
                                                {time(s.opened_at)} – {s.closed_at ? time(s.closed_at) : 'still open'}
                                            </td>
                                            <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{peso(s.opening_cash)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(s.expected_cash)}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{s.status === 'open' ? '—' : peso(s.counted_cash)}</td>
                                            <td className="px-4 py-2 text-right">
                                                {s.status === 'open' ? (
                                                    <StatusPill tone="warning">Still open</StatusPill>
                                                ) : (
                                                    <StatusPill
                                                        tone={Math.abs(s.over_short) < 0.005 ? 'success' : s.over_short > 0 ? 'warning' : 'danger'}
                                                    >
                                                        {overShortLabel(s.over_short)}
                                                    </StatusPill>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {f.sessions.length > 1 && (
                                <tfoot className="border-t border-border bg-muted/20 font-bold">
                                    <tr>
                                        <td className="px-4 py-2">Total</td>
                                        <td className="hidden sm:table-cell" />
                                        <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">{peso(f.opening_cash)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(f.expected_cash)}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{peso(f.counted_cash)}</td>
                                        <td className="px-4 py-2 text-right text-xs">{overShortLabel(f.over_short)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                    {report.open_sessions > 0 && (
                        <Footnote className="border-t border-border px-4 py-2.5">
                            {report.open_sessions} session{report.open_sessions > 1 ? 's are' : ' is'} still open, so cash figures aren’t final until
                            every drawer is counted and closed.
                        </Footnote>
                    )}
                </Panel>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Panel flush icon={Receipt} title={<SectionTitle no={4}>Expenses</SectionTitle>}>
                        <RankedList
                            empty="No approved expenses."
                            rows={report.expenses.by_category.map((e) => ({
                                key: e.name,
                                label: e.name,
                                sub: `${e.count} entr${e.count === 1 ? 'y' : 'ies'}`,
                                value: peso(e.amount),
                                share: e.share,
                            }))}
                            total={report.expenses.count ? peso(report.expenses.total) : undefined}
                        />
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
                    <Panel
                        flush
                        icon={Clock}
                        title={<SectionTitle no={6}>Sales by hour</SectionTitle>}
                        actions={peakHour && <span className="text-[11px] font-semibold text-muted-foreground">Peak {hourLabel(peakHour.hour)}</span>}
                    >
                        <RankedList
                            empty="No sales on this day."
                            rows={report.by_hour.map((h) => ({
                                key: String(h.hour),
                                label: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}`,
                                sub: `${h.count} sale${h.count === 1 ? '' : 's'}`,
                                value: peso(h.amount),
                                share: f.net_sales > 0 ? (h.amount / f.net_sales) * 100 : 0,
                            }))}
                        />
                    </Panel>
                </div>

                <Footnote>
                    Voided sales are left out of every figure except “Voided sales”. “Sales less expenses” is before the cost of the food and drinks
                    sold, so it is not profit. Item amounts in Best sellers are before order-level discounts.
                </Footnote>
            </div>
        </AdminLayout>
    );
}
