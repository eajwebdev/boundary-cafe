<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Expense;
use App\Models\Sale;
use App\Models\SystemSetting;
use App\Services\Reports\DailyReport;
use App\Services\Reports\ExpenseReport;
use App\Services\Reports\IngredientUsageReport;
use App\Services\Reports\InventoryReport;
use App\Services\Reports\ReportLabels;
use App\Services\Reports\SalesReport;
use App\Services\Reports\StockLossReport;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Back-office reports. Each report is built once by its report class and the
 * same result feeds both the screen and the PDF, so the two always agree.
 */
class ReportController extends Controller
{
    private const MAX_PERIOD_DAYS = 366;

    private const REGISTER_PER_PAGE = 25;

    // ── Daily Summary ─────────────────────────────────────────────────────────

    public function dailySummary(Request $request, DailyReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);
        $date = $this->day($request);

        return Inertia::render('Reports/DailySummary', [
            ...$this->context($branchId, $date, $date),
            'report' => $report->build($branchId, $date),
        ]);
    }

    public function dailySummaryPdf(Request $request, DailyReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        $date = $this->day($request);

        return $this->pdf('daily', 'Daily Sales Summary', $branchId, $date, $date, [
            'report' => $report->build($branchId, $date),
        ]);
    }

    // ── Sales Report ──────────────────────────────────────────────────────────

    public function salesReport(Request $request, SalesReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());
        $method = $this->paymentMethod($request);

        $register = $report->register($branchId, $from, $to, $method)
            ->paginate(self::REGISTER_PER_PAGE)
            ->withQueryString()
            ->through(fn (Sale $sale) => $this->saleRow($sale));

        return Inertia::render('Reports/SalesReport', [
            ...$this->context($branchId, $from, $to),
            'payment_method' => $method,
            'report' => $report->build($branchId, $from, $to),
            'register' => $register,
        ]);
    }

    public function salesReportPdf(Request $request, SalesReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());
        $method = $this->paymentMethod($request);

        return $this->pdf('sales', 'Sales Report', $branchId, $from, $to, [
            'report' => $report->build($branchId, $from, $to),
            'register' => $report->register($branchId, $from, $to, $method)->get()->map(fn (Sale $sale) => $this->saleRow($sale)),
            'paymentMethod' => $method,
        ], 'landscape');
    }

    // ── Inventory Report ──────────────────────────────────────────────────────

    public function inventoryReport(Request $request, InventoryReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);

        return Inertia::render('Reports/InventoryReport', [
            ...$this->context($branchId, null, null),
            'report' => $report->build($branchId),
        ]);
    }

    public function inventoryReportPdf(Request $request, InventoryReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['attention', InventoryReport::STATUS_OUT, InventoryReport::STATUS_LOW, InventoryReport::STATUS_EXPIRED, InventoryReport::STATUS_EXPIRING])],
            'category' => ['nullable', 'string', 'max:100'],
        ]);

        $data = $report->build($branchId);
        $data['rows'] = collect($data['rows'])
            ->when($validated['category'] ?? null, fn ($rows, $category) => $rows->where('category', $category))
            ->when($validated['status'] ?? null, fn ($rows, $status) => $status === 'attention'
                ? $rows->where('status', '!=', InventoryReport::STATUS_OK)
                : $rows->where('status', $status))
            ->values()
            ->all();

        return $this->pdf('inventory', 'Inventory Valuation Report', $branchId, null, null, [
            'report' => $data,
            'filterNote' => collect([$validated['category'] ?? null, isset($validated['status']) ? 'Status: '.$validated['status'] : null])->filter()->join(' · '),
        ], 'landscape');
    }

    // ── Expense Report ────────────────────────────────────────────────────────

    public function expenseReport(Request $request, ExpenseReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());

        $register = $report->register($branchId, $from, $to)
            ->paginate(self::REGISTER_PER_PAGE)
            ->withQueryString()
            ->through(fn (Expense $expense) => $this->expenseRow($expense));

        return Inertia::render('Reports/ExpensesReport', [
            ...$this->context($branchId, $from, $to),
            'report' => $report->build($branchId, $from, $to),
            'register' => $register,
        ]);
    }

    public function expenseReportPdf(Request $request, ExpenseReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());

        return $this->pdf('expenses', 'Expense Report', $branchId, $from, $to, [
            'report' => $report->build($branchId, $from, $to),
            'register' => $report->register($branchId, $from, $to)->get()->map(fn (Expense $expense) => $this->expenseRow($expense)),
        ]);
    }

    // ── Ingredient Usage Report ───────────────────────────────────────────────

    public function ingredientUsageReport(Request $request, IngredientUsageReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->subDays(6));

        return Inertia::render('Reports/IngredientUsageReport', [
            ...$this->context($branchId, $from, $to),
            'report' => $report->build($branchId, $from, $to),
        ]);
    }

    public function ingredientUsageReportPdf(Request $request, IngredientUsageReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->subDays(6));

        return $this->pdf('ingredient-usage', 'Ingredient Usage Report', $branchId, $from, $to, [
            'report' => $report->build($branchId, $from, $to),
        ]);
    }

    // ── Stock Loss Report ─────────────────────────────────────────────────────

    public function stockLossReport(Request $request, StockLossReport $report): Response
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());
        $type = $this->lossType($request);

        return Inertia::render('Reports/StockLoss', [
            ...$this->context($branchId, $from, $to),
            'type' => $type,
            'report' => $report->build($branchId, $from, $to, $type),
        ]);
    }

    public function stockLossReportPdf(Request $request, StockLossReport $report): HttpResponse
    {
        $branchId = $this->resolvedBranchId($request);
        [$from, $to] = $this->period($request, today()->startOfMonth());
        $type = $this->lossType($request);

        return $this->pdf('stock-loss', 'Stock Loss Report', $branchId, $from, $to, [
            'report' => $report->build($branchId, $from, $to, $type),
            'type' => $type,
        ]);
    }

    // ── Shared helpers ────────────────────────────────────────────────────────

    /**
     * Admins may pick a branch (none = all branches); everyone else only sees
     * their own branch, whatever they pass.
     */
    private function resolvedBranchId(Request $request): ?int
    {
        $user = $request->user();

        if (! $user->isAdmin()) {
            return $user->branch_id;
        }

        return $request->filled('branch_id') ? Branch::findOrFail((int) $request->input('branch_id'))->id : null;
    }

    private function day(Request $request): string
    {
        $validated = $request->validate(['date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:today']]);

        return $validated['date'] ?? today()->toDateString();
    }

    /**
     * The requested period, defaulting to $defaultFrom … today.
     *
     * @return array{0: string, 1: string}
     */
    private function period(Request $request, CarbonInterface $defaultFrom): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $from = Carbon::parse($validated['from'] ?? $defaultFrom);
        $to = Carbon::parse($validated['to'] ?? today());
        if ($from->gt($to)) {
            [$from, $to] = [$to, $from];
        }

        if ($from->diffInDays($to) + 1 > self::MAX_PERIOD_DAYS) {
            throw ValidationException::withMessages(['to' => 'Choose a period of one year or less.']);
        }

        return [$from->toDateString(), $to->toDateString()];
    }

    private function paymentMethod(Request $request): ?string
    {
        return $request->validate(['payment_method' => ['nullable', Rule::in(['cash', 'gcash', 'card', 'others', 'credit', 'mixed', 'installment'])]])['payment_method'] ?? null;
    }

    private function lossType(Request $request): ?string
    {
        return $request->validate(['type' => ['nullable', Rule::in(StockLossReport::TYPES)]])['type'] ?? null;
    }

    /**
     * Branch picker and the filters the page was built with.
     *
     * @return array<string, mixed>
     */
    private function context(?int $branchId, ?string $from, ?string $to): array
    {
        return [
            'branches' => auth()->user()->isAdmin() ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name']) : null,
            'filters' => ['branch_id' => $branchId, 'from' => $from, 'to' => $to],
            'branch_label' => $this->branchLabel($branchId),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function branchLabel(?int $branchId): string
    {
        return $branchId ? (Branch::whereKey($branchId)->value('name') ?? 'Branch') : 'All branches';
    }

    /**
     * Render a report PDF on the shared letterhead.
     *
     * @param  array<string, mixed>  $data
     */
    private function pdf(string $view, string $title, ?int $branchId, ?string $from, ?string $to, array $data, string $orientation = 'portrait'): HttpResponse
    {
        $settingsBranch = $branchId;
        $period = match (true) {
            $from === null => 'As of '.now()->format('M j, Y g:i A'),
            $from === $to => Carbon::parse($from)->format('l, F j, Y'),
            default => Carbon::parse($from)->format('M j, Y').' – '.Carbon::parse($to)->format('M j, Y'),
        };

        $meta = [
            'title' => $title,
            'period' => $period,
            'branch' => $this->branchLabel($branchId),
            'businessName' => SystemSetting::businessName($settingsBranch),
            'address' => (string) SystemSetting::get('general.address', $settingsBranch, ''),
            'phone' => (string) SystemSetting::get('general.phone', $settingsBranch, ''),
            'tin' => (string) SystemSetting::get('general.tin', $settingsBranch, ''),
            'logoPath' => SystemSetting::logoFilePath($settingsBranch),
            'generatedAt' => now()->format('M j, Y g:i A'),
            'generatedBy' => auth()->user()->full_name,
            'orientation' => $orientation,
        ];

        $filename = str($title)->slug().'-'.($from ?? now()->toDateString()).($to && $to !== $from ? "-to-{$to}" : '').'.pdf';

        return Pdf::loadView("pdf.reports.{$view}", ['meta' => $meta, ...$data])
            ->setPaper('a4', $orientation)
            ->setOption(['isPhpEnabled' => true])
            ->stream($filename);
    }

    /**
     * @return array<string, mixed>
     */
    private function saleRow(Sale $sale): array
    {
        $collected = in_array($sale->payment_method, ['credit', 'mixed', 'installment'], true) ? (float) $sale->amount_paid : (float) $sale->total;

        return [
            'id' => $sale->id,
            'receipt_number' => $sale->receipt_number,
            'created_at' => $sale->created_at->toIso8601String(),
            'cashier' => $sale->user?->full_name ?? '—',
            'customer' => $sale->customer?->name ?? $sale->customer_name,
            'channel' => ReportLabels::channel($sale->channel),
            'payment_method' => $sale->payment_method,
            'payment_label' => ReportLabels::paymentMethod($sale->payment_method),
            'discount' => round((float) $sale->discount_amount + (float) $sale->loyalty_discount, 2),
            'total' => round((float) $sale->total, 2),
            'collected' => round($collected, 2),
            'balance' => round((float) $sale->balance_due, 2),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function expenseRow(Expense $expense): array
    {
        return [
            'id' => $expense->id,
            'date' => Carbon::parse($expense->expense_date)->toDateString(),
            'reference' => $expense->reference_number,
            'category' => $expense->category?->name ?? 'Uncategorized',
            'description' => $expense->description,
            'payment_label' => ReportLabels::paymentMethod($expense->payment_method),
            'recorded_by' => $expense->user?->full_name ?? '—',
            'amount' => round((float) $expense->amount, 2),
        ];
    }
}
