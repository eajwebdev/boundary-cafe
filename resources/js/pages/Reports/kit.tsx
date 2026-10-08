import { router } from '@inertiajs/react';
import { parseISO } from 'date-fns';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import { type DateRange } from 'react-day-picker';

import { BranchSelect, Chip, FilterBar, PageHeader } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { fmtDate, manilaNow, manilaRange, toDateStr } from '@/lib/date';
import { cn } from '@/lib/utils';
import { route } from '@/routes';

/**
 * Shared pieces for the report pages. Every figure on a report page comes from
 * the server for the whole period, so pages never total "just this page".
 */

export interface ReportContext {
    branches: { id: number; name: string }[] | null;
    filters: { branch_id: number | null; from: string | null; to: string | null };
    branch_label: string;
    generated_at: string;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: { url: string | null; label: string; active: boolean }[];
}

export type QueryParams = Record<string, string | number | null | undefined>;

// ─── Formatting ───────────────────────────────────────────────────────────────

export function peso(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Quantities without trailing zeros: 3, 2.5, 0.125. */
export function qty(value: number | string | null | undefined): string {
    return Number(value ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 3 });
}

export function pct(value: number): string {
    return `${value.toFixed(1)}%`;
}

export function overShortLabel(value: number): string {
    if (Math.abs(value) < 0.005) {
        return 'Balanced';
    }
    return value > 0 ? `+${peso(value)} over` : `${peso(value)} short`;
}

/** "Oct 1 – Oct 8, 2026", or a single day when from = to. */
export function periodLabel(from: string | null, to: string | null): string {
    if (!from || !to) {
        return '';
    }
    const day = (d: string, pattern: string) => fmtDate(`${d}T12:00:00+08:00`, pattern);
    if (from === to) {
        return day(from, 'EEE, MMM d, yyyy');
    }
    return from.slice(0, 4) === to.slice(0, 4)
        ? `${day(from, 'MMM d')} – ${day(to, 'MMM d, yyyy')}`
        : `${day(from, 'MMM d, yyyy')} – ${day(to, 'MMM d, yyyy')}`;
}

export const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    card: 'Card',
    bank: 'Bank transfer',
    others: 'Others',
    credit: 'Charge / credit',
    mixed: 'Mixed',
    installment: 'Installment',
};

export const CHANNEL_LABELS: Record<string, string> = {
    counter: 'Counter / takeout',
    dine_in: 'Dine-in',
    online: 'Online orders',
};

/** Drop empty values so URLs stay clean. */
export function cleanParams(params: QueryParams): Record<string, string | number> {
    return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== '')) as Record<string, string | number>;
}

export function openPdf(routeName: string, params: QueryParams): void {
    window.open(route(routeName, cleanParams(params)), '_blank', 'noopener,noreferrer');
}

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Title, scope line ("Main branch · Oct 1 – Oct 8, 2026 · generated 8:00 PM") and the PDF button. */
export function ReportHeader({
    title,
    context,
    scope,
    onPdf,
    children,
}: {
    title: string;
    context: ReportContext;
    scope?: string;
    onPdf: () => void;
    children?: React.ReactNode;
}) {
    return (
        <PageHeader
            title={title}
            subtitle={
                <>
                    <span className="font-semibold text-foreground">{context.branch_label}</span>
                    {' · '}
                    {scope ?? periodLabel(context.filters.from, context.filters.to)}
                    <span className="hidden sm:inline"> · figures as of {fmtDate(context.generated_at, 'MMM d, h:mm a')}</span>
                </>
            }
        >
            {children}
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onPdf}>
                <FileDown className="h-4 w-4" /> Download PDF
            </Button>
        </PageHeader>
    );
}

/** Numbered section heading, matching the numbered sections of the PDF. */
export function SectionTitle({ no, children }: { no: number | string; children: React.ReactNode }) {
    return (
        <>
            <span className="mr-1.5 text-muted-foreground tabular-nums">{no}</span>
            {children}
        </>
    );
}

