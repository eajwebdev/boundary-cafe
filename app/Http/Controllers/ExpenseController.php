<?php

namespace App\Http\Controllers;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class ExpenseController extends Controller
{
    public function index(): Response
    {
        $user = Auth::user();
        $branchId = $user->branch_id;
        $isManager = $user->hasElevatedAccess() || in_array($user->role ?? '', ['manager', 'administrator', 'super_admin']);

        $expenses = Expense::with(['category', 'user'])
            ->where('branch_id', $branchId)
            ->latest()
            ->paginate(20);

        $categories = ExpenseCategory::active()->get(['id', 'name']);

        $totalThisMonth = Expense::where('branch_id', $branchId)
            ->whereMonth('expense_date', now()->month)
            ->whereYear('expense_date', now()->year)
            ->sum('amount');

        return Inertia::render('Expenses/Index', [
            'expenses'       => $expenses,
            'categories'     => $categories,
            'total_this_month' => (float) $totalThisMonth,
            'is_manager'     => $isManager,
            'current_user'   => [
                'id'   => $user->id,
                'name' => trim($user->fname . ' ' . $user->lname),
                'role' => $user->role ?? 'unknown',
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $validated = $request->validate([
            'expense_category_id' => ['required', 'exists:expense_categories,id'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'expense_date'        => ['required', 'date'],
            'description'         => ['required', 'string', 'max:500'],
            'payment_method'      => ['required', 'in:cash,bank,card'],
            'notes'               => ['nullable', 'string', 'max:1000'],
        ]);

        $status = 'approved';

        $expense = Expense::create([
            'branch_id'           => $user->branch_id,
            'user_id'             => $user->id,
            'expense_category_id' => $validated['expense_category_id'],
            'amount'              => $validated['amount'],
            'expense_date'        => $validated['expense_date'],
            'description'         => trim($validated['description']),
            'payment_method'      => $validated['payment_method'],
            'notes'               => $validated['notes'] ?? null,
            'status'              => $status,
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_created',
            'subject_type' => Expense::class,
            'subject_id'   => $expense->id,
            'properties'   => [
                'amount'      => (float) $validated['amount'],
                'category_id' => $validated['expense_category_id'],
                'description' => $validated['description'],
            ],
        ]);

        $msg = "Expense of ₱" . number_format($expense->amount, 2) . " recorded.";

        return back()->with('message', ['type' => 'success', 'text' => $msg]);
    }

    public function show(Expense $expense): Response
    {
        $this->authorizeBranch($expense->branch_id);
        $expense->load(['category', 'user']);
        return Inertia::render('Expenses/Show', ['expense' => $expense]);
    }

    public function update(Request $request, Expense $expense): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);
        $this->authorizeBranch($expense->branch_id);

        $validated = $request->validate([
            'expense_category_id' => ['required', 'exists:expense_categories,id'],
            'amount'              => ['required', 'numeric', 'min:0.01'],
            'expense_date'        => ['required', 'date'],
            'description'         => ['required', 'string', 'max:500'],
            'payment_method'      => ['required', 'in:cash,bank,card'],
            'notes'               => ['nullable', 'string', 'max:1000'],
        ]);

        $expense->update($validated);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_updated',
            'subject_type' => Expense::class,
            'subject_id'   => $expense->id,
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Expense updated successfully.",
        ]);
    }

    public function destroy(Expense $expense): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);
        $this->authorizeBranch($expense->branch_id);

        $expense->delete();

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_deleted',
            'subject_type' => Expense::class,
            'subject_id'   => $expense->id,
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Expense deleted successfully.",
        ]);
    }
}