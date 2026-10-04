<?php

namespace App\Http\Controllers;

use App\Models\DiningTable;
use App\Models\TableOrder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class TableOrderController extends Controller
{
    private function branchId(): int
    {
        $user = Auth::user();
        if (! $user->branch_id) abort(403, 'No branch assigned.');
        return $user->branch_id;
    }

    // ── Index ──────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $branchId = $this->branchId();

        $orders = TableOrder::with('table:id,table_number,section')
            ->where('branch_id', $branchId)
            ->whereDate('opened_at', today())
            ->orderByDesc('opened_at')
            ->get()
            ->map(fn (TableOrder $o) => [
                'id'            => $o->id,
                'order_number'  => $o->order_number,
                'table_id'      => $o->table_id,
                'table_number'  => $o->table?->table_number,
                'section'       => $o->table?->section,
                'label'         => $o->table?->label ?? 'Takeout',
                'status'        => $o->status,
                'total'         => (float) $o->total,
                'covers'        => $o->covers,
                'customer_name' => $o->customer_name,
                'opened_at'     => $o->opened_at?->toIso8601String(),
                'closed_at'     => $o->closed_at?->toIso8601String(),
            ]);

        return Inertia::render('TableOrders/Index', [
            'orders' => $orders,
        ]);
    }

    // ── Store (start a new table order from POS) ───────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $branchId = $this->branchId();

        $validated = $request->validate([
            'table_id'      => ['required', 'exists:tables,id'],
            'covers'        => ['nullable', 'integer', 'min:1', 'max:50'],
            'customer_name' => ['nullable', 'string', 'max:255'],
        ]);

        // Reject if table already has an active order
        $existing = TableOrder::where('table_id', $validated['table_id'])
            ->whereIn('status', ['open', 'billed'])
            ->first();

        if ($existing) {
            return back()->withErrors(['error' => 'This table already has an active order.']);
        }

        $table = DiningTable::findOrFail($validated['table_id']);
        abort_if($table->branch_id !== $branchId, 403);

        TableOrder::create([
            'branch_id'     => $branchId,
            'table_id'      => $table->id,
            'user_id'       => Auth::id(),
            'covers'        => $validated['covers'] ?? 1,
            'customer_name' => $validated['customer_name'] ?? null,
            'opened_at'     => now(),
        ]);

        $table->markOccupied();

        return back()->with('message', ['type' => 'success', 'text' => 'Table order started.']);
    }
}
