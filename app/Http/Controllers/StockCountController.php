<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\ProductStock;
use App\Models\StockCountItem;
use App\Models\StockCountSession;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class StockCountController extends Controller
{
    // ── Index: list all sessions for branch ───────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $isAdmin && $request->filled('branch_id')
            ? (int) $request->branch_id
            : $user->branch_id;

        $sessions = StockCountSession::with(['countedBy:id,fname,lname', 'committedBy:id,fname,lname'])
            ->where('branch_id', $branchId)
            ->latest()
            ->get()
            ->map(fn($s) => [
                'id'             => $s->id,
                'name'           => $s->name,
                'type'           => $s->type,
                'status'         => $s->status,
                'note'           => $s->note,
                'counted_by'     => $s->countedBy
                    ? $s->countedBy->fname . ' ' . $s->countedBy->lname : '—',
                'committed_by'   => $s->committedBy
                    ? $s->committedBy->fname . ' ' . $s->committedBy->lname : null,
                'items_total'    => $s->items_total,
                'items_counted'  => $s->items_counted,
                'items_adjusted' => $s->items_adjusted,
                'progress'       => $s->progressPercent(),
                'committed_at'   => $s->committed_at?->format('M d, Y h:i A'),
                'created_at'     => $s->created_at->format('M d, Y h:i A'),
            ]);

        // Categories for the "New Count" partial filter
        $categories = Category::orderBy('name')->get(['id', 'name']);

        $branches = $isAdmin
            ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name'])
            : collect();

        return Inertia::render('StockCount/Index', [
            'sessions'   => $sessions,
            'categories' => $categories,
            'branch_id'  => $branchId,
            'branches'   => $branches,
            'is_admin'   => $isAdmin,
            'filters'    => $request->only(['branch_id']),
        ]);
    }

    // ── Start: create session + snapshot current qtys ─────────────────────────

    public function start(Request $request): RedirectResponse
    {
        $user    = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        $validated = $request->validate([
            'branch_id'    => ['nullable', 'integer', 'exists:branches,id'],
            'name'         => ['required', 'string', 'max:150'],
            'type'         => ['required', 'in:full,partial'],
            'include_ingredients' => ['nullable', 'boolean'],
            'note'         => ['nullable', 'string', 'max:1000'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
        ]);

        $branchId           = $isAdmin && !empty($validated['branch_id'])
            ? (int) $validated['branch_id']
            : $user->branch_id;
        $includeIngredients = (bool) ($validated['include_ingredients'] ?? false);

        $session = DB::transaction(function () use ($validated, $user, $branchId, $includeIngredients) {
            // Build query for stocks to include
            $query = ProductStock::with(['product:id,name,barcode,category_id,product_type', 'product.category:id,name'])
                ->where('branch_id', $branchId)
                ->whereHas('product', function ($q) use ($includeIngredients) {
                    if ($includeIngredients) {
                        // All types: standard, bundle, made_to_order, ingredient
                        $q->whereIn('product_type', ['standard', 'bundle', 'made_to_order', 'ingredient']);
                    } else {
                        // Exclude ingredients
                        $q->whereIn('product_type', ['standard', 'bundle', 'made_to_order']);
                    }
                });

            if ($validated['type'] === 'partial' && !empty($validated['category_ids'])) {
                $query->whereHas('product', fn($q) =>
                    $q->whereIn('category_id', $validated['category_ids'])
                );
            }

            $stocks = $query->get();

            $session = StockCountSession::create([
                'branch_id'      => $branchId,
                'name'           => $validated['name'],
                'type'           => $validated['type'],
                'status'         => 'draft',
                'note'           => $validated['note'] ?? null,
                'counted_by'     => $user->id,
                'items_total'    => $stocks->count(),
                'items_counted'  => 0,
                'items_adjusted' => 0,
            ]);

            // Snapshot each product's current qty — FROZEN from this moment
            foreach ($stocks as $ps) {
                $prodType = $ps->product?->product_type ?? 'standard';
                StockCountItem::create([
                    'session_id'    => $session->id,
                    'product_id'    => $ps->product_id,
                    'product_name'  => $ps->product?->name ?? '—',
                    'category_name' => $ps->product?->category?->name,
                    'item_type'     => $prodType === 'ingredient' ? 'ingredient' : 'product',
                    'snapshot_qty'  => $ps->stock,
                    'unit_cost'     => $ps->capital,
                    'counted_qty'   => null,
                ]);
            }

            return $session;
        });

        return redirect()->route('stock-count.show', $session->id)
            ->with('message', ['type' => 'success', 'text' => 'Count session started. Snapshot taken.']);
    }

    // ── Show: the count sheet for a specific session ──────────────────────────

    public function show(Request $request, StockCountSession $session): Response
    {
        $this->authorizeBranch($session->branch_id);

        $session->load(['countedBy:id,fname,lname', 'committedBy:id,fname,lname']);

        $perPage   = 100;
        $search    = $request->input('search', '');
        $catFilter = $request->input('category', '');
        $typeFilter= $request->input('item_type', 'all'); // all | product | ingredient
        $viewFilter= $request->input('view', 'all');      // all | uncounted | variance

        $query = StockCountItem::where('session_id', $session->id)
            ->orderBy('item_type')   // products first, then ingredients
            ->orderBy('product_name');

        if ($search !== '') {
            $query->where('product_name', 'like', "%{$search}%");
        }
        if ($catFilter !== '') {
            $query->where('category_name', $catFilter);
        }
        if (in_array($typeFilter, ['product', 'ingredient'])) {
            $query->where('item_type', $typeFilter);
        }
        if ($viewFilter === 'uncounted') {
            $query->whereNull('counted_qty');
        } elseif ($viewFilter === 'variance') {
            $query->whereNotNull('counted_qty')
                  ->whereRaw('counted_qty != snapshot_qty');
        }

        $paginated = $query->paginate($perPage)->withQueryString();

        $items = collect($paginated->items())->map(fn($item) => [
            'id'            => $item->id,
            'product_id'    => $item->product_id,
            'product_name'  => $item->product_name,
            'category_name' => $item->category_name,
            'item_type'     => $item->item_type,
            'snapshot_qty'  => $item->snapshot_qty,
            'unit_cost'     => (float) $item->unit_cost,
            'counted_qty'   => $item->counted_qty,
            'delta'         => $item->delta,
            'cost_impact'   => $item->cost_impact,
        ]);

        // All unique categories across the whole session (not just current page)
        $categories = StockCountItem::where('session_id', $session->id)
            ->whereNotNull('category_name')
            ->distinct()
            ->orderBy('category_name')
            ->pluck('category_name');

        // Type counts for the filter tab badges
        $typeCounts = StockCountItem::where('session_id', $session->id)
            ->selectRaw('item_type, count(*) as cnt')
            ->groupBy('item_type')
            ->pluck('cnt', 'item_type');

        return Inertia::render('StockCount/Show', [
            'session' => [
                'id'             => $session->id,
                'name'           => $session->name,
                'type'           => $session->type,
                'status'         => $session->status,
                'note'           => $session->note,
                'counted_by'     => $session->countedBy
                    ? $session->countedBy->fname . ' ' . $session->countedBy->lname : '—',
                'committed_by'   => $session->committedBy
                    ? $session->committedBy->fname . ' ' . $session->committedBy->lname : null,
                'items_total'    => $session->items_total,
                'items_counted'  => $session->items_counted,
                'items_adjusted' => $session->items_adjusted,
                'progress'       => $session->progressPercent(),
                'committed_at'   => $session->committed_at?->format('M d, Y h:i A'),
                'created_at'     => $session->created_at->format('M d, Y h:i A'),
            ],
            'items'       => $items,
            'pagination'  => [
                'current_page'  => $paginated->currentPage(),
                'last_page'     => $paginated->lastPage(),
                'per_page'      => $paginated->perPage(),
                'total'         => $paginated->total(),
                'from'          => $paginated->firstItem(),
                'to'            => $paginated->lastItem(),
            ],
            'categories' => $categories,
            'type_counts' => $typeCounts,
            'filters'    => [
                'search'    => $search,
                'category'  => $catFilter,
                'item_type' => $typeFilter,
                'view'      => $viewFilter,
            ],
        ]);
    }

    // ── Save: batch-update counted_qty for items (draft only) ────────────────

    public function save(Request $request, StockCountSession $session): RedirectResponse
    {
        $this->authorizeBranch($session->branch_id);

        if (! $session->isDraft()) {
            return back()->withErrors(['error' => 'This session is already ' . $session->status . '.']);
        }

        $validated = $request->validate([
            'counts'               => ['required', 'array'],
            'counts.*.item_id'     => ['required', 'integer'],
            'counts.*.counted_qty' => ['nullable', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($validated, $session) {
            $countedCount = 0;

            foreach ($validated['counts'] as $row) {
                $itemId    = (int) $row['item_id'];
                $countedQty = isset($row['counted_qty']) && $row['counted_qty'] !== '' && $row['counted_qty'] !== null
                    ? (int) $row['counted_qty']
                    : null;

                StockCountItem::where('id', $itemId)
                    ->where('session_id', $session->id)
                    ->update(['counted_qty' => $countedQty]);

                if (! is_null($countedQty)) $countedCount++;
            }

            // Re-sync counters from DB (accurate count of all items in session)
            $totalCounted = StockCountItem::where('session_id', $session->id)
                ->whereNotNull('counted_qty')->count();

            $session->update(['items_counted' => $totalCounted]);
        });

        return back()->with('message', ['type' => 'success', 'text' => 'Progress saved.']);
    }

    // ── Commit: apply delta to live stock, close session ─────────────────────

    /**
     * Key formula: new_live_qty = current_live_qty + (counted_qty - snapshot_qty)
     *
     * This correctly handles any sales that happened DURING the count:
     *   e.g. snapshot=100, counted=95, 3 sold during count → live=97
     *   delta = 95 - 100 = -5
     *   new_live = 97 + (-5) = 92  ✓ correct
     *
     * Items where counted_qty is NULL are skipped (not counted = no change).
     */
    public function commit(Request $request, StockCountSession $session): RedirectResponse
    {
        $this->authorizeBranch($session->branch_id);

        if (! $session->isDraft()) {
            return back()->withErrors(['error' => 'This session is already ' . $session->status . '.']);
        }

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        DB::transaction(function () use ($validated, $session, $request) {
            $user = Auth::user();

            // Load items that have been counted (counted_qty not null)
            $items = StockCountItem::where('session_id', $session->id)
                ->whereNotNull('counted_qty')
                ->get();

            $itemsAdjusted = 0;

            foreach ($items as $item) {
                $delta = $item->counted_qty - $item->snapshot_qty;

                if ($delta === 0) continue; // no change — skip

                // Apply delta to CURRENT live stock (handles concurrent sales)
                $stock = ProductStock::where('product_id', $item->product_id)
                    ->where('branch_id', $session->branch_id)
                    ->lockForUpdate()
                    ->first();

                if ($stock) {
                    $newQty = max(0, $stock->stock + $delta);
                    $stock->update(['stock' => $newQty]);
                    $itemsAdjusted++;
                }
            }

            // Update note if provided
            if (!empty($validated['note'])) {
                $session->note = $validated['note'];
            }

            $session->update([
                'status'         => 'committed',
                'committed_by'   => $user->id,
                'committed_at'   => now(),
                'items_adjusted' => $itemsAdjusted,
                'note'           => $session->note,
            ]);
        });

        return redirect()->route('stock-count.index')
            ->with('message', ['type' => 'success', 'text' => 'Stock count committed. ' . $session->items_adjusted . ' item(s) adjusted.']);
    }

    // ── Cancel: discard a draft session ──────────────────────────────────────

    public function cancel(StockCountSession $session): RedirectResponse
    {
        $this->authorizeBranch($session->branch_id);

        if (! $session->isDraft()) {
            return back()->withErrors(['error' => 'Only draft sessions can be cancelled.']);
        }

        $session->update(['status' => 'cancelled']);

        return redirect()->route('stock-count.index')
            ->with('message', ['type' => 'info', 'text' => 'Count session cancelled.']);
    }
}
