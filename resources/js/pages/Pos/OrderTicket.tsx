import { AlertTriangle, ClipboardList, Minus, Plus, ReceiptText, Star, Trash2, X, Zap } from 'lucide-react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PendingTicket } from './PendingOrdersPanel';
import type { CartItem } from './posTypes';
import { isWeightedKgItem } from './posTypes';
import QtyInput from './QtyInput';
import { fmtMoney, fmtQty } from './ReceiptTemplate';

/**
 * The order ticket shown beside the menu in both register views (Fast and Visual): order type,
 * the lines with quantity steppers, the amount due and the Charge button. On tablets it sits in a
 * slide-in sheet, with onClose wired to its close button.
 */
export default function OrderTicket({
    cart,
    subtotal,
    itemCount,
    currency,
    error,
    lastAddedName,
    ticket,
    pendingCount,
    onUpdateQty,
    onSetExactQty,
    onScannerBurst,
    onRemove,
    onClear,
    onCharge,
    onDetachTicket,
    onOpenPending,
    onClose,
}: {
    cart: CartItem[];
    subtotal: number;
    itemCount: number;
    currency: string;
    error: string | null;
    /** Name of the item added last, highlighted in the list. */
    lastAddedName: string | null;
    /** The waiter's table ticket being charged, if one was loaded from Pending. */
    ticket: PendingTicket | null;
    pendingCount: number;
    onUpdateQty: (key: string, delta: number) => void;
    onSetExactQty: (key: string, qty: number) => void;
    /** A barcode scan that landed in a quantity box; the register moves it to the search box. */
    onScannerBurst: (typed: string) => void;
    onRemove: (key: string) => void;
    onClear: () => void;
    onCharge: () => void;
    onDetachTicket: () => void;
    onOpenPending: () => void;
    onClose?: () => void;
}) {
    const lastLineKey = cart.length > 0 && cart[cart.length - 1].name === lastAddedName ? cart[cart.length - 1].key : null;

    return (
        <div className="flex h-full flex-col bg-card">
            {/* ── Header: title, order type, clear ─────────────────────── */}
            <div className="shrink-0 border-b border-border px-3 py-2.5 lg:px-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary xl:flex">
                            <ReceiptText className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 leading-tight">
                            <p className="text-[15px] font-black tracking-tight text-foreground">Current order</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                                {!ticket && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
                                <span className="truncate">
                                    {ticket ? 'Table ticket' : 'Walk-in'}
                                    {cart.length > 0 && ` · ${fmtQty(itemCount)} item${itemCount === 1 ? '' : 's'}`}
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {!ticket && pendingCount > 0 && (
                            <button
                                type="button"
                                onClick={onOpenPending}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 text-[11px] font-bold text-amber-700 hover:bg-amber-500/20 pointer-coarse:h-10 dark:text-amber-300"
                            >
                                <ClipboardList className="h-3.5 w-3.5" />
                                {pendingCount} waiting
                            </button>
                        )}
                        {cart.length > 0 && (
                            <button
                                type="button"
                                onClick={onClear}
                                className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive pointer-coarse:h-10"
                                title="Clear the order (F8)"
                            >
                                <Trash2 className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                aria-label="Close the order"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>
                </div>

                {ticket && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-2.5 py-1.5">
                        <span className="shrink-0 rounded-lg bg-primary px-2 py-1 text-[11px] font-black tracking-wide text-primary-foreground">
                            TABLE {ticket.table_number}
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate font-mono text-[11px] font-bold text-foreground">{ticket.order_number}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {ticket.taken_by ? `by ${ticket.taken_by}` : 'Dine-in'}
                                {ticket.customer && (
                                    <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400">
                                        <Star className="h-3 w-3 fill-current" /> {ticket.customer.name}
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onDetachTicket}
                            className="h-8 shrink-0 rounded-lg border border-border bg-background px-2.5 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            Detach
                        </button>
                    </div>
                )}
            </div>

            {/* ── Lines: one compact row each ───────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
                {cart.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
                            <ReceiptText className="h-6 w-6" />
                        </span>
                        <div>
                            <p className="text-sm font-black text-foreground">Start an order</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                Tap a menu item or scan a barcode. Table tickets and online pickups are under Pending.
                            </p>
                        </div>
                    </div>
                ) : (
                    <ul className="divide-y divide-border/60">
                        {cart.map((item) => {
                            const rawUnit = item.unit || '';
                            const isKg = isWeightedKgItem(rawUnit, item.name);
                            const unit = rawUnit || (isKg ? 'kg' : 'pc');
                            const step = isKg ? 0.25 : 1;
                            const isLast = item.key === lastLineKey;
                            return (
                                <li
                                    key={item.key}
                                    className={cn(
                                        'flex items-center gap-2 py-2 pr-1.5 pl-3 transition-colors lg:pl-4',
                                        isLast ? 'bg-primary/[0.06]' : 'hover:bg-muted/40',
                                    )}
                                >
                                    <ProductThumbnail
                                        src={item.product_img}
                                        name={item.name}
                                        unit={item.unit}
                                        className="hidden h-9 w-9 shrink-0 rounded-lg border border-border 2xl:block"
                                        padding="p-0.5"
                                        aspect="aspect-square"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-[13px] leading-tight font-bold text-foreground">{item.name}</p>
                                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
                                            {item.variant_name && <span className="font-semibold text-primary">{item.variant_name} · </span>}
                                            {fmtMoney(item.price, currency)} / {unit}
                                        </p>
                                    </div>

                                    <div className="flex shrink-0 items-center rounded-xl border border-border bg-background shadow-xs">
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQty(item.key, -step)}
                                            className="flex h-8 w-8 items-center justify-center rounded-l-xl text-foreground transition-colors hover:bg-muted active:scale-95 pointer-coarse:h-10 pointer-coarse:w-9"
                                            aria-label={`One less ${item.name}`}
                                        >
                                            <Minus className="h-3.5 w-3.5" />
                                        </button>
                                        <QtyInput
                                            value={item.qty}
                                            onCommit={(qty) => onSetExactQty(item.key, qty)}
                                            onScannerBurst={onScannerBurst}
                                            className="h-8 w-8 bg-transparent text-center font-mono text-sm font-black tabular-nums focus:outline-none pointer-coarse:h-10"
                                            ariaLabel={`Quantity of ${item.name}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onUpdateQty(item.key, step)}
                                            className="flex h-8 w-8 items-center justify-center rounded-r-xl text-foreground transition-colors hover:bg-muted active:scale-95 pointer-coarse:h-10 pointer-coarse:w-9"
                                            aria-label={`One more ${item.name}`}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    <span className="w-[4.75rem] shrink-0 text-right font-mono text-sm font-black text-foreground tabular-nums">
                                        {fmtMoney(item.price * item.qty, currency)}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => onRemove(item.key)}
                                        className="flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive pointer-coarse:h-10 pointer-coarse:w-8"
                                        aria-label={`Remove ${item.name}`}
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* ── Amount due + Charge in one bar ───────────────────────── */}
            <div className="shrink-0 border-t border-border bg-muted/30 p-2.5">
                {error && (
                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {error}
                    </div>
                )}
                <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-[var(--pos-display)] p-2 pl-4 text-white shadow-inner">
                    <div
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_160%_at_0%_0%,var(--pos-display-raised)_0%,transparent_60%)]"
                        aria-hidden
                    />
                    <div className="relative min-w-0 flex-1">
                        <p className="text-[10px] font-bold tracking-widest text-[var(--pos-display-accent)] uppercase">
                            {cart.length > 0 ? 'Amount due' : 'Register ready'}
                        </p>
                        <p className="truncate font-mono text-2xl leading-tight font-black tracking-tight tabular-nums xl:text-[1.7rem]">
                            {fmtMoney(subtotal, currency)}
                        </p>
                    </div>
                    <Button
                        className="relative h-12 shrink-0 gap-2 rounded-xl px-5 text-base font-black shadow-md disabled:opacity-40 pointer-coarse:h-14"
                        onClick={onCharge}
                        disabled={cart.length === 0}
                    >
                        <Zap className="h-5 w-5" /> Charge
                        <kbd className="hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px] xl:inline pointer-coarse:hidden">F9</kbd>
                    </Button>
                </div>
            </div>
        </div>
    );
}
