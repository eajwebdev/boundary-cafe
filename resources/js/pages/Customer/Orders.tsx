import { Link } from '@inertiajs/react';
import { ChevronRight, ReceiptText } from 'lucide-react';

import CustomerLayout from '@/layouts/CustomerLayout';
import type { Fulfillment } from '@/lib/customer';
import { FULFILLMENT_ICON, manilaTime, pesoExact, STATUS_TONE } from '@/lib/customer';
import { cn } from '@/lib/utils';

interface OrderRow {
    order_number: string;
    status: string;
    status_label: string;
    is_active: boolean;
    fulfillment_type: Fulfillment;
    total: number;
    item_count: number;
    items_preview: string;
    created_at: string;
}

interface Paginated<T> {
    data: T[];
    links: { url: string | null; label: string; active: boolean }[];
    current_page: number;
    last_page: number;
}

export default function CustomerOrders({ orders }: { orders: Paginated<OrderRow> }) {
    const active = orders.data.filter((o) => o.is_active);
    const past = orders.data.filter((o) => !o.is_active);

    return (
        <CustomerLayout title="My orders">
            <div className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
                <h1 className="font-display text-[30px] leading-none font-bold">My orders</h1>

                {orders.data.length === 0 && (
                    <div className="flex flex-col items-center py-16 text-center">
                        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-shop-accent-soft text-shop-accent-ink">
                            <ReceiptText className="h-8 w-8" />
                        </span>
                        <p className="mt-3 text-lg font-bold">No orders yet</p>
                        <p className="text-sm text-shop-muted">Your dine-in, takeout and delivery orders will appear here.</p>
                        <Link
                            href="/"
                            className="mt-5 inline-flex h-12 items-center rounded-2xl bg-shop-accent px-6 font-semibold text-shop-on-accent"
                        >
                            Start ordering
                        </Link>
                    </div>
                )}

                {active.length > 0 && <Group title="In progress" rows={active} />}
                {past.length > 0 && <Group title="Past orders" rows={past} />}

                {orders.last_page > 1 && (
                    <nav className="flex flex-wrap justify-center gap-1 pb-4">
                        {orders.links.map((l, i) =>
                            l.url ? (
                                <Link
                                    key={i}
                                    href={l.url}
                                    preserveScroll
                                    className={cn(
                                        'flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm',
                                        l.active ? 'bg-shop-ink font-semibold text-shop-bg' : 'border border-shop-line',
                                    )}
                                    dangerouslySetInnerHTML={{ __html: l.label }}
                                />
                            ) : null,
                        )}
                    </nav>
                )}
            </div>
        </CustomerLayout>
    );
}

function Group({ title, rows }: { title: string; rows: OrderRow[] }) {
    return (
        <section>
            <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-shop-muted uppercase">{title}</h2>
            <ul className="space-y-2">
                {rows.map((o) => (
                    <li key={o.order_number}>
                        <Link
                            href={`/account/orders/${o.order_number}`}
                            className="bc-press hover:shadow-shop-md flex items-center gap-3 rounded-[22px] bg-shop-surface p-4 ring-1 ring-shop-line"
                        >
                            <span
                                className={cn(
                                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                                    o.is_active ? 'bg-shop-accent-soft text-shop-accent-ink' : 'bg-shop-sunken text-shop-muted',
                                )}
                            >
                                {(() => {
                                    const Icon = FULFILLMENT_ICON[o.fulfillment_type] ?? FULFILLMENT_ICON.delivery;
                                    return <Icon className="h-5 w-5" />;
                                })()}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={cn('truncate rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[o.status])}>
                                        {o.status_label}
                                    </span>
                                    <span className="shrink-0 text-sm font-bold tabular-nums">{pesoExact(o.total)}</span>
                                </div>
                                <p className="mt-1 truncate text-[15px] font-semibold">{o.items_preview}</p>
                                <p className="truncate text-xs text-shop-muted">
                                    {manilaTime(o.created_at, true)} · {o.item_count} item{o.item_count !== 1 ? 's' : ''} ·{' '}
                                    <span className="font-mono">{o.order_number}</span>
                                </p>
                            </div>
                            <ChevronRight className="h-5 w-5 shrink-0 text-shop-muted" />
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
