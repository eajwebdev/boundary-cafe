import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Clock,
    LayoutGrid,
    List as ListIcon,
    LogOut,
    MessageSquarePlus,
    Minus,
    Monitor,
    Plus,
    Receipt,
    Search,
    Send,
    Sparkles,
    Star,
    Users,
    UtensilsCrossed,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { confirmDialog } from '@/components/ConfirmDialog';
import { Price, ProductImage, QtyControl, ShopButton, useIsDesktop } from '@/components/storefront/ui';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { jsonRequest } from '@/lib/customer';
import { useFloorUpdates } from '@/lib/realtime';
import { cn } from '@/lib/utils';

interface Table {
    id: number;
    table_number: string;
    section: string | null;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'cleaning';
    open_order: { id: number; total: number; pending_items: number; opened_at: string | null } | null;
}

interface Product {
    id: number;
    name: string;
    image: string | null;
    price: number;
    category_id: number | null;
    variants: { id: number; name: string; extra_price: number }[];
}

interface Line {
    key: string;
    product_id: number;
    variant_id: number | null;
    name: string;
    variant_name: string | null;
    price: number;
    quantity: number;
    note: string;
}

type Member = { id: number; name: string; customer_number: string; loyalty_points: number };

interface PageProps {
    tables: Table[];
    products: Product[];
    categories: { id: number; name: string }[];
    auth: { user: { fname: string; lname: string; branch?: { name: string } | null; is_waiter?: boolean; access: string[] } };
    flash?: { success?: string | null; error?: string | null };
    errors: Record<string, string>;
    [key: string]: unknown;
}

type State = 'available' | 'occupied' | 'reserved' | 'cleaning';

/** Visual language shared by each table tile and its chairs. */
const STATE: Record<State, { label: string; dot: string; table: string; chair: string; pill: string; glow: string }> = {
    available: {
        label: 'Free',
        dot: 'bg-shop-success',
        table: 'bg-shop-success-soft text-shop-success ring-shop-success/25',
        chair: 'bg-shop-success/35',
        pill: 'bg-shop-success-soft text-shop-success',
        glow: 'from-shop-success-soft',
    },
    occupied: {
        label: 'Seated',
        dot: 'bg-shop-accent',
        table: 'bg-shop-accent text-shop-on-accent ring-shop-accent/30 shadow-shop-md',
        chair: 'bg-shop-accent/70',
        pill: 'bg-shop-accent-soft text-shop-accent-ink',
        glow: 'from-shop-accent-soft',
    },
    reserved: {
        label: 'Reserved',
        dot: 'bg-shop-warning',
        table: 'bg-shop-warning-soft text-shop-warning ring-shop-warning/30',
        chair: 'bg-shop-warning/40',
        pill: 'bg-shop-warning-soft text-shop-warning',
        glow: 'from-shop-warning-soft',
    },
    cleaning: {
        label: 'Cleaning',
        dot: 'bg-shop-muted',
        table: 'bg-shop-sunken text-shop-muted ring-shop-line',
        chair: 'bg-shop-line',
        pill: 'bg-shop-sunken text-shop-muted',
        glow: 'from-shop-sunken',
    },
};

const stateOf = (t: Table): State => (t.open_order ? 'occupied' : t.status);

