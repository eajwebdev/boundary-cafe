<?php

namespace App\Http\Controllers;

use App\Models\DailySummary;
use App\Models\StockAdjustment;
use App\Models\Sale;
use App\Models\Product;
use App\Models\RecipeIngredient;
use App\Models\ProductStock;
use App\Models\Expense;
use App\Models\Branch;
use App\Models\SystemSetting;
use App\Models\CustomerPayment;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Carbon\Carbon;

class ReportController extends Controller
{
    /**
     * Resolve the branch_id to scope report data.
     * Admins can pass branch_id as a query param (or null = all).
     * Non-admins always see only their own branch, ignoring any passed param.
     */
    private function resolvedBranchId(Request $request): ?int
    {
        $user = auth()->user();
        if ($user->isAdmin()) return $request->branch_id ? (int) $request->branch_id : null;
        return $user->branch_id;
    }

    /**
     * Returns the branches list for the branch selector.
     * Non-admins receive null so the frontend hides the selector.
     */
    private function branchesForSelector(): ?object
    {
        if (!auth()->user()->isAdmin()) return null;
        return Branch::where('is_active', true)->select('id', 'name')->get();
    }

    private function reportBranding(?int $branchId): array
    {
        return [
            'businessName' => SystemSetting::businessName($branchId),
            'logoPath'     => SystemSetting::logoFilePath($branchId),
        ];
    }

    // ====================== DAILY SUMMARY ======================
    public function dailySummary(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $date = $request->date ?? today()->toDateString();

        $summary = DailySummary::generate($branchId, $date);

        return Inertia::render('Reports/DailySummary', [
            'dailySummary'    => $summary,
            'branches'        => $this->branchesForSelector(),
            'currentBranchId' => $branchId,
        ]);
    }

    public function dailySummaryPdf(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $date = $request->date ?? today()->toDateString();

        $summary = DailySummary::generate($branchId, $date);
        $branch = $branchId ? Branch::select('id', 'name')->find($branchId) : null;

        $pdf = Pdf::loadView('pdf.reports.daily', [
            'summary' => $summary,
            'branch' => $branch,
            'date' => Carbon::parse($date),
        ] + $this->reportBranding($branchId));

        $pdf->setPaper('a4', 'portrait');
        return $pdf->stream("daily-summary-{$date}.pdf");
    }

