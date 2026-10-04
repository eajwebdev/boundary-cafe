'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { usePage, Link } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import ReactApexChart from 'react-apexcharts';
import { fmtDate, manilaNow, toDateStr, manilaRange, manilaFmt } from '@/lib/date';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';

import {
    ShoppingCart,
    TrendingUp,
    TrendingDown,
    Package,
    PiggyBank,
    Receipt,
    BarChart2,
    AlertTriangle,
    Users,
    CheckCircle2,
    Calendar as CalendarIcon,
    ArrowUpRight,
    ArrowDownRight,
    RefreshCw,
    Banknote,
    ClipboardList,
    PackageCheck,
    Building2,
    ChevronDown,
    Wallet,
    ChevronRight,
    CircleDot,
    LayoutGrid,
    Download,
    ExternalLink,
    Zap,
    PackageX,
    Clock,
    Activity,
    DollarSign,
    TrendingUp as TUp,
    Scale,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BranchOption {
    id: number;
    name: string;
    code: string;
    business_type: string;
    is_active: boolean;
    feature_flags: Record<string, boolean>;
}
interface PageProps {
    auth: {
        user: {
            id: number;
            fname: string;
            lname: string;
            full_name: string;
            role: string;
            role_label: string;
            access: string[];
            is_super_admin: boolean;
            is_administrator: boolean;
            is_manager: boolean;
            is_cashier: boolean;
            is_admin: boolean;
            branch_id: number | null;
            branch: BranchOption | null;
        } | null;
    };
    settings: Record<string, unknown> | null;
    branches: BranchOption[];
    [key: string]: unknown;
}

interface DashData {
    kpis: {
        revenue: number;
        revenue_change: number | null;
        expenses: number;
        expenses_change: number | null;
        net_income: number;
        net_income_change: number | null;
        transactions: number;
        txn_change: number | null;
        avg_daily: number;
        void_count: number;
        void_total: number;
        discount_total: number;
        stock_loss_value: number;
        credit_collected?: number;
        credit_outstanding?: number;
        physical_cash?: number;
        expected_cash_drawer?: number;
        expected_gcash?: number;
        accounts_payable?: number;
        over_short?: number;
        active_sessions_count?: number;
        pending_orders_count?: number;
    };
    daily_sales: { date: string; revenue: number; expenses: number; transactions: number; discounts: number }[];
    hourly_sales: { hour: number; label: string; revenue: number; transactions: number }[];
    payment_mix: { method: string; count: number | null; revenue: number }[];
    top_products: { name: string; revenue: number; qty_sold: number }[];
    stock_health: { inStock: number; lowStock: number; outStock: number };
    low_stock_items: { name: string; stock: number; status: string }[];
    exp_by_category: { category: string; total: number }[];
    stock_adj: { type: string; count: number; qty: number; value: number }[];
    recent_sales: {
        id: number;
        receipt_number: string;
        total: number;
        payment_method: string;
        status: string;
        cashier: string;
        created_at: string;
    }[];
    recent_sessions: {
        id: number;
        cashier: string;
        opened_at: string;
        closed_at: string | null;
        opening_cash: number;
        expected_cash: number;
        counted_cash: number | null;
        over_short: number | null;
        status: string;
    }[];
    pending_orders: { id: number; order_number: string; supplier: string; total: number; status: string; created_at: string }[];
    system_overview: { branch_count: number; user_count: number; product_count: number; pending_orders: number } | null;
    period: { from: string; to: string; days: number };
    generated_at: string;
}

// ─── Branch / business type meta ─────────────────────────────────────────────
const branchMeta: Record<string, { label: string; color: string }> = {
    cafe: { label: 'Cafe', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    retail: { label: 'Retail', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    restaurant: { label: 'Restaurant', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    mixed: { label: 'Mixed', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
};

// ─── Formatting helpers ───────────────────────────────────────────────────────
function fmtMoney(n: number, compact = false): string {
    const isNeg = n < 0;
    const abs = Math.abs(n);
    if (compact) {
        if (abs >= 1_000_000) return `${isNeg ? '-' : ''}PHP ${(abs / 1_000_000).toFixed(1)}M`;
        if (abs >= 10_000) return `${isNeg ? '-' : ''}PHP ${(abs / 1_000).toFixed(0)}k`;
        if (abs >= 1_000) return `${isNeg ? '-' : ''}PHP ${(abs / 1_000).toFixed(1)}k`;
        if (abs === 0) return 'PHP 0';
        if (Number.isInteger(abs)) return `${isNeg ? '-' : ''}PHP ${abs.toLocaleString('en-PH')}`;
        return `${isNeg ? '-' : ''}PHP ${abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${isNeg ? '-' : ''}PHP ${abs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number): string {
    return n.toLocaleString('en-PH');
}
function fmtActivity(iso: string): string {
    return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Chart colours ────────────────────────────────────────────────────────────
function useChartColors(isDark: boolean) {
    return useMemo(
        () => ({
            c1: isDark ? '#818cf8' : '#4f46e5',
            c2: isDark ? '#4ade80' : '#16a34a',
            c3: isDark ? '#fbbf24' : '#d97706',
            c4: isDark ? '#38bdf8' : '#0284c7',
            c5: isDark ? '#f87171' : '#dc2626',
            c6: isDark ? '#a78bfa' : '#7c3aed',
            muted: isDark ? '#6b7280' : '#9ca3af',
            gridLine: isDark ? 'rgba(75,85,99,0.18)' : 'rgba(229,231,235,0.5)',
            bg: isDark ? '#1f2937' : '#ffffff',
        }),
        [isDark],
    );
}

function baseOpts(c: ReturnType<typeof useChartColors>, isDark: boolean) {
    return {
        chart: { fontFamily: 'Inter, sans-serif', toolbar: { show: false }, background: 'transparent', animations: { enabled: true, speed: 400 } },
        grid: { borderColor: c.gridLine, strokeDashArray: 3, padding: { left: 2, right: 4, top: -8 } },
        xaxis: { labels: { style: { colors: c.muted, fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { colors: c.muted, fontSize: '10px' } } },
        tooltip: { theme: isDark ? 'dark' : 'light' },
        legend: { labels: { colors: c.muted }, position: 'top' as const, fontSize: '11px', horizontalAlign: 'right' as const },
    };
}

// ─── Stat Card Item (Simsoft & CC-Dashboard Uniform Design) ───────────────────
interface StatCardItem {
    key: string;
    label: string;
    subtitle: string;
    value: string | number;
    icon: React.ElementType;
    iconClass: string;
    subClass: string;
    barClass: string;
    trackClass: string;
    sparkColor: string;
    sparkPath: string;
    sparkArea: string;
    sparkDotX: number;
    sparkDotY: number;
    footerLabel: string;
    footerVal: string;
    percent?: number;
    href?: string;
    rawNumeric?: number;
}

function StatCard({ card, loading }: { card: StatCardItem; loading?: boolean }) {
    const isPhp = typeof card.value === 'string' && (card.value.startsWith('PHP ') || card.value.startsWith('-PHP '));
    const isNegative = typeof card.value === 'string' && card.value.startsWith('-PHP ');
    const displayVal = isPhp ? (isNegative ? '-' + card.value.slice(5) : card.value.slice(4)) : card.value;
    const fullTooltip = card.rawNumeric !== undefined ? fmtMoney(card.rawNumeric) : card.value;

    const inner = (
        <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-3.5">
            <div>
                <div className="flex min-h-[30px] items-start justify-between gap-1.5">
                    <span
                        className="line-clamp-2 text-[10px] leading-tight font-bold tracking-wide text-muted-foreground uppercase sm:text-[11px]"
                        title={card.label}
                    >
                        {card.label}
                    </span>
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', card.iconClass)}>
                        <card.icon className="h-3.5 w-3.5" />
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1 leading-none tracking-tight tabular-nums" title={fullTooltip}>
                            {isPhp && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground select-none">PHP</span>}
                            <span className="truncate text-base font-extrabold text-foreground sm:text-lg lg:text-xl">
                                {loading ? '—' : displayVal}
                            </span>
                        </div>
                        <p className={cn('mt-1 truncate text-[9px] font-bold tracking-wider uppercase sm:text-[10px]', card.subClass)}>
                            {card.subtitle}
                        </p>
                    </div>

                    <div className="flex h-6 w-11 shrink-0 items-center justify-end opacity-90 transition-opacity group-hover:opacity-100 sm:h-7 sm:w-13">
                        <svg className="h-full w-full" viewBox="0 0 72 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d={card.sparkArea} fill={card.sparkColor} fillOpacity="0.2" />
                            <path d={card.sparkPath} stroke={card.sparkColor} strokeWidth="2" strokeLinecap="round" />
                            <circle cx={card.sparkDotX} cy={card.sparkDotY} r="2.5" fill={card.sparkColor} />
                        </svg>
                    </div>
                </div>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-border/60 pt-2">
                <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px]">
                    <span className="truncate text-muted-foreground">{card.footerLabel}</span>
                    <span className={cn('shrink-0 font-bold', card.subClass)}>{card.footerVal}</span>
                </div>
                <div className={cn('h-1.5 w-full overflow-hidden rounded-full', card.trackClass)}>
                    <div
                        className={cn('h-full rounded-full transition-all duration-300', card.barClass)}
                        style={{ width: `${card.percent ?? 75}%` }}
                    />
                </div>
            </div>
        </div>
    );

    return card.href ? (
        <Link href={card.href} className="block h-full">
            {inner}
        </Link>
    ) : (
        inner
    );
}

// ─── KPI card (System Overview) ───────────────────────────────────────────────
const kpiAccentStyles = {
    indigo: { icon: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400', bar: 'bg-indigo-500' },
    green: { icon: 'bg-green-50  text-green-600  dark:bg-green-950/50  dark:text-green-400', bar: 'bg-green-500' },
    amber: { icon: 'bg-amber-50  text-amber-600  dark:bg-amber-950/50  dark:text-amber-400', bar: 'bg-amber-500' },
    red: { icon: 'bg-red-50    text-red-600    dark:bg-red-950/50    dark:text-red-400', bar: 'bg-red-500' },
    sky: { icon: 'bg-sky-50    text-sky-600    dark:bg-sky-950/50    dark:text-sky-400', bar: 'bg-sky-500' },
    purple: { icon: 'bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400', bar: 'bg-purple-500' },
};

function KpiCard({
    title,
    value,
    sub,
    change,
    icon: Icon,
    accent = 'indigo',
    href,
    loading,
}: {
    title: string;
    value: string | number;
    sub?: string;
    change?: number | null;
    icon: React.ElementType;
    accent?: keyof typeof kpiAccentStyles;
    href?: string;
    loading?: boolean;
}) {
    const style = kpiAccentStyles[accent] || kpiAccentStyles.indigo;
    const inner = (
        <div
            className={cn(
                'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-200',
                href && 'cursor-pointer hover:border-primary/30 hover:shadow-md',
                loading && 'animate-pulse',
            )}
        >
            <div className={cn('absolute top-0 right-0 left-0 h-0.5 opacity-60', style.bar)} />
            <div className="mb-2.5 flex items-start justify-between gap-2">
                <p className="pr-1 text-xs leading-snug font-medium text-muted-foreground">{title}</p>
                <div className={cn('shrink-0 rounded-lg p-1.5', style.icon)}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
            </div>
            <p className="flex-1 text-2xl leading-none font-bold tracking-tight text-foreground tabular-nums">{loading ? '—' : value}</p>
            {((change !== undefined && change !== null) || sub) && (
                <div className="mt-2 flex min-h-[22px] flex-wrap items-center gap-1.5">
                    {change !== undefined && change !== null && (
                        <span
                            className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                                change >= 0
                                    ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400'
                                    : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
                            )}
                        >
                            {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(change)}% vs prev period
                        </span>
                    )}
                    {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
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

// ─── Chart card ───────────────────────────────────────────────────────────────
function ChartCard({
    title,
    subtitle,
    href,
    children,
    className,
    action,
}: {
    title: string;
    subtitle?: string;
    href?: string;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <Card className={cn('overflow-hidden rounded-xl border-border', className)}>
            <div className="flex items-start justify-between gap-2 px-5 pt-4 pb-0">
                <div className="min-w-0">
                    <p className="text-sm leading-tight font-semibold text-foreground">{title}</p>
                    {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {action}
                    {href && (
                        <Link href={href}>
                            <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                        </Link>
                    )}
                </div>
            </div>
            <CardContent className="px-3 pt-1 pb-3">{children}</CardContent>
        </Card>
    );
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{children}</h3>
            {action}
        </div>
    );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
        completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        voided: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        open: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        short: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        over: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        balanced: 'bg-muted text-muted-foreground',
        low: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        out: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
        <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize', map[status] ?? 'bg-muted text-muted-foreground')}>
            {status}
        </span>
    );
}

// ─── List row ─────────────────────────────────────────────────────────────────
function ListRow({ children, last }: { children: React.ReactNode; last?: boolean }) {
    return <div className={cn('flex items-center gap-3 py-2.5', !last && 'border-b border-border/50')}>{children}</div>;
}

// ─── Branch filter ────────────────────────────────────────────────────────────
function BranchFilter({
    branches,
    selected,
    onChange,
}: {
    branches: BranchOption[];
    selected: number | null;
    onChange: (id: number | null) => void;
}) {
    const [open, setOpen] = useState(false);
    const current = selected ? branches.find((b) => b.id === selected) : null;
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-8 min-w-[160px] justify-between gap-2 text-sm font-normal',
                        selected && 'border-primary/50 bg-primary/5 text-primary',
                    )}
                >
                    <div className="flex min-w-0 items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{current?.name ?? 'All branches'}</span>
                    </div>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1.5 shadow-xl" align="end">
                <p className="px-2 pt-1 pb-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Branch</p>
                <button
                    onClick={() => {
                        onChange(null);
                        setOpen(false);
                    }}
                    className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent',
                        selected === null ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground',
                    )}
                >
                    <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="flex-1">All branches</span>
                </button>
                <div className="my-1.5 border-t border-border" />
                {branches.map((b) => {
                    const meta = branchMeta[b.business_type] ?? { label: b.business_type, color: '' };
                    return (
                        <button
                            key={b.id}
                            onClick={() => {
                                onChange(b.id);
                                setOpen(false);
                            }}
                            className={cn(
                                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent',
                                selected === b.id ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground',
                                !b.is_active && 'opacity-40',
                            )}
                        >
                            <CircleDot className={cn('h-3.5 w-3.5 shrink-0', b.is_active ? 'text-green-500' : 'text-muted-foreground')} />
                            <div className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{b.name}</span>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
                                    <span className={cn('rounded-sm px-1 py-0.5 text-[9px] font-bold', meta.color)}>{meta.label}</span>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </PopoverContent>
        </Popover>
    );
}

// ─── Date filter ──────────────────────────────────────────────────────────────
function DateFilter({ applied, onApply }: { applied: DateRange | undefined; onApply: (r: DateRange | undefined) => void }) {
    const [temp, setTemp] = useState<DateRange | undefined>(applied);
    const presets = [
        { label: 'Today', fn: () => manilaRange.today() },
        { label: 'This week', fn: () => manilaRange.thisWeek() },
        { label: 'This month', fn: () => manilaRange.thisMonth() },
        { label: 'Last month', fn: () => manilaRange.lastMonth() },
        { label: 'Last 3 months', fn: () => manilaRange.last3Months() },
        { label: 'Last 90 days', fn: () => manilaRange.last90Days() },
    ];
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 min-w-[200px] justify-start gap-2 text-sm font-normal">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                        {applied?.from
                            ? applied.to
                                ? `${format(applied.from, 'MMM d')} – ${format(applied.to, 'MMM d, yyyy')}`
                                : format(applied.from, 'MMM d, yyyy')
                            : 'Select date range'}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 shadow-xl" align="end">
                <div className="flex flex-wrap gap-1 border-b p-3">
                    {presets.map((p) => (
                        <button
                            key={p.label}
                            onClick={() => {
                                const r = p.fn();
                                setTemp(r);
                                onApply(r);
                            }}
                            className="h-6 rounded-full bg-muted px-2.5 text-xs font-medium transition-colors hover:bg-primary hover:text-primary-foreground"
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <Calendar mode="range" selected={temp} onSelect={setTemp} numberOfMonths={2} />
                <div className="flex justify-end gap-2 border-t p-3">
                    <Button variant="ghost" size="sm" onClick={() => setTemp(applied)}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={() => onApply(temp)}>
                        Apply
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded bg-muted', className)} />;
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
    const { props } = usePage<PageProps>();
    const user = props.auth?.user;
    const access = user?.access ?? [];
    const branches = props.branches ?? [];
    const has = (id: string) => user?.is_super_admin || access.includes(id);

    const [isDark, setIsDark] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [data, setData] = useState<DashData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(manilaRange.thisMonth());

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Detect dark mode
    useEffect(() => {
        setMounted(true);
        const sync = () => setIsDark(document.documentElement.classList.contains('dark'));
        sync();
        const obs = new MutationObserver(sync);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);

    // Fetch data
    const fetchData = useCallback(async () => {
        const from = dateRange?.from ? toDateStr(dateRange.from) : toDateStr(manilaRange.thisMonth().from);
        const to = dateRange?.to ? toDateStr(dateRange.to) : toDateStr(manilaRange.thisMonth().to);
        const params = new URLSearchParams({ from, to });
        if (selectedBranchId) params.set('branch_id', String(selectedBranchId));
        try {
            const res = await fetch(`/dashboard/data?${params}`, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
            if (res.ok) {
                setData(await res.json());
                setLastRefresh(new Date());
            }
        } catch {
        } finally {
            setLoading(false);
        }
    }, [dateRange, selectedBranchId]);

    // Initial + filter change
    useEffect(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);

    // Auto-refresh every 60 seconds
    useEffect(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (autoRefresh) {
            intervalRef.current = setInterval(() => {
                fetchData();
            }, 60_000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [autoRefresh, fetchData]);

    const colors = useChartColors(isDark);
    const opts = useMemo(() => baseOpts(colors, isDark), [colors, isDark]);

    if (!mounted || !user)
        return (
            <AdminLayout>
                <div className="min-h-screen animate-pulse bg-background" />
            </AdminLayout>
        );

    const greet = () => {
        const h = manilaNow().getHours();
        return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    };
    const selectedBranch = selectedBranchId ? (branches.find((b) => b.id === selectedBranchId) ?? null) : null;
    const isAdmin = user.is_super_admin || user.is_administrator;
    const isManager = user.is_manager;

    // ── Chart series derived from data ────────────────────────────────────────
    const dailyDates = data?.daily_sales.map((d) => fmtDate(d.date + 'T00:00:00+08:00', 'MMM d')) ?? [];
    const dailyRevenue = data?.daily_sales.map((d) => d.revenue) ?? [];
    const dailyExpenses = data?.daily_sales.map((d) => d.expenses) ?? [];
    const dailyTxns = data?.daily_sales.map((d) => d.transactions) ?? [];

    const hourlyLabels = data?.hourly_sales.map((h) => h.label) ?? [];
    const hourlyRevenue = data?.hourly_sales.map((h) => h.revenue) ?? [];

    const paymentLabels =
        data?.payment_mix.map((p) => (p.method === 'credit_payments' ? 'Credit payments' : p.method.charAt(0).toUpperCase() + p.method.slice(1))) ??
        [];
    const paymentCounts = data?.payment_mix.map((p) => p.count) ?? [];
    const paymentRevenue = data?.payment_mix.map((p) => p.revenue) ?? [];

    const topNames = data?.top_products.slice(0, 8).map((p) => p.name) ?? [];
    const topRevenue = data?.top_products.slice(0, 8).map((p) => p.revenue) ?? [];
    const topQty = data?.top_products.slice(0, 8).map((p) => p.qty_sold) ?? [];

    const expCatLabels = data?.exp_by_category.map((e) => e.category) ?? [];
    const expCatValues = data?.exp_by_category.map((e) => e.total) ?? [];

    const stockAdjLabels = data?.stock_adj.map((a) => a.type.charAt(0).toUpperCase() + a.type.slice(1)) ?? [];
    const stockAdjValues = data?.stock_adj.map((a) => a.value) ?? [];

    // ── Chart options ─────────────────────────────────────────────────────────
    const areaOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'area-revenue', type: 'area' as const },
        colors: [colors.c1, colors.c5],
        stroke: { curve: 'smooth' as const, width: [3, 2] },
        fill: { type: 'gradient', gradient: { shadeIntensity: 0, opacityFrom: 0.25, opacityTo: 0.0, stops: [0, 100] } },
        xaxis: { ...opts.xaxis, categories: dailyDates, tickAmount: Math.min(dailyDates.length, 10) },
        yaxis: { ...opts.yaxis, labels: { ...opts.yaxis.labels, formatter: (v: number) => fmtMoney(v, true) } },
        dataLabels: { enabled: false },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const txnBarOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'bar-txns', type: 'bar' as const },
        colors: [colors.c4],
        plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
        xaxis: { ...opts.xaxis, categories: dailyDates, tickAmount: Math.min(dailyDates.length, 10) },
        dataLabels: { enabled: false },
        yaxis: { ...opts.yaxis, labels: { ...opts.yaxis.labels, formatter: (v: number) => fmtNum(v) } },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => `${v} txns` } },
    };

    const hourlyOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'bar-hourly', type: 'bar' as const },
        colors: [colors.c1],
        plotOptions: { bar: { borderRadius: 5, columnWidth: '58%' } },
        xaxis: { ...opts.xaxis, categories: hourlyLabels },
        yaxis: { ...opts.yaxis, labels: { ...opts.yaxis.labels, formatter: (v: number) => fmtMoney(v, true) } },
        dataLabels: { enabled: false },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const payCountOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'donut-pay-count', type: 'donut' as const },
        labels: paymentLabels,
        colors: [colors.c1, colors.c4, colors.c3, colors.c6],
        legend: { ...opts.legend, position: 'bottom' as const },
        plotOptions: {
            pie: { donut: { size: '65%', labels: { show: true, total: { show: true, label: 'Txns', fontSize: '11px', color: colors.muted } } } },
        },
        dataLabels: { enabled: false },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => `${v} txns` } },
    };

    const payRevOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'donut-pay-rev', type: 'donut' as const },
        labels: paymentLabels,
        colors: [colors.c1, colors.c4, colors.c3, colors.c6],
        legend: { ...opts.legend, position: 'bottom' as const },
        plotOptions: {
            pie: {
                donut: {
                    size: '65%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Revenue',
                            fontSize: '11px',
                            color: colors.muted,
                            formatter: () =>
                                fmtMoney(
                                    paymentRevenue.reduce((a, b) => a + b, 0),
                                    true,
                                ),
                        },
                    },
                },
            },
        },
        dataLabels: { enabled: false },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const topProductsOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'bar-top-products', type: 'bar' as const },
        colors: [colors.c2],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '52%' } },
        xaxis: { ...opts.xaxis, categories: topNames, labels: { ...opts.xaxis.labels, formatter: (v: number) => fmtMoney(v, true) } },
        yaxis: { labels: { style: { colors: colors.muted, fontSize: '10px' } } },
        dataLabels: { enabled: false },
        grid: { ...opts.grid, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const stockHealthOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'donut-stock', type: 'donut' as const },
        labels: ['In stock', 'Low stock', 'Out of stock'],
        colors: [colors.c2, colors.c3, colors.c5],
        legend: { ...opts.legend, position: 'bottom' as const },
        plotOptions: {
            pie: { donut: { size: '70%', labels: { show: true, total: { show: true, label: 'Products', fontSize: '11px', color: colors.muted } } } },
        },
        dataLabels: { enabled: false },
    };

    const expCatOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'bar-exp-cat', type: 'bar' as const },
        colors: [colors.c5],
        plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '52%' } },
        xaxis: { ...opts.xaxis, categories: expCatLabels, labels: { ...opts.xaxis.labels, formatter: (v: number) => fmtMoney(v, true) } },
        yaxis: { labels: { style: { colors: colors.muted, fontSize: '10px' } } },
        dataLabels: { enabled: false },
        grid: { ...opts.grid, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const stockAdjOpts = {
        ...opts,
        chart: { ...opts.chart, id: 'bar-adj', type: 'bar' as const },
        colors: [colors.c3],
        plotOptions: { bar: { borderRadius: 5, columnWidth: '55%', distributed: true } },
        xaxis: { ...opts.xaxis, categories: stockAdjLabels },
        yaxis: { ...opts.yaxis, labels: { ...opts.yaxis.labels, formatter: (v: number) => fmtMoney(v, true) } },
        dataLabels: { enabled: false },
        legend: { show: false },
        tooltip: { ...opts.tooltip, y: { formatter: (v: number) => fmtMoney(v) } },
    };

    const kpis = data?.kpis;

    const statCards: StatCardItem[] = [
        {
            key: 'sales',
            label: 'Total Sales',
            subtitle: 'REVENUE',
            value: kpis ? fmtMoney(kpis.revenue, true) : '—',
            rawNumeric: kpis?.revenue,
            icon: ShoppingCart,
            iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            subClass: 'text-emerald-600 dark:text-emerald-400',
            barClass: 'bg-emerald-500',
            trackClass: 'bg-emerald-500/15',
            sparkColor: '#10b981',
            sparkPath: 'M0 20 Q18 22 36 12 T72 6',
            sparkArea: 'M0 20 Q18 22 36 12 T72 6 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 6,
            footerLabel: 'Branch Sales',
            footerVal: 'Owned',
            percent: 85,
            href: has('19') ? '/reports/sales' : undefined,
        },
        {
            key: 'physical_cash',
            label: 'Physical Cash',
            subtitle: 'COLLECTIONS',
            value: kpis ? fmtMoney(kpis.physical_cash ?? 0, true) : '—',
            rawNumeric: kpis?.physical_cash,
            icon: Banknote,
            iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            subClass: 'text-blue-600 dark:text-blue-400',
            barClass: 'bg-blue-500',
            trackClass: 'bg-blue-500/15',
            sparkColor: '#3b82f6',
            sparkPath: 'M0 22 Q18 10 36 16 T72 8',
            sparkArea: 'M0 22 Q18 10 36 16 T72 8 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 8,
            footerLabel: 'Cash Share',
            footerVal: kpis && kpis.revenue > 0 ? `${Math.min(100, Math.round(((kpis.physical_cash ?? 0) / kpis.revenue) * 100))}%` : '0%',
            percent: kpis && kpis.revenue > 0 ? Math.min(100, Math.round(((kpis.physical_cash ?? 0) / kpis.revenue) * 100)) : 50,
            href: has('18') ? '/reports/daily' : undefined,
        },
        {
            key: 'cash_drawer',
            label: 'Cash Drawer',
            subtitle: 'DRAWER TOTAL',
            value: kpis ? fmtMoney(kpis.expected_cash_drawer ?? 0, true) : '—',
            rawNumeric: kpis?.expected_cash_drawer,
            icon: Wallet,
            iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
            subClass: 'text-indigo-600 dark:text-indigo-400',
            barClass: 'bg-indigo-500',
            trackClass: 'bg-indigo-500/15',
            sparkColor: '#6366f1',
            sparkPath: 'M0 16 Q18 18 36 10 T72 4',
            sparkArea: 'M0 16 Q18 18 36 10 T72 4 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 4,
            footerLabel: 'Active Registers',
            footerVal: `${kpis?.active_sessions_count ?? 0} Shift${(kpis?.active_sessions_count ?? 0) !== 1 ? 's' : ''}`,
            percent: 70,
            href: '/cashier-sessions',
        },
        {
            key: 'gcash',
            label: 'GCash / E-Wallet',
            subtitle: 'DIGITAL PAY',
            value: kpis ? fmtMoney(kpis.expected_gcash ?? 0, true) : '—',
            rawNumeric: kpis?.expected_gcash,
            icon: Zap,
            iconClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
            subClass: 'text-sky-600 dark:text-sky-400',
            barClass: 'bg-sky-500',
            trackClass: 'bg-sky-500/15',
            sparkColor: '#0ea5e9',
            sparkPath: 'M0 18 Q18 24 36 14 T72 10',
            sparkArea: 'M0 18 Q18 24 36 14 T72 10 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 10,
            footerLabel: 'Digital Share',
            footerVal: kpis && kpis.revenue > 0 ? `${Math.min(100, Math.round(((kpis.expected_gcash ?? 0) / kpis.revenue) * 100))}%` : '0%',
            percent: kpis && kpis.revenue > 0 ? Math.min(100, Math.round(((kpis.expected_gcash ?? 0) / kpis.revenue) * 100)) : 30,
            href: has('19') ? '/reports/sales' : undefined,
        },
        {
            key: 'expenses',
            label: 'Total Expenses',
            subtitle: 'OUTFLOW',
            value: kpis ? fmtMoney(kpis.expenses, true) : '—',
            rawNumeric: kpis?.expenses,
            icon: TrendingDown,
            iconClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
            subClass: 'text-red-600 dark:text-red-400',
            barClass: 'bg-red-500',
            trackClass: 'bg-red-500/15',
            sparkColor: '#ef4444',
            sparkPath: 'M0 12 Q18 20 36 14 T72 22',
            sparkArea: 'M0 12 Q18 20 36 14 T72 22 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 22,
            footerLabel: 'Exp vs Sales',
            footerVal: kpis && kpis.revenue > 0 ? `${Math.min(100, Math.round(((kpis.expenses ?? 0) / kpis.revenue) * 100))}%` : '0%',
            percent: kpis && kpis.revenue > 0 ? Math.min(100, Math.round(((kpis.expenses ?? 0) / kpis.revenue) * 100)) : 25,
            href: has('21') ? '/reports/expenses' : undefined,
        },
        {
            key: 'accounts_payable',
            label: 'Accounts Payable',
            subtitle: 'DUE TO PAY',
            value: kpis ? fmtMoney(kpis.accounts_payable ?? 0, true) : '—',
            rawNumeric: kpis?.accounts_payable,
            icon: Receipt,
            iconClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
            subClass: 'text-orange-600 dark:text-orange-400',
            barClass: 'bg-orange-500',
            trackClass: 'bg-orange-500/15',
            sparkColor: '#f97316',
            sparkPath: 'M0 24 Q18 14 36 20 T72 6',
            sparkArea: 'M0 24 Q18 14 36 20 T72 6 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 6,
            footerLabel: 'Suppliers',
            footerVal: 'Unsettled',
            percent: 45,
            href: '/purchase-orders',
        },
        {
            key: 'receivables',
            label: 'Receivables',
            subtitle: 'UNPAID CREDIT',
            value: kpis ? fmtMoney(kpis.credit_outstanding ?? 0, true) : '—',
            rawNumeric: kpis?.credit_outstanding,
            icon: Clock,
            iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            subClass: 'text-amber-600 dark:text-amber-400',
            barClass: 'bg-amber-500',
            trackClass: 'bg-amber-500/15',
            sparkColor: '#f59e0b',
            sparkPath: 'M0 14 Q18 8 36 16 T72 12',
            sparkArea: 'M0 14 Q18 8 36 16 T72 12 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 12,
            footerLabel: 'Customer Credit',
            footerVal: 'Due',
            percent: 60,
            href: has('39') ? '/customers' : undefined,
        },
        {
            key: 'over_short',
            label: 'Cash Over / Short',
            subtitle: (kpis?.over_short ?? 0) < 0 ? 'SHORTAGE' : (kpis?.over_short ?? 0) > 0 ? 'SURPLUS' : 'BALANCED',
            value: fmtMoney(Math.abs(kpis?.over_short ?? 0), true),
            rawNumeric: kpis?.over_short,
            icon: Scale,
            iconClass:
                (kpis?.over_short ?? 0) < 0
                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                    : (kpis?.over_short ?? 0) > 0
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
            subClass:
                (kpis?.over_short ?? 0) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : (kpis?.over_short ?? 0) > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground',
            barClass: (kpis?.over_short ?? 0) < 0 ? 'bg-red-500' : 'bg-emerald-500',
            trackClass: (kpis?.over_short ?? 0) < 0 ? 'bg-red-500/15' : 'bg-emerald-500/15',
            sparkColor: (kpis?.over_short ?? 0) < 0 ? '#ef4444' : '#10b981',
            sparkPath: 'M0 14 Q18 14 36 14 T72 14',
            sparkArea: 'M0 14 Q18 14 36 14 T72 14 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 14,
            footerLabel: 'Sessions Audited',
            footerVal: `${kpis?.active_sessions_count ?? 0} Recorded`,
            percent: 100,
            href: '/cashier-sessions',
        },
        {
            key: 'transactions',
            label: 'Total Transactions',
            subtitle: 'COMPLETED',
            value: fmtNum(kpis?.transactions ?? 0),
            rawNumeric: kpis?.transactions,
            icon: ShoppingCart,
            iconClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
            subClass: 'text-purple-600 dark:text-purple-400',
            barClass: 'bg-purple-500',
            trackClass: 'bg-purple-500/15',
            sparkColor: '#a855f7',
            sparkPath: 'M0 18 Q18 8 36 14 T72 6',
            sparkArea: 'M0 18 Q18 8 36 14 T72 6 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 6,
            footerLabel: 'Avg / Day',
            footerVal:
                data && data.period.days > 0 ? `${(Math.round(((kpis?.transactions ?? 0) / data.period.days) * 10) / 10).toFixed(1)}/day` : '0/day',
            percent: 85,
            href: has('3') ? '/sales/history' : undefined,
        },
        {
            key: 'voided',
            label: 'Voided Sales',
            subtitle: fmtMoney(kpis?.void_total ?? 0, true),
            value: `${fmtNum(kpis?.void_count ?? 0)} txns`,
            rawNumeric: kpis?.void_total,
            icon: ClipboardList,
            iconClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
            subClass: 'text-rose-600 dark:text-rose-400',
            barClass: 'bg-rose-500',
            trackClass: 'bg-rose-500/15',
            sparkColor: '#f43f5e',
            sparkPath: 'M0 20 Q18 24 36 16 T72 18',
            sparkArea: 'M0 20 Q18 24 36 16 T72 18 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 18,
            footerLabel: 'Void Rate',
            footerVal:
                kpis && kpis.transactions + (kpis.void_count ?? 0) > 0
                    ? `${(((kpis.void_count ?? 0) / (kpis.transactions + (kpis.void_count ?? 0))) * 100).toFixed(1)}%`
                    : '0%',
            percent:
                kpis && kpis.transactions + (kpis.void_count ?? 0) > 0
                    ? Math.min(100, Math.round(((kpis.void_count ?? 0) / (kpis.transactions + (kpis.void_count ?? 0))) * 100))
                    : 10,
            href: has('3') ? '/sales/history' : undefined,
        },
        {
            key: 'pending_orders',
            label: 'Pending Orders',
            subtitle: 'INBOUND PO',
            value: fmtNum(kpis?.pending_orders_count ?? 0),
            rawNumeric: kpis?.pending_orders_count,
            icon: Package,
            iconClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            subClass: 'text-blue-600 dark:text-blue-400',
            barClass: 'bg-blue-500',
            trackClass: 'bg-blue-500/15',
            sparkColor: '#3b82f6',
            sparkPath: 'M0 16 Q18 10 36 18 T72 12',
            sparkArea: 'M0 16 Q18 10 36 18 T72 12 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 12,
            footerLabel: 'Supplier POs',
            footerVal: `${kpis?.pending_orders_count ?? 0} Awaiting`,
            percent: 50,
            href: '/purchase-orders',
        },
        {
            key: 'stock_loss',
            label: 'Stock Loss Value',
            subtitle: 'INVENTORY LOSS',
            value: kpis ? fmtMoney(kpis.stock_loss_value, true) : '—',
            rawNumeric: kpis?.stock_loss_value,
            icon: PackageX,
            iconClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            subClass: 'text-amber-600 dark:text-amber-400',
            barClass: 'bg-amber-500',
            trackClass: 'bg-amber-500/15',
            sparkColor: '#f59e0b',
            sparkPath: 'M0 24 Q18 16 36 22 T72 14',
            sparkArea: 'M0 24 Q18 16 36 22 T72 14 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 14,
            footerLabel: 'Waste & Damage',
            footerVal: 'Audited',
            percent: 40,
            href: has('31') ? '/reports/stock-loss' : undefined,
        },
        {
            key: 'credit_collected',
            label: 'Credit Collected',
            subtitle: 'PAYMENTS IN',
            value: kpis ? fmtMoney(kpis.credit_collected ?? 0, true) : '—',
            rawNumeric: kpis?.credit_collected,
            icon: CheckCircle2,
            iconClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            subClass: 'text-emerald-600 dark:text-emerald-400',
            barClass: 'bg-emerald-500',
            trackClass: 'bg-emerald-500/15',
            sparkColor: '#10b981',
            sparkPath: 'M0 20 Q18 14 36 16 T72 8',
            sparkArea: 'M0 20 Q18 14 36 16 T72 8 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 8,
            footerLabel: 'Credit Cleared',
            footerVal: 'Settled',
            percent: 80,
            href: has('39') ? '/customers' : undefined,
        },
        {
            key: 'avg_daily',
            label: 'Avg Daily Revenue',
            subtitle: 'DAILY PACE',
            value: kpis ? fmtMoney(kpis.avg_daily, true) : '—',
            rawNumeric: kpis?.avg_daily,
            icon: Activity,
            iconClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
            subClass: 'text-indigo-600 dark:text-indigo-400',
            barClass: 'bg-indigo-500',
            trackClass: 'bg-indigo-500/15',
            sparkColor: '#6366f1',
            sparkPath: 'M0 16 Q18 20 36 12 T72 6',
            sparkArea: 'M0 16 Q18 20 36 12 T72 6 L72 28 L0 28 Z',
            sparkDotX: 72,
            sparkDotY: 6,
            footerLabel: 'Pace',
            footerVal: 'Tracking',
            percent: 75,
            href: has('18') ? '/reports/daily' : undefined,
        },
    ];

    return (
        <AdminLayout>
            <div className="w-full space-y-5 pb-10">
                {/* ── Page header ───────────────────────────────────────── */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">
                            {greet()}, {user.fname} 👋
                        </h1>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                            <span>{user.role_label}</span>
                            {!isAdmin && user.branch && (
                                <>
                                    <span className="text-border">·</span>
                                    <span className="font-medium text-foreground">{user.branch.name}</span>
                                    <span
                                        className={cn('rounded-sm px-1.5 py-0.5 text-[10px] font-bold', branchMeta[user.branch.business_type]?.color)}
                                    >
                                        {branchMeta[user.branch.business_type]?.label}
                                    </span>
                                </>
                            )}
                            {isAdmin && (
                                <>
                                    <span className="text-border">·</span>
                                    <span className="font-medium text-primary">
                                        {selectedBranch ? selectedBranch.name : `All ${branches.length} branch${branches.length !== 1 ? 'es' : ''}`}
                                    </span>
                                </>
                            )}
                            <span className="text-border">·</span>
                            <span>{manilaFmt('EEEE, MMM d, yyyy')}</span>
                        </p>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        {isAdmin && branches.length > 1 && (
                            <BranchFilter branches={branches} selected={selectedBranchId} onChange={setSelectedBranchId} />
                        )}
                        <DateFilter applied={dateRange} onApply={setDateRange} />

                        {/* Auto-refresh toggle */}
                        <button
                            onClick={() => setAutoRefresh((v) => !v)}
                            title={autoRefresh ? 'Auto-refresh ON (every 60s) — click to disable' : 'Auto-refresh OFF — click to enable'}
                            className={cn(
                                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                                autoRefresh
                                    ? 'border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400'
                                    : 'border-border text-muted-foreground hover:bg-muted',
                            )}
                        >
                            <Activity className="h-3.5 w-3.5" />
                            {autoRefresh ? 'Live' : 'Paused'}
                        </button>

                        <button
                            onClick={() => {
                                setLoading(true);
                                fetchData();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="Refresh now"
                        >
                            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                {/* Period + last refresh strip */}
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                    {data ? (
                        <span>
                            <span className="font-semibold text-foreground">
                                {fmtDate(data.period.from + 'T00:00:00+08:00', 'MMM d, yyyy')} –{' '}
                                {fmtDate(data.period.to + 'T00:00:00+08:00', 'MMM d, yyyy')}
                            </span>{' '}
                            · {Math.round(data.period.days)} day{Math.round(data.period.days) !== 1 ? 's' : ''}
                        </span>
                    ) : (
                        <Skeleton className="h-4 w-48" />
                    )}
                    <span className="ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {lastRefresh ? `Updated ${format(lastRefresh, 'h:mm:ss a')}` : 'Loading…'}
                        {autoRefresh && <span className="font-semibold text-green-500">· Live</span>}
                    </span>
                </div>

                {/* ── KPI cards (14 Uniform Cards) ─── */}
                <div className="space-y-3">
                    <SectionTitle>Key Performance Indicators — {data ? Math.round(data.period.days) : '—'}d period</SectionTitle>
                    <div className="grid grid-cols-2 gap-2.5 min-[1680px]:grid-cols-7 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-3.5 xl:grid-cols-5">
                        {statCards.map((card) => (
                            <StatCard key={card.key} card={card} loading={loading} />
                        ))}
                    </div>
                </div>

                {/* ── Revenue + Expenses area chart ─────────────────────── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <ChartCard
                        className="lg:col-span-2"
                        title="Revenue vs Expenses"
                        subtitle={`Daily trend · ${data ? Math.round(data.period.days) : '—'} days`}
                        href={has('19') ? '/reports/sales' : undefined}
                    >
                        {loading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                            <ReactApexChart
                                options={areaOpts as any}
                                series={[
                                    { name: 'Revenue', data: dailyRevenue },
                                    { name: 'Expenses', data: dailyExpenses },
                                ]}
                                type="area"
                                height={250}
                            />
                        )}
                    </ChartCard>

                    <ChartCard title="Daily Transactions" subtitle="Count per day">
                        {loading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : (
                            <ReactApexChart
                                options={txnBarOpts as any}
                                series={[{ name: 'Transactions', data: dailyTxns }]}
                                type="bar"
                                height={250}
                            />
                        )}
                    </ChartCard>
                </div>

                {/* ── Hourly sales (today) ──────────────────────────────── */}
                <ChartCard title="Today's Hourly Sales" subtitle="Revenue by hour (today only)">
                    {loading ? (
                        <Skeleton className="h-48 w-full" />
                    ) : (
                        <ReactApexChart options={hourlyOpts as any} series={[{ name: 'Revenue', data: hourlyRevenue }]} type="bar" height={200} />
                    )}
                </ChartCard>

                {/* ── Payment mix ───────────────────────────────────────── */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <ChartCard title="Payment Mix (Txns)" subtitle="By transaction count">
                        {loading ? (
                            <Skeleton className="h-52 w-full" />
                        ) : paymentCounts.length > 0 ? (
                            <ReactApexChart options={payCountOpts as any} series={paymentCounts} type="donut" height={220} />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
                        )}
                    </ChartCard>

                    <ChartCard title="Payment Mix (Revenue)" subtitle="By revenue share">
                        {loading ? (
                            <Skeleton className="h-52 w-full" />
                        ) : paymentRevenue.length > 0 ? (
                            <ReactApexChart options={payRevOpts as any} series={paymentRevenue} type="donut" height={220} />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">No data</p>
                        )}
                    </ChartCard>

                    <ChartCard title="Stock Health" subtitle="Products by availability" href={has('11') ? '/stock' : undefined}>
                        {loading ? (
                            <Skeleton className="h-52 w-full" />
                        ) : (
                            <ReactApexChart
                                options={stockHealthOpts as any}
                                series={[data?.stock_health.inStock ?? 0, data?.stock_health.lowStock ?? 0, data?.stock_health.outStock ?? 0]}
                                type="donut"
                                height={220}
                            />
                        )}
                    </ChartCard>

                    <ChartCard title="Stock Loss by Type" subtitle="Loss value this period" href={has('31') ? '/reports/stock-loss' : undefined}>
                        {loading ? (
                            <Skeleton className="h-52 w-full" />
                        ) : stockAdjValues.length > 0 ? (
                            <ReactApexChart
                                options={stockAdjOpts as any}
                                series={[{ name: 'Loss Value', data: stockAdjValues }]}
                                type="bar"
                                height={220}
                            />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">No losses recorded</p>
                        )}
                    </ChartCard>
                </div>

                {/* ── Top products + Expense categories ────────────────── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <ChartCard title="Top 8 Products by Revenue" subtitle="Best sellers this period" href={has('6') ? '/products' : undefined}>
                        {loading ? (
                            <Skeleton className="h-72 w-full" />
                        ) : topRevenue.length > 0 ? (
                            <ReactApexChart
                                options={topProductsOpts as any}
                                series={[{ name: 'Revenue', data: topRevenue }]}
                                type="bar"
                                height={280}
                            />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">No sales data</p>
                        )}
                    </ChartCard>

                    <ChartCard title="Expenses by Category" subtitle="Where money went this period" href={has('17') ? '/expenses' : undefined}>
                        {loading ? (
                            <Skeleton className="h-72 w-full" />
                        ) : expCatValues.length > 0 ? (
                            <ReactApexChart options={expCatOpts as any} series={[{ name: 'Amount', data: expCatValues }]} type="bar" height={280} />
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">No expenses recorded</p>
                        )}
                    </ChartCard>
                </div>

                {/* ── Low stock + recent transactions ───────────────────── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Low stock */}
                    <Card className="rounded-xl border-border">
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                                <div>
                                    <p className="text-sm font-semibold">Low &amp; Out of Stock</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        {data ? `${data.stock_health.lowStock + data.stock_health.outStock} items need attention` : '—'}
                                    </p>
                                </div>
                            </div>
                            {has('11') && (
                                <Link href="/stock" className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">
                                    Manage <ExternalLink className="ml-0.5 h-3 w-3" />
                                </Link>
                            )}
                        </div>
                        <CardContent className="px-5 pt-0 pb-4">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-1 h-8 w-full" />)
                            ) : data?.low_stock_items.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">All products well stocked 🎉</p>
                            ) : (
                                data?.low_stock_items.map((item, i, arr) => (
                                    <ListRow key={i} last={i === arr.length - 1}>
                                        <p className="flex-1 truncate text-sm">{item.name}</p>
                                        <span className="text-sm text-muted-foreground tabular-nums">{item.stock} left</span>
                                        <StatusBadge status={item.status} />
                                    </ListRow>
                                ))
                            )}
                        </CardContent>
                    </Card>

                    {/* Recent transactions */}
                    <Card className="rounded-xl border-border">
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                            <div>
                                <p className="text-sm font-semibold">Recent Transactions</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">Latest 10</p>
                            </div>
                            {has('3') && (
                                <Link href="/sales/history" className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">
                                    View all <ExternalLink className="ml-0.5 h-3 w-3" />
                                </Link>
                            )}
                        </div>
                        <CardContent className="px-5 pt-0 pb-4">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="mb-1 h-8 w-full" />)
                            ) : data?.recent_sales.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet</p>
                            ) : (
                                data?.recent_sales.map((s, i, arr) => (
                                    <ListRow key={s.id} last={i === arr.length - 1}>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{s.receipt_number}</p>
                                            <p className="text-[11px] text-muted-foreground">{fmtActivity(s.created_at)}</p>
                                        </div>
                                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground capitalize">
                                            {s.payment_method}
                                        </span>
                                        <span className="text-sm font-bold tabular-nums">{fmtMoney(s.total)}</span>
                                        <StatusBadge status={s.status} />
                                    </ListRow>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Cash sessions + purchase orders ───────────────────── */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {has('14') && (
                        <Card className="rounded-xl border-border">
                            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                                <div>
                                    <p className="text-sm font-semibold">Cash Sessions</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">Recent shifts</p>
                                </div>
                                <Link href="/cash-sessions" className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">
                                    All <ExternalLink className="ml-0.5 h-3 w-3" />
                                </Link>
                            </div>
                            <CardContent className="px-5 pt-0 pb-4">
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-8 w-full" />)
                                ) : data?.recent_sessions.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-muted-foreground">No sessions found</p>
                                ) : (
                                    data?.recent_sessions.map((s, i, arr) => {
                                        const overShort = s.over_short ?? (s.counted_cash !== null ? s.counted_cash - s.expected_cash : null);
                                        return (
                                            <ListRow key={s.id} last={i === arr.length - 1}>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">{s.cashier || '—'}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {s.opened_at ? fmtDate(s.opened_at, 'MMM d, h:mm a') : '—'}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-bold tabular-nums">{fmtMoney(s.expected_cash, true)}</span>
                                                {s.status === 'open' ? (
                                                    <span className="text-xs font-bold text-blue-500">● Live</span>
                                                ) : overShort !== null ? (
                                                    <span
                                                        className={cn(
                                                            'text-xs font-semibold tabular-nums',
                                                            overShort >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500',
                                                        )}
                                                    >
                                                        {overShort >= 0 ? '+' : ''}
                                                        {fmtMoney(overShort, true)}
                                                    </span>
                                                ) : null}
                                                <StatusBadge status={s.status} />
                                            </ListRow>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {has('12') && (
                        <Card className="rounded-xl border-border">
                            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                                <div>
                                    <p className="text-sm font-semibold">Pending Purchase Orders</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">Awaiting action</p>
                                </div>
                                <Link href="/purchase-orders" className="flex shrink-0 items-center gap-0.5 text-xs text-primary hover:underline">
                                    All <ExternalLink className="ml-0.5 h-3 w-3" />
                                </Link>
                            </div>
                            <CardContent className="px-5 pt-0 pb-4">
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="mb-1 h-8 w-full" />)
                                ) : data?.pending_orders.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-muted-foreground">No pending orders</p>
                                ) : (
                                    data?.pending_orders.map((o, i, arr) => (
                                        <ListRow key={o.id} last={i === arr.length - 1}>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">{o.order_number}</p>
                                                <p className="truncate text-[11px] text-muted-foreground">{o.supplier}</p>
                                            </div>
                                            <span className="text-sm font-bold tabular-nums">{fmtMoney(o.total, true)}</span>
                                            <StatusBadge status={o.status} />
                                        </ListRow>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* ── System overview (super admin only) ────────────────── */}
                {isAdmin && data?.system_overview && (
                    <div>
                        <SectionTitle>System Overview</SectionTitle>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <KpiCard
                                title="Active Branches"
                                value={fmtNum(data.system_overview.branch_count)}
                                icon={Building2}
                                accent="indigo"
                                href="/branches"
                            />
                            <KpiCard title="Total Users" value={fmtNum(data.system_overview.user_count)} icon={Users} accent="sky" href="/users" />
                            <KpiCard
                                title="Total Products"
                                value={fmtNum(data.system_overview.product_count)}
                                icon={Package}
                                accent="green"
                                href="/products"
                            />
                            <KpiCard
                                title="Pending Orders"
                                value={fmtNum(data.system_overview.pending_orders)}
                                icon={ClipboardList}
                                accent="amber"
                                href="/purchase-orders"
                            />
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