function minutesSince(iso: string | null, now: number) {
    if (!iso) return null;
    return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

function since(mins: number | null) {
    if (mins === null) return null;
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')}`;
}

export default function Waiter() {
    const { props } = usePage<PageProps>();
    const [tables, setTables] = useState(props.tables);
    const [table, setTable] = useState<Table | null>(null);
    const [count, setCount] = useState(0);

    useEffect(() => {
        setTables(props.tables);
    }, [props.tables]);

    useEffect(() => {
        if (props.flash?.success) toast.success(props.flash.success);
        if (props.flash?.error) toast.error(props.flash.error);
    }, [props.flash]);

    const latestRefresh = useRef(0);
    const refreshTables = useCallback(async () => {
        const mine = ++latestRefresh.current;
        try {
            const fresh = (await jsonRequest<{ tables: Table[] }>('/tables/status')).tables;
            // A slower, older response must not overwrite a newer one.
            if (mine !== latestRefresh.current) return;
            setTables(fresh);
        } catch {
            /* ignore transient errors */
        }
    }, []);

    // Pusher says the moment anything on the floor changes (another waiter, the cashier, table setup).
    const live = useFloorUpdates(refreshTables);

    // A slow poll stays as a safety net — and is the only source of updates when realtime is off.
    useEffect(() => {
        if (table) return;
        const t = window.setInterval(
            () => {
                if (document.visibilityState === 'visible') refreshTables();
            },
            live ? 60000 : 15000,
        );
        return () => window.clearInterval(t);
    }, [table, live, refreshTables]);

    // A phone waking up may have missed events while its socket was asleep.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') refreshTables();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refreshTables]);

    const user = props.auth.user;
    const canPos = user.access?.includes('2');
    const initials = `${user.fname?.[0] ?? ''}${user.lname?.[0] ?? ''}`.toUpperCase();

    return (
        <div className="bc-shop min-h-dvh bg-shop-bg text-shop-ink">
            <Head title={table ? `Table ${table.table_number}` : 'Tables'} />

            <header className="sticky top-0 z-30 border-b border-shop-line/70 bg-shop-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
                <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-3 sm:px-5">
                    {table ? (
                        <button
                            type="button"
                            onClick={() => setTable(null)}
                            className="bc-press shadow-shop-sm flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-shop-surface ring-1 ring-shop-line hover:bg-shop-sunken"
                            aria-label="Back to tables"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                    ) : (
                        <span className="shadow-shop-sm flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 ring-1 ring-black/5">
                            <img src="/uploads/optimized/logo.webp" alt="Boundary Café" className="h-full w-full object-contain" />
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        {table ? (
                            <>
                                <p className="truncate font-display text-xl leading-tight font-bold">Table {table.table_number}</p>
                                <p className="truncate text-xs text-shop-muted">
                                    {table.capacity} seats{table.section ? ` · ${table.section}` : ''}
                                    {count > 0 && ` · ${count} item${count === 1 ? '' : 's'} in this round`}
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="truncate font-display text-xl leading-tight font-bold">Table service</p>
                                <p className="truncate text-xs text-shop-muted">{user.branch?.name ?? 'Boundary Café'}</p>
                            </>
                        )}
                    </div>
                    {canPos && !table && (
                        <Link
                            href="/pos"
                            className="bc-press shadow-shop-sm hidden h-10 items-center gap-1.5 rounded-full bg-shop-surface px-4 text-sm font-semibold ring-1 ring-shop-line hover:bg-shop-sunken sm:flex"
                        >
                            <Monitor className="h-4 w-4" /> POS
                        </Link>
                    )}
                    <div className="shadow-shop-sm flex items-center gap-1 rounded-full bg-shop-surface p-1 ring-1 ring-shop-line">
                        <span
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-shop-navy to-shop-accent text-xs font-bold text-white"
                            title={`${user.fname} ${user.lname}`}
                        >
                            {initials || 'S'}
                        </span>
                        <span className="hidden max-w-32 truncate pr-1 pl-1 text-sm font-semibold md:block">{user.fname}</span>
                        <button
                            type="button"
                            onClick={() => router.post('/logout')}
                            className="bc-press flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-shop-muted hover:bg-shop-sunken hover:text-shop-ink"
                            aria-label="Log out"
                            title="Log out"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            {table ? (
                <OrderTaker
                    key={table.id}
                    table={table}
                    products={props.products}
                    categories={props.categories}
                    onCount={setCount}
                    onSent={() => setTable(null)}
                />
            ) : (
                <FloorPlan tables={tables} onPick={setTable} />
            )}
        </div>
    );
}

// ─── Floor plan ───────────────────────────────────────────────────────────────

function FloorPlan({ tables, onPick }: { tables: Table[]; onPick: (t: Table) => void }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(t);
    }, []);

    const sections = useMemo(() => {
        const map = new Map<string, Table[]>();
        tables.forEach((t) => {
            const key = t.section || 'Dining area';
            map.set(key, [...(map.get(key) ?? []), t]);
        });
        return Array.from(map.entries());
    }, [tables]);

    const markAvailable = async (t: Table) => {
        const confirmed = await confirmDialog({
            title: `Mark table ${t.table_number} clean?`,
            description: 'It becomes available for new guests.',
            confirmLabel: 'Mark available',
        });
        if (!confirmed) return;
        router.post(`/tables/${t.id}/available`, {}, { preserveScroll: true });
    };

    if (tables.length === 0) {
        return (
            <div className="mx-auto max-w-md px-6 py-24 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-shop-accent-soft text-shop-accent-ink">
                    <UtensilsCrossed className="h-7 w-7" />
                </span>
                <p className="mt-5 font-display text-2xl font-bold">No tables set up yet</p>
                <p className="mt-2 text-shop-muted">Ask a manager to add tables under Dining Tables.</p>
            </div>
        );
    }

    let tileIndex = 0;

    return (
        <main className="mx-auto max-w-7xl px-4 pt-2 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-5">
            {sections.map(([section, list]) => {
                const free = list.filter((t) => stateOf(t) === 'available').length;
                return (
                    <section key={section} className="mt-4">
                        <div className="mb-3 flex items-center gap-3">
                            <h2 className="font-display text-lg font-bold">{section}</h2>
                            <span className="rounded-full bg-shop-sunken px-2 py-0.5 text-[11px] font-bold text-shop-muted tabular-nums">
                                {list.length}
                            </span>
                            <span className="h-px flex-1 bg-shop-line" aria-hidden />
                            <span className="text-xs font-medium text-shop-muted">{free ? `${free} free` : 'Full'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            {list.map((t) => (
                                <TableTile
                                    key={t.id}
                                    table={t}
                                    now={now}
                                    delay={Math.min(tileIndex++, 14) * 28}
                                    onClick={() => (stateOf(t) === 'cleaning' ? markAvailable(t) : onPick(t))}
                                />
                            ))}
                        </div>
                    </section>
                );
            })}
        </main>
    );
}

function TableTile({ table, now, delay, onClick }: { table: Table; now: number; delay: number; onClick: () => void }) {
    const state = stateOf(table);
    const s = STATE[state];
    const waiting = (table.open_order?.pending_items ?? 0) > 0;
    const mins = minutesSince(table.open_order?.opened_at ?? null, now);
    const elapsed = since(mins);

    return (
        <button
            type="button"
            onClick={onClick}
            style={{ animationDelay: `${delay}ms` }}
            aria-label={`Table ${table.table_number}, ${s.label}, ${table.capacity} seats`}
            className={cn(
                'bc-rise group shadow-shop-sm relative isolate flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-shop-surface p-3 text-left ring-1 ring-shop-line sm:rounded-[26px] sm:p-3.5',
                'hover:shadow-shop-md transition-[translate,scale,box-shadow] duration-300 ease-shop hover:-translate-y-1 active:scale-[0.98]',
                state === 'occupied' && 'ring-2 ring-shop-accent/40',
                state === 'cleaning' && 'bg-shop-raised',
            )}
        >
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-100',
                    s.glow,
                )}
            />

            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold', s.pill)}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
                    {s.label}
                </span>
                {elapsed && (
                    <span
                        className={cn(
                            'flex items-center gap-1 rounded-full bg-shop-surface/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ring-shop-line',
                            (mins ?? 0) >= 90 ? 'text-shop-danger' : (mins ?? 0) >= 45 ? 'text-shop-warning' : 'text-shop-muted',
                        )}
                        title="Time since the ticket opened"
                    >
                        <Clock className="h-3 w-3" />
                        {elapsed}
                    </span>
                )}
            </div>

            <TableGlyph number={table.table_number} capacity={table.capacity} state={state} />

            <div className="mt-auto flex min-h-10 flex-wrap items-end justify-between gap-x-2 gap-y-1 border-t border-dashed border-shop-line pt-2.5">
                {table.open_order ? (
                    <>
                        <span className="min-w-0">
                            <span className="block text-[10px] font-semibold tracking-wider text-shop-muted uppercase">Ticket</span>
                            <Price value={table.open_order.total} className="block font-display text-lg leading-tight font-bold" />
                        </span>
                        {waiting && (
                            <span className="shrink-0 rounded-full bg-shop-accent px-2 py-0.5 text-[11px] font-bold text-shop-on-accent">
                                At cashier
                            </span>
                        )}
                    </>
                ) : state === 'cleaning' ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-shop-muted">
                        <Sparkles className="h-3.5 w-3.5" /> Tap when clean
                    </span>
                ) : (
                    <>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-shop-muted">
                            <Users className="h-3.5 w-3.5" /> {table.capacity} seats
                        </span>
                        {state === 'available' && (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-shop-ink text-shop-bg opacity-0 transition-[opacity,translate] duration-300 ease-shop group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100 sm:-translate-x-1">
                                <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                        )}
                    </>
                )}
            </div>
        </button>
    );
}

