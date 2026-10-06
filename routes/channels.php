<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// A branch's dining floor — waiters (Table Ordering, menu 41) and cashiers (POS, menu 2) of that branch only.
// The name must match App\Events\TableFloorChanged::channelFor().
Broadcast::channel('branch.{branchId}.tables', function (User $user, string $branchId): bool {
    return (string) $user->workingBranchId() === $branchId
        && ($user->hasAccess(41) || $user->hasAccess(2));
});