/** Short explanation of how a figure is worked out. */
export function Footnote({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>{children}</p>;
}

/** Thin horizontal bar showing a share of a total. */
export function ShareBar({ value }: { value: number }) {
    return (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </span>
    );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

const QUICK_RANGES = [
    { label: 'Today', range: manilaRange.today },
    { label: 'Yesterday', range: manilaRange.yesterday },
    { label: 'Last 7 days', range: () => ({ from: new Date(manilaNow().getTime() - 6 * 86_400_000), to: manilaNow() }) },
    { label: 'This month', range: () => ({ from: manilaRange.thisMonth().from, to: manilaNow() }) },
    { label: 'Last month', range: manilaRange.lastMonth },
];

/**
 * Branch + period picker with quick ranges. Extra controls (payment method,
 * type…) go in `children`; the parent merges them into the request.
 */
export function PeriodFilterBar({
    context,
    onApply,
    children,
    loading,
}: {
    context: ReportContext;
    onApply: (params: { branch_id?: number; from?: string; to?: string }) => void;
    children?: React.ReactNode;
    loading?: boolean;
}) {
    const [branchId, setBranchId] = useState<number | undefined>(context.filters.branch_id ?? undefined);
    const [range, setRange] = useState<DateRange | undefined>(
        context.filters.from && context.filters.to ? { from: parseISO(context.filters.from), to: parseISO(context.filters.to) } : undefined,
    );

    const isRange = (from: Date, to: Date) =>
        range?.from && range?.to && toDateStr(range.from) === toDateStr(from) && toDateStr(range.to) === toDateStr(to);

    return (
        <FilterBar
            loading={loading}
            applyLabel="Show report"
            disabled={!range?.from}
            onApply={() =>
                onApply({
                    branch_id: branchId,
                    from: range?.from ? toDateStr(range.from) : undefined,
                    to: range?.to ? toDateStr(range.to) : range?.from ? toDateStr(range.from) : undefined,
                })
            }
        >
            <BranchSelect branches={context.branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
            <div className="min-w-60">
                <DateRangePicker dateRange={range} onDateRangeChange={setRange} />
            </div>
            <div className="flex flex-wrap gap-1">
                {QUICK_RANGES.map((q) => {
                    const r = q.range();
                    return (
                        <Chip key={q.label} active={!!isRange(r.from, r.to)} onClick={() => setRange({ from: r.from, to: r.to })}>
                            {q.label}
                        </Chip>
                    );
                })}
            </div>
            {children}
        </FilterBar>
    );
}

/** Visit a report with new filters, showing a loading state meanwhile. */
export function useReportVisit(routeName: string) {
    const [loading, setLoading] = useState(false);

    const visit = (params: QueryParams) => {
        setLoading(true);
        router.get(route(routeName), cleanParams(params), { preserveScroll: true, onFinish: () => setLoading(false) });
    };

    return { loading, visit };
}

/** Label / amount list with an optional share bar, for short breakdowns. */
export function RankedList({
    rows,
    total,
    empty,
}: {
    rows: { key: string; label: string; sub?: string; value: string; share?: number }[];
    total?: string;
    empty: string;
}) {
    if (rows.length === 0) {
        return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
    }

    return (
        <ul className="divide-y divide-border text-sm">
            {rows.map((r) => (
                <li key={r.key} className="px-4 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{r.label}</span>
                        <span className="font-semibold tabular-nums">{r.value}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span>{r.sub}</span>
                        {r.share !== undefined && <span className="tabular-nums">{pct(r.share)}</span>}
                    </div>
                    {r.share !== undefined && <ShareBar value={r.share} />}
                </li>
            ))}
            {total && (
                <li className="flex justify-between px-4 py-2 font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">{total}</span>
                </li>
            )}
        </ul>
    );
}