/** A tiny top-down table with its chairs — instantly readable size + state. */
function TableGlyph({ number, capacity, state }: { number: string; capacity: number; state: State }) {
    const s = STATE[state];
    const cap = Math.max(1, Math.min(capacity, 10));
    const sides = cap >= 2 ? 1 : 0;
    const rest = cap - sides * 2;
    const top = Math.ceil(rest / 2);
    const bottom = Math.floor(rest / 2);
    const round = cap <= 2;

    const row = (n: number) => (
        <div className="flex justify-center gap-1.5">
            {Array.from({ length: n }).map((_, i) => (
                <span key={i} className={cn('h-2 w-4 rounded-full sm:w-5', s.chair)} />
            ))}
        </div>
    );

    return (
        <div className="my-3 grid grid-cols-[auto_1fr_auto] grid-rows-[auto_auto_auto] items-center gap-1.5 self-center sm:my-4" aria-hidden>
            <span />
            {row(top)}
            <span />
            {sides ? <span className={cn('h-5 w-2 rounded-full', s.chair)} /> : <span />}
            <span
                className={cn(
                    'mx-auto flex items-center justify-center font-display text-2xl font-bold ring-1 transition-transform duration-300 ease-shop ring-inset group-hover:scale-[1.05]',
                    round ? 'h-14 w-14 rounded-full' : cap > 6 ? 'h-14 w-20 rounded-2xl sm:w-28' : 'h-14 w-20 rounded-2xl',
                    s.table,
                )}
            >
                {number}
            </span>
            {sides ? <span className={cn('h-5 w-2 rounded-full', s.chair)} /> : <span />}
            <span />
            {row(bottom)}
            <span />
        </div>
    );
}

