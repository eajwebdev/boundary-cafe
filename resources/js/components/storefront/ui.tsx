import { Loader2, Minus, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

// ─── Media query ──────────────────────────────────────────────────────────────

export function useMediaQuery(query: string) {
    const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
    useEffect(() => {
        const mql = window.matchMedia(query);
        const on = () => setMatches(mql.matches);
        on();
        mql.addEventListener('change', on);
        return () => mql.removeEventListener('change', on);
    }, [query]);
    return matches;
}

/** ≥1024px — three-column ordering workspace. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

// ─── Buttons ──────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'navy' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-shop-accent text-shop-on-accent hover:brightness-[1.04] shadow-shop-sm disabled:bg-shop-sunken disabled:text-shop-muted disabled:shadow-none',
    secondary: 'border border-shop-line bg-shop-surface text-shop-ink hover:bg-shop-sunken disabled:opacity-50',
    ghost: 'text-shop-ink hover:bg-shop-sunken disabled:opacity-40',
    navy: 'bg-shop-navy text-shop-navy-ink hover:brightness-110 disabled:opacity-50',
    danger: 'border border-shop-danger/30 bg-shop-danger-soft text-shop-danger hover:brightness-95 disabled:opacity-50',
};
const SIZES: Record<Size, string> = {
    sm: 'h-10 px-4 text-sm rounded-xl gap-1.5',
    md: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
    lg: 'h-14 px-6 text-base rounded-2xl gap-2',
};

export const ShopButton = forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; block?: boolean }
>(function ShopButton({ variant = 'primary', size = 'md', loading, block, className, children, disabled, ...rest }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                'bc-press inline-flex cursor-pointer items-center justify-center font-semibold whitespace-nowrap select-none disabled:cursor-not-allowed',
                VARIANTS[variant],
                SIZES[size],
                block && 'w-full',
                className,
            )}
            {...rest}
        >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {children}
        </button>
    );
});

export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            className={cn('bc-press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-shop-ink hover:bg-shop-sunken', className)}
            {...rest}
        >
            {children}
        </button>
    );
}

// ─── Text bits ────────────────────────────────────────────────────────────────

export function Price({ value, className, strike }: { value: number; className?: string; strike?: boolean }) {
    const v = Number(value ?? 0);
    const txt = v.toLocaleString('en-PH', { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
    return (
        <span className={cn('tabular-nums', strike && 'line-through', className)}>
            <span className="mr-[1px] text-[0.82em] font-medium">₱</span>
            {txt}
        </span>
    );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
    return <p className={cn('text-[11px] font-semibold tracking-[0.14em] text-shop-muted uppercase', className)}>{children}</p>;
}

export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'navy'; children: React.ReactNode; className?: string }) {
    const tones = {
        neutral: 'bg-shop-sunken text-shop-ink',
        accent: 'bg-shop-accent-soft text-shop-accent-ink',
        success: 'bg-shop-success-soft text-shop-success',
        warning: 'bg-shop-warning-soft text-shop-warning',
        danger: 'bg-shop-danger-soft text-shop-danger',
        navy: 'bg-shop-navy text-shop-navy-ink',
    } as const;
    return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

/** Status → pill tone for order statuses. */
export const STATUS_PILL: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'navy'> = {
    pending: 'warning',
    accepted: 'navy',
    preparing: 'accent',
    ready: 'success',
    out_for_delivery: 'accent',
    completed: 'success',
    cancelled: 'danger',
    rejected: 'danger',
};

// ─── Route line (signature motif: the Tagukon → Mabinay road) ─────────────────

const ROUTE_D = 'M4 30 C 34 30, 40 8, 74 10 S 112 34, 146 26 S 196 4, 236 14 S 280 34, 316 18';

export function RouteLine({ className, progress, animate = false }: { className?: string; progress?: number; animate?: boolean }) {
    const ref = useRef<SVGPathElement>(null);
    const [len, setLen] = useState(400);
    useEffect(() => {
        if (ref.current) setLen(ref.current.getTotalLength());
    }, []);
    const p = progress == null ? null : Math.max(0, Math.min(1, progress));
    return (
        <svg viewBox="0 0 320 40" preserveAspectRatio="none" className={cn('bc-route block h-6 w-full overflow-visible', className)} aria-hidden>
            {p != null && <path d={ROUTE_D} className="bc-route-track" fill="none" strokeWidth="3" strokeLinecap="round" />}
            <path d={ROUTE_D} className={p != null ? 'bc-route-dash opacity-50' : 'bc-route-dash'} fill="none" strokeWidth="2.25" />
            {p != null && (
                <path
                    ref={ref}
                    d={ROUTE_D}
                    className="bc-route-fill"
                    fill="none"
                    strokeWidth="3.5"
                    strokeDasharray={len}
                    strokeDashoffset={len * (1 - p)}
                    style={animate ? undefined : { transition: 'none' }}
                />
            )}
            <circle cx="4" cy="30" r="3.5" className="fill-shop-accent" />
            <circle cx="316" cy="18" r="4.5" className="fill-shop-navy" />
        </svg>
    );
}

// ─── Product image (photo-first, intentional fallback) ────────────────────────

export function ProductImage({ src, alt, className, sizes }: { src: string | null; alt: string; className?: string; sizes?: string }) {
    const [failed, setFailed] = useState(false);
    const isIllustration = !!src && src.endsWith('.svg');
    if (!src || failed) {
        return (
            <div className={cn('flex items-center justify-center bg-shop-accent-soft text-shop-accent-ink ring-1 ring-black/5 ring-inset', className)} role="img" aria-label={alt}>
                <UtensilsCrossed className="h-1/3 w-1/3 opacity-70" />
            </div>
        );
    }
    return (
        <div className={cn('relative overflow-hidden bg-shop-sunken ring-1 ring-black/5 ring-inset dark:ring-white/5', className)}>
            <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                sizes={sizes}
                onError={() => setFailed(true)}
                className={cn('h-full w-full transition-transform duration-500 ease-shop', isIllustration ? 'object-contain p-[14%]' : 'object-cover')}
            />
        </div>
    );
}

// ─── Quantity control: "+" that morphs into − qty + ───────────────────────────

export function QtyControl({
    qty,
    onAdd,
    onRemove,
    label,
    disabled,
    size = 'md',
    className,
}: {
    qty: number;
    onAdd: () => void;
    onRemove?: () => void;
    label: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}) {
    const h = size === 'sm' ? 'h-9' : 'h-11';
    const w = size === 'sm' ? 'w-9' : 'w-11';
    const [bump, setBump] = useState(0);
    const expanded = qty > 0 && !!onRemove;

    return (
        <div
            className={cn(
                'flex items-center overflow-hidden rounded-full bg-shop-surface shadow-shop-md ring-1 ring-shop-line transition-[width] duration-300 ease-shop',
                h,
                className,
            )}
            onClick={(e) => e.stopPropagation()}
        >
            {expanded && (
                <>
                    <button
                        type="button"
                        aria-label={qty === 1 ? `Remove ${label}` : `One less ${label}`}
                        onClick={onRemove}
                        className={cn('bc-press flex cursor-pointer items-center justify-center text-shop-ink hover:bg-shop-sunken', h, w)}
                    >
                        {qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                    </button>
                    <span key={bump} className="bc-bump min-w-5 text-center text-sm font-bold tabular-nums" aria-live="polite">
                        {qty}
                    </span>
                </>
            )}
            <button
                type="button"
                aria-label={`Add ${label}`}
                disabled={disabled}
                onClick={() => {
                    onAdd();
                    setBump((b) => b + 1);
                }}
                className={cn(
                    'bc-press flex cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-40',
                    h,
                    w,
                    expanded ? 'text-shop-ink hover:bg-shop-sunken' : 'bg-shop-accent text-shop-on-accent',
                )}
            >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
        </div>
    );
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-xl bg-shop-sunken', className)} />;
}
