<?php

namespace App\Services\Reports;

use App\Models\Expense;
use Illuminate\Database\Eloquent\Builder;

/**
 * Approved expenses for a period. Pending and rejected expenses are not spent
 * money yet, so they are only counted for information.
 */
class ExpenseReport
{
    /**
     * @return array<string, mixed>
     */
    public function build(?int $branchId, string $from, string $to): array
    {
        $totals = $this->approved($branchId, $from, $to)
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as total, COALESCE(MAX(amount), 0) as largest')
            ->toBase()
            ->first();

        $total = round((float) $totals->total, 2);
        $count = (int) $totals->count;

        $byCategory = $this->approved($branchId, $from, $to)
            ->leftJoin('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->groupBy('expenses.expense_category_id', 'expense_categories.name')
            ->selectRaw('expense_categories.name as name, COUNT(*) as count, COALESCE(SUM(expenses.amount), 0) as amount')
            ->orderByDesc('amount')
            ->toBase()
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name ?? 'Uncategorized',
                'count' => (int) $row->count,
                'amount' => round((float) $row->amount, 2),
                'share' => $total > 0 ? round((float) $row->amount / $total * 100, 1) : 0.0,
            ])
            ->all();

        $byMethod = $this->approved($branchId, $from, $to)
            ->groupBy('payment_method')
            ->selectRaw('payment_method as `key`, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->orderByDesc('amount')
            ->toBase()
            ->get()
            ->map(fn ($row) => ['key' => (string) $row->key, 'count' => (int) $row->count, 'amount' => round((float) $row->amount, 2)])
            ->all();

        $notApproved = $this->inPeriod($branchId, $from, $to)
            ->where('status', '!=', 'approved')
            ->selectRaw('COUNT(*) as count, COALESCE(SUM(amount), 0) as amount')
            ->toBase()
            ->first();

        return [
            'summary' => [
                'total' => $total,
                'count' => $count,
                'average' => $count > 0 ? round($total / $count, 2) : 0.0,
                'largest' => round((float) $totals->largest, 2),
                'not_approved_count' => (int) $notApproved->count,
                'not_approved_amount' => round((float) $notApproved->amount, 2),
            ],
            'by_category' => $byCategory,
            'by_method' => $byMethod,
        ];
    }

    /**
     * Approved expenses in the period, newest first, for the register.
     *
     * @return Builder<Expense>
     */
    public function register(?int $branchId, string $from, string $to): Builder
    {
        return $this->approved($branchId, $from, $to)
            ->with(['category:id,name', 'user:id,fname,lname'])
            ->orderByDesc('expense_date')
            ->orderByDesc('id');
    }

    /**
     * @return Builder<Expense>
     */
    private function inPeriod(?int $branchId, string $from, string $to): Builder
    {
        return Expense::query()
            ->when($branchId, fn ($query) => $query->where('expenses.branch_id', $branchId))
            ->whereDate('expenses.expense_date', '>=', $from)
            ->whereDate('expenses.expense_date', '<=', $to);
    }

    /**
     * @return Builder<Expense>
     */
    private function approved(?int $branchId, string $from, string $to): Builder
    {
        return $this->inPeriod($branchId, $from, $to)->where('expenses.status', 'approved');
    }
}
