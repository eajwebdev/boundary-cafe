<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Warehouse;
use App\Models\WarehouseStock;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class WarehouseController extends Controller
{
    public function index(): Response
    {
        $warehouses = Warehouse::withCount('stocks')
            ->orderBy('name')
            ->get()
            ->map(fn ($w) => [
                'id'          => $w->id,
                'name'        => $w->name,
                'code'        => $w->code,
                'address'     => $w->address,
                'notes'       => $w->notes,
                'is_active'   => $w->is_active,
                'stocks_count'=> $w->stocks_count,
                'total_units' => WarehouseStock::where('warehouse_id', $w->id)->sum('stock'),
            ]);

        // Stock per warehouse with product details
        $warehouseStocks = WarehouseStock::with([
            'product:id,name,barcode,product_img,product_type',
            'warehouse:id,name,code',
        ])->orderBy('warehouse_id')->get()->map(fn ($s) => [
            'id'             => $s->id,
            'warehouse_id'   => $s->warehouse_id,
            'warehouse_name' => $s->warehouse?->name ?? '—',
            'product_id'     => $s->product_id,
            'product_name'   => $s->product?->name ?? '(deleted)',
            'product_barcode'=> $s->product?->barcode,
            'product_type'   => $s->product?->product_type ?? 'standard',
            'product_img'    => \App\Models\Product::resolveImageUrl($s->product?->product_img),
            'stock'          => (float) $s->stock,
            'capital'        => (float) $s->capital,
            'markup'         => (float) $s->markup,
            'price'          => (float) $s->price,
            'status'         => $s->stock_status,
            'expiry_date'    => $s->expiry_date?->format('Y-m-d'),
        ])->values();

        return Inertia::render('Warehouses/Index', [
            'warehouses'      => $warehouses,
            'warehouse_stocks'=> $warehouseStocks,
            'products'        => Product::select('id', 'name', 'barcode')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name'    => ['required', 'string', 'max:100'],
            'code'    => ['required', 'string', 'max:20', 'unique:warehouses,code'],
            'address' => ['nullable', 'string', 'max:255'],
            'notes'   => ['nullable', 'string', 'max:500'],
        ]);

        $w = Warehouse::create($validated);
        ActivityLog::create(['user_id' => Auth::id(), 'action' => 'warehouse_created',
            'subject_type' => Warehouse::class, 'subject_id' => $w->id,
            'properties' => ['name' => $w->name, 'code' => $w->code]]);

        return back()->with('message', ['type' => 'success', 'text' => 'Warehouse created.']);
    }

    public function update(Request $request, Warehouse $warehouse): RedirectResponse
    {
        $validated = $request->validate([
            'name'    => ['required', 'string', 'max:100'],
            'code'    => ['required', 'string', 'max:20', \Illuminate\Validation\Rule::unique('warehouses', 'code')->ignore($warehouse->id)],
            'address' => ['nullable', 'string', 'max:255'],
            'notes'   => ['nullable', 'string', 'max:500'],
        ]);

        $warehouse->update($validated);
        return back()->with('message', ['type' => 'success', 'text' => 'Warehouse updated.']);
    }

    public function toggle(Warehouse $warehouse): RedirectResponse
    {
        $warehouse->update(['is_active' => ! $warehouse->is_active]);
        $label = $warehouse->is_active ? 'activated' : 'deactivated';
        return back()->with('message', ['type' => 'success', 'text' => "Warehouse {$label}."]);
    }

    public function destroy(Warehouse $warehouse): RedirectResponse
    {
        if ($warehouse->stocks()->where('stock', '>', 0)->exists()) {
            return back()->withErrors(['error' => 'Cannot delete warehouse with stock. Transfer or write off stock first.']);
        }
        $warehouse->stocks()->delete();
        $warehouse->delete();
        return back()->with('message', ['type' => 'success', 'text' => 'Warehouse deleted.']);
    }

    // ── Stock adjust ──────────────────────────────────────────────────────────

    public function adjustStock(Request $request, Warehouse $warehouse): RedirectResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'quantity'   => ['required', 'integer'],
            'capital'    => ['nullable', 'numeric', 'min:0'],
            'markup'     => ['nullable', 'numeric', 'min:0'],
            'notes'      => ['nullable', 'string', 'max:500'],
        ]);

        DB::transaction(function () use ($validated, $warehouse) {
            $stock = WarehouseStock::firstOrCreate(
                ['warehouse_id' => $warehouse->id, 'product_id' => $validated['product_id']],
                ['stock' => 0, 'updated_by' => Auth::id()]
            );

            $newStock = max(0, $stock->stock + $validated['quantity']);
            $update   = ['stock' => $newStock, 'updated_by' => Auth::id()];
            if (isset($validated['capital'])) $update['capital'] = $validated['capital'];
            if (isset($validated['markup']))  $update['markup']  = $validated['markup'];
            $stock->update($update);

            ActivityLog::create([
                'user_id'      => Auth::id(),
                'action'       => 'warehouse_stock_adjusted',
                'subject_type' => Warehouse::class,
                'subject_id'   => $warehouse->id,
                'properties'   => ['product_id' => $validated['product_id'], 'qty_change' => $validated['quantity'], 'new_stock' => $newStock],
            ]);
        });

        return back()->with('message', ['type' => 'success', 'text' => 'Warehouse stock updated.']);
    }
}
