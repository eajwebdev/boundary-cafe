<?php

namespace App\Http\Controllers;

use App\Models\DiningTable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DiningTableController extends Controller
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

        $tables = DiningTable::where('branch_id', $branchId)
            ->orderBy('section')
            ->orderBy('table_number')
            ->get()
            ->map(fn (DiningTable $t) => [
                'id'           => $t->id,
                'table_number' => $t->table_number,
                'section'      => $t->section,
                'label'        => $t->label,
                'capacity'     => $t->capacity,
                'status'       => $t->status,
                'is_active'    => $t->is_active,
            ]);

        return Inertia::render('DiningTables/Index', [
            'tables' => $tables,
        ]);
    }

    // ── Store ──────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $branchId = $this->branchId();

        $validated = $request->validate([
            'table_number' => ['required', 'string', 'max:20'],
            'section'      => ['nullable', 'string', 'max:100'],
            'capacity'     => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        DiningTable::create([
            'branch_id'    => $branchId,
            'table_number' => trim($validated['table_number']),
            'section'      => isset($validated['section']) ? trim($validated['section']) : null,
            'capacity'     => $validated['capacity'] ?? 4,
            'status'       => 'available',
            'is_active'    => true,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Table created successfully.']);
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    public function update(Request $request, DiningTable $diningTable): RedirectResponse
    {
        abort_if($diningTable->branch_id !== $this->branchId(), 403);

        $validated = $request->validate([
            'table_number' => ['required', 'string', 'max:20'],
            'section'      => ['nullable', 'string', 'max:100'],
            'capacity'     => ['nullable', 'integer', 'min:1', 'max:50'],
            'is_active'    => ['nullable', 'boolean'],
            'status'       => ['nullable', 'string', Rule::in(['available', 'occupied', 'reserved', 'cleaning'])],
        ]);

        $diningTable->update([
            'table_number' => trim($validated['table_number']),
            'section'      => isset($validated['section']) ? trim($validated['section']) : null,
            'capacity'     => $validated['capacity']  ?? $diningTable->capacity,
            'is_active'    => $validated['is_active'] ?? $diningTable->is_active,
            'status'       => $validated['status']    ?? $diningTable->status,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Table updated successfully.']);
    }

    // ── Destroy ────────────────────────────────────────────────────────────────

    public function destroy(DiningTable $diningTable): RedirectResponse
    {
        abort_if($diningTable->branch_id !== $this->branchId(), 403);

        if ($diningTable->activeOrder()->exists()) {
            return back()->withErrors(['error' => 'Cannot delete a table with an active order.']);
        }

        $diningTable->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Table deleted successfully.']);
    }
}
