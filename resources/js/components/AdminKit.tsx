import { usePage } from '@inertiajs/react';
import type React from 'react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

/**
 * Shared building blocks for back-office pages, following the Loyalty Program
 * layout: a compact header, one stats strip, and bordered panels.
 */

export function PageHeader({
    title,
    subtitle,
    leading,
    children,
}: {
    title: string;
    subtitle?: React.ReactNode;
    leading?: React.ReactNode;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-3">
            {leading}
            <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

const STRIP_COLUMNS: Record<number, string> = {
    3: 'xl:grid-cols-3',
    4: 'sm:grid-cols-4 xl:grid-cols-4',
    5: 'xl:grid-cols-5',
    6: 'xl:grid-cols-6',
    7: 'xl:grid-cols-7',
    8: 'lg:grid-cols-4 xl:grid-cols-8',
};

/** One bordered strip of figures instead of a row of separate cards. */
export function StatStrip({ count, children }: { count: number; children: React.ReactNode }) {
    return (
        <dl className={cn('grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3', STRIP_COLUMNS[count])}>
            {children}
        </dl>
    );
}

export function Stat({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    tone?: 'warning' | 'success' | 'muted';
}) {
    return (
        <div className="-mb-px -ml-px border-b border-l border-border px-4 py-2.5">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                <Icon className="h-3 w-3" /> {label}
            </dt>
            <dd
                className={cn(
                    'truncate text-base font-extrabold tabular-nums',
                    tone === 'warning' && 'text-amber-700 dark:text-amber-400',
                    tone === 'success' && 'text-emerald-700 dark:text-emerald-400',
                    tone === 'muted' && 'text-muted-foreground',
                )}
            >
                {value}
            </dd>
        </div>
    );
}

/**
 * A titled card. Pass `flush` when the body is a list or table that should run
 * edge to edge under a ruled header.
 */
export function Panel({
    icon: Icon,
    title,
    actions,
    flush,
    className,
    children,
}: {
    icon: React.ElementType;
    title: React.ReactNode;
    actions?: React.ReactNode;
    flush?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    const heading = (
        <div className={cn('flex flex-wrap items-center gap-2', flush && 'border-b border-border px-4 py-3')}>
            <h2 className="flex flex-1 items-center gap-2 text-sm font-bold whitespace-nowrap">
                <Icon className="h-4 w-4 text-primary" /> {title}
            </h2>
            {actions}
        </div>
    );

    return (
        <section className={cn('rounded-xl border border-border bg-card', flush ? 'flex flex-col' : 'space-y-3 p-4', className)}>
            {heading}
            {children}
        </section>
    );
}

/** Small column heading used inside panel tables. */
export const thCls = 'px-4 py-2 text-left text-[11px] font-semibold whitespace-nowrap text-muted-foreground';

/** Compact control used for search boxes and selects inside panel headers. */
export const controlCls =
    'h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Pill-style option used for quick filters. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'h-7 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
        >
            {children}
        </button>
    );
}

/** Server-paginated footer ("1–25 of 340" plus page links). */
export function Pager({
    from,
    to,
    total,
    links,
    onVisit,
}: {
    from: number | null;
    to: number | null;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
    onVisit: (url: string) => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground tabular-nums">
                {from ?? 0}–{to ?? 0} of {total.toLocaleString()}
            </p>
            <div className="flex flex-wrap items-center gap-1">
                {links.map((link, i) => (
                    <button
                        key={i}
                        type="button"
                        disabled={!link.url}
                        onClick={() => link.url && onVisit(link.url)}
                        className={cn(
                            'h-7 min-w-7 rounded-md px-2 text-xs font-semibold',
                            link.active
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30',
                        )}
                        dangerouslySetInnerHTML={{ __html: link.label }}
                    />
                ))}
            </div>
        </div>
    );
}

/** Previous / next footer for pages that only send page numbers. */
export function SimplePager({
    from,
    to,
    total,
    page,
    lastPage,
    onPage,
}: {
    from: number | null;
    to: number | null;
    total: number;
    page: number;
    lastPage: number;
    onPage: (page: number) => void;
}) {
    const btn = 'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30';

    return (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <p className="text-xs text-muted-foreground tabular-nums">
                {from ?? 0}–{to ?? 0} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1 text-xs font-semibold tabular-nums">
                <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
                    ‹
                </button>
                <span className="px-1 text-muted-foreground">
                    {page} / {lastPage}
                </span>
                <button type="button" className={btn} disabled={page >= lastPage} onClick={() => onPage(page + 1)} aria-label="Next page">
                    ›
                </button>
            </div>
        </div>
    );
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'primary';

const TONES: Record<Tone, string> = {
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-700 dark:text-red-400',
    info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    muted: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
};

/** Small status label, readable in light and dark themes. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
    return (
        <span
            className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap', TONES[tone], className)}
        >
            {children}
        </span>
    );
}

/** Full-width message row for an empty table. */
export function EmptyRow({ colSpan, icon: Icon, children }: { colSpan: number; icon?: React.ElementType; children: React.ReactNode }) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted-foreground">
                {Icon && <Icon className="mx-auto mb-2 h-8 w-8 opacity-20" />}
                {children}
            </td>
        </tr>
    );
}

