import { Link } from '@inertiajs/react';
import { ArrowDownRight, ArrowUpRight, Building2, Calendar as CalendarIcon, ChevronDown, ExternalLink, Inbox, LayoutGrid } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { manilaRange } from '@/lib/date';
import { cn } from '@/lib/utils';

const ReactApexChart = lazy(() => import('react-apexcharts'));

// ─── Formatting ───────────────────────────────────────────────────────────────

export function money(n: number | null | undefined, compact = false): string {
    const v = Number(n ?? 0);
    const neg = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (compact) {
        if (a >= 1_000_000) return `${neg}₱${(a / 1_000_000).toFixed(1)}M`;
        if (a >= 10_000) return `${neg}₱${(a / 1_000).toFixed(0)}k`;
        if (a >= 1_000) return `${neg}₱${(a / 1_000).toFixed(1)}k`;
    }
    return `${neg}₱${a.toLocaleString('en-PH', { minimumFractionDigits: compact && Number.isInteger(a) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('en-PH', { maximumFractionDigits: 1 });

export function shortDate(d: string) {
    return format(new Date(d + 'T00:00:00'), 'MMM d');
}

// ─── Chart theme (validated reference palette; light & dark steps) ────────────

const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function useIsDark() {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const sync = () => setDark(document.documentElement.classList.contains('dark'));
        sync();
        const obs = new MutationObserver(sync);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return dark;
}

export function useChartTheme() {
    const dark = useIsDark();
    return useMemo(() => {
        const series = dark ? SERIES_DARK : SERIES_LIGHT;
        const muted = dark ? '#c3c2b7' : '#52514e';
        const grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
        return {
            dark,
            series,
            base: {
                chart: { fontFamily: 'Inter, ui-sans-serif, system-ui', toolbar: { show: false }, background: 'transparent', animations: { enabled: true, speed: 350 }, zoom: { enabled: false } },
                grid: { borderColor: grid, strokeDashArray: 3, padding: { left: 4, right: 8, top: -8 } },
                xaxis: { labels: { style: { colors: muted, fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
                yaxis: { labels: { style: { colors: muted, fontSize: '11px' } } },
                tooltip: { theme: dark ? 'dark' : 'light' },
                legend: { labels: { colors: muted }, position: 'top' as const, horizontalAlign: 'left' as const, fontSize: '12px', markers: { size: 5 } },
                dataLabels: { enabled: false },
                states: { hover: { filter: { type: 'lighten' } } },
            },
        };
    }, [dark]);
}

export function Chart(props: { type: 'line' | 'area' | 'bar' | 'donut' | 'heatmap'; height: number; options: object; series: unknown[] }) {
    return (
        <Suspense fallback={<Skeleton className="w-full" style={{ height: props.height }} />}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ReactApexChart type={props.type} height={props.height} options={props.options as any} series={props.series as any} />
        </Suspense>
    );
}

// ─── Building blocks ──────────────────────────────────────────────────────────

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
    return <div className={cn('animate-pulse rounded-lg bg-muted', className)} style={style} />;
}

export function Kpi({
    label,
    value,
    change,
    hint,
    icon: Icon,
    href,
    loading,
    invert,
}: {
    label: string;
    value: string;
    change?: number | null;
    hint?: string;
    icon?: React.ElementType;
    href?: string;
    loading?: boolean;
    /** For costs: an increase is bad. */
    invert?: boolean;
}) {
    const good = change == null ? null : invert ? change <= 0 : change >= 0;
    const inner = (
        <div className={cn('flex h-full flex-col rounded-xl border border-border bg-card p-4 transition', href && 'hover:border-primary/40 hover:shadow-sm')}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-snug font-semibold text-muted-foreground">{label}</p>
                {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
            {loading ? <Skeleton className="mt-2 h-7 w-24" /> : <p className="mt-1.5 text-2xl leading-none font-extrabold tracking-tight tabular-nums">{value}</p>}
            {(change != null || hint) && !loading && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {change != null && (
                        <span
                            className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
                                good ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                            )}
                        >
                            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(change)}%
                        </span>
                    )}
                    {hint && <span className="text-muted-foreground">{hint}</span>}
                </div>
            )}
        </div>
    );
    return href ? (
        <Link href={href} className="block h-full">
            {inner}
        </Link>
    ) : (
        inner
    );
}

export function Panel({ title, subtitle, href, children, className, action }: { title: string; subtitle?: string; href?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
    return (
        <section className={cn('min-w-0 rounded-xl border border-border bg-card', className)}>
            <header className="flex items-start justify-between gap-2 px-4 pt-4">
                <div className="min-w-0">
                    <h3 className="text-sm font-bold">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {action}
                    {href && (
                        <Link href={href} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Open">
                            <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                    )}
                </div>
            </header>
            <div className="px-3 pt-2 pb-3">{children}</div>
        </section>
    );
}

export function Empty({ text = 'No data for this period yet.', height = 160 }: { text?: string; height?: number }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground" style={{ minHeight: height }}>
            <Inbox className="h-6 w-6 opacity-50" />
            {text}
        </div>
    );
}

export function RankList({ rows, valueLabel }: { rows: { label: string; sub?: string | null; value: string; share?: number }[]; valueLabel?: string }) {
    if (!rows.length) return <Empty />;
    return (
        <ul className="divide-y divide-border px-1">
            {valueLabel && (
                <li className="flex justify-between pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <span>Item</span>
                    <span>{valueLabel}</span>
                </li>
            )}
            {rows.map((r, i) => (
                <li key={i} className="py-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                            <span className="mr-2 text-xs font-bold text-muted-foreground">{i + 1}</span>
                            <span className="font-medium">{r.label}</span>
                            {r.sub && <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{r.value}</span>
                    </div>
                    {r.share != null && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, Math.min(100, r.share))}%` }} />
                        </div>
                    )}
                </li>
            ))}
        </ul>
    );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface BranchOption {
    id: number;
    name: string;
    code: string;
    business_type: string;
    is_active: boolean;
}

