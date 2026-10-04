<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class DailySummary extends Model
{
    use HasFactory;

    protected $fillable = [
        'summary_date',
        'branch_id',
        'total_transactions',
        'gross_sales',
        'total_refunds',
        'cash_sales',
        'gcash_sales',
        'card_sales',
        'other_sales',
        'opening_cash',
        'expected_cash',
        'counted_cash',
        'over_short',
        'total_expenses',
        'expenses_by_category',
        'net_income',
        'items_sold',
        'low_stock_count',
        'is_finalized',
        'finalized_by',
        'finalized_at',
        'notes',
    ];

    protected $casts = [
        'summary_date'         => 'date',
        'gross_sales'          => 'decimal:2',
        'total_refunds'        => 'decimal:2',
        'cash_sales'           => 'decimal:2',
        'gcash_sales'          => 'decimal:2',
        'card_sales'           => 'decimal:2',
        'other_sales'          => 'decimal:2',
        'opening_cash'         => 'decimal:2',
        'expected_cash'        => 'decimal:2',
        'counted_cash'         => 'decimal:2',
        'over_short'           => 'decimal:2',
        'total_expenses'       => 'decimal:2',
        'net_income'           => 'decimal:2',
        'expenses_by_category' => 'array',
        'is_finalized'         => 'boolean',
        'finalized_at'         => 'datetime',
    ];

    // ── Relationships ──────────────────────────────────────────────
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function finalizedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finalized_by');
    }

    // ── Core: Generate (Fixed for null branch_id) ─────────────────────
    public static function generate(?int $branchId = null, Carbon|string|null $date = null, bool $force = false): static
    {
        $date = $date ? Carbon::parse($date)->toDateString() : today()->toDateString();

        // Find existing record if a specific branch is specified
        if ($branchId !== null) {
            $existing = static::where('summary_date', $date)
                ->where('branch_id', $branchId)
                ->first();

            if ($existing?->is_finalized && !$force) {
                return $existing;
            }
        }

        // Sales
        $salesQuery = Sale::whereDate('created_at', $date)
            ->where('status', '!=', 'voided')
            ->when($branchId !== null, fn($q) => $q->where('branch_id', $branchId));

        $totalTransactions = (clone $salesQuery)->count();

        // Gross = actual money collected: amount_paid for credit/mixed sales, full total for completed cash/gcash/card/etc.
        $grossSales = (float) (clone $salesQuery)
            ->selectRaw('SUM(CASE WHEN payment_method IN ("credit", "mixed") THEN amount_paid ELSE total END) as collected')
            ->value('collected');

        $totalRefunds = (float) Sale::whereDate('created_at', $date)
            ->where('status', 'voided')
            ->when($branchId !== null, fn($q) => $q->where('branch_id', $branchId))
            ->sum('total');

        $cashSales     = (float) (clone $salesQuery)->where('payment_method', 'cash')->sum('total');
        $gcashSalesPOS = (float) (clone $salesQuery)->where('payment_method', 'gcash')->sum('total');
        $cardSalesPOS  = (float) (clone $salesQuery)->where('payment_method', 'card')->sum('total');
        $creditPaidPOS = (float) (clone $salesQuery)->whereIn('payment_method', ['credit', 'mixed'])->sum('amount_paid');

        // Customer payments / credit collections received on this date
        $custPaymentsQuery = CustomerPayment::whereDate('payment_date', $date)
            ->when($branchId !== null, fn($q) => $q->where('branch_id', $branchId));
        $custCash  = (float) (clone $custPaymentsQuery)->where('payment_method', 'cash')->sum('amount');
        $custGcash = (float) (clone $custPaymentsQuery)->where('payment_method', 'gcash')->sum('amount');
        $custCard  = (float) (clone $custPaymentsQuery)->where('payment_method', 'card')->sum('amount');
        $custOther = (float) (clone $custPaymentsQuery)->whereNotIn('payment_method', ['cash', 'gcash', 'card'])->sum('amount');
        $custTotal = (float) (clone $custPaymentsQuery)->sum('amount');

        $cashSales  += $custCash;
        $gcashSales  = $gcashSalesPOS + $custGcash;
        $cardSales   = $cardSalesPOS  + $custCard;
        $grossSales += $custTotal;

        // other_sales = credit downpayments + bank + other methods
        $otherSales = round($grossSales - $cashSales - $gcashSales - $cardSales, 2);

        // Items sold
        $itemsSold = (float) SaleItem::whereHas('sale', fn($q) => 
            $q->whereDate('created_at', $date)
              ->where('status', '!=', 'voided')
              ->when($branchId !== null, fn($q2) => $q2->where('branch_id', $branchId))
        )->sum('quantity');

        // Cash session
        if ($branchId !== null) {
            $session = CashSession::where('branch_id', $branchId)
                ->whereDate('opened_at', $date)
                ->latest('opened_at')
                ->first();

            $openingCash  = $session ? (float) $session->opening_cash : 0.00;
            $expectedCash = $session ? (float) $session->expected_cash : 0.00;
            $countedCash  = $session?->counted_cash;
            $overShort    = $session ? (float) $session->over_short : 0.00;
        } else {
            $sessions     = CashSession::whereDate('opened_at', $date)->get();
            $openingCash  = (float) $sessions->sum('opening_cash');
            $expectedCash = (float) $sessions->sum('expected_cash');
            $hasCounted   = $sessions->whereNotNull('counted_cash')->isNotEmpty();
            $countedCash  = $hasCounted ? (float) $sessions->sum('counted_cash') : null;
            $overShort    = (float) $sessions->sum('over_short');
        }

        // Expenses
        $expenseQuery = Expense::whereDate('expense_date', $date)
            ->where('status', 'approved')
            ->when($branchId !== null, fn($q) => $q->where('branch_id', $branchId));

        $totalExpenses = (float) (clone $expenseQuery)->sum('amount');

        $expensesByCategory = (clone $expenseQuery)
            ->with('category:id,name')
            ->get()
            ->groupBy('category.name')
            ->map(fn($g) => round($g->sum('amount'), 2))
            ->toArray();

        $netIncome = round($grossSales - $totalRefunds - $totalExpenses, 2);

        // Low stock
        if ($branchId !== null) {
            $lowStockCount = ProductStock::where('branch_id', $branchId)
                ->where('stock', '>', 0)
                ->where('stock', '<=', 5)
                ->count();
        } else {
            $lowStockCount = ProductStock::where('stock', '>', 0)
                ->where('stock', '<=', 5)
                ->count();
        }

        $attributes = [
            'summary_date'         => $date,
            'branch_id'            => $branchId,
            'total_transactions'   => $totalTransactions,
            'gross_sales'          => $grossSales,
            'total_refunds'        => $totalRefunds,
            'cash_sales'           => $cashSales,
            'gcash_sales'          => $gcashSales,
            'card_sales'           => $cardSales,
            'other_sales'          => $otherSales,
            'opening_cash'         => $openingCash,
            'expected_cash'        => $expectedCash,
            'counted_cash'         => $countedCash,
            'over_short'           => $overShort,
            'total_expenses'       => $totalExpenses,
            'expenses_by_category' => $expensesByCategory,
            'net_income'           => $netIncome,
            'items_sold'           => $itemsSold,
            'low_stock_count'      => $lowStockCount,
        ];

        // For "All Branches" ($branchId === null), return an unpersisted model instance
        // to avoid violating the NOT NULL constraint on branch_id in daily_summaries table.
        if ($branchId === null) {
            $summary = new static($attributes);
            $summary->is_finalized = false;
            return $summary;
        }

        return static::updateOrCreate(
            [
                'summary_date' => $date,
                'branch_id'    => $branchId,
            ],
            $attributes
        );
    }
    
    // ── Finalize ───────────────────────────────────────────────────

    /**
     * Lock this summary after manager verification.
     * After finalization, generate() will skip this record unless $force = true.
     */
    public function finalize(int $userId): void
    {
        $this->update([
            'is_finalized' => true,
            'finalized_by' => $userId,
            'finalized_at' => now(),
        ]);
    }

    // ── Accessors ──────────────────────────────────────────────────

    public function getFormattedGrossSalesAttribute(): string
    {
        return '₱' . number_format($this->gross_sales, 2);
    }

    public function getFormattedNetIncomeAttribute(): string
    {
        return '₱' . number_format($this->net_income, 2);
    }

    public function getFormattedTotalExpensesAttribute(): string
    {
        return '₱' . number_format($this->total_expenses, 2);
    }

    public function getFormattedOverShortAttribute(): string
    {
        $val    = (float) $this->over_short;
        $prefix = $val >= 0 ? '+₱' : '-₱';
        return $prefix . number_format(abs($val), 2);
    }

    public function getOverShortStatusAttribute(): string
    {
        $val = (float) $this->over_short;
        if ($val == 0) return 'balanced';
        return $val > 0 ? 'over' : 'short';
    }

    public function getProfitMarginAttribute(): float
    {
        if ((float) $this->gross_sales === 0.0) return 0.0;
        return round(((float) $this->net_income / (float) $this->gross_sales) * 100, 2);
    }

    // ── Scopes ─────────────────────────────────────────────────────

    public function scopeForBranch($query, int $id)
    {
        return $query->where('branch_id', $id);
    }

    public function scopeFinalized($query)
    {
        return $query->where('is_finalized', true);
    }

    public function scopeUnfinalized($query)
    {
        return $query->where('is_finalized', false);
    }

    public function scopeForDateRange($query, $from, $to)
    {
        return $query->whereBetween('summary_date', [$from, $to]);
    }

    public function scopeThisMonth($query)
    {
        return $query->whereMonth('summary_date', now()->month)
                     ->whereYear('summary_date', now()->year);
    }

    public function scopeThisWeek($query)
    {
        return $query->whereBetween('summary_date', [
            now()->startOfWeek()->toDateString(),
            now()->endOfWeek()->toDateString(),
        ]);
    }
}
