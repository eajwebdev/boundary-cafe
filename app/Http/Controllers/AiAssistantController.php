<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\CashSession;
use App\Models\CustomerPayment;
use App\Models\Expense;
use App\Models\InstallmentPayment;
use App\Models\InstallmentPlan;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockAdjustment;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class AiAssistantController extends Controller
{
    public function chat(Request $request): JsonResponse
    {
        $request->validate(['message' => ['required', 'string', 'max:500']]);

        $user     = Auth::user();
        $branchId = $user->branch_id;
        $msg      = mb_strtolower(trim($request->input('message')));
        $currency = SystemSetting::get('general.currency_symbol', null, '₱');

        return response()->json($this->resolve($msg, $branchId, $user, $currency));
    }

    // ── Intent router ──────────────────────────────────────────────────────────

    private function resolve(string $msg, ?int $branchId, $user, string $currency): array
    {
        return match ($this->detect($msg)) {
            'greeting'          => $this->greeting($user),
            'help'              => $this->help(),
            'sales_today'       => $this->salesToday($branchId, $currency),
            'sales_yesterday'   => $this->salesYesterday($branchId, $currency),
            'sales_week'        => $this->salesWeek($branchId, $currency),
            'sales_month'       => $this->salesMonth($branchId, $currency),
            'net_income'        => $this->netIncome($branchId, $currency),
            'payment_mix'       => $this->paymentMix($branchId, $currency),
            'low_stock'         => $this->lowStock($branchId),
            'out_of_stock'      => $this->outOfStock($branchId),
            'stock_summary'     => $this->stockSummary($branchId),
            'top_products'      => $this->topProducts($branchId, $currency),
            'top_products_month'=> $this->topProductsMonth($branchId, $currency),
            'cash_session'      => $this->cashSession($branchId, $currency),
            'expenses_today'    => $this->expensesToday($branchId, $currency),
            'expenses_month'    => $this->expensesMonth($branchId, $currency),
            'voids_today'       => $this->voidsToday($branchId, $currency),
            'losses'            => $this->losses($branchId, $currency),
            'pending_orders'    => $this->pendingOrders($branchId, $currency),
            'recent_sales'      => $this->recentSales($branchId, $currency),
            'discount_summary'  => $this->discountSummary($branchId, $currency),
            'hourly_peak'       => $this->hourlyPeak($branchId, $currency),
            'product_count'     => $this->productCount($branchId),
            'branch_summary'      => $this->branchSummary($currency),
            'installment_summary' => $this->installmentSummary($branchId, $currency),
            default               => $this->unknown(),
        };
    }

    private function detect(string $msg): string
    {
        // Greetings
        if (preg_match('/\b(hi|hello|hey|good\s*(morning|afternoon|evening)|kumusta|kamusta|musta)\b/', $msg)) return 'greeting';
        // Help
        if (preg_match('/\b(help|commands?|what can you|guide|assist|ano.*alam|what.*ask)\b/', $msg)) return 'help';

        // Void / cancelled
        if (preg_match('/\b(void|voided|cancel+ed|bawi|refund)\b/', $msg)) return 'voids_today';
        // Stock losses / damages
        if (preg_match('/\b(loss|losses|damage[d]?|expired|theft|stolen|shrinkage|nawala|nasira|adjust+ment)\b/', $msg)) return 'losses';
        // Out of stock — before low stock
        if (preg_match('/\b(out.of.stock|zero.?stock|wala.*stock|stockout|walang.*stock|zero)\b/', $msg)) return 'out_of_stock';
        // Low stock
        if (preg_match('/\b(low.?stock|mababa.*stock|stock.*alert|reorder|almost.*out|kulang.*stock|warning.*stock)\b/', $msg)) return 'low_stock';
        // Stock overview / summary
        if (preg_match('/\b(stock.*summar|summar.*stock|stock.*status|stock.*health|overall.*stock|inventory.*summar)\b/', $msg)) return 'stock_summary';
        // Pending purchase orders
        if (preg_match('/\b(pending.*order|purchase.*order|po\b|supplier.*order|order.*pending|pabili|inorder)\b/', $msg)) return 'pending_orders';
        // Top products this month
        if (preg_match('/\b(top.*month|best.*month|month.*best|month.*top|pinaka.*benta.*buwan|best.*sell.*month)\b/', $msg)) return 'top_products_month';
        // Top products today
        if (preg_match('/\b(top|best.?sell|popular|most.*sold|bestsell|pinaka.*benta|best.*product|selling.*product)\b/', $msg)) return 'top_products';
        // Payment mix / methods
        if (preg_match('/\b(payment.*method|method.*payment|gcash|cash.*card|card.*cash|payment.*mix|how.*paid|bayad)\b/', $msg)) return 'payment_mix';
        // Discounts
        if (preg_match('/\b(discount|discounts|promo.*used|bawas|reduction|total.*discount)\b/', $msg)) return 'discount_summary';
        // Hourly peak
        if (preg_match('/\b(peak|busiest|rush.*hour|hour.*rush|peak.*hour|what.*hour|oras.*marami|hourly)\b/', $msg)) return 'hourly_peak';
        // Net income / profit
        if (preg_match('/\b(net|profit|income|kita.*ngayon|net.*income|kumikita|loss.*today)\b/', $msg)) return 'net_income';
        // Cash session
        if (preg_match('/\b(cash.?session|session|drawer|open.*session|kahon|cashier.*open)\b/', $msg)) return 'cash_session';
        // Recent / last transactions
        if (preg_match('/\b(recent|last.*sale|latest.*sale|last.*transaction|recent.*sale|recent.*transaction|last.*order)\b/', $msg)) return 'recent_sales';
        // Expenses this month
        if (preg_match('/\b(expense.*month|month.*expense|gastos.*buwan|buwan.*gastos|monthly.*expense)\b/', $msg)) return 'expenses_month';
        // Expenses today
        if (preg_match('/\b(expense|expenses|gastos|spent|nagastos|cost.*today)\b/', $msg)) return 'expenses_today';
        // Product / inventory count
        if (preg_match('/\b(how many.*product|product.*count|total.*product|ilang.*product|product.*total|item.*count)\b/', $msg)) return 'product_count';
        // Installment summary
        if (preg_match('/\b(installment|instalment|layaway|downpayment|down.?payment|dp.*sale|financing|financed)\b/', $msg)) return 'installment_summary';
        // Branch summary (super admin)
        if (preg_match('/\b(branch|branches|bawat.*branch|branch.*summar|all.*branch)\b/', $msg)) return 'branch_summary';
        // Weekly sales
        if (preg_match('/\b(week|weekly|this.*week|linggo|7.*day|past.*week)\b/', $msg)) return 'sales_week';
        // Yesterday
        if (preg_match('/\b(yesterday|kahapon|last.*day|previous.*day)\b/', $msg)) return 'sales_yesterday';
        // Monthly sales / revenue
        if (preg_match('/\b(month|monthly|this.*month|buwan)\b/', $msg)) return 'sales_month';
        // Today sales (broadest — catch-all for sales questions)
        if (preg_match('/\b(sales?|revenue|earned|income|kita|benta|transaction|today|ngayon|how.*much)\b/', $msg)) return 'sales_today';

        return 'unknown';
    }

    private function fmt(float $n, string $currency): string
    {
        return $currency . number_format($n, 2);
    }

    /**
     * SQL expression that returns the amount actually collected at POS.
     * Installment: only the down-payment (payment_amount), not the financed total.
     * All other methods: use total.
     */
    private function collectedExpr(): string
    {
        return "SUM(CASE WHEN payment_method = 'installment' THEN amount_paid WHEN payment_method IN ('credit','mixed') THEN 0 ELSE total END)";
    }

    private function customerPaymentsTotal(?int $branchId, string $from, string $to): float
    {
        return (float) CustomerPayment::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('payment_date', [$from, $to])
            ->sum('amount');
    }

    /**
     * Base query for remittance payments scoped to a branch.
     * InstallmentPayment joins through installment_plans to get branch_id.
     */
    private function remittanceQuery(?int $branchId)
    {
        return InstallmentPayment::query()
            ->join('installment_plans', 'installment_payments.installment_plan_id', '=', 'installment_plans.id')
            ->when($branchId, fn ($q) => $q->where('installment_plans.branch_id', $branchId));
    }

    /**
     * Total remittances received on a given date, broken down by payment method.
     * Returns ['cash' => 0.0, 'gcash' => 0.0, 'card' => 0.0, 'bank' => 0.0, 'total' => 0.0]
     */
    private function remittanceTotals(?int $branchId, string $date): array
    {
        $rows = $this->remittanceQuery($branchId)
            ->whereDate('installment_payments.payment_date', $date)
            ->selectRaw('installment_payments.payment_method, SUM(installment_payments.amount) as total')
            ->groupBy('installment_payments.payment_method')
            ->get();

        $out = ['cash' => 0.0, 'gcash' => 0.0, 'card' => 0.0, 'bank' => 0.0, 'total' => 0.0];
        foreach ($rows as $r) {
            $m = $r->payment_method;
            if (isset($out[$m])) $out[$m] = (float) $r->total;
            $out['total'] += (float) $r->total;
        }
        return $out;
    }

    // ── Handlers ───────────────────────────────────────────────────────────────

    private function greeting($user): array
    {
        $h = now()->hour;
        $g = $h < 12 ? 'Good morning' : ($h < 18 ? 'Good afternoon' : 'Good evening');
        return ['text' => "{$g}, {$user->fname}! 👋 I'm your EA business assistant.\n\nAsk me about sales, inventory, expenses, and more — type \"help\" to see everything I can do."];
    }

    private function help(): array
    {
        return [
            'text'  => "Here's everything I can help you with:",
            'items' => [
                ['label' => '📊 Sales today',            'value' => '"Sales today"'],
                ['label' => '📅 Yesterday\'s sales',     'value' => '"Sales yesterday"'],
                ['label' => '🗓 This week\'s sales',     'value' => '"This week sales"'],
                ['label' => '📆 Monthly revenue',        'value' => '"This month sales"'],
                ['label' => '📈 Net income today',       'value' => '"Net income today"'],
                ['label' => '💳 Payment methods',        'value' => '"Payment mix today"'],
                ['label' => '🏷 Discounts given',        'value' => '"Discount summary"'],
                ['label' => '⏰ Busiest hour',            'value' => '"What is the peak hour?"'],
                ['label' => '⭐ Top products today',      'value' => '"Best selling today"'],
                ['label' => '📅 Top products this month','value' => '"Top products this month"'],
                ['label' => '🕐 Recent transactions',    'value' => '"Show recent sales"'],
                ['label' => '⚠️ Low stock items',        'value' => '"Show low stock"'],
                ['label' => '🚫 Out of stock',           'value' => '"What\'s out of stock?"'],
                ['label' => '📦 Stock overview',         'value' => '"Stock summary"'],
                ['label' => '📉 Stock losses',           'value' => '"Show stock losses"'],
                ['label' => '🛒 Pending orders',         'value' => '"Pending purchase orders"'],
                ['label' => '💰 Cash session',           'value' => '"Cash session status"'],
                ['label' => '📅 Installment sales',      'value' => '"Installment summary"'],
                ['label' => '💸 Expenses today',         'value' => '"Today\'s expenses"'],
                ['label' => '📋 Monthly expenses',       'value' => '"Monthly expenses"'],
                ['label' => '❌ Voided sales',           'value' => '"Any voids today?"'],
                ['label' => '🔢 Product count',          'value' => '"How many products?"'],
                ['label' => '🏢 Branch summary',         'value' => '"Branch summary"'],
            ],
        ];
    }

    private function salesToday(?int $branchId, string $currency): array
    {
        $data = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('COUNT(*) as count,
                ' . $this->collectedExpr() . ' as revenue,
                SUM(discount_amount) as discounts,
                SUM(total) as gross_total')
            ->first();

        $count = (int) ($data->count ?? 0);
        if ($count === 0) return ['text' => "No completed sales recorded yet today. The day is still young! 💪"];

        $instData = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->where('payment_method', 'installment')
            ->selectRaw('COUNT(*) as count, SUM(payment_amount) as dp, SUM(total) as financed')
            ->first();

        $remit    = $this->remittanceTotals($branchId, now()->toDateString());
        $creditPayments = $this->customerPaymentsTotal($branchId, now()->toDateString(), now()->toDateString());
        $revenue  = (float) ($data->revenue ?? 0) + $remit['total'] + $creditPayments;
        $avgTxn   = $count > 0 ? (float) ($data->revenue ?? 0) / $count : 0;

        $items = [
            ['label' => '💰 Total Collected',       'value' => $this->fmt($revenue, $currency)],
            ['label' => '   POS Sales',             'value' => $this->fmt((float) ($data->revenue ?? 0), $currency)],
            ['label' => '🧾 Transactions',           'value' => number_format($count)],
            ['label' => '📊 Avg. per Transaction',   'value' => $this->fmt($avgTxn, $currency)],
            ['label' => '🏷 Total Discounts',        'value' => $this->fmt((float) ($data->discounts ?? 0), $currency)],
        ];

        if ((int) ($instData->count ?? 0) > 0) {
            $items[] = ['label' => '📅 Installment DP (POS)',     'value' => $this->fmt((float) ($instData->dp ?? 0), $currency), 'badge' => $instData->count . ' txn'];
            $items[] = ['label' => '   Financed (not collected)', 'value' => $this->fmt((float) ($instData->financed ?? 0) - (float) ($instData->dp ?? 0), $currency), 'badge' => 'On credit'];
        }

        if ($remit['total'] > 0) {
            $items[] = ['label' => '🏦 Remittances Received',     'value' => $this->fmt($remit['total'], $currency)];
            if ($remit['cash']  > 0) $items[] = ['label' => '   Cash',       'value' => $this->fmt($remit['cash'],  $currency)];
            if ($remit['gcash'] > 0) $items[] = ['label' => '   GCash',      'value' => $this->fmt($remit['gcash'], $currency)];
            if ($remit['card']  > 0) $items[] = ['label' => '   Card',       'value' => $this->fmt($remit['card'],  $currency)];
            if ($remit['bank']  > 0) $items[] = ['label' => '   Bank/Check', 'value' => $this->fmt($remit['bank'],  $currency)];
        }

        if ($creditPayments > 0) {
            $items[] = ['label' => 'Customer Credit Payments', 'value' => $this->fmt($creditPayments, $currency)];
        }

        return ['text' => "Here's your sales summary for today (" . now()->format('M d, Y') . "):", 'items' => $items];
    }

    private function salesYesterday(?int $branchId, string $currency): array
    {
        $yesterday = now()->subDay();
        $data = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$yesterday->copy()->startOfDay(), $yesterday->copy()->endOfDay()])
            ->selectRaw('COUNT(*) as count, ' . $this->collectedExpr() . ' as revenue, AVG(total) as avg_txn')
            ->first();

        $count = (int) ($data->count ?? 0);
        if ($count === 0) return ['text' => "No sales were recorded yesterday (" . $yesterday->format('M d, Y') . ")."];

        return [
            'text'  => "Yesterday's sales (" . $yesterday->format('M d, Y') . "):",
            'items' => [
                ['label' => '💰 Total Collected',      'value' => $this->fmt((float) ($data->revenue ?? 0), $currency)],
                ['label' => '🧾 Transactions',          'value' => number_format($count)],
                ['label' => '📊 Avg. per Transaction',  'value' => $this->fmt((float) ($data->avg_txn ?? 0), $currency)],
            ],
        ];
    }

    private function salesWeek(?int $branchId, string $currency): array
    {
        $from = now()->startOfWeek();
        $to   = now()->endOfWeek();

        $data = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('COUNT(*) as count, ' . $this->collectedExpr() . ' as revenue, SUM(discount_amount) as discounts')
            ->first();

        $creditPayments = $this->customerPaymentsTotal($branchId, $from->toDateString(), $to->toDateString());
        $revenue = (float) ($data->revenue ?? 0) + $creditPayments;
        $count   = (int)   ($data->count   ?? 0);
        $avgDaily = $count > 0 ? $revenue / max(1, now()->dayOfWeek ?: 7) : 0;

        return [
            'text'  => "This week's sales (" . $from->format('M d') . " – " . now()->format('M d') . "):",
            'items' => [
                ['label' => '💰 Total Collected', 'value' => $this->fmt($revenue, $currency)],
                ['label' => '🧾 Transactions',    'value' => number_format($count)],
                ['label' => '📊 Daily Average',   'value' => $this->fmt($avgDaily, $currency)],
                ['label' => '🏷 Discounts',       'value' => $this->fmt((float) ($data->discounts ?? 0), $currency)],
            ],
        ];
    }

    private function salesMonth(?int $branchId, string $currency): array
    {
        $from = now()->startOfMonth();
        $to   = now()->endOfMonth();

        $data = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('COUNT(*) as count, ' . $this->collectedExpr() . ' as revenue, SUM(discount_amount) as discounts')
            ->first();

        $expenses = (float) Expense::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->sum('amount');

        $creditPayments = $this->customerPaymentsTotal($branchId, $from->toDateString(), $to->toDateString());
        $revenue  = (float) ($data->revenue ?? 0) + $creditPayments;
        $net      = $revenue - $expenses;
        $daysSoFar = now()->day;

        return [
            'text'  => "Monthly performance — " . now()->format('F Y') . ":",
            'items' => [
                ['label' => '💰 Total Collected', 'value' => $this->fmt($revenue, $currency)],
                ['label' => '🧾 Transactions',    'value' => number_format((int) ($data->count ?? 0))],
                ['label' => '📊 Daily Average',   'value' => $this->fmt($daysSoFar > 0 ? $revenue / $daysSoFar : 0, $currency)],
                ['label' => '💸 Total Expenses',  'value' => $this->fmt($expenses, $currency)],
                ['label' => '📈 Net Income',      'value' => $this->fmt($net, $currency), 'badge' => $net >= 0 ? '▲ Profit' : '▼ Loss'],
            ],
        ];
    }

    private function netIncome(?int $branchId, string $currency): array
    {
        $today = now()->toDateString();

        $revenueData = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw($this->collectedExpr() . ' as collected,
                SUM(CASE WHEN payment_method = \'cash\' THEN total ELSE 0 END) as cash_rev,
                SUM(CASE WHEN payment_method = \'gcash\' THEN total ELSE 0 END) as gcash_rev,
                SUM(CASE WHEN payment_method = \'card\' THEN total ELSE 0 END) as card_rev,
                SUM(CASE WHEN payment_method = \'bank\' THEN total ELSE 0 END) as bank_rev,
                SUM(CASE WHEN payment_method = \'installment\' THEN payment_amount ELSE 0 END) as inst_dp')
            ->first();

        $revenue = (float) ($revenueData->collected ?? 0);

        $expenses = (float) Expense::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereDate('expense_date', $today)
            ->sum('amount');

        $lossValue = (float) (StockAdjustment::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('SUM(quantity * unit_cost) as total')
            ->value('total') ?? 0);

        $remit = $this->remittanceTotals($branchId, $today);
        $creditPayments = $this->customerPaymentsTotal($branchId, $today, $today);
        $total = $revenue + $remit['total'] + $creditPayments;
        $net   = $total - $expenses - $lossValue;

        $items = [
            ['label' => '💰 Total Collected', 'value' => $this->fmt($total, $currency)],
            ['label' => '   POS Sales',       'value' => $this->fmt($revenue, $currency)],
        ];

        if ((float) ($revenueData->cash_rev ?? 0) > 0)
            $items[] = ['label' => '     Cash',           'value' => $this->fmt((float) $revenueData->cash_rev, $currency)];
        if ((float) ($revenueData->gcash_rev ?? 0) > 0)
            $items[] = ['label' => '     GCash',          'value' => $this->fmt((float) $revenueData->gcash_rev, $currency)];
        if ((float) ($revenueData->card_rev ?? 0) > 0)
            $items[] = ['label' => '     Card',           'value' => $this->fmt((float) $revenueData->card_rev, $currency)];
        if ((float) ($revenueData->bank_rev ?? 0) > 0)
            $items[] = ['label' => '     Bank/Check',     'value' => $this->fmt((float) $revenueData->bank_rev, $currency)];
        if ((float) ($revenueData->inst_dp ?? 0) > 0)
            $items[] = ['label' => '     Installment DP', 'value' => $this->fmt((float) $revenueData->inst_dp, $currency), 'badge' => 'DP only'];

        if ($remit['total'] > 0) {
            $items[] = ['label' => '   Remittances',      'value' => $this->fmt($remit['total'], $currency)];
            if ($remit['cash']  > 0) $items[] = ['label' => '     Cash',       'value' => $this->fmt($remit['cash'],  $currency)];
            if ($remit['gcash'] > 0) $items[] = ['label' => '     GCash',      'value' => $this->fmt($remit['gcash'], $currency)];
            if ($remit['card']  > 0) $items[] = ['label' => '     Card',       'value' => $this->fmt($remit['card'],  $currency)];
            if ($remit['bank']  > 0) $items[] = ['label' => '     Bank/Check', 'value' => $this->fmt($remit['bank'],  $currency)];
        }
        if ($creditPayments > 0) {
            $items[] = ['label' => '   Customer Credit Payments', 'value' => $this->fmt($creditPayments, $currency)];
        }

        $items[] = ['label' => '💸 Expenses',    'value' => '− ' . $this->fmt($expenses, $currency)];
        $items[] = ['label' => '📉 Stock Losses','value' => '− ' . $this->fmt($lossValue, $currency)];
        $items[] = ['label' => '📈 Net Income',  'value' => $this->fmt($net, $currency), 'badge' => $net >= 0 ? '▲ Profit' : '▼ Loss'];

        return ['text' => "📈 Today's net income breakdown:", 'items' => $items];
    }

    private function paymentMix(?int $branchId, string $currency): array
    {
        $rows = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('payment_method, COUNT(*) as count,
                ' . $this->collectedExpr() . ' as collected')
            ->groupBy('payment_method')
            ->orderByDesc('collected')
            ->get();

        $creditPayments = $this->customerPaymentsTotal($branchId, now()->toDateString(), now()->toDateString());

        if ($rows->isEmpty() && $creditPayments <= 0) return ['text' => "No sales yet today to show payment method breakdown."];

        $total = $rows->sum(fn ($r) => (float) $r->collected);

        $labels = [
            'cash'        => '💵 Cash',
            'gcash'       => '📱 GCash',
            'card'        => '💳 Card',
            'bank'        => '🏦 Bank / Check',
            'installment' => '📅 Installment (DP)',
        ];

        $items = $rows->map(fn ($r) => [
            'label' => $labels[$r->payment_method] ?? ucfirst($r->payment_method),
            'value' => $this->fmt((float) $r->collected, $currency),
            'badge' => $r->count . ' txn · ' . ($total > 0 ? round((float) $r->collected / $total * 100, 1) : 0) . '%',
        ])->toArray();

        // Add remittance payments (grouped by method)
        $remit = $this->remittanceTotals($branchId, now()->toDateString());
        $remitLabels = [
            'cash'  => '💵 Cash (Remittance)',
            'gcash' => '📱 GCash (Remittance)',
            'card'  => '💳 Card (Remittance)',
            'bank'  => '🏦 Bank/Check (Remittance)',
        ];
        foreach (['cash', 'gcash', 'card', 'bank'] as $m) {
            if ($remit[$m] > 0) {
                $total += $remit[$m];
                $items[] = ['label' => $remitLabels[$m], 'value' => $this->fmt($remit[$m], $currency), 'badge' => 'Remit'];
            }
        }
        if ($creditPayments > 0) {
            $total += $creditPayments;
            $items[] = ['label' => 'Customer credit payments', 'value' => $this->fmt($creditPayments, $currency), 'badge' => 'Credit'];
        }

        $items[] = ['label' => '📋 Total Collected', 'value' => $this->fmt($total, $currency), 'badge' => 'Total'];

        return ['text' => "💳 Today's payment method breakdown:", 'items' => $items];
    }

    private function lowStock(?int $branchId): array
    {
        $items = ProductStock::with('product:id,name')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('stock', '>', 0)
            ->where('stock', '<=', 5)
            ->orderBy('stock')
            ->limit(10)
            ->get();

        if ($items->isEmpty()) return ['text' => "Great news! 🎉 No low stock items right now. All products are sufficiently stocked."];

        return [
            'text'  => "⚠️ {$items->count()} item(s) with low stock (5 or fewer units):",
            'items' => $items->map(fn ($s) => [
                'label' => $s->product?->name ?? '—',
                'value' => $s->stock . ' units',
                'badge' => $s->stock <= 2 ? 'Critical' : 'Low',
            ])->toArray(),
        ];
    }

    private function outOfStock(?int $branchId): array
    {
        $items = ProductStock::with('product:id,name')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('stock', '<=', 0)
            ->limit(10)
            ->get();

        if ($items->isEmpty()) return ['text' => "Great news! 🎉 No out-of-stock items. All products have available stock."];

        return [
            'text'  => "🚫 {$items->count()} item(s) are out of stock:",
            'items' => $items->map(fn ($s) => [
                'label' => $s->product?->name ?? '—',
                'value' => '0 units',
                'badge' => 'Out',
            ])->toArray(),
        ];
    }

    private function stockSummary(?int $branchId): array
    {
        $threshold = 5;
        $base = ProductStock::when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $inStock  = (clone $base)->where('stock', '>', $threshold)->count();
        $lowStock = (clone $base)->where('stock', '>', 0)->where('stock', '<=', $threshold)->count();
        $outStock = (clone $base)->where('stock', '<=', 0)->count();
        $total    = $inStock + $lowStock + $outStock;

        return [
            'text'  => "📦 Overall inventory health:",
            'items' => [
                ['label' => '✅ In Stock',    'value' => number_format($inStock),  'badge' => $total > 0 ? round($inStock / $total * 100) . '%' : '0%'],
                ['label' => '⚠️ Low Stock',   'value' => number_format($lowStock), 'badge' => 'Low'],
                ['label' => '🚫 Out of Stock','value' => number_format($outStock), 'badge' => 'Out'],
                ['label' => '📊 Total SKUs',  'value' => number_format($total)],
            ],
        ];
    }

    private function topProducts(?int $branchId, string $currency): array
    {
        $products = SaleItem::query()
            ->join('sales',    'sale_items.sale_id',    '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->where('sales.status', 'completed')
            ->where('sale_items.is_bundle_component', false)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->where('sales.created_at', '>=', now()->startOfDay())
            ->selectRaw('products.name, SUM(sale_items.quantity) as qty_sold, SUM(sale_items.total) as revenue')
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        if ($products->isEmpty()) return ['text' => "No sales recorded today yet. Check back once you start selling! 🛍️"];

        return [
            'text'  => "⭐ Top 5 selling products today:",
            'items' => $products->map(fn ($p) => [
                'label' => $p->name,
                'value' => $this->fmt((float) $p->revenue, $currency),
                'badge' => $p->qty_sold . ' sold',
            ])->toArray(),
        ];
    }

    private function topProductsMonth(?int $branchId, string $currency): array
    {
        $products = SaleItem::query()
            ->join('sales',    'sale_items.sale_id',    '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->where('sales.status', 'completed')
            ->where('sale_items.is_bundle_component', false)
            ->when($branchId, fn ($q) => $q->where('sales.branch_id', $branchId))
            ->whereBetween('sales.created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->selectRaw('products.name, SUM(sale_items.quantity) as qty_sold, SUM(sale_items.total) as revenue')
            ->groupBy('products.id', 'products.name')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        if ($products->isEmpty()) return ['text' => "No sales data available for " . now()->format('F Y') . "."];

        return [
            'text'  => "📅 Top 5 products this month (" . now()->format('F Y') . "):",
            'items' => $products->map(fn ($p) => [
                'label' => $p->name,
                'value' => $this->fmt((float) $p->revenue, $currency),
                'badge' => $p->qty_sold . ' sold',
            ])->toArray(),
        ];
    }

    private function cashSession(?int $branchId, string $currency): array
    {
        $session = CashSession::with('user:id,fname,lname')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('status', 'open')
            ->latest('opened_at')
            ->first();

        if (! $session) {
            $last = CashSession::when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->where('status', 'closed')->latest('closed_at')->first();
            $msg = "💤 No active cash session right now.";
            if ($last) $msg .= " Last session closed at " . $last->closed_at?->format('g:i A') . ".";
            return ['text' => $msg];
        }

        $session->loadMissing(['sales', 'expenses.pettyCashVoucher']);
        $cashier    = $session->user ? "{$session->user->fname} {$session->user->lname}" : '—';
        $opening    = (float) $session->opening_cash;
        $cashSales  = (float) $session->sales()->where('payment_method', 'cash')->where('status', '!=', 'voided')->sum('total');
        $instDp     = $session->installment_dp_total;
        $pettyCash  = $session->petty_cash_paid;
        $gcash      = $session->gcash_sales_total;
        $card       = $session->card_sales_total;
        $bank       = (float) $session->sales()->where('payment_method', 'bank')->where('status', '!=', 'voided')->sum('total');
        $expected   = $session->computeExpectedCash();

        // Remittances received today (cash goes into drawer)
        $remit = $this->remittanceTotals($session->branch_id, now()->toDateString());

        $items = [
            ['label' => '👤 Cashier',      'value' => $cashier],
            ['label' => '🕐 Opened At',    'value' => $session->opened_at?->format('g:i A') ?? '—'],
            ['label' => '💵 Opening Cash', 'value' => $this->fmt($opening, $currency)],
            ['label' => '🛒 Cash Sales',   'value' => $this->fmt($cashSales, $currency)],
        ];

        if ($instDp > 0)
            $items[] = ['label' => '📅 Installment DP',     'value' => $this->fmt($instDp, $currency), 'badge' => 'In drawer'];
        if ($remit['cash'] > 0)
            $items[] = ['label' => '🏦 Cash Remittance',    'value' => $this->fmt($remit['cash'], $currency), 'badge' => 'In drawer'];
        if ($pettyCash > 0)
            $items[] = ['label' => '💸 Petty Cash Out',     'value' => '− ' . $this->fmt($pettyCash, $currency)];

        $items[] = ['label' => '📊 Expected in Drawer', 'value' => $this->fmt($expected + $remit['cash'], $currency), 'badge' => 'Total'];

        if ($gcash > 0 || $remit['gcash'] > 0)
            $items[] = ['label' => '📱 GCash (not in drawer)',       'value' => $this->fmt($gcash + $remit['gcash'], $currency)];
        if ($card > 0 || $remit['card'] > 0)
            $items[] = ['label' => '💳 Card (not in drawer)',        'value' => $this->fmt($card + $remit['card'], $currency)];
        if ($bank > 0 || $remit['bank'] > 0)
            $items[] = ['label' => '🏦 Bank/Check (not in drawer)',  'value' => $this->fmt($bank + $remit['bank'], $currency)];

        return ['text' => "✅ Active cash session is open:", 'items' => $items];
    }

    private function expensesToday(?int $branchId, string $currency): array
    {
        $rows = Expense::with('category:id,name')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereDate('expense_date', today()->toDateString())
            ->selectRaw('expense_category_id, SUM(amount) as total')
            ->groupBy('expense_category_id')
            ->with('category:id,name')
            ->get();

        if ($rows->isEmpty()) return ['text' => "No expenses recorded today. Keep it that way! 😄"];

        $total = $rows->sum(fn ($r) => (float) $r->total);
        $items = $rows->map(fn ($r) => ['label' => $r->category?->name ?? 'Uncategorized', 'value' => $this->fmt((float) $r->total, $currency)])->toArray();
        $items[] = ['label' => '📋 TOTAL', 'value' => $this->fmt($total, $currency), 'badge' => 'Total'];

        return ['text' => "💸 Today's expense breakdown:", 'items' => $items];
    }

    private function expensesMonth(?int $branchId, string $currency): array
    {
        $from = now()->startOfMonth()->toDateString();
        $to   = now()->endOfMonth()->toDateString();

        $rows = Expense::with('category:id,name')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('expense_date', [$from, $to])
            ->selectRaw('expense_category_id, SUM(amount) as total')
            ->groupBy('expense_category_id')
            ->with('category:id,name')
            ->orderByDesc('total')
            ->get();

        if ($rows->isEmpty()) return ['text' => "No expenses recorded this month yet."];

        $total = $rows->sum(fn ($r) => (float) $r->total);
        $items = $rows->map(fn ($r) => ['label' => $r->category?->name ?? 'Uncategorized', 'value' => $this->fmt((float) $r->total, $currency)])->toArray();
        $items[] = ['label' => '📋 TOTAL', 'value' => $this->fmt($total, $currency), 'badge' => 'Total'];

        return ['text' => "💸 " . now()->format('F Y') . " expense breakdown:", 'items' => $items];
    }

    private function voidsToday(?int $branchId, string $currency): array
    {
        $data = Sale::voided()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('COUNT(*) as count, SUM(total) as total')
            ->first();

        $count = (int) ($data->count ?? 0);
        if ($count === 0) return ['text' => "✅ No voided transactions today. Clean record! 👍"];

        return [
            'text'  => "⚠️ {$count} voided transaction(s) today:",
            'items' => [
                ['label' => '❌ Void Count',  'value' => number_format($count)],
                ['label' => '💸 Total Value', 'value' => $this->fmt((float) ($data->total ?? 0), $currency), 'badge' => 'Voided'],
            ],
        ];
    }

    private function losses(?int $branchId, string $currency): array
    {
        $summary = StockAdjustment::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->selectRaw('type, SUM(quantity) as total_qty, SUM(quantity * unit_cost) as total_cost')
            ->groupBy('type')
            ->get();

        if ($summary->isEmpty()) return ['text' => "✅ No stock adjustments recorded this month. Great stock management! 📦"];

        $totalLoss = $summary->sum(fn ($s) => (float) $s->total_cost);
        $items = $summary->map(fn ($s) => [
            'label' => ucfirst($s->type),
            'value' => $this->fmt((float) $s->total_cost, $currency),
            'badge' => $s->total_qty . ' units',
        ])->toArray();
        $items[] = ['label' => '📉 Total Loss', 'value' => $this->fmt($totalLoss, $currency), 'badge' => 'Total'];

        return ['text' => "📉 Stock loss summary for " . now()->format('F Y') . ":", 'items' => $items];
    }

    private function pendingOrders(?int $branchId, string $currency): array
    {
        $orders = Order::with('supplier:id,name')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereIn('status', ['pending', 'confirmed', 'shipped'])
            ->latest()
            ->limit(6)
            ->get();

        if ($orders->isEmpty()) return ['text' => "✅ No pending purchase orders at the moment."];

        $total = $orders->sum(fn ($o) => (float) $o->total);
        $items = $orders->map(fn ($o) => [
            'label' => $o->order_number . ' · ' . ($o->supplier?->name ?? '—'),
            'value' => $this->fmt((float) $o->total, $currency),
            'badge' => ucfirst($o->status),
        ])->toArray();
        $items[] = ['label' => '📋 ' . $orders->count() . ' orders pending', 'value' => $this->fmt($total, $currency), 'badge' => 'Total'];

        return ['text' => "🛒 Pending purchase orders:", 'items' => $items];
    }

    private function recentSales(?int $branchId, string $currency): array
    {
        $sales = Sale::with('user:id,fname,lname')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->latest()
            ->limit(6)
            ->get();

        if ($sales->isEmpty()) return ['text' => "No transactions found yet."];

        $payLabel = [
            'cash' => 'Cash', 'gcash' => 'GCash', 'card' => 'Card',
            'bank' => 'Bank', 'installment' => 'Instalment DP',
        ];

        return [
            'text'  => "🕐 Last " . $sales->count() . " transactions:",
            'items' => $sales->map(fn ($s) => [
                'label' => $s->receipt_number . ' · ' . $s->created_at?->format('g:i A'),
                'value' => $s->payment_method === 'installment'
                    ? $this->fmt((float) $s->payment_amount, $currency)
                    : $this->fmt((float) $s->total, $currency),
                'badge' => ($payLabel[$s->payment_method] ?? ucfirst($s->payment_method)) . ' · ' . ucfirst($s->status),
            ])->toArray(),
        ];
    }

    private function discountSummary(?int $branchId, string $currency): array
    {
        $data = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('COUNT(CASE WHEN discount_amount > 0 THEN 1 END) as discounted_count, SUM(discount_amount) as total_discount, SUM(total) as total_revenue')
            ->first();

        $discounted = (int)   ($data->discounted_count ?? 0);
        $discount   = (float) ($data->total_discount   ?? 0);
        $revenue    = (float) ($data->total_revenue    ?? 0);

        if ($discount === 0.0) return ['text' => "No discounts have been applied today."];

        return [
            'text'  => "🏷 Discount summary for today:",
            'items' => [
                ['label' => '🧾 Discounted Transactions', 'value' => number_format($discounted)],
                ['label' => '💸 Total Discounts Given',   'value' => $this->fmt($discount, $currency)],
                ['label' => '💰 Gross Revenue',           'value' => $this->fmt($revenue, $currency)],
                ['label' => '📊 Discount Rate',           'value' => ($revenue > 0 ? round($discount / $revenue * 100, 2) : 0) . '%'],
            ],
        ];
    }

    private function hourlyPeak(?int $branchId, string $currency): array
    {
        $rows = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('HOUR(created_at) as hour, COUNT(*) as count, SUM(total) as revenue')
            ->groupBy('hour')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        if ($rows->isEmpty()) return ['text' => "No sales data today to determine peak hours yet."];

        $peak = $rows->first();
        $fmtH = fn ($h) => ($h === 0 ? 12 : ($h > 12 ? $h - 12 : $h)) . ($h < 12 ? 'am' : 'pm');

        return [
            'text'  => "⏰ Today's busiest hours by revenue (peak: {$fmtH($peak->hour)}):",
            'items' => $rows->map(fn ($r) => [
                'label' => $fmtH($r->hour),
                'value' => $this->fmt((float) $r->revenue, $currency),
                'badge' => $r->count . ' txn',
            ])->toArray(),
        ];
    }

    private function productCount(?int $branchId): array
    {
        $total     = Product::where('product_type', '!=', 'ingredient')->count();
        $active    = ProductStock::when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('stock', '>', 0)->count();
        $outStock  = ProductStock::when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('stock', '<=', 0)->count();
        $lowStock  = ProductStock::when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('stock', '>', 0)->where('stock', '<=', 5)->count();

        return [
            'text'  => "🔢 Product & inventory count:",
            'items' => [
                ['label' => '📦 Total Products',  'value' => number_format($total)],
                ['label' => '✅ With Stock',       'value' => number_format($active)],
                ['label' => '⚠️ Low Stock',        'value' => number_format($lowStock), 'badge' => 'Low'],
                ['label' => '🚫 Out of Stock',     'value' => number_format($outStock),  'badge' => 'Out'],
            ],
        ];
    }

    private function branchSummary(string $currency): array
    {
        $branches = Branch::where('is_active', true)->get();
        if ($branches->isEmpty()) return ['text' => "No active branches found."];

        $today = now()->startOfDay();
        $items = $branches->map(function ($b) use ($currency, $today) {
            $revenue = (float) Sale::completed()
                ->where('branch_id', $b->id)
                ->where('created_at', '>=', $today)
                ->selectRaw($this->collectedExpr() . ' as collected')
                ->value('collected');
            $revenue += $this->customerPaymentsTotal($b->id, now()->toDateString(), now()->toDateString());
            return [
                'label' => $b->name,
                'value' => $this->fmt($revenue, $currency),
                'badge' => $revenue > 0 ? 'Active' : 'No sales',
            ];
        })->toArray();

        return ['text' => "🏢 Branch sales summary for today:", 'items' => $items];
    }

    private function installmentSummary(?int $branchId, string $currency): array
    {
        // POS installment sales (DP collected at time of sale)
        $todaySales = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('payment_method', 'installment')
            ->where('created_at', '>=', now()->startOfDay())
            ->selectRaw('COUNT(*) as count, SUM(payment_amount) as dp_total, SUM(total) as financed_total')
            ->first();

        $monthSales = Sale::completed()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('payment_method', 'installment')
            ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->selectRaw('COUNT(*) as count, SUM(payment_amount) as dp_total, SUM(total) as financed_total')
            ->first();

        // Remittances received (subsequent payments from financing provider)
        $todayRemit = $this->remittanceTotals($branchId, now()->toDateString());

        $monthRemit = $this->remittanceQuery($branchId)
            ->whereBetween('installment_payments.payment_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
            ->selectRaw('installment_payments.payment_method, SUM(installment_payments.amount) as total')
            ->groupBy('installment_payments.payment_method')
            ->get();
        $monthRemitTotal = $monthRemit->sum(fn ($r) => (float) $r->total);

        // Active plans
        $activePlans = InstallmentPlan::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('status', 'active')
            ->selectRaw('COUNT(*) as count, SUM(balance - total_paid) as outstanding')
            ->first();

        $todayCount = (int) ($todaySales->count ?? 0);
        $monthCount = (int) ($monthSales->count ?? 0);

        if ($monthCount === 0 && $monthRemitTotal == 0 && (int) ($activePlans->count ?? 0) === 0) {
            return ['text' => "No installment activity recorded this month."];
        }

        $items = [];

        // Today's POS DPs
        if ($todayCount > 0) {
            $items[] = ['label' => '📅 Today — DP at POS',         'value' => $this->fmt((float) ($todaySales->dp_total ?? 0), $currency), 'badge' => $todayCount . ' new'];
            $items[] = ['label' => '   Today — Financed Amount',   'value' => $this->fmt((float) ($todaySales->financed_total ?? 0) - (float) ($todaySales->dp_total ?? 0), $currency), 'badge' => 'On credit'];
        }

        // Today's remittances
        if ($todayRemit['total'] > 0) {
            $items[] = ['label' => '🏦 Today — Remittances',       'value' => $this->fmt($todayRemit['total'], $currency)];
            if ($todayRemit['cash']  > 0) $items[] = ['label' => '   Cash',       'value' => $this->fmt($todayRemit['cash'],  $currency)];
            if ($todayRemit['gcash'] > 0) $items[] = ['label' => '   GCash',      'value' => $this->fmt($todayRemit['gcash'], $currency)];
            if ($todayRemit['card']  > 0) $items[] = ['label' => '   Card',       'value' => $this->fmt($todayRemit['card'],  $currency)];
            if ($todayRemit['bank']  > 0) $items[] = ['label' => '   Bank/Check', 'value' => $this->fmt($todayRemit['bank'],  $currency)];
        }

        // Month totals
        if ($monthCount > 0) {
            $items[] = ['label' => now()->format('M') . ' — DP at POS',       'value' => $this->fmt((float) ($monthSales->dp_total ?? 0), $currency), 'badge' => $monthCount . ' sales'];
            $items[] = ['label' => now()->format('M') . ' — Total Financed',  'value' => $this->fmt((float) ($monthSales->financed_total ?? 0), $currency)];
        }

        if ($monthRemitTotal > 0)
            $items[] = ['label' => now()->format('M') . ' — Remittances',     'value' => $this->fmt($monthRemitTotal, $currency)];

        // Active plans outstanding
        if ((int) ($activePlans->count ?? 0) > 0) {
            $items[] = ['label' => '📋 Active Plans',              'value' => number_format((int) $activePlans->count)];
            $items[] = ['label' => '💳 Outstanding Balance',       'value' => $this->fmt((float) ($activePlans->outstanding ?? 0), $currency), 'badge' => 'Receivable'];
        }

        return ['text' => "📅 Installment & remittance summary:", 'items' => $items];
    }

    private function unknown(): array
    {
        return ['text' => "I'm not sure I understood that. 🤔\n\nTry asking things like:\n• \"Sales today\" or \"Yesterday's sales\"\n• \"This week's revenue\"\n• \"Net income today\"\n• \"Payment methods today\"\n• \"Best selling today\"\n• \"Top products this month\"\n• \"Low stock items\"\n• \"Out of stock items\"\n• \"Stock summary\"\n• \"Pending purchase orders\"\n• \"Recent transactions\"\n• \"Cash session status\"\n• \"Today's expenses\"\n• \"Monthly expenses\"\n• \"Discount summary\"\n• \"Peak hour today\"\n• \"How many products?\"\n• \"Branch summary\"\n• \"Any voids today?\"\n• \"Stock losses this month\"\n\nOr type \"help\" to see all commands."];
    }
}