export function BranchFilter({ branches, selected, onChange }: { branches: BranchOption[]; selected: number | null; onChange: (id: number | null) => void }) {
    const [open, setOpen] = useState(false);
    const current = selected ? branches.find((b) => b.id === selected) : null;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('h-9 min-w-40 justify-between gap-2 text-sm font-normal', selected && 'border-primary/50 bg-primary/5 text-primary')}>
                    <span className="flex min-w-0 items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{current?.name ?? 'All branches'}</span>
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1.5" align="end">
                <button
                    onClick={() => {
                        onChange(null);
                        setOpen(false);
                    }}
                    className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent', selected === null && 'bg-primary/10 font-semibold text-primary')}
                >
                    <LayoutGrid className="h-3.5 w-3.5 opacity-50" /> All branches
                </button>
                <div className="my-1 border-t border-border" />
                {branches.map((b) => (
                    <button
                        key={b.id}
                        onClick={() => {
                            onChange(b.id);
                            setOpen(false);
                        }}
                        className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent',
                            selected === b.id && 'bg-primary/10 font-semibold text-primary',
                            !b.is_active && 'opacity-50',
                        )}
                    >
                        <span className="truncate">{b.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}

export function DateFilter({ applied, onApply }: { applied: DateRange | undefined; onApply: (r: DateRange | undefined) => void }) {
    const [temp, setTemp] = useState<DateRange | undefined>(applied);
    const [open, setOpen] = useState(false);
    const presets = [
        { label: 'Today', fn: () => manilaRange.today() },
        { label: 'This week', fn: () => manilaRange.thisWeek() },
        { label: 'This month', fn: () => manilaRange.thisMonth() },
        { label: 'Last month', fn: () => manilaRange.lastMonth() },
        { label: 'Last 90 days', fn: () => manilaRange.last90Days() },
    ];
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 min-w-48 justify-start gap-2 text-sm font-normal">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                        {applied?.from ? (applied.to ? `${format(applied.from, 'MMM d')} – ${format(applied.to, 'MMM d, yyyy')}` : format(applied.from, 'MMM d, yyyy')) : 'Select dates'}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
                <div className="flex flex-wrap gap-1 border-b p-3">
                    {presets.map((p) => (
                        <button
                            key={p.label}
                            onClick={() => {
                                const r = p.fn();
                                setTemp(r);
                                onApply(r);
                                setOpen(false);
                            }}
                            className="h-7 rounded-full bg-muted px-3 text-xs font-medium hover:bg-primary hover:text-primary-foreground"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <Calendar mode="range" selected={temp} onSelect={setTemp} numberOfMonths={1} />
                <div className="flex justify-end gap-2 border-t p-3">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            onApply(temp);
                            setOpen(false);
                        }}
                    >
                        Apply
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