// ─── Order taking ─────────────────────────────────────────────────────────────

function OrderTaker({
    table,
    products,
    categories,
    onCount,
    onSent,
}: {
    table: Table;
    products: Product[];
    categories: { id: number; name: string }[];
    onCount: (n: number) => void;
    onSent: () => void;
}) {
    const isDesktop = useIsDesktop();
    const [lines, setLines] = useState<Line[]>([]);
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<number | null>(null);
    const [menuLayout, setMenuLayout] = useMenuLayout();
    const [variantFor, setVariantFor] = useState<Product | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [covers, setCovers] = useState(0);
    const [notes, setNotes] = useState('');
    const [member, setMember] = useState<Member | null>(null);
    const [sending, setSending] = useState(false);

    const list = useMemo(() => {
        const q = query.trim().toLowerCase();
        return products.filter((p) => (!cat || p.category_id === cat) && (!q || p.name.toLowerCase().includes(q)));
    }, [products, cat, query]);

    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const total = lines.reduce((s, l) => s + l.price * l.quantity, 0);

    useEffect(() => onCount(count), [count, onCount]);
    useEffect(() => () => onCount(0), [onCount]);

    const add = useCallback((p: Product, v: Product['variants'][number] | null = null) => {
        const key = `${p.id}-${v?.id ?? 'base'}`;
        setLines((prev) => {
            const ex = prev.find((l) => l.key === key && !l.note);
            if (ex) return prev.map((l) => (l === ex ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l));
            return [
                ...prev,
                {
                    key,
                    product_id: p.id,
                    variant_id: v?.id ?? null,
                    name: p.name,
                    variant_name: v?.name ?? null,
                    price: p.price + (v?.extra_price ?? 0),
                    quantity: 1,
                    note: '',
                },
            ];
        });
        if ('vibrate' in navigator) navigator.vibrate?.(15);
    }, []);

    const removeOne = (key: string) =>
        setLines((p) => p.flatMap((x) => (x.key !== key ? [x] : x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : [])));

    const qtyOf = (productId: number) => lines.filter((l) => l.product_id === productId).reduce((s, l) => s + l.quantity, 0);

    const send = () => {
        if (!lines.length) return;
        setSending(true);
        router.post(
            '/tables/orders',
            {
                table_id: table.id,
                items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, quantity: l.quantity, note: l.note || null })),
                covers: covers || null,
                customer_id: member?.id ?? null,
                notes: notes || null,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setReviewOpen(false);
                    onSent();
                },
                onError: (errs) => toast.error(Object.values(errs)[0] as string),
                onFinish: () => setSending(false),
            },
        );
    };

    const ticket = (
        <Ticket
            table={table}
            lines={lines}
            setLines={setLines}
            removeOne={removeOne}
            covers={covers}
            setCovers={setCovers}
            notes={notes}
            setNotes={setNotes}
            member={member}
            setMember={setMember}
            total={total}
            count={count}
            sending={sending}
            onSend={send}
        />
    );

    return (
        <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6 lg:px-5">
            <div className="min-w-0 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-10">
                {table.open_order && (
                    <div className="bc-rise mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-shop-warning-soft px-3 py-3 text-sm text-shop-warning ring-1 ring-shop-warning/15 lg:mx-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-shop-surface/70">
                            <Receipt className="h-4 w-4" />
                        </span>
                        <p>
                            <b>
                                Open ticket · <Price value={table.open_order.total} />
                            </b>
                            . New items are added as another round.
                        </p>
                    </div>
                )}

                <div className="sticky top-16 z-20 space-y-3 bg-shop-bg/90 px-4 pt-4 pb-3 backdrop-blur-xl lg:px-0">
                    <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-shop-muted" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search the menu"
                                type="search"
                                className="shadow-shop-sm h-12 w-full rounded-2xl border-0 bg-shop-surface pr-10 pl-12 text-base ring-1 ring-shop-line outline-none placeholder:text-shop-muted focus:ring-2 focus:ring-shop-accent"
                            />
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-shop-muted hover:bg-shop-sunken"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div
                            className="shadow-shop-sm flex h-12 shrink-0 items-center gap-1 rounded-2xl bg-shop-surface p-1 ring-1 ring-shop-line"
                            role="group"
                            aria-label="Menu layout"
                        >
                            {(
                                [
                                    ['list', ListIcon, 'List view'],
                                    ['grid', LayoutGrid, 'Grid view'],
                                ] as const
                            ).map(([value, Icon, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setMenuLayout(value)}
                                    aria-pressed={menuLayout === value}
                                    aria-label={label}
                                    title={label}
                                    className={cn(
                                        'flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl transition-colors',
                                        menuLayout === value ? 'bg-shop-ink text-shop-bg' : 'text-shop-muted hover:bg-shop-sunken',
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="bc-rail -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
                        <Chip active={cat === null} onClick={() => setCat(null)}>
                            All
                        </Chip>
                        {categories.map((c) => (
                            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                                {c.name}
                            </Chip>
                        ))}
                    </div>
                </div>

                <ul
                    className={cn(
                        'grid px-4 pt-1 lg:px-0',
                        menuLayout === 'list' ? 'grid-cols-1 gap-2 md:grid-cols-2' : 'grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4',
                    )}
                >
                    {list.map((p) => {
                        const q = qtyOf(p.id);
                        const hasOptions = p.variants.length > 0;
                        const baseKey = `${p.id}-base`;
                        const baseQty = lines.find((l) => l.key === baseKey && !l.note)?.quantity ?? 0;
                        const qtyControl = (
                            <QtyControl
                                size="sm"
                                qty={hasOptions ? 0 : baseQty}
                                label={p.name}
                                onAdd={() => (hasOptions ? setVariantFor(p) : add(p))}
                                onRemove={hasOptions ? undefined : () => removeOne(baseKey)}
                                className="ml-auto"
                            />
                        );
                        if (menuLayout === 'list') {
                            return (
                                <li
                                    key={p.id}
                                    className={cn(
                                        'shadow-shop-sm relative flex items-center gap-3 rounded-[20px] bg-shop-surface p-1.5 pr-3 ring-1 transition-shadow duration-300 ease-shop',
                                        q > 0 ? 'ring-2 ring-shop-accent' : 'ring-shop-line',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => (hasOptions ? setVariantFor(p) : add(p))}
                                        className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                                        aria-label={`Add ${p.name}`}
                                    >
                                        <span className="relative shrink-0">
                                            <ProductImage src={p.image} alt="" className="h-18 w-18 rounded-[14px]" />
                                            {q > 0 && (
                                                <span
                                                    key={q}
                                                    className="bc-bump shadow-shop-md absolute -top-1 -left-1 rounded-full bg-shop-ink px-2 py-0.5 text-[11px] font-bold text-shop-bg tabular-nums"
                                                >
                                                    ×{q}
                                                </span>
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="line-clamp-2 text-[15px] leading-snug font-semibold">{p.name}</span>
                                            <span className="mt-0.5 flex items-baseline gap-2">
                                                <Price value={p.price} className="font-display text-base font-bold" />
                                                {hasOptions && (
                                                    <span className="text-[11px] font-medium text-shop-muted">{p.variants.length} options</span>
                                                )}
                                            </span>
                                        </span>
                                    </button>
                                    {qtyControl}
                                </li>
                            );
                        }
                        return (
                            <li
                                key={p.id}
                                className={cn(
                                    'shadow-shop-sm hover:shadow-shop-md relative flex flex-col overflow-hidden rounded-[24px] bg-shop-surface p-1.5 ring-1 transition-[translate,box-shadow] duration-300 ease-shop hover:-translate-y-0.5',
                                    q > 0 ? 'ring-2 ring-shop-accent' : 'ring-shop-line',
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => (hasOptions ? setVariantFor(p) : add(p))}
                                    className="group block cursor-pointer text-left"
                                    aria-label={`Add ${p.name}`}
                                >
                                    <ProductImage
                                        src={p.image}
                                        alt=""
                                        className="aspect-[4/3] w-full rounded-[18px] [&_img]:group-hover:scale-[1.06]"
                                    />
                                    <p className="line-clamp-2 min-h-[2.75rem] px-2 pt-2.5 text-[15px] leading-snug font-semibold">{p.name}</p>
                                </button>
                                {q > 0 && (
                                    <span
                                        key={q}
                                        className="bc-bump shadow-shop-md absolute top-3 left-3 rounded-full bg-shop-ink/90 px-2.5 py-1 text-xs font-bold text-shop-bg tabular-nums backdrop-blur"
                                    >
                                        ×{q}
                                    </span>
                                )}
                                <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 pt-1 pb-1.5">
                                    <div className="min-w-0">
                                        <Price value={p.price} className="font-display text-base font-bold" />
                                        {hasOptions && <p className="text-[11px] font-medium text-shop-muted">{p.variants.length} options</p>}
                                    </div>
                                    {qtyControl}
                                </div>
                            </li>
                        );
                    })}
                    {list.length === 0 && <li className="col-span-full py-16 text-center text-shop-muted">No menu items match “{query}”.</li>}
                </ul>
            </div>

            {/* Desktop/tablet: the ticket lives beside the menu */}
            {isDesktop && (
                <aside className="shadow-shop-md sticky top-20 mt-4 flex h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-3xl bg-shop-surface ring-1 ring-shop-line">
                    {ticket}
                </aside>
            )}

            {/* Phone: floating review bar + sheet */}
            {!isDesktop && (
                <>
                    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <button
                            type="button"
                            disabled={!count}
                            onClick={() => setReviewOpen(true)}
                            className="bc-press shadow-shop-lg flex h-16 w-full cursor-pointer items-center justify-between rounded-[22px] bg-shop-navy px-3 pr-5 text-shop-navy-ink transition-opacity disabled:pointer-events-none disabled:opacity-0"
                        >
                            <span className="flex items-center gap-3">
                                <span className="flex h-10 min-w-10 items-center justify-center rounded-2xl bg-white/15 px-2 font-bold tabular-nums">
                                    {count}
                                </span>
                                <span className="text-left leading-tight">
                                    <span className="block text-base font-bold">Review order</span>
                                    <span className="block text-xs opacity-75">Table {table.table_number}</span>
                                </span>
                            </span>
                            <Price value={total} className="font-display text-xl font-bold" />
                        </button>
                    </div>
                    <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
                        <SheetContent
                            side="bottom"
                            showCloseButton={false}
                            className="bc-shop flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-[28px] border-shop-line bg-shop-surface p-0 sm:mx-auto sm:max-w-lg"
                        >
                            <SheetTitle className="sr-only">Table {table.table_number} order</SheetTitle>
                            <SheetDescription className="sr-only">Check the order with the guests, then send it to the cashier.</SheetDescription>
                            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-shop-line" aria-hidden />
                            {ticket}
                        </SheetContent>
                    </Sheet>
                </>
            )}

            {/* Variant picker */}
            <Sheet open={!!variantFor} onOpenChange={(o) => !o && setVariantFor(null)}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="bc-shop rounded-t-[28px] border-shop-line bg-shop-surface p-0 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md"
                >
                    {variantFor && (
                        <>
                            <div className="flex items-center gap-3 p-4 pb-2">
                                <ProductImage src={variantFor.image} alt="" className="h-16 w-16 shrink-0 rounded-2xl" />
                                <div className="min-w-0 flex-1">
                                    <SheetTitle className="truncate font-display text-xl font-bold">{variantFor.name}</SheetTitle>
                                    <SheetDescription className="text-shop-muted">Choose one option</SheetDescription>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setVariantFor(null)}
                                    className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken"
                                    aria-label="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="space-y-2 px-4 pt-2">
                                {variantFor.variants.map((v) => (
                                    <button
                                        key={v.id}
                                        type="button"
                                        onClick={() => {
                                            add(variantFor, v);
                                            setVariantFor(null);
                                        }}
                                        className="bc-press flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-shop-line px-4 text-left font-semibold hover:border-shop-accent hover:bg-shop-accent-soft/50"
                                    >
                                        {v.name}
                                        <span className="flex items-center gap-2 text-sm text-shop-muted">
                                            <Price value={variantFor.price + v.extra_price} />
                                            <Plus className="h-4 w-4 text-shop-accent-ink" />
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

// ─── Ticket (sheet on phones, side panel on tablets/desktop) ─────────────────

function Ticket({
    table,
    lines,
    setLines,
    removeOne,
    covers,
    setCovers,
    notes,
    setNotes,
    member,
    setMember,
    total,
    count,
    sending,
    onSend,
}: {
    table: Table;
    lines: Line[];
    setLines: React.Dispatch<React.SetStateAction<Line[]>>;
    removeOne: (key: string) => void;
    covers: number;
    setCovers: (n: number) => void;
    notes: string;
    setNotes: (s: string) => void;
    member: Member | null;
    setMember: (m: Member | null) => void;
    total: number;
    count: number;
    sending: boolean;
    onSend: () => void;
}) {
    const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
    const [memberQuery, setMemberQuery] = useState('');
    const [memberMsg, setMemberMsg] = useState<string | null>(null);
    const [finding, setFinding] = useState(false);

    const findMember = async () => {
        setMemberMsg(null);
        setFinding(true);
        try {
            const res = await jsonRequest<{ customer: Member | null }>(`/tables/customers/find?q=${encodeURIComponent(memberQuery)}`);
            if (res.customer) setMember(res.customer);
            else setMemberMsg('No member found with that mobile or card number.');
        } catch (e) {
            setMemberMsg((e as Error).message);
        } finally {
            setFinding(false);
        }
    };

    return (
        <>
            <div className="flex items-end justify-between gap-3 border-b border-shop-line px-5 pt-4 pb-3">
                <div>
                    <p className="text-[11px] font-semibold tracking-[0.14em] text-shop-muted uppercase">This round</p>
                    <p className="font-display text-2xl leading-tight font-bold">Table {table.table_number}</p>
                </div>
                <span className="rounded-full bg-shop-sunken px-3 py-1 text-xs font-bold tabular-nums">
                    {count} item{count === 1 ? '' : 's'}
                </span>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
                {lines.length === 0 ? (
                    <div className="flex flex-col items-center py-10 text-center">
                        <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-shop-accent-soft text-shop-accent-ink">
                            <UtensilsCrossed className="h-6 w-6" />
                        </span>
                        <p className="mt-4 font-semibold">Nothing added yet</p>
                        <p className="mt-1 max-w-[16rem] text-sm text-shop-muted">Tap menu items to build this table's order.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {lines.map((l) => {
                            const showNote = noteOpen[l.key] || !!l.note;
                            return (
                                <li key={l.key} className="rounded-2xl bg-shop-raised p-3 ring-1 ring-shop-line">
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="leading-snug font-semibold">{l.name}</p>
                                            {l.variant_name && <p className="text-xs text-shop-muted">{l.variant_name}</p>}
                                            <Price value={l.price * l.quantity} className="mt-0.5 block text-sm font-bold" />
                                        </div>
                                        <div className="flex h-10 items-center rounded-full bg-shop-surface ring-1 ring-shop-line">
                                            <button
                                                type="button"
                                                className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken"
                                                onClick={() => removeOne(l.key)}
                                                aria-label={`One less ${l.name}`}
                                            >
                                                <Minus className="h-4 w-4" />
                                            </button>
                                            <span className="w-6 text-center font-bold tabular-nums">{l.quantity}</span>
                                            <button
                                                type="button"
                                                className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full hover:bg-shop-sunken"
                                                onClick={() =>
                                                    setLines((p) =>
                                                        p.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(99, x.quantity + 1) } : x)),
                                                    )
                                                }
                                                aria-label={`One more ${l.name}`}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                    {showNote ? (
                                        <input
                                            autoFocus={noteOpen[l.key] && !l.note}
                                            value={l.note}
                                            onChange={(e) =>
                                                setLines((p) => p.map((x) => (x.key === l.key ? { ...x, note: e.target.value.slice(0, 120) } : x)))
                                            }
                                            placeholder="Kitchen note (e.g. no onions)"
                                            className="mt-2 h-10 w-full rounded-xl border-0 bg-shop-surface px-3 text-sm ring-1 ring-shop-line outline-none placeholder:text-shop-muted focus:ring-2 focus:ring-shop-accent"
                                        />
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setNoteOpen((n) => ({ ...n, [l.key]: true }))}
                                            className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-shop-accent-ink hover:underline"
                                        >
                                            <MessageSquarePlus className="h-3.5 w-3.5" /> Add kitchen note
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 rounded-2xl bg-shop-sunken/60 p-3">
                    <span className="text-sm font-semibold">Guests</span>
                    <div className="flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={() => setCovers(Math.max(0, covers - 1))}
                            disabled={covers === 0}
                            className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-shop-surface ring-1 ring-shop-line disabled:opacity-40"
                            aria-label="Fewer guests"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <span className={cn('w-16 text-center tabular-nums', covers ? 'text-lg font-bold' : 'text-xs font-medium text-shop-muted')}>
                            {covers || 'Optional'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCovers(Math.min(50, covers + 1))}
                            className="bc-press flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-shop-surface ring-1 ring-shop-line"
                            aria-label="More guests"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <label htmlFor="ticket-note" className="text-sm font-semibold">
                        Note
                    </label>
                    <input
                        id="ticket-note"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, 200))}
                        placeholder="Birthday, allergies…"
                        className="h-10 w-full min-w-0 rounded-xl border-0 bg-shop-surface px-3 text-sm ring-1 ring-shop-line outline-none placeholder:text-shop-muted focus:ring-2 focus:ring-shop-accent"
                    />
                </div>

                <div className="rounded-2xl p-3 ring-1 ring-shop-line">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-shop-warning-soft text-shop-warning">
                            <Star className="h-3.5 w-3.5 fill-current" />
                        </span>
                        Boundary Rewards
                        <span className="font-normal text-shop-muted">(optional)</span>
                    </p>
                    {member ? (
                        <div className="mt-3 flex items-center gap-3 rounded-xl bg-shop-warning-soft px-3 py-2.5">
                            <div className="min-w-0 flex-1 text-sm">
                                <p className="truncate font-bold">{member.name}</p>
                                <p className="text-xs text-shop-muted tabular-nums">
                                    {member.customer_number} · {member.loyalty_points.toLocaleString()} pts
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMember(null)}
                                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-black/5"
                                aria-label="Remove member"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <form
                            className="mt-3 flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (memberQuery.trim().length >= 4) findMember();
                            }}
                        >
                            <input
                                value={memberQuery}
                                onChange={(e) => setMemberQuery(e.target.value)}
                                placeholder="Mobile or card no."
                                inputMode="tel"
                                aria-label="Member mobile or card number"
                                className="h-11 min-w-0 flex-1 rounded-xl border-0 bg-shop-surface px-3 text-base ring-1 ring-shop-line outline-none placeholder:text-shop-muted focus:ring-2 focus:ring-shop-accent"
                            />
                            <ShopButton
                                type="submit"
                                variant="secondary"
                                size="sm"
                                className="h-11"
                                loading={finding}
                                disabled={memberQuery.trim().length < 4}
                            >
                                Find
                            </ShopButton>
                        </form>
                    )}
                    {memberMsg && <p className="mt-2 text-xs text-shop-danger">{memberMsg}</p>}
                </div>
            </div>

            <div className="border-t border-shop-line bg-shop-surface px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                <div className="mb-3 flex items-baseline justify-between">
                    <span className="text-sm text-shop-muted">Round total</span>
                    <Price value={total} className="font-display text-2xl font-bold" />
                </div>
                <ShopButton size="lg" block loading={sending} disabled={!lines.length} onClick={onSend}>
                    {!sending && <Send className="h-5 w-5" />}
                    Send to cashier
                </ShopButton>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-xs text-shop-muted">
                    <Check className="h-3.5 w-3.5 text-shop-success" /> Shows in the POS under Pending Orders as Table {table.table_number}
                </p>
            </div>
        </>
    );
}

type MenuLayout = 'list' | 'grid';

/**
 * The waiter's preferred menu layout, remembered per device. Defaults to a
 * compact list on phones and a picture grid on tablets and larger.
 */
function useMenuLayout(): [MenuLayout, (layout: MenuLayout) => void] {
    const [layout, setLayout] = useState<MenuLayout>(() => {
        if (typeof window === 'undefined') {
            return 'grid';
        }
        try {
            const saved = window.localStorage.getItem('bc-waiter-menu-layout');
            if (saved === 'list' || saved === 'grid') {
                return saved;
            }
        } catch {
            /* ignore */
        }
        return window.matchMedia('(min-width: 640px)').matches ? 'grid' : 'list';
    });
    const choose = (next: MenuLayout) => {
        setLayout(next);
        try {
            window.localStorage.setItem('bc-waiter-menu-layout', next);
        } catch {
            /* ignore */
        }
    };
    return [layout, choose];
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'bc-press h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                active ? 'border-shop-ink bg-shop-ink text-shop-bg' : 'border-shop-line bg-shop-surface hover:bg-shop-sunken',
            )}
        >
            {children}
        </button>
    );
}
