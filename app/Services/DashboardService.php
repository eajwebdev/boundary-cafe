<?php

namespace App\Services;

use App\Models\CashSession;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\Order;
use App\Models\PettyCashFund;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Promo;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockAdjustment;
use App\Models\SystemSetting;
use App\Models\TableOrder;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard analytics, one method per tab. Every figure comes from real queries.
 * Queries use portable SQL (MySQL + SQLite) — hour bucketing is done via a driver-aware expression.
 */
class DashboardService
{
    public const TABS = ['sales', 'orders', 'menu', 'inventory', 'customers', 'cash'];

    private ?int $branchId;

    private Carbon $from;

    private Carbon $to;

    private Carbon $prevFrom;

    private Carbon $prevTo;

    private int $days;

    public function scope(?int $branchId, \DateTimeInterface $from, \DateTimeInterface $to): static
    {
        // Normalise to mutable Carbon (the app may hand us CarbonImmutable); the day loops below mutate a cursor.
        $this->branchId = $branchId;
        $this->from = Carbon::instance($from)->startOfDay();
        $this->to = Carbon::instance($to)->endOfDay();
        $this->days = (int) $this->from->copy()->startOfDay()->diffInDays($this->to->copy()->startOfDay()) + 1;
        $this->prevFrom = $this->from->copy()->subDays($this->days)->startOfDay();
        $this->prevTo = $this->from->copy()->subDay()->endOfDay();

        return $this;
    }

    public function period(): array
    {
        return ['from' => $this->from->toDateString(), 'to' => $this->to->toDateString(), 'days' => $this->days];
    }

    // ── SALES ─────────────────────────────────────────────────────────────

