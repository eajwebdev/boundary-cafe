<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Supplier;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class BranchController extends Controller
{
    // ── Index ──────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $branches = Branch::query()
            ->with('supplier:id,name')
            ->withCount(['users', 'productStocks'])
            ->orderBy('name')
            ->get()
            ->map(fn (Branch $b) => [
                'id'              => $b->id,
                'name'            => $b->name,
                'code'            => $b->code,
                'address'         => $b->address,
                'phone'           => $b->phone,
                'contact_person'  => $b->contact_person,
                'is_active'       => $b->is_active,
                'business_type'   => $b->business_type,
                'business_type_label' => $b->business_type_label,
                'supplier_id'     => $b->supplier_id,
                'supplier'        => $b->supplier
                    ? ['id' => $b->supplier->id, 'name' => $b->supplier->name]
                    : null,
                'feature_flags'   => $b->feature_flags,
                // individual flags for the form toggles
                'use_table_ordering'  => $b->use_table_ordering,
                'use_variants'        => $b->use_variants,
                'use_expiry_tracking' => $b->use_expiry_tracking,
                'use_recipe_system'   => $b->use_recipe_system,
                'use_bundles'         => $b->use_bundles,
                // stats
                'users_count'         => $b->users_count,
                'product_stocks_count'=> $b->product_stocks_count,
                'created_at'          => $b->created_at?->toIso8601String(),
            ]);

        return Inertia::render('Branches/Index', [
            'branches'      => $branches,
            'suppliers'     => Supplier::orderBy('name')->get(['id', 'name']),
            'businessTypes' => Branch::businessTypes(),
        ]);
    }

    // ── Store ──────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name'             => ['required', 'string', 'max:255', 'unique:branches,name'],
            'code'             => ['required', 'string', 'max:20', 'unique:branches,code'],
            'address'          => ['nullable', 'string', 'max:500'],
            'phone'            => ['nullable', 'string', 'max:50'],
            'contact_person'   => ['nullable', 'string', 'max:255'],
            'supplier_id'      => ['nullable', 'exists:suppliers,id'],
            'business_type'    => ['required', 'string', Rule::in(array_keys(Branch::businessTypes()))],
            'use_table_ordering'  => ['nullable', 'boolean'],
            'use_variants'        => ['nullable', 'boolean'],
            'use_expiry_tracking' => ['nullable', 'boolean'],
            'use_recipe_system'   => ['nullable', 'boolean'],
            'use_bundles'         => ['nullable', 'boolean'],
            'is_active'           => ['nullable', 'boolean'],
        ], [
            'name.unique' => 'A branch with this name already exists.',
            'code.unique' => 'This branch code is already taken.',
        ]);

        $branch = Branch::create([
            'name'              => trim($validated['name']),
            'code'              => strtoupper(trim($validated['code'])),
            'address'           => $validated['address']        ?? null,
            'phone'             => $validated['phone']          ?? null,
            'contact_person'    => $validated['contact_person'] ?? null,
            'supplier_id'       => $validated['supplier_id']    ?? null,
            'business_type'     => $validated['business_type'],
            'use_table_ordering'  => $validated['use_table_ordering']  ?? false,
            'use_variants'        => $validated['use_variants']        ?? false,
            'use_expiry_tracking' => $validated['use_expiry_tracking'] ?? false,
            'use_recipe_system'   => $validated['use_recipe_system']   ?? false,
            'use_bundles'         => $validated['use_bundles']         ?? false,
            'is_active'           => $validated['is_active']           ?? true,
        ]);

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'branch_created',
            'subject_type' => Branch::class,
            'subject_id'   => $branch->id,
            'properties'   => [
                'name'          => $branch->name,
                'code'          => $branch->code,
                'business_type' => $branch->business_type,
                'ip'            => $request->ip(),
                'user_agent'    => $request->userAgent(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Branch created successfully.']);
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    public function update(Request $request, Branch $branch): RedirectResponse
    {
        $validated = $request->validate([
            'name'            => ['required', 'string', 'max:255', Rule::unique('branches', 'name')->ignore($branch->id)],
            'code'            => ['required', 'string', 'max:20',  Rule::unique('branches', 'code')->ignore($branch->id)],
            'address'         => ['nullable', 'string', 'max:500'],
            'phone'           => ['nullable', 'string', 'max:50'],
            'contact_person'  => ['nullable', 'string', 'max:255'],
            'supplier_id'     => ['nullable', 'exists:suppliers,id'],
            'business_type'   => ['required', 'string', Rule::in(array_keys(Branch::businessTypes()))],
            'use_table_ordering'  => ['nullable', 'boolean'],
            'use_variants'        => ['nullable', 'boolean'],
            'use_expiry_tracking' => ['nullable', 'boolean'],
            'use_recipe_system'   => ['nullable', 'boolean'],
            'use_bundles'         => ['nullable', 'boolean'],
            'is_active'           => ['nullable', 'boolean'],
        ], [
            'name.unique' => 'A branch with this name already exists.',
            'code.unique' => 'This branch code is already taken.',
        ]);

        $old = $branch->only(['name', 'code', 'address', 'phone', 'contact_person',
                              'supplier_id', 'business_type', 'use_table_ordering',
                              'use_variants', 'use_expiry_tracking', 'use_recipe_system',
                              'use_bundles', 'is_active']);

        $branch->update([
            'name'            => trim($validated['name']),
            'code'            => strtoupper(trim($validated['code'])),
            'address'         => $validated['address']        ?? null,
            'phone'           => $validated['phone']          ?? null,
            'contact_person'  => $validated['contact_person'] ?? null,
            'supplier_id'     => $validated['supplier_id']    ?? null,
            'business_type'   => $validated['business_type'],
            'use_table_ordering'  => $validated['use_table_ordering']  ?? $branch->use_table_ordering,
            'use_variants'        => $validated['use_variants']        ?? $branch->use_variants,
            'use_expiry_tracking' => $validated['use_expiry_tracking'] ?? $branch->use_expiry_tracking,
            'use_recipe_system'   => $validated['use_recipe_system']   ?? $branch->use_recipe_system,
            'use_bundles'         => $validated['use_bundles']         ?? $branch->use_bundles,
            'is_active'           => $validated['is_active']           ?? $branch->is_active,
        ]);

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'branch_updated',
            'subject_type' => Branch::class,
            'subject_id'   => $branch->id,
            'properties'   => [
                'old_data'   => $old,
                'new_data'   => $branch->fresh()->only(array_keys($old)),
                'ip'         => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Branch updated successfully.']);
    }

    // ── Toggle active ──────────────────────────────────────────────────────────

    public function toggleActive(Request $request, Branch $branch): RedirectResponse
    {
        $branch->update(['is_active' => ! $branch->is_active]);

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'branch_toggled',
            'subject_type' => Branch::class,
            'subject_id'   => $branch->id,
            'properties'   => [
                'name'      => $branch->name,
                'is_active' => $branch->is_active,
                'ip'        => $request->ip(),
            ],
        ]);

        $status = $branch->is_active ? 'activated' : 'deactivated';

        return back()->with('message', ['type' => 'success', 'text' => "Branch {$status}."]);
    }

    // ── Destroy ────────────────────────────────────────────────────────────────

    public function destroy(Request $request, Branch $branch): RedirectResponse
    {
        if ($branch->users()->exists()) {
            throw ValidationException::withMessages([
                'error' => 'Cannot delete this branch — it still has users assigned to it.',
            ]);
        }

        if ($branch->productStocks()->exists()) {
            throw ValidationException::withMessages([
                'error' => 'Cannot delete this branch — it has product stock records.',
            ]);
        }

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'branch_deleted',
            'subject_type' => Branch::class,
            'subject_id'   => $branch->id,
            'properties'   => [
                'deleted_branch' => $branch->name,
                'code'           => $branch->code,
                'reason'         => $request->input('reason', 'No reason provided'),
                'ip'             => $request->ip(),
                'user_agent'     => $request->userAgent(),
            ],
        ]);

        $branch->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Branch deleted successfully.']);
    }
}