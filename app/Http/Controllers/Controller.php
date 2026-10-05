<?php

namespace App\Http\Controllers;

abstract class Controller
{
    /**
     * Returns the branch_id to scope queries to.
     * Admins (super_admin + administrator) return null → no restriction.
     * Manager and Cashier always return their own branch_id.
     */
    protected function scopedBranchId(): ?int
    {
        $user = auth()->user();
        if ($user->isAdmin()) return null;
        return $user->branch_id;
    }

    /**
     * The branch a staff member works in. Branchless super admins operate
     * on the online-ordering branch (Mabinay) so restaurant screens still work.
     */
    protected function workingBranchId(): int
    {
        $user = auth()->user();
        $branchId = $user->branch_id
            ?? app(\App\Services\OnlineOrderService::class)->branch()?->id
            ?? \App\Models\Branch::where('is_active', true)->value('id');

        if (! $branchId) {
            abort(403, 'No branch assigned.');
        }

        return (int) $branchId;
    }

    /**
     * Aborts with 403 if a non-admin user tries to access a resource
     * that belongs to a different branch.
     */
    protected function authorizeBranch(?int $resourceBranchId): void
    {
        $user = auth()->user();
        if ($user->isAdmin()) return;
        if ($user->branch_id !== $resourceBranchId) {
            abort(403, 'You do not have access to this resource.');
        }
    }
}