    public function sales(): array
    {
        $cur = $this->salesTotals($this->from, $this->to);
        $prev = $this->salesTotals($this->prevFrom, $this->prevTo);
        $cogs = $this->cogs($this->from, $this->to);
        $prevCogs = $this->cogs($this->prevFrom, $this->prevTo);

        $daily = $this->completedSales($this->from, $this->to)
            ->selectRaw('DATE(created_at) as d, SUM(total) as revenue, COUNT(*) as txns')
            ->groupBy('d')->get()->keyBy('d');
        $prevDaily = $this->completedSales($this->prevFrom, $this->prevTo)
            ->selectRaw('DATE(created_at) as d, SUM(total) as revenue')
            ->groupBy('d')->get()->keyBy('d');

        $trend = [];
        $cursor = $this->from->copy();
        $prevCursor = $this->prevFrom->copy();
        while ($cursor->lte($this->to)) {
            $d = $cursor->toDateString();
            $trend[] = [
                'date' => $d,
                'revenue' => round((float) ($daily[$d]->revenue ?? 0), 2),
                'transactions' => (int) ($daily[$d]->txns ?? 0),
                'previous' => round((float) ($prevDaily[$prevCursor->toDateString()]->revenue ?? 0), 2),
            ];
            $cursor->addDay();
            $prevCursor->addDay();
        }

        // Day-of-week × hour heatmap (revenue)
        $heat = $this->completedSales($this->from, $this->to)
            ->selectRaw($this->dowExpr('created_at').' as dow, '.$this->hourExpr('created_at').' as hr, SUM(total) as revenue, COUNT(*) as txns')
            ->groupBy('dow', 'hr')->get();
        $heatmap = [];
        foreach (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as $i => $day) {
            $row = ['day' => $day, 'hours' => []];
            for ($h = 6; $h <= 22; $h++) {
                $cell = $heat->first(fn ($r) => (int) $r->dow === $i && (int) $r->hr === $h);
                $row['hours'][] = ['hour' => $h, 'revenue' => round((float) ($cell->revenue ?? 0), 2), 'txns' => (int) ($cell->txns ?? 0)];
            }
            $heatmap[] = $row;
        }

        $channels = $this->completedSales($this->from, $this->to)
            ->selectRaw("COALESCE(channel, 'counter') as channel, COUNT(*) as txns, SUM(total) as revenue")
            ->groupBy('channel')->get()
            ->map(fn ($r) => ['channel' => $r->channel, 'transactions' => (int) $r->txns, 'revenue' => round((float) $r->revenue, 2)])
            ->values();

        $payments = $this->completedSales($this->from, $this->to)
            ->selectRaw('payment_method, COUNT(*) as txns, SUM(total) as revenue')
            ->groupBy('payment_method')->get()
            ->map(fn ($r) => ['method' => $r->payment_method, 'transactions' => (int) $r->txns, 'revenue' => round((float) $r->revenue, 2)])
            ->values();

        $recent = Sale::with('user:id,fname,lname')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->latest()->limit(8)->get()
            ->map(fn (Sale $s) => [
                'id' => $s->id,
                'receipt_number' => $s->receipt_number,
                'channel' => $s->channel ?? 'counter',
                'total' => (float) $s->total,
                'payment_method' => $s->payment_method,
                'status' => $s->status,
                'cashier' => trim(($s->user?->fname ?? '').' '.($s->user?->lname ?? '')),
                'created_at' => $s->created_at?->toIso8601String(),
            ])->values();

        $grossProfit = $cur['net_sales'] - $cogs;

        return [
            'kpis' => [
                'revenue' => $cur['revenue'],
                'revenue_change' => $this->pct($cur['revenue'], $prev['revenue']),
                'transactions' => $cur['transactions'],
                'transactions_change' => $this->pct($cur['transactions'], $prev['transactions']),
                'average_ticket' => $cur['transactions'] > 0 ? round($cur['revenue'] / $cur['transactions'], 2) : 0,
                'average_ticket_change' => $this->pct(
                    $cur['transactions'] > 0 ? $cur['revenue'] / $cur['transactions'] : 0,
                    $prev['transactions'] > 0 ? $prev['revenue'] / $prev['transactions'] : 0,
                ),
                'gross_profit' => round($grossProfit, 2),
                'gross_profit_change' => $this->pct($grossProfit, $prev['net_sales'] - $prevCogs),
                'gross_margin' => $cur['net_sales'] > 0 ? round(($grossProfit / $cur['net_sales']) * 100, 1) : null,
                'discounts' => $cur['discounts'],
                'loyalty_discounts' => $cur['loyalty_discounts'],
                'delivery_fees' => $cur['delivery_fees'],
                'vat' => $this->vatCollected(),
                'voids' => $cur['voids'],
                'void_total' => $cur['void_total'],
                'avg_daily' => $this->days > 0 ? round($cur['revenue'] / $this->days, 2) : 0,
            ],
            'trend' => $trend,
            'heatmap' => $heatmap,
            'channels' => $channels,
            'payments' => $payments,
            'recent' => $recent,
        ];
    }

    // ── ORDERS ────────────────────────────────────────────────────────────

