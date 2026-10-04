import { route } from '@/routes';

export const reportRoutes = {
    daily: () => route('reports.daily'),
    sales: () => route('reports.sales'),
    inventory: () => route('reports.inventory'),
    expenses: () => route('reports.expenses'),
    ingredientUsage: () => route('reports.ingredient-usage'),

    dailyPreview: () => route('reports.daily.pdf'),
    salesPreview: () => route('reports.sales.pdf'),
    inventoryPreview: () => route('reports.inventory.pdf'),
    expensesPreview: () => route('reports.expenses.pdf'),
    ingredientUsagePreview: () => route('reports.ingredient-usage.pdf'),
} as const;

export type ReportType = 'daily' | 'sales' | 'inventory' | 'expenses' | 'ingredient-usage';

export interface ReportFilters {
    branch_id?: number;
    date?: string;
    from_date?: string;
    to_date?: string;
    payment_method?: string;
}

// Add this type (was missing)
export interface DailySummaryData {
    id: number;
    summary_date: string;
    branch_id: number | null;
    total_transactions: number;
    gross_sales: number;
    total_refunds: number;
    cash_sales: number;
    gcash_sales: number;
    card_sales: number;
    other_sales: number;
    opening_cash: number;
    expected_cash: number;
    counted_cash: number | null;
    over_short: number;
    total_expenses: number;
    net_income: number;
    items_sold: number;
    low_stock_count: number;
    is_finalized: boolean;
    finalized_at: string | null;
    notes?: string;
}

export const getReportTitle = (type: ReportType): string => {
    const titles: Record<ReportType, string> = {
        daily: 'Daily Summary',
        sales: 'Sales Report',
        inventory: 'Inventory Report',
        expenses: 'Expenses Report',
        'ingredient-usage': 'Ingredient Usage Report',
    };
    return titles[type];
};

export const getDefaultFilters = (type: ReportType, branchId?: number): ReportFilters => {
    const today = new Date().toISOString().split('T')[0];

    if (type === 'daily') {
        return { branch_id: branchId, date: today };
    }
    return {
        branch_id: branchId,
        from_date: today,
        to_date: today,
    };
};

export const openLivePdfPreview = (type: ReportType, filters: ReportFilters = {}) => {
    const baseUrl = {
        daily: reportRoutes.dailyPreview(),
        sales: reportRoutes.salesPreview(),
        inventory: reportRoutes.inventoryPreview(),
        expenses: reportRoutes.expensesPreview(),
        'ingredient-usage': reportRoutes.ingredientUsagePreview(),
    }[type];

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.append(key, String(value));
        }
    });

    const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    window.open(url, '_blank', 'noopener,noreferrer');
};