/** Slim filter row used above report results: controls on the left, Apply on the right. */
export function FilterBar({
    children,
    onApply,
    loading,
    applyLabel = 'Apply',
    disabled,
}: {
    children: React.ReactNode;
    onApply?: () => void;
    loading?: boolean;
    applyLabel?: string;
    disabled?: boolean;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
            {children}
            {onApply && (
                <button
                    type="button"
                    onClick={onApply}
                    disabled={loading || disabled}
                    className="ml-auto flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                    {loading ? 'Loading…' : applyLabel}
                </button>
            )}
        </div>
    );
}

/** Branch picker for admins; renders nothing when the user is tied to one branch. */
export function BranchSelect({
    branches,
    value,
    onChange,
}: {
    branches: { id: number; name: string }[] | null | undefined;
    value: string | number | null | undefined;
    onChange: (branchId: string) => void;
}) {
    if (!branches || branches.length === 0) {
        return null;
    }

    return (
        <select value={value?.toString() ?? ''} onChange={(e) => onChange(e.target.value)} className={cn(controlCls, 'h-9')} aria-label="Branch">
            <option value="">All branches</option>
            {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                    {branch.name}
                </option>
            ))}
        </select>
    );
}

/** Label / value line inside a panel (used for summaries). */
export function Line({
    label,
    value,
    strong,
    tone,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    strong?: boolean;
    tone?: 'warning' | 'success' | 'danger';
}) {
    return (
        <div className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', strong && 'border-t border-border pt-2.5 font-bold')}>
            <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
            <span
                className={cn(
                    'tabular-nums',
                    tone === 'warning' && 'text-amber-700 dark:text-amber-400',
                    tone === 'success' && 'text-emerald-700 dark:text-emerald-400',
                    tone === 'danger' && 'text-red-700 dark:text-red-400',
                )}
            >
                {value}
            </span>
        </div>
    );
}

type FlashBag = {
    success?: string | null;
    error?: string | null;
    message?: { type: string; text: string } | null;
};

/** Show the server's flash messages (success / error / message) and a failed action's `errors.error` as toasts. */
export function useFlashToasts(): void {
    const { flash, errors } = usePage().props as { flash?: FlashBag; errors?: Record<string, string> };

    useEffect(() => {
        if (errors?.error) {
            toast.error(errors.error);
        }
    }, [errors]);

    useEffect(() => {
        if (!flash) {
            return;
        }
        if (flash.success) {
            toast.success(flash.success);
        }
        if (flash.error) {
            toast.error(flash.error);
        }
        if (flash.message?.text) {
            const { type, text } = flash.message;
            if (type === 'success') {
                toast.success(text);
            } else if (type === 'warning') {
                toast.warning(text);
            } else {
                toast.error(text);
            }
        }
    }, [flash]);
}

/** Labelled form control used in panel forms. */
export function FormField({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={cn('block space-y-1', className)}>
            <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
            {children}
            {error && <span className="block text-xs text-destructive">{error}</span>}
        </label>
    );
}

/** Full-width input / select / textarea style for panel forms. */
export const inputCls = cn(controlCls, 'h-9 w-full');
export const textareaCls =
    'w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
