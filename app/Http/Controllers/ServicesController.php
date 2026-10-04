<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ServicesController extends Controller
{
    public function index(Request $request): Response
    {
        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $isAdmin && $request->filled('branch_id')
            ? (int) $request->branch_id
            : $user->branch_id;

        $services = Product::where('product_type', 'service')
            ->with([
                'category:id,name',
                'stocks' => fn ($q) => $q->where('branch_id', $branchId),
            ])
            ->when($request->filled('search'), fn ($q) =>
                $q->where('name', 'like', '%' . $request->search . '%')
            )
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('category_id'), fn ($q) =>
                $q->where('category_id', $request->category_id)
            )
            ->latest()
            ->paginate(50)
            ->withQueryString()
            ->through(fn (Product $p) => [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
                'duration_minutes' => $p->duration_minutes,
                'status'      => $p->status,
                'barcode'     => $p->barcode,
                'category'    => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'product_img' => \App\Models\Product::resolveImageUrl($p->product_img),
                'is_taxable'  => (bool) $p->is_taxable,
                'price'       => (float) ($p->stocks->first()?->price ?? 0),
                'capital'     => (float) ($p->stocks->first()?->capital ?? 0),
                'markup'      => (float) ($p->stocks->first()?->markup ?? 0),
            ]);

        $categories = Category::where('is_active', true)->orderBy('name')->get(['id', 'name']);

        $branches = $isAdmin
            ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name'])
            : collect();

        return Inertia::render('Services/Index', [
            'services'    => $services,
            'categories'  => $categories,
            'branches'    => $branches,
            'branch_id'   => $branchId,
            'is_admin'    => $isAdmin,
            'filters'     => $request->only('search', 'category_id'),
            'currency'    => \App\Models\SystemSetting::currencySymbol(),
        ]);
    }

    public function store(Request $request)
    {
        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $isAdmin && $request->filled('branch_id')
            ? (int) $request->branch_id
            : $user->branch_id;

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'barcode'     => ['nullable', 'string', 'max:255', 'unique:products,barcode'],
            'category_id' => ['required', 'exists:categories,id'],
            'description' => ['nullable', 'string', 'max:1000'],
            'price'       => ['required', 'numeric', 'min:0'],
            'duration_minutes' => ['nullable', 'integer', 'min:0', 'max:10080'],
            'status'      => ['required', 'in:active,inactive'],
            'capital'     => ['nullable', 'numeric', 'min:0'],
            'markup'      => ['nullable', 'numeric', 'min:0', 'max:500'],
            'is_taxable'  => ['boolean'],
            'branch_id'   => $isAdmin ? ['required', 'exists:branches,id'] : ['nullable'],
            'product_img' => ['sometimes', 'nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120'],
        ]);

        DB::transaction(function () use ($validated, $branchId, $request) {
            $imgPath = null;
            if ($request->hasFile('product_img')) {
                $imgPath = $request->file('product_img')->store('products', 'public');
            }

            $product = Product::create([
                'name'         => $validated['name'],
                'description'  => $validated['description'] ?? null,
                'barcode'      => $validated['barcode'] ?? null,
                'category_id'  => $validated['category_id'],
                'product_type' => 'service',
                'duration_minutes' => $validated['duration_minutes'] ?? null,
                'status'       => $validated['status'],
                'is_taxable'   => $validated['is_taxable'] ?? true,
                'product_img'  => $imgPath,
            ]);

            $capital = (float) ($validated['capital'] ?? $validated['price']);
            $markup  = $capital > 0 ? max(0, (((float) $validated['price'] / $capital) - 1) * 100) : 0;

            ProductStock::create([
                'product_id' => $product->id,
                'branch_id'  => $branchId,
                'stock'      => 0,
                'capital'    => $capital,
                'markup'     => $markup,
            ]);

            ActivityLog::record('created_service', "Created service: {$product->name}");
        });

        return back()->with('success', 'Service created successfully.');
    }

    public function update(Request $request, Product $service)
    {
        abort_unless($service->product_type === 'service', 404);

        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $isAdmin && $request->filled('branch_id')
            ? (int) $request->branch_id
            : $user->branch_id;

        $validated = $request->validate([
            'name'        => ['required', 'string', 'max:255'],
            'barcode'     => ['nullable', 'string', 'max:255',
                \Illuminate\Validation\Rule::unique('products', 'barcode')->ignore($service->id)],
            'category_id' => ['required', 'exists:categories,id'],
            'description' => ['nullable', 'string', 'max:1000'],
            'price'       => ['required', 'numeric', 'min:0'],
            'duration_minutes' => ['nullable', 'integer', 'min:0', 'max:10080'],
            'status'      => ['required', 'in:active,inactive'],
            'capital'     => ['nullable', 'numeric', 'min:0'],
            'markup'      => ['nullable', 'numeric', 'min:0', 'max:500'],
            'is_taxable'  => ['boolean'],
            'product_img' => ['sometimes', 'nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120'],
        ]);

        DB::transaction(function () use ($service, $validated, $branchId, $request) {
            if ($request->hasFile('product_img')) {
                if ($service->product_img) Storage::disk('public')->delete($service->product_img);
                $validated['product_img'] = $request->file('product_img')->store('products', 'public');
            }

            $service->update([
                'name'        => $validated['name'],
                'description' => $validated['description'] ?? null,
                'barcode'     => $validated['barcode'] ?? null,
                'category_id' => $validated['category_id'],
                'duration_minutes' => $validated['duration_minutes'] ?? null,
                'status'      => $validated['status'],
                'is_taxable'  => $validated['is_taxable'] ?? true,
                'product_img' => $validated['product_img'] ?? $service->product_img,
            ]);

            $stock = $service->stocks()->where('branch_id', $branchId)->first()
                ?? $service->stocks()->first();

            if ($stock) {
                $stock->update([
                    'capital' => (float) ($validated['capital'] ?? $validated['price']),
                    'markup'  => ((float) ($validated['capital'] ?? $validated['price'])) > 0
                        ? max(0, (((float) $validated['price'] / (float) ($validated['capital'] ?? $validated['price'])) - 1) * 100)
                        : 0,
                ]);
            } else {
                ProductStock::create([
                    'product_id' => $service->id,
                    'branch_id'  => $branchId,
                    'stock'      => 0,
                    'capital'    => (float) ($validated['capital'] ?? $validated['price']),
                    'markup'     => ((float) ($validated['capital'] ?? $validated['price'])) > 0
                        ? max(0, (((float) $validated['price'] / (float) ($validated['capital'] ?? $validated['price'])) - 1) * 100)
                        : 0,
                ]);
            }

            ActivityLog::record('updated_service', "Updated service: {$service->name}");
        });

        return back()->with('success', 'Service updated.');
    }

    public function destroy(Product $service)
    {
        abort_unless($service->product_type === 'service', 404);

        if ($service->product_img) Storage::disk('public')->delete($service->product_img);
        $service->delete();

        ActivityLog::record('deleted_service', "Deleted service: {$service->name}");

        return back()->with('success', 'Service deleted.');
    }
}
