import { usePage } from '@inertiajs/react';
import { Activity, Banknote, Boxes, Clock, Gift, RefreshCw, ShoppingBag, TrendingUp, UtensilsCrossed } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import AdminLayout from '@/layouts/AdminLayout';
import { manilaFmt, manilaNow, manilaRange, toDateStr } from '@/lib/date';
import { cn } from '@/lib/utils';

import type { BranchOption} from './kit';
import { BranchFilter, DateFilter } from './kit';
import CashTab from './tabs/CashTab';
import CustomersTab from './tabs/CustomersTab';
import InventoryTab from './tabs/InventoryTab';
import MenuTab from './tabs/MenuTab';
import OrdersTab from './tabs/OrdersTab';
import SalesTab from './tabs/SalesTab';

type TabKey = 'sales' | 'orders' | 'menu' | 'inventory' | 'customers' | 'cash';

const TAB_META: Record<TabKey, { label: string; icon: React.ElementType }> = {
    sales: { label: 'Sales', icon: TrendingUp },
    orders: { label: 'Orders', icon: ShoppingBag },
    menu: { label: 'Menu performance', icon: UtensilsCrossed },
    inventory: { label: 'Inventory', icon: Boxes },
    customers: { label: 'Customers & Loyalty', icon: Gift },
    cash: { label: 'Cash & Expenses', icon: Banknote },
};

interface PageProps {
    branches: BranchOption[];
    tabs: TabKey[];
    auth: { user: { fname: string; role_label: string; access: string[]; is_super_admin: boolean; is_administrator: boolean; branch: { name: string } | null } };
    [key: string]: unknown;
}

interface TabResponse {
    tab: TabKey;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    period: { from: string; to: string; days: number };
    generated_at: string;
}

function readTab(allowed: TabKey[]): TabKey {
    const t = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    return t && allowed.includes(t) ? t : allowed[0] ?? 'sales';
}

export default function Dashboard() {
    const { props } = usePage<PageProps>();
    const { branches, tabs } = props;
    const user = props.auth.user;
    const isAdmin = user.is_super_admin || user.is_administrator;
    const has = (id: string) => isAdmin || user.access.includes(id);

    const [tab, setTab] = useState<TabKey>(() => readTab(tabs));
    const [branchId, setBranchId] = useState<number | null>(null);
    const [range, setRange] = useState<DateRange | undefined>(manilaRange.thisMonth());
    const [cache, setCache] = useState<Record<string, TabResponse>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    const from = range?.from ? toDateStr(range.from) : toDateStr(manilaRange.thisMonth().from);
    const to = range?.to ? toDateStr(range.to) : range?.from ? toDateStr(range.from) : toDateStr(manilaRange.thisMonth().to);
    const keyFor = useCallback((t: TabKey) => `${t}|${from}|${to}|${branchId ?? 'all'}`, [from, to, branchId]);

    const load = useCallback(
        async (t: TabKey, force = false) => {
            const key = keyFor(t);
            if (!force && cache[key]) return;
            abortRef.current?.abort();
            const ctrl = new AbortController();
            abortRef.current = ctrl;
            setLoading(true);
            setError(null);
            const params = new URLSearchParams({ tab: t, from, to });
            if (branchId) params.set('branch_id', String(branchId));
            try {
                const res = await fetch(`/dashboard/data?${params}`, { headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, signal: ctrl.signal, credentials: 'same-origin' });
                if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this tab.' : `Could not load (${res.status}).`);
                const json = (await res.json()) as TabResponse;
                setCache((c) => ({ ...c, [key]: json }));
            } catch (e) {
                if ((e as Error).name !== 'AbortError') setError((e as Error).message);
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        },
        [keyFor, cache, from, to, branchId],
    );

    // Lazy-load the active tab whenever it or the filters change.
    useEffect(() => {
        load(tab);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, from, to, branchId]);

    // Keep ?tab= in the URL so reloads and shared links open the same tab.
    useEffect(() => {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(window.history.state, '', url);
    }, [tab]);

    // Auto-refresh the visible tab every 60s.
    useEffect(() => {
        if (!autoRefresh) return;
        const t = window.setInterval(() => document.visibilityState === 'visible' && load(tab, true), 60_000);
        return () => window.clearInterval(t);
    }, [autoRefresh, tab, load]);

    const current = cache[keyFor(tab)];
    const hour = manilaNow().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <AdminLayout title="Dashboard">
            <div className="w-full space-y-4 pb-10">
                {/* Header + filters */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">
                            {greeting}, {user.fname}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {user.role_label} · {isAdmin ? (branchId ? branches.find((b) => b.id === branchId)?.name : 'All branches') : user.branch?.name} · {manilaFmt('EEEE, MMM d, yyyy')}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {isAdmin && branches.length > 1 && <BranchFilter branches={branches} selected={branchId} onChange={setBranchId} />}
                        <DateFilter applied={range} onApply={setRange} />
                        <button
                            type="button"
                            onClick={() => setAutoRefresh((v) => !v)}
                            className={cn(
                                'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold',
                                autoRefresh ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground',
                            )}
                            title="Refresh the open tab every minute"
                        >
                            <Activity className="h-3.5 w-3.5" /> {autoRefresh ? 'Live' : 'Paused'}
                        </button>
                        <button
                            type="button"
                            onClick={() => load(tab, true)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                            aria-label="Refresh now"
                        >
                            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                {/* Tabs — horizontally scrollable on phones */}
                <div className="sticky top-16 z-20 -mx-6 border-b border-border bg-background/95 px-6 backdrop-blur" role="tablist" aria-label="Dashboard sections">
                    <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {tabs.map((t) => {
                            const Meta = TAB_META[t];
                            const active = t === tab;
                            return (
                                <button
                                    key={t}
                                    role="tab"
                                    aria-selected={active}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={cn(
                                        'flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition',
                                        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <Meta.icon className="h-4 w-4" />
                                    {Meta.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {current && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {current.period.from} → {current.period.to} · {current.period.days} day{current.period.days !== 1 ? 's' : ''} · updated{' '}
                        {new Date(current.generated_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                    </p>
                )}

                {error && (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                        {error}
                        <button type="button" onClick={() => load(tab, true)} className="font-semibold underline">
                            Try again
                        </button>
                    </div>
                )}

                <div role="tabpanel">
                    {tab === 'sales' && <SalesTab data={current?.data} loading={!current} has={has} />}
                    {tab === 'orders' && <OrdersTab data={current?.data} loading={!current} has={has} />}
                    {tab === 'menu' && <MenuTab data={current?.data} loading={!current} has={has} />}
                    {tab === 'inventory' && <InventoryTab data={current?.data} loading={!current} has={has} />}
                    {tab === 'customers' && <CustomersTab data={current?.data} loading={!current} has={has} />}
                    {tab === 'cash' && <CashTab data={current?.data} loading={!current} has={has} />}
                </div>
            </div>
        </AdminLayout>
    );
}
