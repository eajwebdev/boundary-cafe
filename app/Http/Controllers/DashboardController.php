<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\CustomerPayment;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\InstallmentPayment;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockAdjustment;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Carbon\Carbon;

class DashboardController extends Controller
{
    public function index(): Response
    {
        $user = Auth::user();

        if ($user->isSuperAdmin() || $user->isAdministrator()) {
            $branches = Branch::with('supplier:id,name')
                ->orderBy('name')
                ->get()
                ->map(fn(Branch $b) => [
                    'id'            => $b->id,
                    'name'          => $b->name,
                    'code'          => $b->code,
                    'business_type' => $b->business_type,
                    'is_active'     => $b->is_active,
                    'feature_flags' => $b->feature_flags,
                ]);
        } else {
            $branches = $user->branch
                ? collect([[
                    'id'            => $user->branch->id,
                    'name'          => $user->branch->name,
                    'code'          => $user->branch->code,
                    'business_type' => $user->branch->business_type,
                    'is_active'     => $user->branch->is_active,
                    'feature_flags' => $user->branch->feature_flags,
                ]])
                : collect();
        }

        return Inertia::render('Dashboard/Index', [
            'branches' => $branches->values(),
        ]);
    }

    /**
     * JSON endpoint: returns all dashboard analytics for the given period & branch.
     * Called by the frontend via fetch/axios whenever filters change or on poll.
     */
    public function data(Request $request): JsonResponse
    {
        $user     = Auth::user();
        $isSuperAdmin = $user->isSuperAdmin();

        // ── Resolve branch scope ──────────────────────────────────────────────
        // super_admin and administrator can filter by branch; others are locked to their own
        if ($isSuperAdmin || $user->isAdministrator()) {
            $branchId = $request->branch_id ? (int) $request->branch_id : null;
        } else {
            $branchId = $user->branch_id;
        }

        // ── Resolve date range ────────────────────────────────────────────────
        $from = $request->filled('from')
            ? Carbon::parse($request->from)->startOfDay()
            : now()->startOfMonth();
        $to   = $request->filled('to')
            ? Carbon::parse($request->to)->endOfDay()
            : now()->endOfMonth();

        // Previous period for % change (same length, immediately before)
        // Use date-only diff to avoid float from start-of-day vs end-of-day
        $days     = (int) $from->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1;
        $prevFrom = $from->copy()->subDays($days)->startOfDay();
        $prevTo   = $from->copy()->subDay()->endOfDay();

        // ── Helper: scope queries ─────────────────────────────────────────────
        $scopeSales = fn($q) => $q
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to]);

        $scopePrevSales = fn($q) => $q
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$prevFrom, $prevTo]);

        $scopeExpenses = fn($q) => $q
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()]);

        $scopePrevExpenses = fn($q) => $q
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('expense_date', [$prevFrom->toDateString(), $prevTo->toDateString()]);

        // ── KPIs ──────────────────────────────────────────────────────────────
        // Revenue = cash actually received.
        // For installment sales only the down payment (payment_amount) was collected at POS;
        // the rest comes in as provider remittances recorded in installment_payments.
        // Regular sales: use total (full sale value collected immediately).
        // Installment sales: use payment_amount (DP only) + remittances received in the period.

        $scopeRemittances = fn($q) => $q
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn($q) => $q->where('installment_plans.branch_id', $branchId))
            ->whereBetween('installment_payments.payment_date', [$from->toDateString(), $to->toDateString()]);

        $scopePrevRemittances = fn($q) => $q
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn($q) => $q->where('installment_plans.branch_id', $branchId))
            ->whereBetween('installment_payments.payment_date', [$prevFrom->toDateString(), $prevTo->toDateString()]);

        // Regular (non-installment) sales — full total collected
        $regularRevenue     = (float) Sale::completed()->whereNotIn('payment_method', ['installment', 'credit', 'mixed'])->tap($scopeSales)->sum('total');
        $prevRegularRevenue = (float) Sale::completed()->whereNotIn('payment_method', ['installment', 'credit', 'mixed'])->tap($scopePrevSales)->sum('total');

        // Installment sales — only the DP collected at POS
        $instDpRevenue     = (float) Sale::completed()->where('payment_method', 'installment')->tap($scopeSales)->sum('payment_amount');
        $prevInstDpRevenue = (float) Sale::completed()->where('payment_method', 'installment')->tap($scopePrevSales)->sum('payment_amount');

        // Provider remittances received in the period
        $remittanceRevenue     = (float) InstallmentPayment::query()->tap($scopeRemittances)->sum('installment_payments.amount');
        $prevRemittanceRevenue = (float) InstallmentPayment::query()->tap($scopePrevRemittances)->sum('installment_payments.amount');

        $creditRevenue = (float) CustomerPayment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('payment_date', [$from->toDateString(), $to->toDateString()])
            ->sum('amount');
        $prevCreditRevenue = (float) CustomerPayment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('payment_date', [$prevFrom->toDateString(), $prevTo->toDateString()])
            ->sum('amount');

        $revenue     = $regularRevenue + $instDpRevenue + $remittanceRevenue + $creditRevenue;
        $prevRevenue = $prevRegularRevenue + $prevInstDpRevenue + $prevRemittanceRevenue + $prevCreditRevenue;
        $txnCount     = Sale::completed()->tap($scopeSales)->count();
        $prevTxnCount = Sale::completed()->tap($scopePrevSales)->count();
        $voidCount    = Sale::voided()->tap($scopeSales)->count();
        $voidTotal    = (float) Sale::voided()->tap($scopeSales)->sum('total');
        $discountTotal= (float) Sale::completed()->tap($scopeSales)->sum('discount_amount');

        $expenses     = (float) Expense::tap($scopeExpenses)->sum('amount');
        $prevExpenses = (float) Expense::tap($scopePrevExpenses)->sum('amount');

        $netIncome    = $revenue - $expenses;
        $prevNet      = $prevRevenue - $prevExpenses;

        $avgDaily     = $days > 0 ? round($revenue / $days, 2) : 0;

        $stockLossValue = (float) StockAdjustment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('SUM(quantity * unit_cost) as total')
            ->value('total') ?? 0;

        $creditOutstanding = (float) Sale::completed()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->where('balance_due', '>', 0)
            ->sum('balance_due');

        $pct = fn($cur, $prev) => $prev > 0 ? round((($cur - $prev) / $prev) * 100, 1) : null;

        $physicalCash = (float) Sale::completed()->where('payment_method', 'cash')->tap($scopeSales)->sum('total')
            + (float) Sale::completed()->where('payment_method', 'installment')->tap($scopeSales)->sum('payment_amount')
            + $creditRevenue;

        $activeSessionCash = (float) CashSession::when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->where('status', 'open')
            ->latest('opened_at')
            ->value('expected_cash') ?? 0;
        if ($activeSessionCash <= 0) {
            $activeSessionCash = (float) CashSession::when($branchId, fn($q) => $q->where('branch_id', $branchId))
                ->latest('opened_at')
                ->value('expected_cash') ?? $physicalCash;
        }

        $expectedGcash = (float) Sale::completed()->whereIn('payment_method', ['gcash', 'e-wallet', 'digital'])->tap($scopeSales)->sum('total');

        $accountsPayable = (float) Order::when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereIn('status', ['pending', 'confirmed', 'shipped'])
            ->sum('total');

        $overShort = (float) CashSession::when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('opened_at', [$from, $to])
            ->sum('over_short');

        $activeSessionsCount = CashSession::when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('opened_at', [$from, $to])
            ->count();

        $pendingOrdersCount = Order::when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereIn('status', ['pending', 'confirmed', 'shipped'])
            ->count();

        $kpis = [
            'revenue'              => $revenue,
            'revenue_change'       => $pct($revenue, $prevRevenue),
            'expenses'             => $expenses,
            'expenses_change'      => $pct($expenses, $prevExpenses),
            'net_income'           => $netIncome,
            'net_income_change'    => $pct($netIncome, $prevNet),
            'transactions'         => $txnCount,
            'txn_change'           => $pct($txnCount, $prevTxnCount),
            'avg_daily'            => $avgDaily,
            'void_count'           => $voidCount,
            'void_total'           => $voidTotal,
            'discount_total'       => $discountTotal,
            'stock_loss_value'     => round($stockLossValue, 2),
            'credit_collected'     => round($creditRevenue, 2),
            'credit_outstanding'   => round($creditOutstanding ?? 0, 2),
            'physical_cash'        => round($physicalCash, 2),
            'expected_cash_drawer' => round($activeSessionCash, 2),
            'expected_gcash'       => round($expectedGcash, 2),
            'accounts_payable'     => round($accountsPayable, 2),
            'over_short'           => round($overShort, 2),
            'active_sessions_count'=> $activeSessionsCount,
            'pending_orders_count' => $pendingOrdersCount,
        ];

        // ── Daily sales trend ─────────────────────────────────────────────────
        // For installment sales use payment_amount (DP only), not total.
        $dailyRows = Sale::completed()
            ->tap($scopeSales)
            ->selectRaw("DATE(created_at) as date,
                SUM(CASE WHEN payment_method = 'installment' THEN amount_paid WHEN payment_method IN ('credit','mixed') THEN 0 ELSE total END) as revenue,
                COUNT(*) as transactions,
                SUM(discount_amount) as discounts")
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        // Add daily remittances to the trend
        $dailyRemitRows = InstallmentPayment::query()
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn($q) => $q->where('installment_plans.branch_id', $branchId))
            ->whereBetween('installment_payments.payment_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw("payment_date as date, SUM(amount) as remittances")
            ->groupBy('payment_date')
            ->get()
            ->keyBy('date');

        $dailyCreditRows = CustomerPayment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('payment_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw("payment_date as date, SUM(amount) as customer_payments")
            ->groupBy('payment_date')
            ->get()
            ->keyBy('date');

        $dailyExpRows = Expense::tap($scopeExpenses)
            ->selectRaw("expense_date as date, SUM(amount) as expenses")
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        // Fill every day in range
        $dailySales = [];
        $cursor = $from->copy();
        while ($cursor->lte($to)) {
            $d = $cursor->toDateString();
            $dailySales[] = [
                'date'         => $d,
                'revenue'      => (float) ($dailyRows[$d]->revenue      ?? 0) + (float) ($dailyRemitRows[$d]->remittances ?? 0) + (float) ($dailyCreditRows[$d]->customer_payments ?? 0),
                'transactions' => (int)   ($dailyRows[$d]->transactions ?? 0),
                'discounts'    => (float) ($dailyRows[$d]->discounts    ?? 0),
                'expenses'     => (float) ($dailyExpRows[$d]->expenses  ?? 0),
            ];
            $cursor = $cursor->addDay();
        }

        // ── Hourly sales (today only, for cashier / quick view) ───────────────
        $today = now()->startOfDay();
        $hourlySales = Sale::completed()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', $today)
            ->selectRaw("HOUR(created_at) as hour,
                SUM(CASE WHEN payment_method = 'installment' THEN amount_paid WHEN payment_method IN ('credit','mixed') THEN 0 ELSE total END) as revenue,
                COUNT(*) as transactions")
            ->groupBy('hour')
            ->orderBy('hour')
            ->get()
            ->keyBy('hour');
        $hourlyCreditPayments = CustomerPayment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereDate('payment_date', today())
            ->selectRaw("HOUR(created_at) as hour, SUM(amount) as revenue")
            ->groupBy('hour')
            ->get()
            ->keyBy('hour');

        $hourlyData = [];
        for ($h = 6; $h <= 22; $h++) {
            $hourlyData[] = [
                'hour'         => $h,
                'label'        => ($h < 12 ? $h : ($h === 12 ? 12 : $h - 12)) . ($h < 12 ? 'am' : 'pm'),
                'revenue'      => (float) ($hourlySales[$h]->revenue ?? 0) + (float) ($hourlyCreditPayments[$h]->revenue ?? 0),
                'transactions' => (int)   ($hourlySales[$h]->transactions ?? 0),
            ];
        }

        // ── Payment mix ───────────────────────────────────────────────────────
        $paymentMix = Sale::completed()
            ->tap($scopeSales)
            ->selectRaw("payment_method, COUNT(*) as count, SUM(CASE WHEN payment_method = 'installment' THEN amount_paid WHEN payment_method IN ('credit','mixed') THEN 0 ELSE total END) as revenue")
            ->groupBy('payment_method')
            ->get()
            ->map(fn($r) => ['method' => $r->payment_method, 'count' => $r->count, 'revenue' => (float) $r->revenue]);
        if ($creditRevenue > 0) {
            $paymentMix->push(['method' => 'credit_payments', 'count' => null, 'revenue' => round($creditRevenue, 2)]);
        }

        // ── Top 10 products by revenue ────────────────────────────────────────
        $topProducts = SaleItem::query()
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->where('sales.status', 'completed')
            ->where('sale_items.is_bundle_component', false)
            ->when($branchId, fn($q) => $q->where('sales.branch_id', $branchId))
            ->whereBetween('sales.created_at', [$from, $to])
            ->selectRaw("products.id, products.name, SUM(sale_items.total) as revenue, SUM(sale_items.quantity) as qty_sold")
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('revenue')
            ->limit(10)
            ->get()
            ->map(fn($r) => ['name' => $r->name, 'revenue' => (float) $r->revenue, 'qty_sold' => (int) $r->qty_sold]);

        // ── Stock health ──────────────────────────────────────────────────────
        $lowThreshold = SystemSetting::lowStockThreshold($branchId);
        $stockQuery = ProductStock::when($branchId, fn($q) => $q->where('branch_id', $branchId));
        $inStock  = (clone $stockQuery)->where('stock', '>', $lowThreshold)->count();
        $lowStock = (clone $stockQuery)->where('stock', '>', 0)->where('stock', '<=', $lowThreshold)->count();
        $outStock = (clone $stockQuery)->where('stock', '<=', 0)->count();

        // ── Low stock items ───────────────────────────────────────────────────
        $lowStockItems = ProductStock::with('product:id,name,barcode')
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->where('stock', '>=', 0)
            ->where('stock', '<=', $lowThreshold)
            ->orderBy('stock')
            ->limit(10)
            ->get()
            ->map(fn($s) => [
                'name'   => $s->product?->name ?? '—',
                'stock'  => $s->stock,
                'status' => $s->stock <= 0 ? 'out' : 'low',
            ]);

        // ── Expense by category ───────────────────────────────────────────────
        $expByCategory = Expense::with('category:id,name')
            ->tap($scopeExpenses)
            ->selectRaw("expense_category_id, SUM(amount) as total")
            ->groupBy('expense_category_id')
            ->with('category:id,name')
            ->get()
            ->map(fn($r) => ['category' => $r->category?->name ?? 'Uncategorized', 'total' => (float) $r->total]);

        // ── Stock adjustments by type ─────────────────────────────────────────
        $stockAdj = StockAdjustment::query()
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("type, COUNT(*) as count, SUM(quantity) as qty, SUM(quantity * unit_cost) as value")
            ->groupBy('type')
            ->get()
            ->map(fn($r) => ['type' => $r->type, 'count' => (int)$r->count, 'qty' => (int)$r->qty, 'value' => (float)$r->value]);

        // ── Recent transactions (last 10) ─────────────────────────────────────
        $recentSales = Sale::with('user:id,fname,lname')
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->latest()
            ->limit(10)
            ->get()
            ->map(fn($s) => [
                'id'             => $s->id,
                'receipt_number' => $s->receipt_number,
                'total'          => (float) $s->total,
                'payment_method' => $s->payment_method,
                'status'         => $s->status,
                'cashier'        => trim(($s->user?->fname ?? '') . ' ' . ($s->user?->lname ?? '')),
                'created_at'     => $s->created_at->toIso8601String(),
            ]);

        // ── Cash sessions ─────────────────────────────────────────────────────
        $recentSessions = CashSession::with('user:id,fname,lname')
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->latest('opened_at')
            ->limit(6)
            ->get()
            ->map(fn($s) => [
                'id'           => $s->id,
                'cashier'      => trim(($s->user?->fname ?? '') . ' ' . ($s->user?->lname ?? '')),
                'opened_at'    => $s->opened_at?->toIso8601String(),
                'closed_at'    => $s->closed_at?->toIso8601String(),
                'opening_cash' => (float) $s->opening_cash,
                'expected_cash'=> (float) ($s->expected_cash ?? $s->computeExpectedCash()),
                'counted_cash' => $s->counted_cash ? (float) $s->counted_cash : null,
                'over_short'   => $s->over_short ? (float) $s->over_short : null,
                'status'       => $s->status,
            ]);

        // ── Pending purchase orders ───────────────────────────────────────────
        $pendingOrders = Order::with('supplier:id,name')
            ->when($branchId, fn($q) => $q->where('branch_id', $branchId))
            ->whereIn('status', ['pending', 'confirmed', 'shipped'])
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn($o) => [
                'id'           => $o->id,
                'order_number' => $o->order_number,
                'supplier'     => $o->supplier?->name ?? '—',
                'total'        => (float) $o->total,
                'status'       => $o->status,
                'created_at'   => $o->created_at->toIso8601String(),
            ]);

        // ── System overview (super admin) ─────────────────────────────────────
        $systemOverview = null;
        if ($isSuperAdmin || $user->isAdministrator()) {
            $systemOverview = [
                'branch_count'   => Branch::where('is_active', true)->count(),
                'user_count'     => \App\Models\User::count(),
                'product_count'  => Product::count(),
                'pending_orders' => Order::whereIn('status', ['pending'])->count(),
            ];
        }

        return response()->json([
            'kpis'            => $kpis,
            'daily_sales'     => $dailySales,
            'hourly_sales'    => $hourlyData,
            'payment_mix'     => $paymentMix,
            'top_products'    => $topProducts,
            'stock_health'    => compact('inStock', 'lowStock', 'outStock'),
            'low_stock_items' => $lowStockItems,
            'exp_by_category' => $expByCategory,
            'stock_adj'       => $stockAdj,
            'recent_sales'    => $recentSales,
            'recent_sessions' => $recentSessions,
            'pending_orders'  => $pendingOrders,
            'system_overview' => $systemOverview,
            'period'          => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days],
            'generated_at'    => now()->toIso8601String(),
        ]);
    }
}
