<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Warehouse;
use App\Models\WarehouseStock;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class InventoryController extends Controller
{
    public function index(Request $request): Response
    {
        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $user->branch_id;

        $search      = $request->string('search', '')->trim()->toString();
        $branchFilter= $request->integer('branch_id') ?: null;
        $statusFilter= $request->string('status', '')->toString();
        $perPage     = in_array($request->integer('per_page', 25), [10, 25, 50, 100])
                        ? $request->integer('per_page', 25) : 25;

        // ── Branch stocks ─────────────────────────────────────────────────────
        $branchStockQuery = ProductStock::query()
            ->with(['product:id,name,barcode,product_img,product_type,is_taxable', 'branch:id,name,code'])
            ->when(! $isAdmin && $branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'))
            ->when($isAdmin && $branchFilter, fn ($q) => $q->where('branch_id', $branchFilter))
            ->when($search, fn ($q) => $q->whereHas('product', fn ($p) =>
                $p->where('name', 'like', "%{$search}%")
                  ->orWhere('barcode', 'like', "%{$search}%")
            ));

        if ($statusFilter !== '') {
            match ($statusFilter) {
                'in_stock'    => $branchStockQuery->where('stock', '>', 5),
                'low_stock'   => $branchStockQuery->where('stock', '>', 0)->where('stock', '<=', 5),
                'out_of_stock'=> $branchStockQuery->where('stock', '<=', 0),
                'expired'     => $branchStockQuery->whereDate('expiry_date', '<', now()),
                'near_expiry' => $branchStockQuery->whereDate('expiry_date', '>=', now())
                                                  ->whereDate('expiry_date', '<=', now()->addDays(30)),
                default       => null,
            };
        }

        $branchStockPaginated = $branchStockQuery
            ->orderByRaw("CASE WHEN stock <= 0 THEN 0 WHEN stock <= 5 THEN 1 ELSE 2 END")
            ->orderBy('stock', 'asc')
            ->paginate($perPage)
            ->withQueryString();

        $branchStockRows = collect($branchStockPaginated->items())->map(fn ($s) => [
            'id'             => $s->id,
            'location_type'  => 'branch',
            'location_id'    => $s->branch_id,
            'location_name'  => $s->branch?->name ?? '—',
            'location_code'  => $s->branch?->code ?? '',
            'product_id'     => $s->product_id,
            'product_name'   => $s->product?->name ?? '(deleted)',
            'product_barcode'=> $s->product?->barcode,
            'product_type'   => $s->product?->product_type ?? 'standard',
            'product_img'    => Product::resolveImageUrl($s->product?->product_img),
            'stock'          => (float) $s->stock,
            'capital'        => (float) $s->capital,
            'markup'         => (float) $s->markup,
            'price'          => (float) $s->price,
            'status'         => $s->stock_status,
            'expiry_date'    => $s->expiry_date?->format('Y-m-d'),
            'batch_number'   => $s->batch_number,
        ])->values();

        // ── Warehouse stocks (advance) ────────────────────────────────────────
        $warehouseStockQuery = WarehouseStock::query()
            ->with(['product:id,name,barcode,product_img,product_type', 'warehouse:id,name,code'])
            ->when($search, fn ($q) => $q->whereHas('product', fn ($p) =>
                $p->where('name', 'like', "%{$search}%")
                  ->orWhere('barcode', 'like', "%{$search}%")
            ));

        $warehouseStockRows = $warehouseStockQuery->get()->map(fn ($s) => [
            'id'             => $s->id,
            'location_type'  => 'warehouse',
            'location_id'    => $s->warehouse_id,
            'location_name'  => $s->warehouse?->name ?? '—',
            'location_code'  => $s->warehouse?->code ?? '',
            'product_id'     => $s->product_id,
            'product_name'   => $s->product?->name ?? '(deleted)',
            'product_barcode'=> $s->product?->barcode,
            'product_type'   => $s->product?->product_type ?? 'standard',
            'product_img'    => Product::resolveImageUrl($s->product?->product_img),
            'stock'          => (float) $s->stock,
            'capital'        => (float) $s->capital,
            'markup'         => (float) $s->markup,
            'price'          => (float) $s->price,
            'status'         => $s->stock_status,
            'expiry_date'    => $s->expiry_date?->format('Y-m-d'),
            'batch_number'   => $s->batch_number,
        ])->values();

        // ── Summary stats ─────────────────────────────────────────────────────
        $statsBase = ProductStock::query()
            ->when(! $isAdmin && $branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'));

        $stats = [
            'total_sku'      => (clone $statsBase)->count(),
            'low_stock'      => (clone $statsBase)->where('stock', '>', 0)->where('stock', '<=', 5)->count(),
            'out_of_stock'   => (clone $statsBase)->where('stock', '<=', 0)->count(),
            'expired'        => (clone $statsBase)->whereDate('expiry_date', '<', now())->count(),
            'warehouse_units'=> WarehouseStock::sum('stock'),
        ];

        return Inertia::render('Inventory/Index', [
            'branch_stocks'     => $branchStockRows,
            'branch_pagination' => [
                'total'        => $branchStockPaginated->total(),
                'per_page'     => $branchStockPaginated->perPage(),
                'current_page' => $branchStockPaginated->currentPage(),
                'last_page'    => $branchStockPaginated->lastPage(),
                'from'         => $branchStockPaginated->firstItem(),
                'to'           => $branchStockPaginated->lastItem(),
            ],
            'warehouse_stocks'  => $warehouseStockRows,
            'stats'             => $stats,
            'branches'          => $isAdmin
                ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name', 'code'])
                : [],
            'filters' => [
                'search'    => $search,
                'branch_id' => $branchFilter,
                'status'    => $statusFilter,
                'per_page'  => $perPage,
            ],
            'is_admin'  => $isAdmin,
        ]);
    }
}
