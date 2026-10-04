import { useMemo, useState } from 'react';
import { Table2, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtMoney } from '../ReceiptTemplate';
import type { Product, CartItem, TableOrder, DiningTable } from '../posTypes';
import TabletLayout from './TabletLayout';

function tableStatusColor(status: string) {
    if (status === 'available') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (status === 'occupied') return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    if (status === 'reserved') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    return 'bg-muted text-muted-foreground border-border';
}

// ── Start-order dialog ────────────────────────────────────────────────────────

function StartOrderDialog({
    table,
    onConfirm,
    onClose,
}: {
    table: DiningTable;
    onConfirm: (tableId: number, covers: number) => void;
    onClose: () => void;
}) {
    const [covers, setCovers] = useState(2);
    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-xs overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                <div className="flex items-start justify-between border-b border-border px-5 pt-5 pb-3">
                    <div>
                        <p className="font-semibold">{table.label ?? `Table ${table.table_number}`}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Start a new dine-in order</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    <div>
                        <label className="mb-2 block text-xs font-semibold tracking-wide text-muted-foreground uppercase">Number of covers</label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setCovers((c) => Math.max(1, c - 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted text-lg font-bold transition-colors hover:bg-muted/80"
                            >
                                −
                            </button>
                            <span className="flex-1 text-center text-xl font-black tabular-nums">{covers}</span>
                            <button
                                onClick={() => setCovers((c) => Math.min(20, c + 1))}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted text-lg font-bold transition-colors hover:bg-muted/80"
                            >
                                +
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => onConfirm(table.id, covers)}
                        className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Start Order
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RestaurantLayout({
    filtered,
    cart,
    currency,
    onProductClick,
    openTableOrders,
    diningTables,
    activeTableOrderId,
    onSelectTable,
    onStartTableOrder,
}: {
    filtered: Product[];
    cart: CartItem[];
    currency: string;
    onProductClick: (p: Product) => void;
    openTableOrders: TableOrder[];
    diningTables: DiningTable[];
    activeTableOrderId: number | null;
    onSelectTable: (id: number | null) => void;
    onStartTableOrder: (tableId: number, covers: number) => void;
}) {
    const [tab, setTab] = useState<'tables' | 'takeout'>('tables');
    const [pendingTable, setPendingTable] = useState<DiningTable | null>(null);

    const sections = useMemo(() => {
        const map: Record<string, DiningTable[]> = {};
        diningTables.forEach((t) => {
            const s = t.section ?? 'Main';
            if (!map[s]) map[s] = [];
            map[s].push(t);
        });
        return map;
    }, [diningTables]);

    const activeOrder = openTableOrders.find((o) => o.id === activeTableOrderId);

    const handleTableClick = (t: DiningTable) => {
        const order = openTableOrders.find((o) => o.table_id === t.id);
        if (order) {
            onSelectTable(order.id);
        } else {
            setPendingTable(t);
        }
    };

    const handleConfirmStart = (tableId: number, covers: number) => {
        setPendingTable(null);
        onStartTableOrder(tableId, covers);
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Sidebar */}
            <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-card xl:w-72">
                <div className="flex shrink-0 border-b border-border">
                    {(['tables', 'takeout'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                'flex-1 py-2.5 text-xs font-bold transition-colors',
                                tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t === 'tables' ? `Tables (${diningTables.length})` : 'Takeout'}
                        </button>
                    ))}
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-3">
                    {tab === 'tables' ? (
                        <>
                            {Object.keys(sections).length === 0 ? (
                                <p className="py-8 text-center text-xs text-muted-foreground">No tables configured</p>
                            ) : (
                                Object.entries(sections).map(([section, tables]) => (
                                    <div key={section}>
                                        <p className="mb-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{section}</p>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {tables.map((t) => {
                                                const order = openTableOrders.find((o) => o.table_id === t.id);
                                                const isActive = order && order.id === activeTableOrderId;
                                                return (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => handleTableClick(t)}
                                                        className={cn(
                                                            'flex flex-col items-center justify-center rounded-xl border p-2 text-center transition-all',
                                                            isActive
                                                                ? 'border-primary bg-primary/15 shadow-sm'
                                                                : order
                                                                  ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15'
                                                                  : 'border-border hover:border-primary/40 hover:bg-accent',
                                                        )}
                                                    >
                                                        <span className="text-xs font-black">{t.table_number}</span>
                                                        <span
                                                            className={cn(
                                                                'mt-0.5 text-[9px] font-medium',
                                                                order ? 'text-amber-500' : 'text-emerald-500',
                                                            )}
                                                        >
                                                            {order ? 'Occupied' : 'Free'}
                                                        </span>
                                                        {order && (
                                                            <span className="text-[9px] text-muted-foreground tabular-nums">
                                                                {fmtMoney(order.total, currency)}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    ) : (
                        <div className="py-8 text-center">
                            <p className="mb-3 text-xs text-muted-foreground">Add items to cart for takeout — no table needed</p>
                            <button
                                onClick={() => onSelectTable(null)}
                                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                            >
                                New Takeout Order
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Product area */}
            <div className="flex-1 overflow-y-auto p-3">
                {activeOrder && (
                    <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                        <Table2 className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="text-sm font-bold text-amber-500">{activeOrder.label}</span>
                        {activeOrder.customer_name && <span className="text-xs text-muted-foreground">· {activeOrder.customer_name}</span>}
                        <span className="ml-auto text-sm font-bold text-foreground tabular-nums">{fmtMoney(activeOrder.total, currency)}</span>
                        <button onClick={() => onSelectTable(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
                <TabletLayout filtered={filtered} cart={cart} currency={currency} onProductClick={onProductClick} />
            </div>

            {/* Start-order dialog */}
            {pendingTable && <StartOrderDialog table={pendingTable} onConfirm={handleConfirmStart} onClose={() => setPendingTable(null)} />}
        </div>
    );
}