    // ====================== SALES REPORT ======================
    public function salesReport(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $filters  = array_merge($request->only(['from_date', 'to_date']), ['branch_id' => $branchId]);

        $sales = Sale::query()
            ->select([
                'id', 'receipt_number', 'created_at', 'user_id',
                'total', 'payment_method', 'payment_amount', 'amount_paid', 'balance_due', 'payment_status', 'discount_amount',
                'customer_name', 'customer_id'
            ])
            ->with(['user:id,fname,lname', 'customer:id,name'])
            ->where('status', 'completed')
            ->when($branchId, fn($q, $id) => $q->where('branch_id', $id))
            ->when($filters['from_date'] ?? null, fn($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($filters['to_date'] ?? null, fn($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->latest()
            ->paginate(10)
            ->withQueryString();

        // User::full_name is a computed accessor not in $appends — append it so it serializes
        $sales->getCollection()->each(fn($sale) => $sale->user?->append('full_name'));

        return Inertia::render('Reports/SalesReport', [
            'sales'    => $sales,
            'branches' => $this->branchesForSelector(),
            'filters'  => $filters,
        ]);
    }

    public function salesReportPdf(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $filters  = array_merge($request->only(['from_date', 'to_date', 'payment_method']), ['branch_id' => $branchId]);

        $sales = Sale::query()
            ->select([
                'id', 'receipt_number', 'created_at', 'user_id',
                'total', 'payment_method', 'payment_amount', 'amount_paid', 'balance_due', 'payment_status', 'discount_amount',
                'customer_name', 'status', 'customer_id'
            ])
            ->with(['user:id,fname,lname', 'customer:id,name'])
            ->where('status', 'completed')
            ->when($branchId, fn($q, $id) => $q->where('branch_id', $id))
            ->when($filters['from_date'] ?? null, fn($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($filters['to_date'] ?? null, fn($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->when($filters['payment_method'] ?? null, fn($q, $m) => $q->where('payment_method', $m))
            ->latest()
            ->get();

        $creditPayments = CustomerPayment::query()
            ->when($branchId, fn($q, $id) => $q->where('branch_id', $id))
            ->when($filters['from_date'] ?? null, fn($q, $d) => $q->whereDate('payment_date', '>=', $d))
            ->when($filters['to_date'] ?? null, fn($q, $d) => $q->whereDate('payment_date', '<=', $d))
            ->sum('amount');
        $totalSales = $sales->sum(fn ($sale) => in_array($sale->payment_method, ['credit', 'mixed'], true) ? 0 : ($sale->payment_method === 'installment' ? (float) $sale->amount_paid : (float) $sale->total)) + $creditPayments;

        $branch = $branchId ? Branch::select('id', 'name')->find($branchId) : null;

        $pdf = Pdf::loadView('pdf.reports.sales', [
            'sales'       => $sales,
            'total_sales' => $totalSales,
            'branch'      => $branch,
            'from_date'   => $filters['from_date'] ?? null,
            'to_date'     => $filters['to_date'] ?? null,
        ] + $this->reportBranding($filters['branch_id'] ?? null));

        $pdf->setPaper('a4', 'landscape');
        return $pdf->stream('sales-report.pdf');
    }

    // ====================== INVENTORY REPORT (Stock Levels Only) ======================
    public function inventoryReport(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $type     = $request->type ?? 'all';

        $query = Product::with([
            'category:id,name',
            'stocks' => function ($q) use ($branchId) {
                if ($branchId) $q->where('branch_id', $branchId);
            }
        ])
        ->select('id', 'name', 'category_id', 'product_type', 'barcode')
        ->when($type !== 'all', function ($q) use ($type) {
            // Keep your existing type filter logic
            if ($type === 'ingredient' || $type === 'standard') {
                $q->where('product_type', 'standard');
            } else {
                $q->where('product_type', $type);
            }
        })
        ->when($branchId, fn($q) => $q->whereHas('stocks', fn($sq) => $sq->where('branch_id', $branchId)));

        $stocks = $query->paginate(15);

        // Transform to plain arrays so Product model accessors don't override
        // branch-specific stock values during Inertia serialization.
        $stocks->getCollection()->transform(function ($product) use ($branchId) {
            // Stocks are already filtered to the branch by the eager load constraint above
            $stockRecord = $product->stocks->first();

            $stockQty = $branchId
                ? ($stockRecord?->stock ?? 0)
                : $product->stocks->sum('stock');

            return [
                'id'             => $product->id,
                'name'           => $product->name,
                'category_name'  => $product->category?->name,
                'product_type'   => $product->product_type,
                'stock'          => $stockQty,
                'unit'           => 'pcs',
                'expiry_date'    => $stockRecord?->expiry_date?->format('Y-m-d'),
                'is_low_stock'   => $stockQty > 0 && $stockQty <= 5,
                'is_near_expiry' => $stockRecord ? $stockRecord->isNearExpiry() : false,
            ];
        });

        return Inertia::render('Reports/InventoryReport', [
            'stocks'          => $stocks,
            'branches'        => $this->branchesForSelector(),
            'currentBranchId' => $branchId,
        ]);
    }

    public function inventoryReportPdf(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $type     = $request->type ?? 'all';

        $products = Product::with([
                'category:id,name',
                'stocks' => function ($q) use ($branchId) {
                    if ($branchId) $q->where('branch_id', $branchId);
                },
            ])
            ->when($type !== 'all', function ($q) use ($type) {
                if ($type === 'ingredient' || $type === 'standard') {
                    $q->where('product_type', 'standard');
                } else {
                    $q->where('product_type', $type);
                }
            })
            ->when($branchId, function ($q) use ($branchId) {
                $q->whereHas('stocks', fn($sq) => $sq->where('branch_id', $branchId));
            })
            ->get();

        // Transform to plain objects so Product model accessors don't override
        // branch-specific stock values in the Blade template.
        $stocks = $products->map(function ($product) use ($branchId) {
            $stockRecord = $product->stocks->first();

            $stockQty = $branchId
                ? ($stockRecord?->stock ?? 0)
                : $product->stocks->sum('stock');

            $item = new \stdClass();
            $item->name         = $product->name;
            $item->category     = $product->category;
            $item->product_type = $product->product_type;
            $item->stock        = $stockQty;
            $item->unit         = 'pcs';
            $item->expiry_date  = $stockRecord?->expiry_date; // Carbon instance or null
            return $item;
        });

        $branch = $branchId ? Branch::select('id', 'name')->find($branchId) : null;

        $pdf = Pdf::loadView('pdf.reports.inventory', [
            'stocks'       => $stocks,
            'branch'       => $branch,
        ] + $this->reportBranding($branchId));

        $pdf->setPaper('a4', 'portrait');
        return $pdf->stream('inventory-report.pdf');
    }

    // ====================== NEW: INGREDIENT USAGE REPORT (Separate) ======================
    public function ingredientUsageReport(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $fromDate = $request->from_date;
        $toDate   = $request->to_date ?: now()->format('Y-m-d');

        $usage = collect();

        if ($fromDate) {
            $usage = RecipeIngredient::selectRaw('
                    recipe_ingredients.ingredient_id,
                    ingredients.name as ingredient_name,
                    recipe_ingredients.unit,
                    SUM(recipe_ingredients.quantity * sale_items.quantity) as total_used
                ')
                ->join('products as ingredients', 'ingredients.id', '=', 'recipe_ingredients.ingredient_id')
                ->join('sale_items', 'sale_items.product_id', '=', 'recipe_ingredients.product_id')
                ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->whereBetween('sales.created_at', [$fromDate, $toDate . ' 23:59:59'])
                ->when($branchId, fn($q) => $q->where('sales.branch_id', $branchId))
                ->groupBy('recipe_ingredients.ingredient_id', 'ingredients.name', 'recipe_ingredients.unit')
                ->orderByDesc('total_used')
                ->get();

            // Add breakdown per finished product
            $usage->each(function ($item) use ($fromDate, $toDate, $branchId) {
                $item->recipes_used_in = RecipeIngredient::selectRaw('
                        products.name as product_name,
                        recipe_ingredients.quantity as quantity_per_unit,
                        SUM(sale_items.quantity) as total_sold
                    ')
                    ->join('products', 'products.id', '=', 'recipe_ingredients.product_id')
                    ->join('sale_items', 'sale_items.product_id', '=', 'recipe_ingredients.product_id')
                    ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                    ->where('recipe_ingredients.ingredient_id', $item->ingredient_id)
                    ->whereBetween('sales.created_at', [$fromDate, $toDate . ' 23:59:59'])
                    ->when($branchId, fn($q) => $q->where('sales.branch_id', $branchId))
                    ->groupBy('products.name', 'recipe_ingredients.quantity')
                    ->get();
            });
        }

        return Inertia::render('Reports/IngredientUsageReport', [
            'usage'    => $usage,
            'branches' => $this->branchesForSelector(),
        ]);
    }

    public function ingredientUsageReportPdf(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $fromDate = $request->from_date;
        $toDate   = $request->to_date ?: now()->format('Y-m-d');

        $usage = collect();

        if ($fromDate) {
            $usage = RecipeIngredient::selectRaw('
                    recipe_ingredients.ingredient_id,
                    ingredients.name as ingredient_name,
                    recipe_ingredients.unit,
                    SUM(recipe_ingredients.quantity * sale_items.quantity) as total_used
                ')
                ->join('products as ingredients', 'ingredients.id', '=', 'recipe_ingredients.ingredient_id')
                ->join('sale_items', 'sale_items.product_id', '=', 'recipe_ingredients.product_id')
                ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->whereBetween('sales.created_at', [$fromDate, $toDate . ' 23:59:59'])
                ->when($branchId, fn($q) => $q->where('sales.branch_id', $branchId))
                ->groupBy('recipe_ingredients.ingredient_id', 'ingredients.name', 'recipe_ingredients.unit')
                ->orderByDesc('total_used')
                ->get();

            $usage->each(function ($item) use ($fromDate, $toDate, $branchId) {
                $item->recipes_used_in = RecipeIngredient::selectRaw('
                        products.name as product_name,
                        recipe_ingredients.quantity as quantity_per_unit,
                        SUM(sale_items.quantity) as total_sold
                    ')
                    ->join('products', 'products.id', '=', 'recipe_ingredients.product_id')
                    ->join('sale_items', 'sale_items.product_id', '=', 'recipe_ingredients.product_id')
                    ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                    ->where('recipe_ingredients.ingredient_id', $item->ingredient_id)
                    ->whereBetween('sales.created_at', [$fromDate, $toDate . ' 23:59:59'])
                    ->when($branchId, fn($q) => $q->where('sales.branch_id', $branchId))
                    ->groupBy('products.name', 'recipe_ingredients.quantity')
                    ->get();
            });
        }

        $branch = $branchId ? Branch::select('id', 'name')->find($branchId) : null;

        $pdf = Pdf::loadView('pdf.reports.ingredient-usage', [
            'usage'    => $usage,
            'fromDate' => $fromDate,
            'toDate'   => $toDate,
            'branch'   => $branch,
        ] + $this->reportBranding($branchId));

        $pdf->setPaper('a4', 'portrait');
        return $pdf->stream('ingredient-usage-report.pdf');
    }

    // ====================== EXPENSES REPORT ======================
    public function expenseReport(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $filters  = array_merge($request->only(['from_date', 'to_date']), ['branch_id' => $branchId]);

        $baseQuery = fn() => Expense::query()
            ->where('status', 'approved')
            ->when($filters['branch_id'] ?? null, fn($q, $id) => $q->where('branch_id', $id))
            ->when($filters['from_date'] ?? null, fn($q, $d) => $q->whereDate('expense_date', '>=', $d))
            ->when($filters['to_date'] ?? null, fn($q, $d) => $q->whereDate('expense_date', '<=', $d));

        $expenses = $baseQuery()
            ->select([
                'id', 'expense_date', 'amount', 'expense_category_id',
                'payment_method', 'description', 'status'
            ])
            ->with(['category:id,name'])
            ->latest('expense_date')
            ->paginate(10)
            ->withQueryString();

        $totalAmount = $baseQuery()->sum('amount');

        return Inertia::render('Reports/ExpensesReport', [
            'expenses'     => $expenses,
            'branches'     => $this->branchesForSelector(),
            'filters'      => $filters,
            'total_amount' => (float) $totalAmount,
        ]);
    }

    public function expenseReportPdf(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);
        $filters  = array_merge($request->only(['from_date', 'to_date']), ['branch_id' => $branchId]);

        $expenses = Expense::query()
            ->select([
                'id', 'expense_date', 'amount', 'expense_category_id',
                'payment_method', 'description', 'status'
            ])
            ->with(['category:id,name'])
            ->where('status', 'approved')
            ->when($branchId, fn($q, $id) => $q->where('branch_id', $id))
            ->when($filters['from_date'] ?? null, fn($q, $d) => $q->whereDate('expense_date', '>=', $d))
            ->when($filters['to_date'] ?? null, fn($q, $d) => $q->whereDate('expense_date', '<=', $d))
            ->latest('expense_date')
            ->get();

        $branch = $branchId ? Branch::select('id', 'name')->find($branchId) : null;

        $pdf = Pdf::loadView('pdf.reports.expenses', [
            'expenses'     => $expenses,
            'branch'       => $branch,
            'fromDate'     => $filters['from_date'] ?? null,
            'toDate'       => $filters['to_date'] ?? null,
        ] + $this->reportBranding($branchId));

        $pdf->setPaper('a4', 'portrait');
        return $pdf->stream('expenses-report.pdf');
    }

    // ====================== STOCK LOSS REPORT ======================

    public function stockLossReport(Request $request)
    {
        $branchId = $this->resolvedBranchId($request);

        $filters = $request->only(['from', 'to', 'type']);
        $from = $filters['from'] ?? now()->startOfMonth()->toDateString();
        $to   = $filters['to']   ?? now()->toDateString();

        $query = StockAdjustment::with(['product:id,name,barcode', 'recordedBy:id,fname,lname'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereDate('created_at', '>=', $from)
            ->whereDate('created_at', '<=', $to);

        if (!empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        $adjustments = $query->latest()->get()->map(fn ($a) => [
            'id'           => $a->id,
            'date'         => $a->created_at->toDateTimeString(),
            'product_name' => $a->product?->name ?? '—',
            'barcode'      => $a->product?->barcode,
            'type'         => $a->type,
            'type_label'   => StockAdjustment::typeLabel($a->type),
            'quantity'     => $a->quantity,
            'unit_cost'    => (float) $a->unit_cost,
            'total_cost'   => round((float) $a->unit_cost * $a->quantity, 2),
            'note'         => $a->note,
            'recorded_by'  => trim(($a->recordedBy?->fname ?? '') . ' ' . ($a->recordedBy?->lname ?? '')),
        ]);

        $summary = $adjustments->groupBy('type')->map(fn ($group) => [
            'count'      => $group->count(),
            'total_qty'  => $group->sum('quantity'),
            'total_cost' => $group->sum('total_cost'),
        ]);

        return Inertia::render('Reports/StockLoss', [
            'adjustments'     => $adjustments,
            'summary'         => $summary,
            'total_loss'      => $adjustments->sum('total_cost'),
            'total_units'     => $adjustments->sum('quantity'),
            'filters'         => ['from' => $from, 'to' => $to, 'type' => $filters['type'] ?? null],
            'branches'        => $this->branchesForSelector(),
            'currentBranchId' => $branchId,
        ]);
    }
}
