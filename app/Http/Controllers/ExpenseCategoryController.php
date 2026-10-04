<?php

namespace App\Http\Controllers;

use App\Models\ExpenseCategory;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class ExpenseCategoryController extends Controller
{
    public function index(): Response
    {
        $user = Auth::user();
        $isManager = $user->hasElevatedAccess() || in_array($user->role ?? '', ['manager', 'administrator', 'super_admin']);

        $categories = ExpenseCategory::withCount('expenses')
            ->orderBy('name')
            ->get();

        return Inertia::render('ExpenseCategories/Index', [
            'categories' => $categories,
            'is_manager' => $isManager,
            'current_user' => [
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
            'name'        => ['required', 'string', 'max:100', 'unique:expense_categories,name'],
            'description' => ['nullable', 'string', 'max:255'],
            'color'       => ['nullable', 'string', 'max:7'],
        ]);

        $category = ExpenseCategory::create([
            'name'        => trim($validated['name']),
            'description' => $validated['description'] ? trim($validated['description']) : null,
            'color'       => $validated['color'] ?? '#3b82f6',
            'is_active'   => true,
            'created_by'  => $user->id,
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_category_created',
            'subject_type' => ExpenseCategory::class,
            'subject_id'   => $category->id,
            'properties'   => ['name' => $category->name],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Expense category '{$category->name}' created successfully.",
        ]);
    }

    public function update(Request $request, ExpenseCategory $category): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:100', 'unique:expense_categories,name,' . $category->id],
            'description' => ['nullable', 'string', 'max:255'],
            'color'       => ['nullable', 'string', 'max:7'],
        ]);

        $category->update([
            'name'        => trim($validated['name']),
            'description' => $validated['description'] ? trim($validated['description']) : null,
            'color'       => $validated['color'] ?? $category->color,
        ]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_category_updated',
            'subject_type' => ExpenseCategory::class,
            'subject_id'   => $category->id,
            'properties'   => ['name' => $category->name],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Expense category updated successfully.",
        ]);
    }

    public function toggleActive(Request $request, ExpenseCategory $category): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);

        $category->update(['is_active' => !$category->is_active]);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => $category->is_active ? 'expense_category_activated' : 'expense_category_deactivated',
            'subject_type' => ExpenseCategory::class,
            'subject_id'   => $category->id,
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Category '{$category->name}' has been " . ($category->is_active ? 'activated' : 'deactivated') . ".",
        ]);
    }

    public function destroy(ExpenseCategory $category): RedirectResponse
    {
        $user = Auth::user();
        if (!$user->hasElevatedAccess()) abort(403);

        if ($category->expenses()->exists()) {
            return back()->withErrors(['error' => 'Cannot delete category with existing expenses.']);
        }

        $name = $category->name;
        $category->delete();

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'expense_category_deleted',
            'subject_type' => ExpenseCategory::class,
            'subject_id'   => $category->id,
            'properties'   => ['name' => $name],
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => "Expense category '{$name}' deleted successfully.",
        ]);
    }
}