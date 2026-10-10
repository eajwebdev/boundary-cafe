import { AlertTriangle, Check, ClipboardList as PendingIcon, Minus, Plus, Scale, Trash2, Zap } from 'lucide-react';
import ProductThumbnail from '@/components/ProductThumbnail';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PendingTicket } from './PendingOrdersPanel';
import type { CartItem } from './posTypes';
import { isWeightedKgItem } from './posTypes';
import QtyInput from './QtyInput';
import { fmtMoney, fmtQty } from './ReceiptTemplate';

/**
 * Fast register: the order itself fills the screen (big amount due, large line table, Tender).
 * Items come in through the search box (type or scan), not a product grid.
 */
export default function FastRegister({
    cart,
    currency,
    ticket,
    onUpdateQty,
    onSetExactQty,
    onScannerBurst,
    onRemove,
    onClear,
    onCharge,
    onDetachTicket,
    onPendingOrders,
    pendingCount = 0,
    lastScanned,
    error,
}: {
    cart: CartItem[];
    currency: string;
    /** The waiter's table ticket being charged, if one was loaded from Pending. */
    ticket: PendingTicket | null;
    onUpdateQty: (key: string, delta: number) => void;
    onSetExactQty: (key: string, qty: number) => void;
    /** A barcode scan that landed in a quantity box; the register moves it to the search box. */
    onScannerBurst: (typed: string) => void;
    onRemove: (key: string) => void;
    onClear: () => void;
    onCharge: () => void;
    onDetachTicket: () => void;
    onPendingOrders: () => void;
    pendingCount?: number;
    lastScanned: { name: string; qty: number; unit: string; price: number; total: number; targetAmount?: number } | null;
    /** e.g. a barcode that matched nothing. */
    error: string | null;
}) {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const totalQty = cart.reduce((s, i) => s + i.qty, 0);
    const stepBtn =
        'flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background font-bold text-foreground transition-colors hover:bg-muted active:scale-95 pointer-coarse:h-10 pointer-coarse:w-10';

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* ── Register display: amount due + Tender ─────────────────────── */}
            <div className="relative flex shrink-0 flex-row items-center justify-between gap-3 overflow-hidden border-b border-[var(--pos-display-line)] bg-[var(--pos-display)] px-4 py-3 text-white select-none lg:px-5">
                <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_0%,var(--pos-display-raised)_0%,transparent_55%)]"
                    aria-hidden
                />
                <div className="relative min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full bg-[var(--pos-display-accent)]', cart.length > 0 && 'animate-pulse')} />
                        <span className="font-mono text-[11px] font-bold tracking-widest text-[var(--pos-display-accent)] uppercase">
                            {cart.length > 0 ? 'Amount due' : 'Register ready'}
                        </span>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-3xl font-black tracking-tight text-white tabular-nums sm:text-4xl lg:text-5xl">
                        {fmtMoney(subtotal, currency)}
                    </div>
                </div>

                <div className="relative flex shrink-0 items-center gap-3">
                    <div className="hidden shrink-0 rounded-xl border border-[var(--pos-display-line)] bg-[var(--pos-display-raised)] px-4 py-2 text-right md:block">
                        <div className="text-[10px] font-bold text-[var(--pos-display-muted)] uppercase">Lines · Units</div>
                        <div className="font-mono text-lg font-black whitespace-nowrap text-white tabular-nums">
                            {cart.length} · {fmtQty(totalQty)}
                        </div>
                    </div>

                    <Button
                        onClick={onCharge}
                        disabled={cart.length === 0}
                        className="h-12 gap-2 rounded-xl px-5 text-sm font-black tracking-wide whitespace-nowrap shadow-lg disabled:opacity-40 pointer-coarse:h-14 lg:px-6"
                    >
                        <Zap className="h-4 w-4" /> Tender
                        <kbd className="hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px] lg:inline pointer-coarse:hidden">F9</kbd>
                    </Button>
                </div>
            </div>

            {error && (
                <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-bold text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Last added item */}
            {!error && lastScanned && (
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    <span className="flex min-w-0 items-center gap-1.5 font-bold">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span className="truncate">Added: {lastScanned.name}</span>
                        {lastScanned.targetAmount && (
                            <span className="ml-1 shrink-0 rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                Auto-detected from ₱{lastScanned.targetAmount.toFixed(2)}
                            </span>
                        )}
                    </span>
                    <span className="hidden shrink-0 font-mono md:inline">
                        {fmtQty(lastScanned.qty)} {lastScanned.unit} @ {fmtMoney(lastScanned.price, currency)} ={' '}
                        <strong>{fmtMoney(lastScanned.total, currency)}</strong>
                    </span>
                </div>
            )}

            {/* Table ticket being charged */}
            {ticket && (
                <div className="flex shrink-0 items-center gap-3 border-b border-primary/25 bg-primary/[0.06] px-4 py-2 text-sm">
                    <span className="shrink-0 rounded-lg bg-primary px-2 py-0.5 text-xs font-black text-primary-foreground">TABLE {ticket.table_number}</span>
                    <span className="min-w-0 truncate font-semibold">
                        Charging ticket {ticket.order_number}
                        {ticket.taken_by ? ` · by ${ticket.taken_by}` : ''}
                        {ticket.customer ? ` · ★ ${ticket.customer.name} (${ticket.customer.loyalty_points} pts)` : ''}
                    </span>
                    <button
                        type="button"
                        onClick={onDetachTicket}
                        className="ml-auto h-8 shrink-0 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold hover:bg-muted"
                    >
                        Detach &amp; clear
                    </button>
                </div>
            )}

            {/* ── Order lines ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto">
                {cart.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
                        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Scale className="h-8 w-8" />
                        </span>
                        <div>
                            <p className="text-base font-bold text-foreground">Ready for the next order</p>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                Type a name or scan a barcode in the search box, then tap a result or press Enter. Open <b>Pending</b> to charge a
                                table ticket from a server or hand over an online pickup.
                            </p>
                        </div>
                        <div className="mt-2 hidden items-center gap-2 lg:flex pointer-coarse:hidden">
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F1 Search</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F3 Pending</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F4 Visual</span>
                            <span className="rounded-md bg-muted/60 px-2 py-1 font-mono text-[11px]">F9 Pay</span>
                        </div>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 text-[10px] font-bold tracking-wider text-muted-foreground uppercase backdrop-blur-xs">
                            <tr>
                                <th className="hidden w-10 px-3 py-2.5 text-center md:table-cell">#</th>
                                <th className="px-3 py-2.5">Item</th>
                                <th className="hidden w-20 px-3 py-2.5 text-center xl:table-cell">Unit</th>
                                <th className="hidden w-24 px-3 py-2.5 text-right lg:table-cell">Price</th>
                                <th className="px-3 py-2.5 text-center whitespace-nowrap">
                                    <span className="hidden xl:inline">Quantity &amp; Presyo</span>
                                    <span className="xl:hidden">Qty</span>
                                </th>
                                <th className="w-24 px-3 py-2.5 text-right lg:w-28">Total</th>
                                <th className="w-12 px-2 py-2.5 text-center">
                                    <span className="sr-only">Remove</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                            {cart.map((item, idx) => {
                                const rawUnit = item.unit || '';
                                const isKg = isWeightedKgItem(rawUnit, item.name);
                                const unit = rawUnit || (isKg ? 'kg' : 'pc');
                                const isLastAdded = lastScanned?.name === item.name && idx === cart.length - 1;
                                return (
                                    <tr key={item.key} className={cn('group transition-colors hover:bg-muted/40', isLastAdded && 'bg-primary/[0.04]')}>
                                        <td className="hidden px-3 py-2.5 text-center font-mono font-semibold text-muted-foreground md:table-cell">
                                            {idx + 1}
                                        </td>
                                        <td className="px-3 py-2.5 pointer-coarse:py-3">
                                            <div className="flex items-center gap-2.5">
                                                <ProductThumbnail
                                                    src={item.product_img}
                                                    name={item.name}
                                                    unit={item.unit}
                                                    className="h-9 w-9 shrink-0 rounded-lg border border-border"
                                                    padding="p-0.5"
                                                    aspect="aspect-square"
                                                />
                                                <div className="min-w-0">
                                                    <p className="line-clamp-2 text-sm leading-snug font-bold text-foreground">{item.name}</p>
                                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-muted-foreground">
                                                        <span className="lg:hidden">
                                                            {fmtMoney(item.price, currency)} / {unit}
                                                        </span>
                                                        {item.barcode && <span className="hidden lg:inline">{item.barcode}</span>}
                                                        {item.variant_name && (
                                                            <span className="font-semibold text-primary">[{item.variant_name}]</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="hidden px-3 py-2.5 text-center xl:table-cell">
                                            <span
                                                className={cn(
                                                    'rounded-md px-2 py-0.5 text-[10px] font-black uppercase',
                                                    isKg
                                                        ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                        : unit === 'sack' || unit === 'bag'
                                                          ? 'border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                          : 'bg-muted text-muted-foreground',
                                                )}
                                            >
                                                {unit.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="hidden px-3 py-2.5 text-right font-mono font-bold text-foreground lg:table-cell">
                                            {fmtMoney(item.price, currency)}
                                        </td>
                                        <td className="px-2 py-2.5 lg:px-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? -0.25 : -1)}
                                                    title={isKg ? '-0.25 kg' : '-1'}
                                                    aria-label={`One less ${item.name}`}
                                                    className={stepBtn}
                                                >
                                                    <Minus className="h-3.5 w-3.5" />
                                                </button>

                                                <QtyInput
                                                    value={item.qty}
                                                    onCommit={(qty) => onSetExactQty(item.key, qty)}
                                                    onScannerBurst={onScannerBurst}
                                                    ariaLabel={`Quantity of ${item.name}`}
                                                    className="h-8 w-12 rounded-lg border border-border bg-background text-center font-mono text-sm font-black text-foreground focus:ring-1 focus:ring-primary focus:outline-none pointer-coarse:h-10 lg:w-16"
                                                />

                                                <button
                                                    onClick={() => onUpdateQty(item.key, isKg ? 0.25 : 1)}
                                                    title={isKg ? '+0.25 kg' : '+1'}
                                                    aria-label={`One more ${item.name}`}
                                                    className={stepBtn}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                </button>

                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono text-sm font-black whitespace-nowrap text-primary">
                                            {fmtMoney(item.price * item.qty, currency)}
                                        </td>
                                        <td className="px-2 py-2.5 text-center">
                                            <button
                                                onClick={() => onRemove(item.key)}
                                                aria-label={`Remove ${item.name}`}
                                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive pointer-coarse:h-10 pointer-coarse:w-10"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Footer: clear, pending, subtotal, charge ──────────────────── */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/30 p-2.5 lg:gap-3 lg:p-3">
                <div className="flex items-center gap-2">
                    {cart.length > 0 && (
                        <button
                            onClick={onClear}
                            className="flex h-10 items-center gap-1.5 rounded-xl border border-destructive/30 bg-background px-3 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 pointer-coarse:h-11"
                        >
                            <Trash2 className="h-4 w-4" /> Clear
                            <kbd className="hidden font-mono text-[10px] opacity-70 xl:inline pointer-coarse:hidden">F8</kbd>
                        </button>
                    )}
                    <button
                        onClick={onPendingOrders}
                        className="relative flex h-10 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-500/20 pointer-coarse:h-11 dark:text-amber-300"
                    >
                        <PendingIcon className="h-4 w-4" /> Pending
                        <kbd className="hidden font-mono text-[10px] opacity-70 xl:inline pointer-coarse:hidden">F3</kbd>
                        {pendingCount > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black text-white">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-3 lg:gap-4">
                    <div className="text-right">
                        <span className="block text-[10px] font-bold text-muted-foreground uppercase">Subtotal</span>
                        <span className="font-mono text-lg font-black text-foreground tabular-nums lg:text-xl">{fmtMoney(subtotal, currency)}</span>
                    </div>

                    <Button onClick={onCharge} disabled={cart.length === 0} className="h-10 gap-2 rounded-xl px-4 text-sm font-black shadow-sm pointer-coarse:h-11 lg:px-5">
                        <Zap className="h-4 w-4" /> Charge
                        <kbd className="hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[10px] xl:inline pointer-coarse:hidden">F9</kbd>
                    </Button>
                </div>
            </div>
        </div>
    );
}
