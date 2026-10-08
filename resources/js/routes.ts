import { route } from 'ziggy-js';

export { route };

// ─── Type helpers ─────────────────────────────────────────────────────────────
type Id = number | string;

// ─── Routes ───────────────────────────────────────────────────────────────────
export const routes = {
    // ── Auth ──────────────────────────────────────────────────────────────────
    login: () => route('login'),
    loginPost: () => route('login.post'),
    logoutPost: () => route('logout.post'),

    // ── Core ──────────────────────────────────────────────────────────────────
    dashboard: () => route('dashboard'),

    // ── System Settings — ID 28 ───────────────────────────────────────────────
    settings: {
        index: () => route('settings.index'),
        save: () => route('settings.save'),
        modules: () => route('settings.modules'),
        reset: (key: string) => route('settings.reset', { key }),
        logo: () => route('settings.logo'),
    },

    // ── POS / Cashier — ID 2 ──────────────────────────────────────────────────
    pos: {
        index: () => route('pos.index'),
        store: () => route('pos.store'),
        openSession: () => route('pos.session.open'),
        show: (id: Id) => route('pos.show', { sale: id }),
        edit: (id: Id) => route('pos.edit', { sale: id }),
        update: (id: Id) => route('pos.update', { sale: id }),
        void: (id: Id) => route('pos.void', { sale: id }),
        barcodeLookup: () => route('pos.barcode.lookup'),
    },

    // ── Sales History — ID 3 ──────────────────────────────────────────────────
    sales: {
        history: () => route('sales.history'),
    },

    // ── Online Orders — ID 40 ─────────────────────────────────────────────────
    onlineOrders: {
        index: () => route('online-orders.index'),
        feed: () => route('online-orders.feed'),
        pendingCount: () => route('online-orders.pending-count'),
        transition: (id: Id) => route('online-orders.transition', { onlineOrder: id }),
    },

    // ── Table Ordering (waiter) — ID 41 ───────────────────────────────────────
    tableOrders: {
        index: () => route('table-orders.index'),
        tables: () => route('table-orders.tables'),
        store: () => route('table-orders.store'),
        findCustomer: () => route('table-orders.customers.find'),
        available: (id: Id) => route('table-orders.available', { diningTable: id }),
        pending: () => route('pos.pending'),
        void: (id: Id) => route('pos.table-orders.void', { tableOrder: id }),
    },

    // ── Delivery Zone — ID 43 ─────────────────────────────────────────────────
    deliveryZone: {
        index: () => route('delivery-zone.index'),
        update: () => route('delivery-zone.update'),
    },

    // ── Loyalty Program — ID 44 ───────────────────────────────────────────────
    loyaltyProgram: {
        index: () => route('loyalty-program.index'),
        update: () => route('loyalty-program.update'),
    },

    // ── Customer ordering app (customer guard) ────────────────────────────────
    customer: {
        login: () => route('customer.login'),
        register: () => route('customer.register'),
        account: () => route('customer.account'),
        orders: () => route('customer.orders.index'),
        order: (orderNumber: string) => route('customer.orders.show', { orderNumber }),
        rewards: () => route('customer.rewards'),
        checkout: () => route('customer.checkout'),
    },

    // ── Products / Inventory — ID 6 ───────────────────────────────────────────
    products: {
        index: () => route('products.index'),
        store: () => route('products.store'),
        update: (id: Id) => route('products.update', { product: id }),
        destroy: (id: Id) => route('products.destroy', { product: id }),
        adjustStock: (id: Id) => route('products.stock.adjust', { product: id }),

        categories: {
            index: () => route('products.categories.index'),
            store: () => route('products.categories.store'),
            update: (id: Id) => route('products.categories.update', { category: id }),
            destroy: (id: Id) => route('products.categories.destroy', { category: id }),
        },

        variants: {
            index: () => route('products.variants.index'),
            store: () => route('products.variants.store'),
            update: (id: Id) => route('products.variants.update', { variant: id }),
            destroy: (id: Id) => route('products.variants.destroy', { variant: id }),
        },

        bundles: {
            index: () => route('products.bundles.index'),
            store: () => route('products.bundles.store'),
            update: (id: Id) => route('products.bundles.update', { bundle: id }),
            destroy: (id: Id) => route('products.bundles.destroy', { bundle: id }),
            addItem: (id: Id) => route('products.bundles.items.store', { bundle: id }),
            updateItem: (bundleId: Id, itemId: Id) => route('products.bundles.items.update', { bundle: bundleId, item: itemId }),
            removeItem: (bundleId: Id, itemId: Id) => route('products.bundles.items.destroy', { bundle: bundleId, item: itemId }),
            build: (id: Id) => route('products.bundles.build', { bundle: id }),
        },

        recipes: {
            index: () => route('products.recipes.index'),
            store: () => route('products.recipes.store'),
            destroy: (id: Id) => route('products.recipes.destroy', { recipe: id }),
        },

        stock: {
            index: () => route('products.stock.index'),
        },
    },

    // ── Categories standalone — ID 7 ─────────────────────────────────────────
    categories: {
        index: () => route('categories.index'),
        store: () => route('categories.store'),
        update: (id: Id) => route('categories.update', { category: id }),
        destroy: (id: Id) => route('categories.destroy', { category: id }),
    },

    // ── Variants, Bundles, Recipes, Stock standalone ─────────────────────────
    variants: { index: () => route('variants.index') },
    bundles: { index: () => route('bundles.index') },
    recipes: { index: () => route('recipes.index') },
    stock: { index: () => route('stock.index') },

    // ── Cash Sessions — ID 14 ─────────────────────────────────────────────────
    cashSessions: {
        index: () => route('cash-sessions.index'),
        open: () => route('cash-sessions.open'),
        close: (id: number) => route('cash-sessions.close', { session: id }),
        show: (id: number) => route('cash-sessions.show', { session: id }),
    },

    // ── Cash Counts — ID 15 ───────────────────────────────────────────────────
    cashCounts: {
        index: () => route('cash-counts.index'),
    },

    // ── Z-Reading (end of day) — ID 47 ────────────────────────────────────────
    zReadings: {
        index: () => route('z-readings.index'),
        store: () => route('z-readings.store'),
        show: (id: Id) => route('z-readings.show', { zReading: id }),
        reprint: (id: Id) => route('z-readings.reprint', { zReading: id }),
    },

    // ── Petty Cash — ID 16 ────────────────────────────────────────────────────
    pettyCash: {
        index: () => route('petty-cash.index'),
        store: () => route('petty-cash.store'),
        approve: (id: Id) => route('petty-cash.approve', { voucher: id }),
        reject: (id: Id) => route('petty-cash.reject', { voucher: id }),

        funds: {
            store: () => route('petty-cash.funds.store'),
            close: (fundId: Id) => route('petty-cash.funds.close', { fund: fundId }),
        },
    },

    // ── Employees — ID 45 / Attendance — ID 46 / public time clock ────────────
    employees: {
        index: () => route('employees.index'),
        store: () => route('employees.store'),
        update: (id: Id) => route('employees.update', { employee: id }),
        destroy: (id: Id) => route('employees.destroy', { employee: id }),
        enrollFace: (id: Id) => route('employees.face.store', { employee: id }),
        face: (id: Id) => route('employees.face', { employee: id }),
        resetDevice: (id: Id) => route('employees.device.destroy', { employee: id }),
    },
    attendance: {
        index: () => route('attendance.index'),
        location: (branchId: Id) => route('attendance.location', { branch: branchId }),
        photo: (id: Id) => route('attendance.photo', { attendance: id }),
    },
    timeClock: {
        show: () => route('time-clock'),
        identify: () => route('time-clock.identify'),
        challenge: () => route('time-clock.challenge'),
        punch: () => route('time-clock.punch'),
    },

    // ── Expenses — ID 17 ──────────────────────────────────────────────────────
    expenses: {
        index: () => route('expenses.index'),
        store: () => route('expenses.store'),
    },

    // ── Reports — IDs 18–21 (HTML views + direct PDF downloads) ───────────────
    reports: {
        daily: () => route('reports.daily'),
        sales: () => route('reports.sales'),
        inventory: () => route('reports.inventory'),
        expenses: () => route('reports.expenses'),
        ingredientUsage: () => route('reports.ingredient-usage'),
        stockLoss: () => route('reports.stock-loss'),
    },

    // ── Activity Logs — ID 22 ─────────────────────────────────────────────────
    logs: {
        index: () => route('logs.index'),
    },

    // ── Users — ID 23 ─────────────────────────────────────────────────────────
    users: {
        index: () => route('users.index'),
        store: () => route('users.store'),
        update: (id: Id) => route('users.update', { user: id }),
        destroy: (id: Id) => route('users.destroy', { user: id }),
    },

    // ── Suppliers — ID 24 ─────────────────────────────────────────────────────
    suppliers: {
        index: () => route('suppliers.index'),
        store: () => route('suppliers.store'),
        update: (id: Id) => route('suppliers.update', { supplier: id }),
        destroy: (id: Id) => route('suppliers.destroy', { supplier: id }),
    },

    // ── Branches — ID 25 ──────────────────────────────────────────────────────
    branches: {
        index: () => route('branches.index'),
        store: () => route('branches.store'),
        update: (id: Id) => route('branches.update', { branch: id }),
        toggle: (id: Id) => route('branches.toggle', { branch: id }),
        destroy: (id: Id) => route('branches.destroy', { branch: id }),
    },

    // ── Promos — ID 29 ────────────────────────────────────────────────────────
    promos: {
        index: () => route('promos.index'),
        store: () => route('promos.store'),
        update: (id: Id) => route('promos.update', { promo: id }),
        toggle: (id: Id) => route('promos.toggle', { promo: id }),
        destroy: (id: Id) => route('promos.destroy', { promo: id }),
        apply: () => route('promos.apply'),
    },

    // ── Dining Tables — ID 42 ─────────────────────────────────────────────────
    diningTables: {
        index: () => route('dining-tables.index'),
        store: () => route('dining-tables.store'),
        update: (id: Id) => route('dining-tables.update', { diningTable: id }),
        destroy: (id: Id) => route('dining-tables.destroy', { diningTable: id }),
    },

    // ── Expense Categories — ID 27 ────────────────────────────────────────────
    expenseCategories: {
        index: () => route('expense-categories.index'),
        store: () => route('expense-categories.store'),
        update: (id: Id) => route('expense-categories.update', { category: id }),
        toggle: (id: Id) => route('expense-categories.toggle', { category: id }),
        destroy: (id: Id) => route('expense-categories.destroy', { category: id }),
    },

    // ── Stock Adjustments (Losses/Damages) — ID 31 ───────────────────────────
    stockAdjustments: {
        index: () => route('stock-adjustments.index'),
        store: () => route('stock-adjustments.store'),
        destroy: (id: Id) => route('stock-adjustments.destroy', { stockAdjustment: id }),
    },

    // ── Inventory — ID 33 ────────────────────────────────────────────────────
    inventory: {
        index: () => route('inventory.index'),
    },

    // ── Stock Transfers — ID 34 ───────────────────────────────────────────────
    stockTransfers: {
        index: () => route('stock-transfers.index'),
        store: () => route('stock-transfers.store'),
        complete: (id: Id) => route('stock-transfers.complete', { stockTransfer: id }),
        cancel: (id: Id) => route('stock-transfers.cancel', { stockTransfer: id }),
    },

    customers: {
        index: () => route('customers.index'),
        store: () => route('customers.store'),
        show: (id: Id) => route('customers.show', { customer: id }),
        update: (id: Id) => route('customers.update', { customer: id }),
        destroy: (id: Id) => route('customers.destroy', { customer: id }),
    },

    // ── Stock Count (Physical Inventory) — ID 36 ─────────────────────────────
    stockCount: {
        index: () => route('stock-count.index'),
        start: () => route('stock-count.start'),
        show: (id: Id) => route('stock-count.show', { session: id }),
        save: (id: Id) => route('stock-count.save', { session: id }),
        commit: (id: Id) => route('stock-count.commit', { session: id }),
        cancel: (id: Id) => route('stock-count.cancel', { session: id }),
    },

    // ── Purchase Orders — ID 12 ───────────────────────────────────────────────
    purchaseOrders: {
        index: () => route('purchase-orders.index'),
        create: () => route('purchase-orders.create'),
        store: () => route('purchase-orders.store'),
        show: (id: Id) => route('purchase-orders.show', { purchase: id }),
        markPaid: (id: Id) => route('purchase-orders.mark-paid', { purchase: id }),
    },
} as const;
