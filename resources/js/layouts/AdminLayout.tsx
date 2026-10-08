'use client';

import { Link, Head, router, usePage } from '@inertiajs/react';
import {
    LayoutDashboard,
    ShoppingCart,
    History,
    Package,
    Tag,
    PackageCheck,
    Wallet,
    BarChart2,
    PackageX,
    ScrollText,
    Users,
    Truck,
    Building2,
    FolderOpen,
    Settings,
    LogOut,
    Bell,
    Sun,
    Moon,
    ChevronDown,
    LayoutList,
    ArrowLeftRight,
    ClipboardCheck,
    Bike,
    Utensils,
    MapPinned,
    Gift,
    Armchair,
    Store,
    IdCard,
    Fingerprint,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import FloatingChat from '@/components/FloatingChat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import type { SharedProps } from '@/types/shared';
import CashierLayout from './CashierLayout';

interface AdminLayoutProps {
    children: ReactNode;
    defaultSidebarOpen?: boolean;
    sidebarCollapsible?: 'offcanvas' | 'icon' | 'none';
    title?: string;
}

// ─── Menu ID constants (must match MenuHelper.php) ───────────────────────────
const MENU = {
    DASHBOARD: '1',
    POS: '2',
    SALES_HISTORY: '3',
    PRODUCTS: '6',
    CATEGORIES: '7',
    VARIANTS: '8',
    BUNDLES: '9',
    RECIPES: '10',
    STOCK: '11',
    PURCHASE_ORDERS: '12',
    GRN: '13',
    CASH_SESSIONS: '14',
    CASH_COUNTS: '15',
    PETTY_CASH: '16',
    EXPENSES: '17',
    DAILY_SUMMARY: '18',
    SALES_REPORT: '19',
    INVENTORY_REPORT: '20',
    EXPENSE_REPORT: '21',
    INGREDIENT_USAGE_REPORT: '30',
    ACTIVITY_LOGS: '22',
    USERS: '23',
    SUPPLIERS: '24',
    BRANCHES: '25',
    EXPENSE_CATEGORIES: '27',
    SYSTEM_SETTINGS: '28',
    PROMOS: '29',
    STOCK_ADJUSTMENTS: '31',
    INVENTORY: '33',
    STOCK_TRANSFERS: '34',
    STOCK_COUNT: '36',
    CUSTOMERS: '39',
    ONLINE_ORDERS: '40',
    TABLE_ORDERING: '41',
    DINING_TABLES: '42',
    DELIVERY_ZONE: '43',
    LOYALTY_PROGRAM: '44',
    EMPLOYEES: '45',
    ATTENDANCE: '46',
    Z_READING: '47',
} as const;

/** Polls the number of new (pending) online orders for the sidebar badge. */
function usePendingOnlineCount(enabled: boolean) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        let timer: number | undefined;
        const tick = async () => {
            if (document.visibilityState === 'visible') {
                try {
                    const res = await fetch('/online-orders/pending-count', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
                    if (res.ok) setCount((await res.json()).pending ?? 0);
                } catch {
                    /* offline — keep last value */
                }
            }
            timer = window.setTimeout(tick, 30000);
        };
        tick();
        return () => window.clearTimeout(timer);
    }, [enabled]);
    return count;
}

// ─── Sidebar section header ───────────────────────────────────────────────────
function SidebarSectionLabel({ label }: { label: string }) {
    return (
        <p className="px-3 pt-4 pb-1 text-[10px] font-semibold tracking-widest text-sidebar-foreground/55 uppercase group-data-[collapsible=icon]:hidden">
            {label}
        </p>
    );
}

// ─── Simple flat link ─────────────────────────────────────────────────────────
function NavItem({
    href,
    icon: Icon,
    label,
    active,
    tooltip,
    badge,
}: {
    href: string;
    icon: React.ElementType;
    label: string;
    active: boolean;
    tooltip?: string;
    badge?: number;
}) {
    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                asChild
                tooltip={tooltip ?? label}
                className={cn(
                    'transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    active &&
                        'bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground',
                )}
            >
                <Link href={href}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                    {!!badge && badge > 0 && (
                        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-black text-white group-data-[collapsible=icon]:hidden">
                            {badge}
                        </span>
                    )}
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );
}