    public function orders(): array
    {
        $online = OnlineOrder::query()->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId));
        $inPeriod = (clone $online)->whereBetween('created_at', [$this->from, $this->to]);

        $live = collect(OnlineOrder::ACTIVE_STATUSES)->mapWithKeys(fn ($s) => [$s => (clone $online)->where('status', $s)->count()]);

        $finished = (clone $inPeriod)->whereIn('status', OnlineOrder::FINAL_STATUSES)->get([
            'id', 'status', 'fulfillment_type', 'created_at', 'accepted_at', 'ready_at', 'completed_at', 'cancel_reason', 'cancelled_by', 'barangay', 'total',
        ]);
        $completed = $finished->where('status', OnlineOrder::STATUS_COMPLETED);
        $lost = $finished->whereIn('status', [OnlineOrder::STATUS_CANCELLED, OnlineOrder::STATUS_REJECTED]);

        // Average minutes between two timestamps, ignoring orders missing either one.
        $avg = function ($rows, string $start, string $end): ?float {
            $minutes = $rows->filter(fn ($o) => $o->{$start} && $o->{$end})
                ->map(fn ($o) => $o->{$start}->diffInMinutes($o->{$end}));

            return $minutes->isNotEmpty() ? round($minutes->avg(), 1) : null;
        };

        $byBarangay = (clone $inPeriod)->where('fulfillment_type', 'delivery')->whereNotNull('barangay')
            ->selectRaw("barangay, COUNT(*) as orders, SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) as revenue")
            ->groupBy('barangay')->orderByDesc('orders')->limit(12)->get()
            ->map(fn ($r) => ['barangay' => $r->barangay, 'orders' => (int) $r->orders, 'revenue' => round((float) $r->revenue, 2)])
            ->values();

        $reasons = $lost->groupBy(fn ($o) => $o->cancel_reason ?: 'No reason given')
            ->map(fn ($g, $reason) => ['reason' => $reason, 'count' => $g->count()])
            ->sortByDesc('count')->take(8)->values();

        $dailyOrders = (clone $inPeriod)->selectRaw('DATE(created_at) as d, COUNT(*) as orders')
            ->groupBy('d')->get()->keyBy('d');
        $ordersTrend = [];
        $cursor = $this->from->copy();
        while ($cursor->lte($this->to)) {
            $d = $cursor->toDateString();
            $ordersTrend[] = ['date' => $d, 'orders' => (int) ($dailyOrders[$d]->orders ?? 0)];
            $cursor->addDay();
        }

        $pendingTables = TableOrder::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereIn('status', ['open', 'billed'])
            ->with('table:id,table_number')
            ->orderBy('opened_at')->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'table_number' => $t->table?->table_number,
                'total' => (float) $t->total,
                'opened_at' => $t->opened_at?->toIso8601String(),
            ])->values();

        $placed = (clone $inPeriod)->count();

        return [
            'kpis' => [
                'placed' => $placed,
                'completed' => $completed->count(),
                'cancelled' => $lost->count(),
                'cancellation_rate' => $finished->count() > 0 ? round(($lost->count() / $finished->count()) * 100, 1) : null,
                'online_revenue' => round((float) $completed->sum('total'), 2),
                'avg_accept_minutes' => $avg($finished, 'created_at', 'accepted_at'),
                'avg_prep_minutes' => $avg($completed, 'accepted_at', 'ready_at'),
                'avg_delivery_minutes' => $avg($completed->where('fulfillment_type', 'delivery'), 'ready_at', 'completed_at'),
                'pending_tables' => $pendingTables->count(),
                'delivery_share' => $placed > 0 ? round(((clone $inPeriod)->where('fulfillment_type', 'delivery')->count() / $placed) * 100, 1) : null,
            ],
            'live' => $live,
            'trend' => $ordersTrend,
            'by_barangay' => $byBarangay,
            'cancel_reasons' => $reasons,
            'pending_tables' => $pendingTables,
        ];
    }

    // ── MENU PERFORMANCE ──────────────────────────────────────────────────

    public function menu(): array
    {
        $rows = $this->itemsQuery()
            ->selectRaw('products.id, products.name, products.category_id, SUM(sale_items.quantity) as qty, SUM(sale_items.total) as revenue')
            ->groupBy('products.id', 'products.name', 'products.category_id')
            ->get();

        $categories = Category::pluck('name', 'id');
        $catMix = $rows->groupBy('category_id')->map(fn ($g, $cid) => [
            'category' => $categories[$cid] ?? 'Uncategorised',
            'revenue' => round((float) $g->sum('revenue'), 2),
            'qty' => (float) $g->sum('qty'),
        ])->sortByDesc('revenue')->values();

        $map = fn ($r) => ['id' => $r->id, 'name' => $r->name, 'qty' => (float) $r->qty, 'revenue' => round((float) $r->revenue, 2), 'category' => $categories[$r->category_id] ?? null];

        $soldIds = $rows->pluck('id');
        $neverSold = Product::query()
            ->where('status', 'active')
            ->whereNotIn('product_type', ['ingredient', 'service'])
            ->when($this->branchId, fn ($q) => $q->whereHas('stocks', fn ($s) => $s->where('branch_id', $this->branchId)))
            ->whereNotIn('id', $soldIds)
            ->orderBy('name')->limit(25)->get(['id', 'name', 'category_id'])
            ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'category' => $categories[$p->category_id] ?? null])
            ->values();

        return [
            'kpis' => [
                'items_sold' => (float) $rows->sum('qty'),
                'distinct_items' => $rows->count(),
                'top_item' => optional($rows->sortByDesc('qty')->first())->name,
                'never_sold' => $neverSold->count(),
            ],
            'top_by_qty' => $rows->sortByDesc('qty')->take(10)->map($map)->values(),
            'top_by_revenue' => $rows->sortByDesc('revenue')->take(10)->map($map)->values(),
            'bottom' => $rows->sortBy('qty')->take(10)->map($map)->values(),
            'category_mix' => $catMix,
            'never_sold' => $neverSold,
        ];
    }

    // ── INVENTORY ─────────────────────────────────────────────────────────

    public function inventory(): array
    {
        $threshold = SystemSetting::lowStockThreshold($this->branchId);
        $stocks = ProductStock::with('product:id,name,product_type,unit,category_id')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereHas('product', fn ($q) => $q->where('status', 'active')->where('product_type', '!=', 'service'))
            ->get();

        $tracked = $stocks->filter(fn ($s) => $s->product && $s->product->product_type !== 'made_to_order');
        $out = $tracked->filter(fn ($s) => (float) $s->stock <= 0);
        $low = $tracked->filter(fn ($s) => (float) $s->stock > 0 && (float) $s->stock <= $threshold);
        $map = fn ($s) => [
            'product_id' => $s->product_id,
            'name' => $s->product?->name,
            'stock' => (float) $s->stock,
            'unit' => $s->product?->unit,
            'is_ingredient' => $s->product?->product_type === 'ingredient',
        ];

        $losses = StockAdjustment::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('created_at', [$this->from, $this->to])
            ->selectRaw('type, COUNT(*) as entries, SUM(quantity) as qty, SUM(quantity * unit_cost) as value')
            ->groupBy('type')->get()
            ->map(fn ($r) => ['type' => $r->type, 'entries' => (int) $r->entries, 'qty' => (float) $r->qty, 'value' => round((float) $r->value, 2)])
            ->values();

        // Ingredient usage implied by recipes for what was sold in the period
        $usage = DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('recipe_ingredients', 'recipe_ingredients.product_id', '=', 'sale_items.product_id')
            ->join('products as ing', 'ing.id', '=', 'recipe_ingredients.ingredient_id')
            ->where('sales.status', 'completed')
            ->when($this->branchId, fn ($q) => $q->where('sales.branch_id', $this->branchId))
            ->whereBetween('sales.created_at', [$this->from, $this->to])
            ->selectRaw('ing.id, ing.name, ing.unit, SUM(sale_items.quantity * recipe_ingredients.quantity) as used')
            ->groupBy('ing.id', 'ing.name', 'ing.unit')
            ->orderByDesc('used')->limit(10)->get()
            ->map(fn ($r) => ['name' => $r->name, 'unit' => $r->unit, 'used' => round((float) $r->used, 2)])
            ->values();

        $stockValue = round((float) $stocks->sum(fn ($s) => max(0, (float) $s->stock) * (float) $s->capital), 2);

        $pendingPos = Order::with('supplier:id,name')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereIn('status', ['pending', 'confirmed', 'shipped'])
            ->latest()->limit(6)->get()
            ->map(fn ($o) => ['id' => $o->id, 'order_number' => $o->order_number, 'supplier' => $o->supplier?->name, 'total' => (float) $o->total, 'status' => $o->status])
            ->values();

        return [
            'kpis' => [
                'tracked_items' => $tracked->count(),
                'in_stock' => $tracked->count() - $out->count() - $low->count(),
                'low_stock' => $low->count(),
                'out_of_stock' => $out->count(),
                'stock_value' => $stockValue,
                'loss_value' => round((float) $losses->sum('value'), 2),
                'threshold' => $threshold,
                'pending_purchase_orders' => $pendingPos->count(),
            ],
            'low_stock' => $low->sortBy('stock')->take(15)->map($map)->values(),
            'out_of_stock' => $out->take(15)->map($map)->values(),
            'losses' => $losses,
            'ingredient_usage' => $usage,
            'pending_purchase_orders' => $pendingPos,
        ];
    }

    // ── CUSTOMERS & LOYALTY ───────────────────────────────────────────────

    public function customers(): array
    {
        $loyalty = app(LoyaltyService::class);
        $rules = $loyalty->rules($this->branchId);

        $buyers = $this->completedSales($this->from, $this->to)->whereNotNull('customer_id')
            ->selectRaw('customer_id, COUNT(*) as visits, SUM(total) as spent')
            ->groupBy('customer_id')->get();
        $firstPurchase = Sale::query()->where('status', 'completed')->whereIn('customer_id', $buyers->pluck('customer_id'))
            ->selectRaw('customer_id, MIN(created_at) as first_at')->groupBy('customer_id')->pluck('first_at', 'customer_id');
        $new = $buyers->filter(fn ($b) => isset($firstPurchase[$b->customer_id]) && Carbon::parse($firstPurchase[$b->customer_id])->gte($this->from))->count();

        $names = Customer::whereIn('id', $buyers->pluck('customer_id'))->pluck('name', 'id');
        $top = $buyers->sortByDesc('spent')->take(10)->map(fn ($b) => [
            'id' => $b->customer_id,
            'name' => $names[$b->customer_id] ?? 'Customer',
            'visits' => (int) $b->visits,
            'spent' => round((float) $b->spent, 2),
        ])->values();

        $tx = LoyaltyTransaction::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('created_at', [$this->from, $this->to]);
        $issued = (int) (clone $tx)->whereIn('type', [LoyaltyTransaction::TYPE_EARN, LoyaltyTransaction::TYPE_BONUS])->sum('points');
        $redeemed = (int) abs((clone $tx)->where('type', LoyaltyTransaction::TYPE_REDEEM)->sum('points'));

        $outstanding = (int) Customer::where('loyalty_enabled', true)->sum('loyalty_points');
        $tiers = collect($rules['tiers']);
        $tierDist = $tiers->mapWithKeys(fn ($t) => [$t['name'] => 0])->all();
        Customer::where('loyalty_enabled', true)->pluck('lifetime_points_earned')->each(function ($lifetime) use ($tiers, &$tierDist) {
            $tier = $tiers->filter(fn ($t) => (int) $lifetime >= $t['min'])->last() ?? $tiers->first();
            if ($tier) {
                $tierDist[$tier['name']]++;
            }
        });

        $promoUsage = Sale::query()->where('status', 'completed')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('created_at', [$this->from, $this->to])
            ->where('notes', 'like', '%Promo %')
            ->selectRaw('COUNT(*) as uses, SUM(total) as revenue, SUM(discount_amount) as discount')
            ->first();

        $promos = Promo::tableExists()
            ? Promo::orderByDesc('uses_count')->limit(8)->get()->map(fn (Promo $p) => [
                'id' => $p->id, 'name' => $p->name, 'code' => $p->code, 'uses' => (int) $p->uses_count,
                'status' => $p->status, 'channels' => $p->channels, 'storefront' => (bool) $p->show_on_storefront,
            ])->values()
            : collect();

        return [
            'kpis' => [
                'customers_buying' => $buyers->count(),
                'new_customers' => $new,
                'returning_customers' => $buyers->count() - $new,
                'member_sales_share' => ($all = $this->salesTotals($this->from, $this->to)['revenue']) > 0
                    ? round(((float) $buyers->sum('spent') / $all) * 100, 1) : null,
                'online_accounts' => Customer::whereNotNull('password')->count(),
                'new_signups' => Customer::whereNotNull('password')->whereBetween('created_at', [$this->from, $this->to])->count(),
                'points_issued' => $issued,
                'points_redeemed' => $redeemed,
                'outstanding_points' => $outstanding,
                'points_liability' => round($outstanding * $rules['peso_per_point'], 2),
                'promo_uses' => (int) ($promoUsage->uses ?? 0),
                'promo_revenue' => round((float) ($promoUsage->revenue ?? 0), 2),
                'promo_discount' => round((float) ($promoUsage->discount ?? 0), 2),
            ],
            'top_customers' => $top,
            'tier_distribution' => collect($tierDist)->map(fn ($count, $name) => ['tier' => $name, 'members' => $count])->values(),
            'promos' => $promos,
        ];
    }

    // ── CASH & EXPENSES ───────────────────────────────────────────────────

    public function cash(): array
    {
        $expenses = Expense::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('expense_date', [$this->from->toDateString(), $this->to->toDateString()]);
        $prevExpenses = (float) Expense::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('expense_date', [$this->prevFrom->toDateString(), $this->prevTo->toDateString()])
            ->sum('amount');

        $expTotal = round((float) (clone $expenses)->sum('amount'), 2);
        $byCategory = (clone $expenses)->with('category:id,name')
            ->selectRaw('expense_category_id, SUM(amount) as total')
            ->groupBy('expense_category_id')->get()
            ->map(fn ($r) => ['category' => $r->category?->name ?? 'Uncategorised', 'total' => round((float) $r->total, 2)])
            ->sortByDesc('total')->values();

        $revenue = $this->salesTotals($this->from, $this->to)['revenue'];
        $prevRevenue = $this->salesTotals($this->prevFrom, $this->prevTo)['revenue'];

        $sessions = CashSession::with('user:id,fname,lname')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->where(fn ($q) => $q->where('status', 'open')->orWhereBetween('opened_at', [$this->from, $this->to]))
            ->latest('opened_at')->limit(10)->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'cashier' => trim(($s->user?->fname ?? '').' '.($s->user?->lname ?? '')),
                'status' => $s->status,
                'opened_at' => $s->opened_at?->toIso8601String(),
                'closed_at' => $s->closed_at?->toIso8601String(),
                'opening_cash' => (float) $s->opening_cash,
                'expected_cash' => $s->expected_cash !== null ? (float) $s->expected_cash : null,
                'counted_cash' => $s->counted_cash !== null ? (float) $s->counted_cash : null,
                'over_short' => $s->over_short !== null ? (float) $s->over_short : null,
            ])->values();

        $overShort = (float) CashSession::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('opened_at', [$this->from, $this->to])->sum('over_short');

        $pettyCash = (float) PettyCashFund::query()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->where('status', 'active')->sum('current_balance');

        $dailyExp = (clone $expenses)->selectRaw('expense_date as d, SUM(amount) as total')->groupBy('d')->get()
            ->keyBy(fn ($r) => Carbon::parse($r->d)->toDateString());
        $dailyRev = $this->completedSales($this->from, $this->to)->selectRaw('DATE(created_at) as d, SUM(total) as revenue')->groupBy('d')->get()->keyBy('d');
        $trend = [];
        $cursor = $this->from->copy();
        while ($cursor->lte($this->to)) {
            $d = $cursor->toDateString();
            $trend[] = ['date' => $d, 'revenue' => round((float) ($dailyRev[$d]->revenue ?? 0), 2), 'expenses' => round((float) ($dailyExp[$d]->total ?? 0), 2)];
            $cursor->addDay();
        }

        $cogs = $this->cogs($this->from, $this->to);
        $net = $revenue - $cogs - $expTotal;

        return [
            'kpis' => [
                'revenue' => $revenue,
                'expenses' => $expTotal,
                'expenses_change' => $this->pct($expTotal, $prevExpenses),
                'cogs' => round($cogs, 2),
                'net_income' => round($net, 2),
                'net_income_change' => $this->pct($net, $prevRevenue - $this->cogs($this->prevFrom, $this->prevTo) - $prevExpenses),
                'open_sessions' => $sessions->where('status', 'open')->count(),
                'over_short' => round($overShort, 2),
                'petty_cash_balance' => round($pettyCash, 2),
            ],
            'expenses_by_category' => $byCategory,
            'trend' => $trend,
            'sessions' => $sessions,
        ];
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    private function completedSales(Carbon $from, Carbon $to)
    {
        return Sale::query()
            ->where('status', 'completed')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('created_at', [$from, $to]);
    }

    private function salesTotals(Carbon $from, Carbon $to): array
    {
        $row = $this->completedSales($from, $to)
            ->selectRaw('COUNT(*) as txns, SUM(total) as revenue, SUM(discount_amount) as discounts, SUM(loyalty_discount) as loyalty, SUM(delivery_fee) as fees')
            ->first();
        $voids = Sale::query()->where('status', 'voided')
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('COUNT(*) as c, SUM(total) as t')->first();

        $revenue = round((float) ($row->revenue ?? 0), 2);
        $fees = round((float) ($row->fees ?? 0), 2);

        return [
            'revenue' => $revenue,
            'net_sales' => round($revenue - $fees, 2),
            'transactions' => (int) ($row->txns ?? 0),
            'discounts' => round((float) ($row->discounts ?? 0), 2),
            'loyalty_discounts' => round((float) ($row->loyalty ?? 0), 2),
            'delivery_fees' => $fees,
            'voids' => (int) ($voids->c ?? 0),
            'void_total' => round((float) ($voids->t ?? 0), 2),
        ];
    }

    /** Cost of goods sold, using each product's capital at the selling branch. */
    private function cogs(Carbon $from, Carbon $to): float
    {
        return (float) DB::table('sale_items')
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('product_stocks', function ($j) {
                $j->on('product_stocks.product_id', '=', 'sale_items.product_id')
                    ->on('product_stocks.branch_id', '=', 'sales.branch_id');
            })
            ->where('sales.status', 'completed')
            ->where('sale_items.is_bundle_component', false)
            ->when($this->branchId, fn ($q) => $q->where('sales.branch_id', $this->branchId))
            ->whereBetween('sales.created_at', [$from, $to])
            ->selectRaw('SUM(sale_items.quantity * product_stocks.capital) as cogs')
            ->value('cogs');
    }

    /** VAT collected: stored per sale for VAT-exclusive pricing, derived from net sales when prices include VAT. */
    private function vatCollected(): float
    {
        $rate = (float) SystemSetting::get('tax.vat_rate', $this->branchId, 12);
        if (! SystemSetting::vatEnabled($this->branchId) || $rate <= 0) {
            return 0.0;
        }

        if ((bool) SystemSetting::get('tax.vat_inclusive', $this->branchId, true)) {
            $net = $this->salesTotals($this->from, $this->to)['net_sales'];

            return round($net - ($net / (1 + $rate / 100)), 2);
        }

        return round((float) $this->completedSales($this->from, $this->to)->sum('vat_amount'), 2);
    }

    private function itemsQuery()
    {
        return SaleItem::query()
            ->join('sales', 'sale_items.sale_id', '=', 'sales.id')
            ->join('products', 'sale_items.product_id', '=', 'products.id')
            ->where('sales.status', 'completed')
            ->where('sale_items.is_bundle_component', false)
            ->when($this->branchId, fn ($q) => $q->where('sales.branch_id', $this->branchId))
            ->whereBetween('sales.created_at', [$this->from, $this->to]);
    }

    private function hourExpr(string $col): string
    {
        return DB::getDriverName() === 'sqlite' ? "CAST(strftime('%H', {$col}) AS INTEGER)" : "HOUR({$col})";
    }

    /** 0 = Sunday … 6 = Saturday on both drivers. */
    private function dowExpr(string $col): string
    {
        return DB::getDriverName() === 'sqlite' ? "CAST(strftime('%w', {$col}) AS INTEGER)" : "(DAYOFWEEK({$col}) - 1)";
    }

    private function pct(float|int $cur, float|int $prev): ?float
    {
        return $prev > 0 ? round((($cur - $prev) / $prev) * 100, 1) : null;
    }
}
