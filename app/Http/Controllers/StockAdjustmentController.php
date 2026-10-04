<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\StockAdjustment;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StockAdjustmentController extends Controller
{
    private const TYPES = ['damage', 'loss', 'expired', 'theft', 'correction', 'other'];

    public function index(Request $request): Response
    {
        $user     = Auth::user();

        // Super admin & administrator can see all branches or filter by one
        if ($user->isSuperAdmin() || $user->isAdministrator()) {
            $branchId = $request->filled('branch_id') ? (int) $request->branch_id : null;
        } else {
            $branchId = $user->branch_id;
        }

        $query = StockAdjustment::with(['product:id,name,barcode', 'recordedBy:id,fname,lname'])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }
        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }
        if ($request->filled('search')) {
            $s = $request->search;
            $query->whereHas('product', fn ($q) => $q->where('name', 'like', "%{$s}%"));
        }

        $adjustments = $query->latest()->paginate(30)->withQueryString();

        // Summary for current filter
        $summaryQuery = StockAdjustment::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));
        if ($request->filled('type'))   $summaryQuery->where('type', $request->type);
        if ($request->filled('from'))   $summaryQuery->whereDate('created_at', '>=', $request->from);
        if ($request->filled('to'))     $summaryQuery->whereDate('created_at', '<=', $request->to);
        if ($request->filled('search')) {
            $s = $request->search;
            $summaryQuery->whereHas('product', fn ($q) => $q->where('name', 'like', "%{$s}%"));
        }

        $summary = $summaryQuery->selectRaw('type, SUM(quantity) as total_qty, SUM(quantity * unit_cost) as total_cost')
            ->groupBy('type')
            ->get()
            ->keyBy('type');

        // Products for the form — if super/admin with no specific branch, load all stocked products
        $productsQuery = Product::query()
            ->where('product_type', '!=', 'ingredient')
            ->orderBy('name');

        if ($branchId) {
            $productsQuery->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId)->where('stock', '>', 0));
        } else {
            $productsQuery->whereHas('stocks', fn ($q) => $q->where('stock', '>', 0));
        }

        $products = $productsQuery->get()->map(fn (Product $p) => [
            'id'        => $p->id,
            'name'      => $p->name,
            'barcode'   => $p->barcode,
            'stock'     => (int) ($branchId
                ? ($p->stocks->firstWhere('branch_id', $branchId)?->stock ?? 0)
                : $p->stocks->sum('stock')),
            'unit_cost' => (float) ($branchId
                ? ($p->stocks->firstWhere('branch_id', $branchId)?->capital ?? 0)
                : ($p->stocks->first()?->capital ?? 0)),
        ]);

        return Inertia::render('StockAdjustments/Index', [
            'adjustments'  => $adjustments,
            'products'     => $products,
            'types'        => self::TYPES,
            'summary'      => $summary,
            'filters'      => $request->only(['type', 'from', 'to', 'search', 'branch_id']),
            'can_delete'   => $user->hasElevatedAccess(),
            'branch_id'    => $branchId,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user     = Auth::user();
        $branchId = ($user->isSuperAdmin() || $user->isAdministrator())
            ? ($request->integer('branch_id') ?: $user->branch_id)
            : $user->branch_id;

        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'type'       => ['required', 'in:' . implode(',', self::TYPES)],
            'quantity'   => ['required', 'integer', 'min:1'],
            'note'       => ['nullable', 'string', 'max:500'],
            'branch_id'  => ['nullable', 'integer', 'exists:branches,id'],
        ]);

        DB::transaction(function () use ($validated, $user, $branchId) {
            $productStock = ProductStock::where('product_id', $validated['product_id'])
                ->where('branch_id', $branchId)
                ->lockForUpdate()
                ->first();

            if (! $productStock) {
                abort(422, 'No stock record found for this product in your branch.');
            }

            $unitCost = (float) $productStock->capital;
            $qty      = (int) $validated['quantity'];

            // Deduct stock (clamp at 0 to avoid negative stock)
            $productStock->decrement('stock', min($qty, $productStock->stock));

            $adjustment = StockAdjustment::create([
                'branch_id'   => $branchId,
                'product_id'  => $validated['product_id'],
                'recorded_by' => $user->id,
                'type'        => $validated['type'],
                'quantity'    => $qty,
                'unit_cost'   => $unitCost,
                'note'        => $validated['note'] ?? null,
            ]);

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'stock_adjustment_recorded',
                'subject_type' => StockAdjustment::class,
                'subject_id'   => $adjustment->id,
                'properties'   => [
                    'product_id'   => $validated['product_id'],
                    'branch_id'    => $branchId,
                    'type'         => $validated['type'],
                    'quantity'     => $qty,
                    'unit_cost'    => $unitCost,
                    'total_cost'   => round($unitCost * $qty, 2),
                ],
            ]);
        });

        return back()->with('message', [
            'type' => 'success',
            'text' => 'Stock adjustment recorded successfully.',
        ]);
    }

    public function destroy(StockAdjustment $stockAdjustment): RedirectResponse
    {
        $user = Auth::user();
        if (! $user->hasElevatedAccess()) abort(403);
        $this->authorizeBranch($stockAdjustment->branch_id);

        DB::transaction(function () use ($stockAdjustment, $user) {
            // Restore the stock that was deducted
            ProductStock::where('product_id', $stockAdjustment->product_id)
                ->where('branch_id', $stockAdjustment->branch_id)
                ->increment('stock', $stockAdjustment->quantity);

            ActivityLog::create([
                'user_id'      => $user->id,
                'action'       => 'stock_adjustment_deleted',
                'subject_type' => StockAdjustment::class,
                'subject_id'   => $stockAdjustment->id,
                'properties'   => [
                    'product_id' => $stockAdjustment->product_id,
                    'type'       => $stockAdjustment->type,
                    'quantity'   => $stockAdjustment->quantity,
                    'note'       => $stockAdjustment->note,
                ],
            ]);

            $stockAdjustment->delete();
        });

        return back()->with('message', [
            'type' => 'success',
            'text' => 'Adjustment deleted and stock restored.',
        ]);
    }
}