// ─── Collapsible group ────────────────────────────────────────────────────────
function NavGroup({ icon: Icon, label, active, children }: { icon: React.ElementType; label: string; active: boolean; children: ReactNode }) {
    return (
        <SidebarMenuItem>
            <Collapsible defaultOpen={active}>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                        tooltip={label}
                        className={cn(
                            'justify-between transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&[data-state=open]>svg:last-child]:rotate-180',
                            active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{label}</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60 transition-transform" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="mt-0.5 mb-1 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">{children}</div>
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}

// ─── Sub-link inside a NavGroup ───────────────────────────────────────────────
function SubLink({ href, label, active }: { href: string; label: string; active: boolean }) {
    return (
        <Link
            href={href}
            className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                active && 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground',
            )}
        >
            {label}
        </Link>
    );
}

// ─── Main layout ──────────────────────────────────────────────────────────────
export default function AdminLayout({ children, defaultSidebarOpen, sidebarCollapsible = 'icon', title }: AdminLayoutProps) {
    const { props } = usePage<SharedProps>();
    const { theme, setTheme } = useTheme();
    const appName = props.app?.name ?? 'POS System';
    const appLogo = props.app?.logo_url ?? null;
    const appIcon = props.app?.icon_url || appLogo || '/uploads/logo.png';

    const currentPath = usePage().url.split('?')[0].replace(/\/$/, '');
    const pendingOnline = usePendingOnlineCount(((props.auth?.user?.access ?? []) as string[]).includes('40'));
    const isPosPage = currentPath === '/pos' || currentPath.startsWith('/pos');

    // Touch-oriented layouts use the compact cashier navigation on other pages.
    // On /pos, always maintain the full SimSoft POS register interface!
    const posLayout = props.auth?.user?.pos_layout ?? 'grid';
    const BOTTOM_NAV_LAYOUTS = ['tablet', 'cafe'];
    if (BOTTOM_NAV_LAYOUTS.includes(posLayout) && !isPosPage) {
        return <CashierLayout>{children}</CashierLayout>;
    }

    // Automatically collapse / close sidebar when entering POS, unless explicitly overridden
    const shouldOpen = defaultSidebarOpen !== undefined ? defaultSidebarOpen : !isPosPage;

    const isActive = (path: string): boolean => {
        const p = new URL(path, window.location.origin).pathname.replace(/\/$/, '');
        return currentPath === p || currentPath.startsWith(p + '/');
    };

    const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

    const role: string = props.auth?.user?.role ?? '';
    const isSuperOrAdmin =
        role === 'super_admin' ||
        role === 'administrator' ||
        Boolean(props.auth?.user?.is_super_admin) ||
        Boolean(props.auth?.user?.is_administrator);

    const userAccess: string[] = props.auth?.user?.access ?? [];
    const has = (id: string) => {
        if (isSuperOrAdmin && (id === MENU.DASHBOARD || id === MENU.SYSTEM_SETTINGS)) {
            return true;
        }
        return userAccess.includes(id);
    };
    const roleLabel = () => {
        if (role === 'super_admin') return 'Super Admin';
        if (role === 'administrator') return 'Administrator';
        if (role === 'manager') return 'Manager';
        if (role === 'cashier') return 'Cashier';
        return role;
    };

    // Cash group active
    const cashActive = ['/cash-sessions', '/cash-counts', '/z-readings', '/petty-cash', '/expenses'].some(isActive);
    // Reports group active
    const reportsActive = ['/reports', '/logs', '/stock-adjustments'].some(isActive);

    return (
        <SidebarProvider key={isPosPage ? 'sidebar-pos' : 'sidebar-main'} defaultOpen={shouldOpen} forceDesktop={isPosPage}>
            <div className="flex min-h-screen w-full bg-background text-foreground">
                {/* ── SIDEBAR ─────────────────────────────────────────── */}
                <Sidebar collapsible={sidebarCollapsible} className="border-r border-sidebar-border">
                    <Head title={props.title ?? ''}>
                        <link rel="icon" href={appIcon} />
                        <link rel="apple-touch-icon" href={appIcon} />
                    </Head>

                    {/* Header / Logo */}
                    <SidebarHeader className="border-b border-sidebar-border">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton size="lg" asChild>
                                    <Link href={has(MENU.DASHBOARD) ? routes.dashboard() : routes.pos.index()}>
                                        <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-white p-0.5 shadow-xs ring-1 ring-white/20">
                                            <img src={appIcon} alt={appName} className="h-full w-full object-contain" />
                                        </div>
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-semibold">{appName}</span>
                                            <span className="truncate text-xs text-sidebar-foreground/60">
                                                {props.auth?.user?.supplier?.name ?? '—'}
                                            </span>
                                        </div>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarHeader>

                    {/* Content */}
                    <SidebarContent className="overflow-y-auto">
                        <SidebarGroup>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {/* ── MAIN ──────────────────────────── */}
                                    {has(MENU.DASHBOARD) && (
                                        <NavItem
                                            href={routes.dashboard()}
                                            icon={LayoutDashboard}
                                            label="Dashboard"
                                            active={isActive(routes.dashboard())}
                                        />
                                    )}

                                    {/* ── SALES ─────────────────────────── */}
                                    {(has(MENU.POS) ||
                                        has(MENU.SALES_HISTORY) ||
                                        has(MENU.PROMOS) ||
                                        has(MENU.CUSTOMERS) ||
                                        has(MENU.ONLINE_ORDERS) ||
                                        has(MENU.TABLE_ORDERING) ||
                                        has(MENU.LOYALTY_PROGRAM)) && (
                                        <>
                                            <SidebarSectionLabel label="Sales" />

                                            {has(MENU.POS) && (
                                                <NavItem href="/pos" icon={ShoppingCart} label="POS / Cashier" active={isActive('/pos')} />
                                            )}
                                            {has(MENU.ONLINE_ORDERS) && (
                                                <NavItem
                                                    href="/online-orders"
                                                    icon={Bike}
                                                    label="Online Orders"
                                                    active={isActive('/online-orders')}
                                                    badge={pendingOnline}
                                                />
                                            )}
                                            {has(MENU.TABLE_ORDERING) && (
                                                <NavItem href="/tables" icon={Utensils} label="Table Ordering" active={isActive('/tables')} />
                                            )}
                                            {has(MENU.SALES_HISTORY) && (
                                                <NavItem
                                                    href="/sales/history"
                                                    icon={History}
                                                    label="Sales History"
                                                    active={isActive('/sales/history')}
                                                />
                                            )}
                                            {has(MENU.PROMOS) && (
                                                <NavItem href="/promos" icon={Tag} label="Promos & Discounts" active={isActive('/promos')} />
                                            )}
                                            {has(MENU.CUSTOMERS) && (
                                                <NavItem href="/customers" icon={Users} label="Customers" active={isActive('/customers')} />
                                            )}
                                            {has(MENU.LOYALTY_PROGRAM) && (
                                                <NavItem
                                                    href="/loyalty-program"
                                                    icon={Gift}
                                                    label="Loyalty Program"
                                                    active={isActive('/loyalty-program')}
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* ── INVENTORY ─────────────────────── */}
                                    {(has(MENU.PRODUCTS) ||
                                        has(MENU.PURCHASE_ORDERS) ||
                                        has(MENU.STOCK_ADJUSTMENTS) ||
                                        has(MENU.INVENTORY) ||
                                        has(MENU.STOCK_TRANSFERS) ||
                                        has(MENU.STOCK_COUNT)) && (
                                        <>
                                            <SidebarSectionLabel label="Inventory" />
                                            {has(MENU.INVENTORY) && (
                                                <NavItem href="/inventory" icon={LayoutList} label="Inventory" active={isActive('/inventory')} />
                                            )}
                                            {has(MENU.STOCK_COUNT) && (
                                                <NavItem
                                                    href="/stock-count"
                                                    icon={ClipboardCheck}
                                                    label="Stock Count"
                                                    active={isActive('/stock-count')}
                                                />
                                            )}
                                            {has(MENU.PRODUCTS) && (
                                                <NavItem href="/products" icon={Package} label="All Products" active={currentPath === '/products'} />
                                            )}
                                            {has(MENU.STOCK_TRANSFERS) && (
                                                <NavItem
                                                    href="/stock-transfers"
                                                    icon={ArrowLeftRight}
                                                    label="Stock Transfers"
                                                    active={isActive('/stock-transfers')}
                                                />
                                            )}
                                            {has(MENU.PURCHASE_ORDERS) && (
                                                <NavItem
                                                    href="/purchase-orders"
                                                    icon={PackageCheck}
                                                    label="Purchase Orders"
                                                    active={isActive('/purchase-orders')}
                                                />
                                            )}
                                            {has(MENU.STOCK_ADJUSTMENTS) && (
                                                <NavItem
                                                    href="/stock-adjustments"
                                                    icon={PackageX}
                                                    label="Losses / Damages"
                                                    active={isActive('/stock-adjustments')}
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* ── CASH ──────────────────────────── */}
                                    {(has(MENU.CASH_SESSIONS) ||
                                        has(MENU.CASH_COUNTS) ||
                                        has(MENU.Z_READING) ||
                                        has(MENU.PETTY_CASH) ||
                                        has(MENU.EXPENSES)) && (
                                        <>
                                            <SidebarSectionLabel label="Cash" />

                                            <NavGroup icon={Wallet} label="Cash Management" active={cashActive}>
                                                {has(MENU.CASH_SESSIONS) && (
                                                    <SubLink href="/cash-sessions" label="Cash Sessions" active={isActive('/cash-sessions')} />
                                                )}
                                                {has(MENU.CASH_COUNTS) && (
                                                    <SubLink href="/cash-counts" label="Cash Counts" active={isActive('/cash-counts')} />
                                                )}
                                                {has(MENU.Z_READING) && (
                                                    <SubLink href="/z-readings" label="Z-Reading" active={isActive('/z-readings')} />
                                                )}
                                                {has(MENU.PETTY_CASH) && (
                                                    <SubLink href="/petty-cash" label="Petty Cash" active={isActive('/petty-cash')} />
                                                )}
                                                {has(MENU.EXPENSES) && <SubLink href="/expenses" label="Expenses" active={isActive('/expenses')} />}
                                            </NavGroup>
                                        </>
                                    )}

                                    {/* ── REPORTS ───────────────────────── */}
                                    {(has(MENU.DAILY_SUMMARY) ||
                                        has(MENU.SALES_REPORT) ||
                                        has(MENU.INVENTORY_REPORT) ||
                                        has(MENU.EXPENSE_REPORT) ||
                                        has(MENU.INGREDIENT_USAGE_REPORT) ||
                                        has(MENU.ACTIVITY_LOGS)) && (
                                        <>
                                            <SidebarSectionLabel label="Reports" />

                                            <NavGroup icon={BarChart2} label="Reports" active={reportsActive}>
                                                {has(MENU.DAILY_SUMMARY) && (
                                                    <SubLink href="/reports/daily" label="Daily Summary" active={isActive('/reports/daily')} />
                                                )}
                                                {has(MENU.SALES_REPORT) && (
                                                    <SubLink href="/reports/sales" label="Sales Report" active={isActive('/reports/sales')} />
                                                )}
                                                {has(MENU.INVENTORY_REPORT) && (
                                                    <SubLink
                                                        href="/reports/inventory"
                                                        label="Inventory Report"
                                                        active={isActive('/reports/inventory')}
                                                    />
                                                )}
                                                {has(MENU.EXPENSE_REPORT) && (
                                                    <SubLink href="/reports/expenses" label="Expense Report" active={isActive('/reports/expenses')} />
                                                )}
                                                {has(MENU.INGREDIENT_USAGE_REPORT) && (
                                                    <SubLink
                                                        href="/reports/ingredient-usage"
                                                        label="Ingredient Usage"
                                                        active={isActive('/reports/ingredient-usage')}
                                                    />
                                                )}
                                                {has(MENU.STOCK_ADJUSTMENTS) && (
                                                    <SubLink
                                                        href="/reports/stock-loss"
                                                        label="Stock Loss Report"
                                                        active={isActive('/reports/stock-loss')}
                                                    />
                                                )}
                                            </NavGroup>

                                            {has(MENU.ACTIVITY_LOGS) && (
                                                <NavItem href="/logs" icon={ScrollText} label="Activity Logs" active={isActive('/logs')} />
                                            )}
                                        </>
                                    )}

                                    {/* ── MANAGEMENT ────────────────────── */}
                                    {(has(MENU.USERS) ||
                                        has(MENU.EMPLOYEES) ||
                                        has(MENU.ATTENDANCE) ||
                                        has(MENU.SUPPLIERS) ||
                                        has(MENU.BRANCHES) ||
                                        has(MENU.EXPENSE_CATEGORIES) ||
                                        has(MENU.DINING_TABLES) ||
                                        has(MENU.DELIVERY_ZONE) ||
                                        has(MENU.SYSTEM_SETTINGS)) && (
                                        <>
                                            <SidebarSectionLabel label="Management" />

                                            {has(MENU.USERS) && <NavItem href="/users" icon={Users} label="Users" active={isActive('/users')} />}
                                            {has(MENU.EMPLOYEES) && (
                                                <NavItem href="/employees" icon={IdCard} label="Employees" active={isActive('/employees')} />
                                            )}
                                            {has(MENU.ATTENDANCE) && (
                                                <NavItem href="/attendance" icon={Fingerprint} label="Attendance" active={isActive('/attendance')} />
                                            )}
                                            {has(MENU.SUPPLIERS) && (
                                                <NavItem href="/suppliers" icon={Truck} label="Suppliers" active={isActive('/suppliers')} />
                                            )}
                                            {has(MENU.BRANCHES) && (
                                                <NavItem href="/branches" icon={Building2} label="Branches" active={isActive('/branches')} />
                                            )}
                                            {has(MENU.EXPENSE_CATEGORIES) && (
                                                <NavItem
                                                    href="/expense-categories"
                                                    icon={FolderOpen}
                                                    label="Expense Categories"
                                                    active={isActive('/expense-categories')}
                                                />
                                            )}
                                            {has(MENU.DINING_TABLES) && (
                                                <NavItem
                                                    href="/dining-tables"
                                                    icon={Armchair}
                                                    label="Dining Tables"
                                                    active={isActive('/dining-tables')}
                                                />
                                            )}
                                            {has(MENU.DELIVERY_ZONE) && (
                                                <NavItem
                                                    href="/delivery-zone"
                                                    icon={MapPinned}
                                                    label="Delivery Zone"
                                                    active={isActive('/delivery-zone')}
                                                />
                                            )}
                                            {has(MENU.SYSTEM_SETTINGS) && (
                                                <NavItem href="/settings" icon={Settings} label="System Settings" active={isActive('/settings')} />
                                            )}
                                            <NavItem
                                                href="/"
                                                icon={Store}
                                                label="View storefront"
                                                active={false}
                                                tooltip="Open the customer ordering site"
                                            />
                                        </>
                                    )}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>

                    {/* Footer / Profile */}
                    <SidebarFooter className="border-t border-sidebar-border">
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <SidebarMenuButton
                                            size="lg"
                                            className="w-full data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                                        >
                                            <Avatar className="h-8 w-8 rounded-lg">
                                                <AvatarFallback className="rounded-lg bg-primary text-xs text-primary-foreground">
                                                    {props.auth?.user?.fname?.[0]?.toUpperCase() ?? '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="grid flex-1 text-left text-sm leading-tight">
                                                <span className="truncate font-semibold">
                                                    {props.auth?.user?.fname ?? ''} {props.auth?.user?.lname ?? ''}
                                                </span>
                                                <span className="truncate text-xs text-sidebar-foreground/60">{roleLabel()}</span>
                                            </div>
                                            <ChevronDown className="ml-auto h-4 w-4 opacity-50" />
                                        </SidebarMenuButton>
                                    </DropdownMenuTrigger>

                                    <DropdownMenuContent className="w-56 rounded-lg" align="start" side="right">
                                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem asChild>
                                            <Link href="/account" className="flex cursor-pointer items-center gap-2">
                                                <Users className="h-4 w-4" />
                                                Profile
                                            </Link>
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="cursor-pointer text-destructive"
                                            onSelect={() => router.post('/logout', {}, { preserveState: false })}
                                        >
                                            <LogOut className="mr-2 h-4 w-4" />
                                            Logout
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </SidebarMenuItem>
                        </SidebarMenu>
                    </SidebarFooter>

                    <SidebarRail />
                </Sidebar>

                {/* ── MAIN CONTENT ────────────────────────────────────── */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* Top bar */}
                    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background px-6 shadow-sm">
                        <div className="flex items-center gap-3">
                            <SidebarTrigger />
                            <h1 className="text-base font-semibold">{title ?? (isPosPage ? 'POS / Cashier' : (props.title ?? 'Dashboard'))}</h1>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleTheme}
                                aria-label="Toggle theme"
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                                <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                            </Button>

                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                                <Bell className="h-4 w-4" />
                            </Button>

                            <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                                    {props.auth?.user?.fname?.[0]?.toUpperCase() ?? '?'}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    </header>

                    {/* Page content */}
                    <main className={cn('flex-1 bg-background', isPosPage ? 'overflow-x-auto overflow-y-auto p-0' : 'overflow-y-auto p-6')}>
                        {children}
                    </main>
                </div>
            </div>

            {/* Floating AI Assistant — hidden on /pos and for admin/super_admin */}
            <FloatingChat />
        </SidebarProvider>
    );
}
