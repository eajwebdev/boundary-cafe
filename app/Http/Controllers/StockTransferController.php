<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\StockTransfer;
use App\Models\Warehouse;
use App\Models\WarehouseStock;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StockTransferController extends Controller
{
    public function index(Request $request): Response
    {
        $user    = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();
        $perPage = in_array($request->integer('per_page', 20), [10, 20, 50]) ? $request->integer('per_page', 20) : 20;
        $status  = $request->string('status', '')->toString();
        $search  = $request->string('search', '')->trim()->toString();

        $query = StockTransfer::with([
            'product:id,name,barcode',
            'requestedBy:id,fname,lname',
            'completedBy:id,fname,lname',
        ])->latest();

        if ($status) $query->where('status', $status);
        if ($search) $query->whereHas('product', fn ($q) =>
            $q->where('name', 'like', "%{$search}%")->orWhere('barcode', 'like', "%{$search}%")
        );

        // Non-admin: only see transfers involving their branch
        if (! $isAdmin && $user->branch_id) {
            $bid = $user->branch_id;
            $query->where(fn ($q) =>
                $q->where(fn ($i) => $i->where('from_type', 'branch')->where('from_id', $bid))
                  ->orWhere(fn ($i) => $i->where('to_type', 'branch')->where('to_id', $bid))
            );
        }

        $paginated = $query->paginate($perPage)->withQueryString();

        // Resolve location names eagerly
        $branchNames    = Branch::pluck('name', 'id');
        $warehouseNames = Warehouse::pluck('name', 'id');

        $transfers = collect($paginated->items())->map(fn ($t) => [
            'id'               => $t->id,
            'transfer_number'  => $t->transfer_number,
            'from_type'        => $t->from_type,
            'from_id'          => $t->from_id,
            'from_name'        => $t->from_type === 'branch'
                                    ? ($branchNames[$t->from_id] ?? '?')
                                    : ($warehouseNames[$t->from_id] ?? '?'),
            'to_type'          => $t->to_type,
            'to_id'            => $t->to_id,
            'to_name'          => $t->to_type === 'branch'
                                    ? ($branchNames[$t->to_id] ?? '?')
                                    : ($warehouseNames[$t->to_id] ?? '?'),
            'product_id'       => $t->product_id,
            'product_name'     => $t->product?->name ?? '—',
            'product_barcode'  => $t->product?->barcode,
            'quantity'         => $t->quantity,
            'status'           => $t->status,
            'notes'            => $t->notes,
            'requested_by'     => $t->requestedBy ? trim("{$t->requestedBy->fname} {$t->requestedBy->lname}") : '—',
            'completed_by'     => $t->completedBy ? trim("{$t->completedBy->fname} {$t->completedBy->lname}") : null,
            'completed_at'     => $t->completed_at?->toIso8601String(),
            'created_at'       => $t->created_at?->toIso8601String(),
        ])->values();

        return Inertia::render('StockTransfers/Index', [
            'transfers'  => $transfers,
            'pagination' => [
                'total'        => $paginated->total(),
                'per_page'     => $paginated->perPage(),
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
            ],
            'branches'   => Branch::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code']),
            'warehouses' => Warehouse::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code']),
            'products'   => Product::select('id', 'name', 'barcode')->orderBy('name')->get(),
            'filters'    => ['status' => $status, 'search' => $search, 'per_page' => $perPage],
            'is_admin'   => $isAdmin,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();

        $validated = $request->validate([
            'from_type'  => ['required', 'in:branch,warehouse'],
            'from_id'    => ['required', 'integer'],
            'to_type'    => ['required', 'in:branch,warehouse'],
            'to_id'      => ['required', 'integer'],
            'product_id' => ['required', 'exists:products,id'],
            'quantity'   => ['required', 'integer', 'min:1'],
            'notes'      => ['nullable', 'string', 'max:500'],
        ]);

        // Cannot transfer to same location
        if ($validated['from_type'] === $validated['to_type'] && $validated['from_id'] === $validated['to_id']) {
            return back()->withErrors(['error' => 'Source and destination cannot be the same.']);
        }

        // Validate location existence
        if ($validated['from_type'] === 'branch') {
            if (! Branch::where('id', $validated['from_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['error' => 'Source branch not found.']);
            }
        } else {
            if (! Warehouse::where('id', $validated['from_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['error' => 'Source warehouse not found.']);
            }
        }
        if ($validated['to_type'] === 'branch') {
            if (! Branch::where('id', $validated['to_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['error' => 'Destination branch not found.']);
            }
        } else {
            if (! Warehouse::where('id', $validated['to_id'])->where('is_active', true)->exists()) {
                return back()->withErrors(['error' => 'Destination warehouse not found.']);
            }
        }

        DB::beginTransaction();
        try {
            $transfer = StockTransfer::create([
                'transfer_number' => StockTransfer::generateNumber(),
                'from_type'       => $validated['from_type'],
                'from_id'         => $validated['from_id'],
                'to_type'         => $validated['to_type'],
                'to_id'           => $validated['to_id'],
                'product_id'      => $validated['product_id'],
                'quantity'        => $validated['quantity'],
                'notes'           => $validated['notes'] ?? null,
                'status'          => 'pending',
                'requested_by'    => $user->id,
            ]);

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'stock_transfer_created',
                'subject_type' => StockTransfer::class,
                'subject_id'   => $transfer->id,
                'properties'   => ['transfer_number' => $transfer->transfer_number],
            ]);

            DB::commit();
            return back()->with('message', ['type' => 'success', 'text' => "Transfer {$transfer->transfer_number} created."]);
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => 'Failed to create transfer: ' . $e->getMessage()]);
        }
    }

    public function complete(Request $request, StockTransfer $stockTransfer): RedirectResponse
    {
        $user = Auth::user();

        if (! $stockTransfer->isPending()) {
            return back()->withErrors(['error' => 'Only pending transfers can be completed.']);
        }

        DB::beginTransaction();
        try {
            $qty = $stockTransfer->quantity;

            // ── Deduct from source ────────────────────────────────────────────
            if ($stockTransfer->from_type === 'branch') {
                $src = ProductStock::firstOrCreate(
                    ['product_id' => $stockTransfer->product_id, 'branch_id' => $stockTransfer->from_id],
                    ['stock' => 0, 'updated_by' => $user->id]
                );
                if ($src->stock < $qty) {
                    DB::rollBack();
                    return back()->withErrors(['error' => "Insufficient stock at source. Available: {$src->stock}, Requested: {$qty}."]);
                }
                $src->decrement('stock', $qty);
                $src->update(['updated_by' => $user->id]);
            } else {
                $src = WarehouseStock::firstOrCreate(
                    ['product_id' => $stockTransfer->product_id, 'warehouse_id' => $stockTransfer->from_id],
                    ['stock' => 0, 'updated_by' => $user->id]
                );
                if ($src->stock < $qty) {
                    DB::rollBack();
                    return back()->withErrors(['error' => "Insufficient stock in source warehouse. Available: {$src->stock}, Requested: {$qty}."]);
                }
                $src->decrement('stock', $qty);
                $src->update(['updated_by' => $user->id]);
            }

            // ── Add to destination ────────────────────────────────────────────
            if ($stockTransfer->to_type === 'branch') {
                $dst = ProductStock::firstOrCreate(
                    ['product_id' => $stockTransfer->product_id, 'branch_id' => $stockTransfer->to_id],
                    ['stock' => 0, 'capital' => $src->capital, 'markup' => $src->markup, 'updated_by' => $user->id]
                );
                $dst->increment('stock', $qty);
                $dst->update(['updated_by' => $user->id]);
            } else {
                $dst = WarehouseStock::firstOrCreate(
                    ['product_id' => $stockTransfer->product_id, 'warehouse_id' => $stockTransfer->to_id],
                    ['stock' => 0, 'capital' => $src->capital, 'markup' => $src->markup, 'updated_by' => $user->id]
                );
                $dst->increment('stock', $qty);
                $dst->update(['updated_by' => $user->id]);
            }

            // ── Mark complete ─────────────────────────────────────────────────
            $stockTransfer->update([
                'status'       => 'completed',
                'completed_by' => $user->id,
                'completed_at' => now(),
            ]);

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'stock_transfer_completed',
                'subject_type' => StockTransfer::class,
                'subject_id'   => $stockTransfer->id,
                'properties'   => ['transfer_number' => $stockTransfer->transfer_number, 'qty' => $qty],
            ]);

            DB::commit();
            return back()->with('message', ['type' => 'success', 'text' => "Transfer {$stockTransfer->transfer_number} completed. {$qty} units moved."]);
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => 'Transfer failed: ' . $e->getMessage()]);
        }
    }

    public function cancel(StockTransfer $stockTransfer): RedirectResponse
    {
        $user = Auth::user();

        if (! $stockTransfer->isPending()) {
            return back()->withErrors(['error' => 'Only pending transfers can be cancelled.']);
        }

        $stockTransfer->update(['status' => 'cancelled']);

        ActivityLog::create([
            'user_id'      => $user->id,
            'action'       => 'stock_transfer_cancelled',
            'subject_type' => StockTransfer::class,
            'subject_id'   => $stockTransfer->id,
            'properties'   => ['transfer_number' => $stockTransfer->transfer_number],
        ]);

        return back()->with('message', ['type' => 'warning', 'text' => "Transfer {$stockTransfer->transfer_number} cancelled."]);
    }
}
