<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductBundle;
use App\Models\ProductBundleItem;
use App\Models\ProductStock;
use App\Models\ProductVariant;
use App\Models\RecipeIngredient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    // ── Index ──────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $user->branch_id;

        // ── Filters from request ───────────────────────────────────────────────
        $search = $request->string('search', '')->trim()->toString();
        $category = $request->integer('category_id') ?: null;
        $type = $request->string('type', '')->toString();
        $status = $request->string('status', '')->toString();
        $perPage = $request->integer('per_page', 24);
        $perPage = in_array($perPage, [12, 24, 48, 96]) ? $perPage : 24;

        // Branch filter: admins default to first branch; non-admins are locked to theirs
        $branchFilter = $isAdmin
            ? ($request->integer('branch_id') ?: Branch::orderBy('name')->value('id'))
            : $branchId;

        // ── Products query (paginated) ─────────────────────────────────────────
        // Load full stock rows (price, capital, markup, stock) + the branch name.
        // Do NOT use column-select shorthand on the stocks relation itself
        // because we need price/capital/markup/stock columns.
        $query = Product::query()
            ->with([
                'category:id,name',
                'stocks',                      // full ProductStock row (price, capital, markup, stock …)
                'stocks.branch:id,name,code',  // then hydrate branch name on each stock
            ])
            ->withCount('orderItems')
            ->latest();

        // Branch scope: non-admins are locked to their branch; admins can filter
        if (! $isAdmin) {
            if (! $branchId) {
                $query->whereRaw('1 = 0');
            } else {
                $query->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId));
            }
        } elseif ($branchFilter) {
            $query->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchFilter));
        }

        // Search
        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        // Category filter
        if ($category) {
            $query->where('category_id', $category);
        }

        // Product type filter
        if (in_array($type, ['standard', 'made_to_order', 'bundle', 'ingredient'])) {
            $query->where('product_type', $type);
        }

        // Stock status filter — resolved in DB for performance. Only counted items
        // have meaningful stock; made-to-order rows exist just to carry a price.
        if ($status !== '') {
            $query->whereIn('product_type', Product::COUNTED_TYPES);
            if ($status === 'out_of_stock') {
                $query->whereDoesntHave('stocks', fn ($q) => $q->where('stock', '>', 0));
            } elseif ($status === 'low_stock') {
                $query->whereHas('stocks', fn ($q) => $q->where('stock', '>', 0)->where('stock', '<=', 5));
            } elseif ($status === 'in_stock') {
                $query->whereHas('stocks', fn ($q) => $q->where('stock', '>', 5));
            }
        }

        $paginated = $query->paginate($perPage)->withQueryString();

        // Map each product in the current page
        $products = collect($paginated->items())->map(function (Product $product) use ($isAdmin, $branchId, $branchFilter) {
            // Branch-scoped stock record.
            // For non-admins: their branch. For admins with a filter: that branch. Otherwise first stock.
            $effectiveBranchId = $branchFilter ?? $branchId;
            $branchStock = $effectiveBranchId ? $product->stocks->firstWhere('branch_id', $effectiveBranchId) : null;
            $displayStock = $branchStock ?? $product->stocks->first();

            // Resolve price safely: if the stored price is 0 but capital + markup are set,
            // recompute on the fly. This covers rows created before booted() auto-compute.
            $resolvePrice = static function (?Model $s): float {
                if (! $s) {
                    return 0.00;
                }
                $p = (float) $s->price;
                if ($p <= 0.0 && (float) $s->capital > 0.0) {
                    $p = round((float) $s->capital * (1.0 + ((float) $s->markup / 100.0)), 2);
                }

                return $p;
            };

            return [
                'id' => $product->id,
                'name' => $product->name,
                'barcode' => $product->barcode,
                'product_type' => $product->product_type,
                'unit' => $product->unit ?? 'pc',
                'is_taxable' => (bool) $product->is_taxable,
                'product_img' => Product::resolveImageUrl($product->product_img),

                'category' => $product->category
                    ? ['id' => $product->category->id, 'name' => $product->category->name]
                    : null,

                // Use $displayStock (not $branchStock) so admins also get a valid price.
                'branch_stock' => $displayStock ? (float) $displayStock->stock : 0,
                'branch_stock_status' => $displayStock ? $displayStock->stock_status : 'Out of Stock',
                'branch_price' => $resolvePrice($displayStock),
                'branch_capital' => $displayStock ? (float) $displayStock->capital : 0.00,
                'branch_markup' => $displayStock ? (float) $displayStock->markup : 0.00,

                'global_stock' => $product->stock,
                'global_stock_formatted' => $product->formatted_stock,
                'global_stock_status' => $product->stock_status,

                'order_items_count' => $product->order_items_count,

                'stocks' => $product->stocks
                    ->when(! $isAdmin, fn ($c) => $c->where('branch_id', $branchId))
                    ->map(function ($s) use ($resolvePrice) {
                        $price = $resolvePrice($s);

                        return [
                            'branch_id' => $s->branch_id,
                            'branch_name' => $s->branch?->name ?? 'Unknown',
                            'stock' => (int) $s->stock,
                            'capital' => (float) $s->capital,
                            'markup' => (float) $s->markup,
                            'price' => $price,
                            'formatted_price' => '₱'.number_format($price, 2),
                            'status' => $s->stock_status,
                            'expiry_date' => $s->expiry_date?->format('Y-m-d'),
                            'batch_number' => $s->batch_number,
                        ];
                    })->values(),

                // Variants, bundle, recipe are NOT loaded in the list view
                // — they are only needed in modals; load on demand or pass
                // empty arrays so the TSX type is satisfied.
                'variants' => [],
                'bundle' => null,
                'recipe' => [],
            ];
        })->values();

        // ── Summary stats (fast aggregate queries, not loaded from memory) ──────
        $baseStatsQuery = Product::query();
        if (! $isAdmin && $branchId) {
            $baseStatsQuery->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchId));
        } elseif (! $isAdmin) {
            $baseStatsQuery->whereRaw('1 = 0');
        } elseif ($branchFilter) {
            $baseStatsQuery->whereHas('stocks', fn ($q) => $q->where('branch_id', $branchFilter));
        }

        // Effective branch for per-branch aggregates
        $effectiveBranchForStats = $branchFilter ?? ($isAdmin ? null : $branchId);

        $totalProducts = (clone $baseStatsQuery)->where('product_type', '!=', 'ingredient')->count();
        $ingredientCount = (clone $baseStatsQuery)->where('product_type', 'ingredient')->count();
        $madeToOrderCount = (clone $baseStatsQuery)->where('product_type', 'made_to_order')->count();
        $totalUnits = (clone $baseStatsQuery)
            ->where('product_type', 'standard')
            ->join('product_stocks', 'products.id', '=', 'product_stocks.product_id')
            ->when($effectiveBranchForStats, fn ($q) => $q->where('product_stocks.branch_id', $effectiveBranchForStats))
            ->sum('product_stocks.stock');
        $lowStock = (clone $baseStatsQuery)
            ->whereIn('product_type', Product::COUNTED_TYPES)
            ->whereHas('stocks', function ($q) use ($effectiveBranchForStats) {
                $q->where('stock', '>', 0)->where('stock', '<=', 5);
                if ($effectiveBranchForStats) {
                    $q->where('branch_id', $effectiveBranchForStats);
                }
            })->count();
        $outOfStock = (clone $baseStatsQuery)
            ->whereIn('product_type', Product::COUNTED_TYPES)
            ->whereDoesntHave('stocks', function ($q) use ($effectiveBranchForStats) {
                $q->where('stock', '>', 0);
                if ($effectiveBranchForStats) {
                    $q->where('branch_id', $effectiveBranchForStats);
                }
            })->count();

        // ── Variants, Bundles, Recipes — full lists (small, so load all) ────────
        // Variants: load all variants grouped by product (non-paginated)
        $variantProducts = Product::query()
            ->with(['category:id,name', 'variants.stocks'])
            ->whereHas('variants')
            ->when(! $isAdmin && $branchId, fn ($q) => $q->whereHas('stocks', fn ($s) => $s->where('branch_id', $branchId)))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'))
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'product_img' => Product::resolveImageUrl($p->product_img),
                'variants' => $p->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'product_id' => $v->product_id,
                    'name' => $v->name,
                    'sku' => $v->sku,
                    'barcode' => $v->barcode,
                    'attributes' => $v->attributes,
                    'extra_price' => (float) $v->extra_price,
                    'is_available' => $v->is_available,
                    'sort_order' => $v->sort_order,
                    'total_stock' => $v->total_stock,
                ])->values(),
            ])->values();

        // Bundles
        $bundleProducts = Product::query()
            ->with(['category:id,name', 'bundle.items.componentProduct:id,name', 'bundle.items.componentVariant:id,name'])
            ->where('product_type', 'bundle')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'product_img' => Product::resolveImageUrl($p->product_img),
                'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'bundle' => $p->bundle ? [
                    'id' => $p->bundle->id,
                    'pricing_mode' => $p->bundle->pricing_mode,
                    'price_adjustment' => (float) $p->bundle->price_adjustment,
                    'build_notes' => $p->bundle->build_notes,
                    'items' => $p->bundle->items->map(fn ($i) => [
                        'id' => $i->id,
                        'component_product_id' => $i->component_product_id,
                        'component_product_name' => $i->componentProduct?->name ?? '(deleted)',
                        'component_variant_id' => $i->component_variant_id,
                        'component_variant_name' => $i->componentVariant?->name,
                        'quantity' => $i->quantity,
                        'override_price' => $i->override_price !== null ? (float) $i->override_price : null,
                        'is_required' => $i->is_required,
                        'notes' => $i->notes,
                        'sort_order' => $i->sort_order,
                    ])->values(),
                ] : null,
            ])->values();

        // Recipes
        $recipeProducts = Product::query()
            ->with(['category:id,name', 'recipeIngredients.ingredient:id,name'])
            ->where('product_type', 'made_to_order')
            ->orderBy('name')
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'product_img' => Product::resolveImageUrl($p->product_img),
                'category' => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'recipe' => $p->recipeIngredients->map(fn ($l) => [
                    'id' => $l->id,
                    'ingredient_id' => $l->ingredient_id,
                    'ingredient_name' => $l->ingredient?->name ?? '(deleted)',
                    'quantity' => (float) $l->quantity,
                    'unit' => $l->unit,
                    'notes' => $l->notes,
                    'formatted_quantity' => $l->formatted_quantity,
                ])->values(),
            ])->values();

        // Stock management — paginated flat list of product × stock rows
        $stockPerPage = $request->integer('stock_per_page', 25);
        $stockPerPage = in_array($stockPerPage, [10, 25, 50, 100]) ? $stockPerPage : 25;
        $stockSearch = $request->string('stock_search', '')->trim()->toString();
        $stockBranch = $request->integer('stock_branch') ?: null;
        $stockStatus = $request->string('stock_status', '')->toString();

        $stockQuery = ProductStock::query()
            ->with(['product:id,name,barcode,product_img', 'branch:id,name'])
            ->when(! $isAdmin && $branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->when(! $isAdmin && ! $branchId, fn ($q) => $q->whereRaw('1 = 0'))
            // Exclude made_to_order products — they have no stock; ingredients are deducted on sale
            ->whereHas('product', fn ($q) => $q->where('product_type', '!=', 'made_to_order'))
            ->when($stockBranch && $isAdmin, fn ($q) => $q->where('branch_id', $stockBranch))
            ->when($stockSearch !== '', fn ($q) => $q->whereHas('product', fn ($p) => $p->where('name', 'like', "%{$stockSearch}%")
                ->orWhere('barcode', 'like', "%{$stockSearch}%")
            ));

        if ($stockStatus !== '') {
            match ($stockStatus) {
                'in_stock' => $stockQuery->where('stock', '>', 5),
                'low_stock' => $stockQuery->where('stock', '>', 0)->where('stock', '<=', 5),
                'out_of_stock' => $stockQuery->where('stock', '<=', 0),
                'expired' => $stockQuery->whereDate('expiry_date', '<', now()),
                'near_expiry' => $stockQuery->whereDate('expiry_date', '>=', now())
                    ->whereDate('expiry_date', '<=', now()->addDays(30)),
                default => null,
            };
        }

        $stockPaginated = $stockQuery
            ->orderBy('stock', 'asc') // low stock first
            ->paginate($stockPerPage, ['*'], 'stock_page')
            ->withQueryString();

        // Helper: recompute price if DB has 0 but capital+markup are set
        $resolveStockPrice = static function (ProductStock $s): float {
            $p = (float) $s->price;
            if ($p <= 0.0 && (float) $s->capital > 0.0) {
                $p = round((float) $s->capital * (1.0 + ((float) $s->markup / 100.0)), 2);
            }

            return $p;
        };

        $stockRows = collect($stockPaginated->items())->map(function ($s) use ($resolveStockPrice) {
            $price = $resolveStockPrice($s);

            return [
                'product_id' => $s->product_id,
                'product_name' => $s->product?->name ?? '(deleted)',
                'product_barcode' => $s->product?->barcode,
                'product_img' => Product::resolveImageUrl($s->product?->product_img),
                'product_type' => $s->product?->product_type ?? 'standard',
                'branch_id' => $s->branch_id,
                'branch_name' => $s->branch?->name ?? 'Unknown',
                'stock' => (float) $s->stock,
                'capital' => (float) $s->capital,
                'markup' => (float) $s->markup,
                'price' => $price,
                'formatted_price' => '₱'.number_format($price, 2),
                'status' => $s->stock_status,
                'expiry_date' => $s->expiry_date?->format('Y-m-d'),
                'batch_number' => $s->batch_number,
            ];
        })->values();

        // All products for dropdowns — used by variants, recipes, and bundle selectors.
        // Bundle-type products are always included even if they have no stock yet
        // (stock is only created after a build action, so we can't filter by stock for bundles).
        $allProductsForSelect = Product::query()
            ->select('id', 'name', 'product_type')
            ->orderBy('name')
            ->when(! $isAdmin && $branchId, fn ($q) => $q->where(fn ($inner) => $inner->where('product_type', 'bundle')           // bundles: always include
                ->orWhereHas('stocks', fn ($s) => $s->where('branch_id', $branchId))
            )
            )
            ->get()
            ->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'product_type' => $p->product_type])
            ->values();

        return Inertia::render('Products/Index', [
            // ── Products tab (paginated) ───────────────────────────────────────
            'products' => $products,
            'pagination' => [
                'total' => $paginated->total(),
                'per_page' => $paginated->perPage(),
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
            'filters' => [
                'search' => $search,
                'category_id' => $category,
                'type' => $type,
                'status' => $status,
                'per_page' => $perPage,
                'branch_id' => $branchFilter,
            ],

            // ── Summary stats ─────────────────────────────────────────────────
            'stats' => [
                'total_products' => $totalProducts,
                'total_units' => (int) $totalUnits,
                'ingredients' => $ingredientCount,
                'made_to_order' => $madeToOrderCount,
                'low_stock' => $lowStock,
                'out_of_stock' => $outOfStock,
            ],

            // ── Other tabs (full lists, non-paginated) ────────────────────────
            'variantProducts' => $variantProducts,
            'bundleProducts' => $bundleProducts,
            'recipeProducts' => $recipeProducts,

            // ── Stock management tab (paginated) ──────────────────────────────
            'stockRows' => $stockRows,
            'stockPagination' => [
                'total' => $stockPaginated->total(),
                'per_page' => $stockPaginated->perPage(),
                'current_page' => $stockPaginated->currentPage(),
                'last_page' => $stockPaginated->lastPage(),
                'from' => $stockPaginated->firstItem(),
                'to' => $stockPaginated->lastItem(),
            ],
            'stockFilters' => [
                'search' => $stockSearch,
                'branch_id' => $stockBranch,
                'status' => $stockStatus,
                'per_page' => $stockPerPage,
            ],

            // ── Shared data ───────────────────────────────────────────────────
            'categories' => Category::orderBy('name')->withCount('products')->get()
                ->map(fn ($c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'slug' => $c->slug,
                    'description' => $c->description,
                    'is_active' => $c->is_active,
                    'products_count' => $c->products_count,
                ]),
            'branches' => Branch::orderBy('name')->get(['id', 'name', 'code']),
            'allProductsForSelect' => $allProductsForSelect,
            'isAdmin' => $isAdmin,
            'userRole' => $user->role,
            'userBranchId' => $branchId,
        ]);
    }

    // ── Store ──────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        $validated = $request->validate([
            'name' => ['bail', 'required', 'string', 'max:255'],
            'barcode' => ['nullable', 'string', 'max:255', 'unique:products,barcode'],
            'product_img' => ['sometimes', 'nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120'],
            'product_type' => ['nullable', 'string', 'in:standard,made_to_order,bundle,service,ingredient'],
            'category_id' => ['bail', 'required', 'exists:categories,id'],
            'branch_id' => $isAdmin
                ? ['bail', 'required', 'exists:branches,id']
                : ['nullable', 'string'],
            'stock' => ['bail', 'required', 'integer', 'min:0'],
            'capital' => ['bail', 'required', 'numeric', 'min:0'],
            'markup' => ['bail', 'required', 'numeric', 'min:0', 'max:500'],
            'is_taxable' => ['nullable', 'boolean'],
        ]);

        $branchId = $isAdmin ? $validated['branch_id'] : $user->branch_id;

        if (! $branchId) {
            throw ValidationException::withMessages(['branch_id' => 'No branch associated with your account.']);
        }

        $product = DB::transaction(function () use ($validated, $branchId, $request) {
            $barcode = $validated['barcode'] ?? $this->generateNextBarcode();

            $product = Product::create([
                'name' => trim($validated['name']),
                'barcode' => $barcode,
                'category_id' => $validated['category_id'],
                'product_type' => $validated['product_type'] ?? 'standard',
                'is_taxable' => $validated['is_taxable'] ?? true,
            ]);

            // forceFormData sends product_img as the string "null" when no file chosen.
            // Only process when a real uploaded file is present.
            if ($request->hasFile('product_img') && $request->file('product_img')->isValid()) {
                Storage::disk('public')->makeDirectory('products', 0755, true);
                $path = $request->file('product_img')->store('products', 'public');
                $product->update(['product_img' => $path]);
            }

            ProductStock::create([
                'product_id' => $product->id,
                'branch_id' => $branchId,
                'stock' => $validated['stock'],
                'capital' => $validated['capital'],
                'markup' => $validated['markup'],
                'updated_by' => auth()->id(),
            ]);

            return $product;
        });

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'product_created',
            'subject_type' => Product::class,
            'subject_id' => $product->id,
            'properties' => [
                'name' => $product->name,
                'barcode' => $product->barcode,
                'product_type' => $product->product_type,
                'category_id' => $product->category_id,
                'branch_id' => $branchId,
                'stock' => $validated['stock'],
                'capital' => $validated['capital'],
                'markup' => $validated['markup'],
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Product created successfully.']);
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    public function update(Request $request, Product $product): RedirectResponse
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        if (! $isAdmin) {
            $hasAccess = $product->stocks()->where('branch_id', $user->branch_id)->exists();
            if (! $hasAccess) {
                abort(403, 'You do not have permission to edit this product.');
            }
        }

        $validated = $request->validate([
            'name' => ['bail', 'required', 'string', 'max:255'],
            'barcode' => ['nullable', 'string', 'max:255', Rule::unique('products', 'barcode')->ignore($product->id)],
            'product_img' => ['sometimes', 'nullable', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120'],
            'product_type' => ['nullable', 'string', 'in:standard,made_to_order,bundle,service,ingredient'],
            'category_id' => ['bail', 'required', 'exists:categories,id'],
            'branch_id' => $isAdmin
                ? ['bail', 'required', 'exists:branches,id']
                : ['nullable', 'string'],
            'stock' => ['bail', 'required', 'integer', 'min:0'],
            'capital' => ['bail', 'required', 'numeric', 'min:0'],
            'markup' => ['bail', 'required', 'numeric', 'min:0', 'max:500'],
            'is_taxable' => ['nullable', 'boolean'],
        ]);

        $branchId = $isAdmin ? $validated['branch_id'] : $user->branch_id;

        DB::transaction(function () use ($product, $validated, $branchId, $request) {
            $product->update([
                'name' => trim($validated['name']),
                'barcode' => $validated['barcode'] ?? $product->barcode,
                'category_id' => $validated['category_id'],
                'product_type' => $validated['product_type'] ?? $product->product_type,
                'is_taxable' => $validated['is_taxable'] ?? $product->is_taxable,
            ]);

            if ($request->hasFile('product_img') && $request->file('product_img')->isValid()) {
                Storage::disk('public')->makeDirectory('products', 0755, true);
                if ($product->product_img) {
                    Storage::disk('public')->delete($product->product_img);
                }
                $imagePath = $request->file('product_img')->store('products', 'public');
                $product->update(['product_img' => $imagePath]);
            }

            ProductStock::updateOrCreate(
                ['product_id' => $product->id, 'branch_id' => $branchId],
                ['stock' => $validated['stock'], 'capital' => $validated['capital'], 'markup' => $validated['markup'], 'updated_by' => auth()->id()]
            );
        });

        $product->refresh();

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'product_updated',
            'subject_type' => Product::class,
            'subject_id' => $product->id,
            'properties' => [
                'name' => trim($validated['name']),
                'barcode' => $product->barcode,
                'product_type' => $product->product_type,
                'category_id' => $validated['category_id'],
                'branch_id' => $branchId,
                'stock' => $validated['stock'],
                'capital' => $validated['capital'],
                'markup' => $validated['markup'],
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Product updated successfully.']);
    }

    // ── Destroy ────────────────────────────────────────────────────────────────

    public function destroy(Request $request, Product $product): RedirectResponse
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        if (! $isAdmin) {
            $hasAccess = $product->stocks()->where('branch_id', $user->branch_id)->exists();
            if (! $hasAccess) {
                abort(403, 'You do not have permission to delete this product.');
            }
        }

        if ($product->orderItems()->exists() || $product->saleItems()->exists()) {
            throw ValidationException::withMessages(['error' => 'Cannot delete — product has been used in orders or sales.']);
        }

        if ($product->product_img) {
            Storage::disk('public')->delete($product->product_img);
        }

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'product_deleted',
            'subject_type' => Product::class,
            'subject_id' => $product->id,
            'properties' => [
                'deleted_product' => $product->name,
                'old_data' => [
                    'name' => $product->name,
                    'barcode' => $product->barcode,
                    'product_type' => $product->product_type,
                    'category_id' => $product->category_id,
                    'global_stock' => $product->stock,
                ],
                'reason' => $request->input('reason', 'No reason provided'),
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        $product->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Product deleted successfully.']);
    }

    // ── Variants ───────────────────────────────────────────────────────────────

    public function storeVariant(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:100'],
            'barcode' => ['nullable', 'string', 'max:255'],
            'attributes' => ['nullable', 'string'],
            'extra_price' => ['nullable', 'numeric', 'min:0'],
            'is_available' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attributes = null;
        if (! empty($validated['attributes'])) {
            $decoded = json_decode($validated['attributes'], true);
            $attributes = is_array($decoded) ? $decoded : null;
        }

        ProductVariant::create([
            'product_id' => $validated['product_id'],
            'name' => trim($validated['name']),
            'sku' => $validated['sku'] ?? null,
            'barcode' => $validated['barcode'] ?? null,
            'attributes' => $attributes,
            'extra_price' => $validated['extra_price'] ?? 0,
            'is_available' => $validated['is_available'] ?? true,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Variant added successfully.']);
    }

    public function updateVariant(Request $request, ProductVariant $variant): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:100'],
            'barcode' => ['nullable', 'string', 'max:255'],
            'attributes' => ['nullable', 'string'],
            'extra_price' => ['nullable', 'numeric', 'min:0'],
            'is_available' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $attributes = null;
        if (! empty($validated['attributes'])) {
            $decoded = json_decode($validated['attributes'], true);
            $attributes = is_array($decoded) ? $decoded : null;
        }

        $variant->update([
            'name' => trim($validated['name']),
            'sku' => $validated['sku'] ?? $variant->sku,
            'barcode' => $validated['barcode'] ?? $variant->barcode,
            'attributes' => $attributes,
            'extra_price' => $validated['extra_price'] ?? $variant->extra_price,
            'is_available' => $validated['is_available'] ?? $variant->is_available,
            'sort_order' => $validated['sort_order'] ?? $variant->sort_order,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Variant updated successfully.']);
    }

    public function destroyVariant(ProductVariant $variant): RedirectResponse
    {
        $variant->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Variant deleted.']);
    }

    // ── Recipes ────────────────────────────────────────────────────────────────

    public function storeRecipe(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'ingredient_id' => ['required', 'exists:products,id', 'different:product_id'],
            'quantity' => ['required', 'numeric', 'min:0.0001'],
            'unit' => ['required', 'in:pcs,g,kg,ml,l,tsp,tbsp,cup,oz,lb,pinch'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $exists = RecipeIngredient::where('product_id', $validated['product_id'])
            ->where('ingredient_id', $validated['ingredient_id'])
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages(['ingredient_id' => 'This ingredient is already in the recipe.']);
        }

        RecipeIngredient::create($validated);

        return back()->with('message', ['type' => 'success', 'text' => 'Ingredient added to recipe.']);
    }

    public function destroyRecipe(RecipeIngredient $recipe): RedirectResponse
    {
        $recipe->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Ingredient removed from recipe.']);
    }

    // ── Stock Adjust ───────────────────────────────────────────────────────────

    public function adjustStock(Request $request, Product $product): RedirectResponse
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        $validated = $request->validate([
            'branch_id' => ['required', 'exists:branches,id'],
            'stock' => ['required', 'integer', 'min:0'],
            'capital' => ['required', 'numeric', 'min:0'],
            'markup' => ['required', 'numeric', 'min:0', 'max:500'],
        ]);

        if (! $isAdmin && $validated['branch_id'] != $user->branch_id) {
            abort(403, 'You can only adjust stock for your own branch.');
        }

        ProductStock::updateOrCreate(
            ['product_id' => $product->id, 'branch_id' => $validated['branch_id']],
            ['stock' => $validated['stock'], 'capital' => $validated['capital'], 'markup' => $validated['markup'], 'updated_by' => auth()->id()]
        );

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'stock_adjusted',
            'subject_type' => Product::class,
            'subject_id' => $product->id,
            'properties' => [
                'product_name' => $product->name,
                'branch_id' => $validated['branch_id'],
                'stock' => $validated['stock'],
                'capital' => $validated['capital'],
                'markup' => $validated['markup'],
                'ip' => $request->ip(),
            ],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Stock adjusted successfully.']);
    }

    // ── Bundles ────────────────────────────────────────────────────────────────
    //
    // A bundle is a product whose capital = sum(component capitals × qty).
    // "Build" deducts component stock and writes/updates the bundle ProductStock.

    /**
     * Create the bundle definition for an existing product of type=bundle.
     */
    public function storeBundle(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'pricing_mode' => ['required', 'in:computed,fixed'],
            'price_adjustment' => ['nullable', 'numeric'],
            'build_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $product = Product::findOrFail($validated['product_id']);
        if ($product->product_type !== 'bundle') {
            throw ValidationException::withMessages(['product_id' => 'Product must be of type "bundle".']);
        }
        if ($product->bundle()->exists()) {
            throw ValidationException::withMessages(['product_id' => 'Bundle definition already exists for this product.']);
        }

        $bundle = ProductBundle::create([
            'product_id' => $validated['product_id'],
            'pricing_mode' => $validated['pricing_mode'],
            'price_adjustment' => $validated['price_adjustment'] ?? 0,
            'build_notes' => $validated['build_notes'] ?? null,
        ]);

        ActivityLog::create([
            'user_id' => auth()->id(),
            'action' => 'bundle_created',
            'subject_type' => ProductBundle::class,
            'subject_id' => $bundle->id,
            'properties' => ['product' => $product->name, 'ip' => $request->ip()],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Bundle definition created.']);
    }

    public function updateBundle(Request $request, ProductBundle $bundle): RedirectResponse
    {
        $validated = $request->validate([
            'pricing_mode' => ['required', 'in:computed,fixed'],
            'price_adjustment' => ['nullable', 'numeric'],
            'build_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $bundle->update([
            'pricing_mode' => $validated['pricing_mode'],
            'price_adjustment' => $validated['price_adjustment'] ?? 0,
            'build_notes' => $validated['build_notes'] ?? null,
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Bundle updated.']);
    }

    public function destroyBundle(ProductBundle $bundle): RedirectResponse
    {
        $bundle->items()->delete();
        $bundle->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Bundle definition removed.']);
    }

    // ── Bundle items (components) ──────────────────────────────────────────────

    public function addBundleItem(Request $request, ProductBundle $bundle): RedirectResponse
    {
        $validated = $request->validate([
            'component_product_id' => ['required', 'exists:products,id'],
            'component_variant_id' => ['nullable', 'exists:product_variants,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'override_price' => ['nullable', 'numeric', 'min:0'],
            'is_required' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        // Prevent adding the bundle product itself as a component
        if ($validated['component_product_id'] == $bundle->product_id) {
            throw ValidationException::withMessages(['component_product_id' => 'A bundle cannot contain itself.']);
        }

        $bundle->items()->create([
            'component_product_id' => $validated['component_product_id'],
            'component_variant_id' => $validated['component_variant_id'] ?? null,
            'quantity' => $validated['quantity'],
            'override_price' => $validated['override_price'] ?? null,
            'is_required' => $validated['is_required'] ?? true,
            'notes' => $validated['notes'] ?? null,
            'sort_order' => $validated['sort_order'] ?? $bundle->items()->count(),
        ]);

        $this->syncBundleStock($bundle->fresh(['items.componentProduct.stocks']));

        return back()->with('message', ['type' => 'success', 'text' => 'Component added to bundle.']);
    }

    public function updateBundleItem(Request $request, ProductBundle $bundle, ProductBundleItem $item): RedirectResponse
    {
        $validated = $request->validate([
            'quantity' => ['required', 'integer', 'min:1'],
            'override_price' => ['nullable', 'numeric', 'min:0'],
            'is_required' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $item->update([
            'quantity' => $validated['quantity'],
            'override_price' => array_key_exists('override_price', $validated) ? $validated['override_price'] : $item->override_price,
            'is_required' => $validated['is_required'] ?? $item->is_required,
            'notes' => $validated['notes'] ?? $item->notes,
            'sort_order' => $validated['sort_order'] ?? $item->sort_order,
        ]);

        $this->syncBundleStock($bundle->fresh(['items.componentProduct.stocks']));

        return back()->with('message', ['type' => 'success', 'text' => 'Component updated.']);
    }

    public function removeBundleItem(ProductBundle $bundle, ProductBundleItem $item): RedirectResponse
    {
        $item->delete();
        $this->syncBundleStock($bundle->fresh(['items.componentProduct.stocks']));

        return back()->with('message', ['type' => 'success', 'text' => 'Component removed.']);
    }

    // ── Build bundle ───────────────────────────────────────────────────────────
    //
    // "Building" a bundle:
    //   1. Deducts qty of each required component from stock in the given branch
    //   2. Computes capital = sum(component_capital × component_qty)
    //   3. Writes (or updates) the bundle product's ProductStock with that capital
    //      so the system treats it exactly like any other stocked product.
    //
    // After building, the bundle product can be sold on the POS.

    public function buildBundle(Request $request, ProductBundle $bundle): RedirectResponse
    {
        $user = Auth::user();
        $isAdmin = $user->isSuperAdmin() || $user->isAdministrator();

        $validated = $request->validate([
            'branch_id' => ['required', 'exists:branches,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'markup' => ['required', 'numeric', 'min:0', 'max:500'],
        ]);

        $branchId = (int) $validated['branch_id'];
        $qty = (int) $validated['quantity'];

        if (! $isAdmin && $branchId !== (int) $user->branch_id) {
            abort(403, 'You can only build bundles for your own branch.');
        }

        // Load bundle with items + component stocks in one query
        $bundle->load([
            'product',
            'items.componentProduct.stocks' => fn ($q) => $q->where('branch_id', $branchId),
        ]);

        DB::transaction(function () use ($bundle, $branchId, $qty, $validated) {
            $totalCapital = 0;
            $stockLog = [];

            foreach ($bundle->items as $item) {
                if (! $item->is_required) {
                    continue;
                } // optional components not deducted

                $compStock = $item->componentProduct->stocks->first();

                if (! $compStock) {
                    throw ValidationException::withMessages([
                        'error' => "No stock record for \"{$item->componentProduct->name}\" in this branch.",
                    ]);
                }

                $needed = $item->quantity * $qty;
                if ($compStock->stock < $needed) {
                    throw ValidationException::withMessages([
                        'error' => "Insufficient stock for \"{$item->componentProduct->name}\". Need {$needed}, have {$compStock->stock}.",
                    ]);
                }

                // Deduct component stock
                $compStock->decrement('stock', $needed);

                // Accumulate capital: use override_price if set, else component capital
                $componentCapital = $item->override_price !== null
                    ? (float) $item->override_price    // override acts as capital for this line
                    : (float) $compStock->capital;

                $totalCapital += $componentCapital * $item->quantity;

                $stockLog[] = [
                    'product' => $item->componentProduct->name,
                    'qty_used' => $needed,
                    'capital' => $componentCapital,
                ];
            }

            // Per-unit capital of the built bundle
            $unitCapital = round($totalCapital, 2);

            // Write bundle product stock — add $qty units with computed capital
            $bundleStock = ProductStock::where('product_id', $bundle->product_id)
                ->where('branch_id', $branchId)
                ->first();

            if ($bundleStock) {
                // Weighted average capital when adding to existing stock
                $existingUnits = $bundleStock->stock;
                $existingCapital = (float) $bundleStock->capital;
                $newTotalUnits = $existingUnits + $qty;
                $avgCapital = $newTotalUnits > 0
                    ? round((($existingCapital * $existingUnits) + ($unitCapital * $qty)) / $newTotalUnits, 2)
                    : $unitCapital;

                $bundleStock->update([
                    'stock' => $existingUnits + $qty,
                    'capital' => $avgCapital,
                    'markup' => $validated['markup'],
                    'updated_by' => auth()->id(),
                ]);
            } else {
                ProductStock::create([
                    'product_id' => $bundle->product_id,
                    'branch_id' => $branchId,
                    'stock' => $qty,
                    'capital' => $unitCapital,
                    'markup' => $validated['markup'],
                    'updated_by' => auth()->id(),
                ]);
            }

            ActivityLog::create([
                'user_id' => auth()->id(),
                'action' => 'bundle_built',
                'subject_type' => ProductBundle::class,
                'subject_id' => $bundle->id,
                'properties' => [
                    'bundle_product' => $bundle->product->name,
                    'branch_id' => $branchId,
                    'qty_built' => $qty,
                    'unit_capital' => $unitCapital,
                    'markup' => $validated['markup'],
                    'selling_price' => round($unitCapital * (1 + ((float) $validated['markup'] / 100)), 2),
                    'components_used' => $stockLog,
                    'ip' => request()->ip(),
                ],
            ]);
        });

        return back()->with('message', [
            'type' => 'success',
            'text' => "Built {$qty} unit(s) of '{$bundle->product->name}' successfully.",
        ]);
    }

    // ── Sync bundle product stock ──────────────────────────────────────────────
    //
    // Called automatically after any component add/update/remove.
    // Recomputes the bundle product's capital = sum(component.capital × qty)
    // then updates price = capital × (1 + markup/100).
    // Markup is read from the existing ProductStock row (default 10% if none yet).
    // This keeps the bundle product's price always in sync with its components.

    private function syncBundleStock(ProductBundle $bundle): void
    {
        // Load all branches that have stock for any component
        $bundle->loadMissing([
            'items.componentProduct.stocks',
        ]);

        // Gather all branch IDs across all components
        $branchIds = $bundle->items
            ->flatMap(fn ($i) => $i->componentProduct?->stocks->pluck('branch_id') ?? collect())
            ->unique()
            ->filter();

        foreach ($branchIds as $branchId) {
            $totalCapital = 0;

            foreach ($bundle->items as $item) {
                $compStock = $item->componentProduct?->stocks
                    ->firstWhere('branch_id', $branchId);

                if ($compStock) {
                    // Use override_price as the per-unit capital contribution if set,
                    // otherwise use the component's actual capital
                    $unitCapital = $item->override_price !== null
                        ? (float) $item->override_price
                        : (float) $compStock->capital;
                    $totalCapital += $unitCapital * $item->quantity;
                }
            }

            if ($totalCapital <= 0) {
                continue;
            }

            // Read existing bundle stock row to preserve markup + stock qty
            $bundleStock = ProductStock::where('product_id', $bundle->product_id)
                ->where('branch_id', $branchId)
                ->first();

            $markup = $bundleStock ? (float) $bundleStock->markup : 10.0; // default 10%
            $price = round($totalCapital * (1 + $markup / 100), 2);

            ProductStock::updateOrCreate(
                ['product_id' => $bundle->product_id, 'branch_id' => $branchId],
                [
                    'capital' => round($totalCapital, 2),
                    'markup' => $markup,
                    'price' => $price,
                    'updated_by' => auth()->id(),
                    // stock stays unchanged — only capital + price are recomputed
                ]
            );
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private function generateNextBarcode(): string
    {
        $last = Product::latest('id')->first();
        $lastNumber = ($last && $last->barcode) ? (int) $last->barcode : 0;

        return str_pad($lastNumber + 1, 7, '0', STR_PAD_LEFT);
    }
}
