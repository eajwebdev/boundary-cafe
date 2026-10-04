<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\Supplier;
use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Illuminate\Validation\ValidationException;

class ShopController extends Controller
{
    public function index()
    {
        $user         = Auth::user();
        $isAdmin      = (int) $user->role === 1;
        $mySupplierId = $user->supplier_id;

        $productQuery = Product::query()
            ->with(['category'])
            ->withCount('orderItems')
            ->latest();

        // Only show products that have stock > 0
        $productQuery->whereHas('stocks', function ($q) use ($isAdmin, $mySupplierId) {
            $q->where('stock', '>', 0);

            if (!$isAdmin && $mySupplierId) {
                $q->where('supplier_id', '!=', $mySupplierId);
            }
        });

        $productQuery->with(['stocks.supplier']);

        $products = $productQuery->get();

        $transformed = $products->map(function ($product) use ($isAdmin, $mySupplierId) {
            $visibleStocks = $product->stocks;

            if (!$isAdmin && $mySupplierId) {
                $visibleStocks = $visibleStocks->reject(fn($stock) => $stock->supplier_id === $mySupplierId);
            }

            $firstVisibleStock = $visibleStocks->first();

            $displayPrice = $firstVisibleStock ? (float) $firstVisibleStock->capital : 0.00;

            // Convert relative path to full accessible URL
            $imageUrl = \App\Models\Product::resolveImageUrl($product->product_img);

            return [
                'id'                 => $product->id,
                'name'               => $product->name,
                'product_img'        => $imageUrl,                    // ← Full URL now
                'price'              => $displayPrice,
                'formatted_price'    => number_format($displayPrice, 2),

                'category'           => $product->category ? [
                    'id'   => $product->category->id,
                    'name' => $product->category->name,
                ] : null,

                'order_items_count'  => $product->order_items_count,

                'stocks'             => $visibleStocks->map(fn($s) => [
                    'supplier_id'     => $s->supplier_id,
                    'supplier_name'   => $s->supplier?->name ?? 'Unknown',
                    'stock'           => (int) $s->stock,
                    'capital'         => (float) $s->capital,
                    'markup'          => (float) $s->markup,
                    'price'           => (float) $s->price,
                    'formatted_price' => number_format($s->price, 2),
                    'status'          => $s->stock_status,
                ])->values(),

                'supplier'           => $firstVisibleStock ? [
                    'id'   => $firstVisibleStock->supplier->id,
                    'name' => $firstVisibleStock->supplier->name,
                ] : null,

                'total_stock'        => $visibleStocks->sum('stock'),

                'has_own_stock'      => !$isAdmin && $mySupplierId
                    ? $product->stocks->contains('supplier_id', $mySupplierId)
                    : false,
            ];
        })->values();

        return Inertia::render('Shop/Index', [
            'products'       => $transformed,
            'suppliers'      => Supplier::orderBy('name')->get(['id', 'name']),
            'categories'     => Category::orderBy('name')->get(['id', 'name']),
            'userRole'       => (int) $user->role,
            'userSupplierId' => $mySupplierId,
            'isAdmin'        => $isAdmin,
        ]);
    }
    
    public function orders()
    {
        $user = Auth::user();

        $orders = Order::with([
            'supplier:id,name',
            'items.product:id,name',
            'items.product.stocks.supplier',
        ])
            ->where('user_id', $user->id)
            ->latest()
            ->take(50)
            ->get()
            ->map(function ($order) {
                return [
                    'id'             => $order->id,
                    'order_number'   => $order->order_number,
                    'status'         => $order->status,
                    'order_type'     => $order->order_type,
                    'payment_method' => $order->payment_method,
                    'subtotal'       => (float) $order->subtotal,
                    'total'          => (float) $order->total,
                    'created_at'     => $order->created_at->format('M d, Y • h:i A'),
                    'supplier'       => $order->supplier?->name ?? '—',
                    'can_edit'       => $order->status === 'pending',
                    'items'          => $order->items->map(fn($item) => [
                        'product_id' => $item->product_id,
                        'name'       => $item->product?->name ?? '(deleted)',
                        'price'      => (float) $item->price,
                        'quantity'   => (int) $item->quantity,
                        'total'      => (float) $item->total,
                        'current_stock' => $item->product
                            ? $item->product->stocks()
                                ->where('supplier_id', $order->supplier_id)
                                ->value('stock') ?? 0
                            : 0,
                    ])->toArray(),
                ];
            });

        return Inertia::render('Shop/Orders', [
            'orders'   => $orders,
            'userRole' => (int) $user->role,
        ]);
    }

    public function store(Request $request)
    {
        $user = Auth::user();

        $validated = $request->validate([
            'cart'               => 'required|array|min:1',
            'cart.*.id'          => 'required|integer|exists:products,id',
            'cart.*.quantity'    => 'required|integer|min:1',
            'supplier_id'        => 'required|exists:suppliers,id',
            'order_type'         => 'required|in:pickup,delivery',
            'payment_method'     => 'required|in:cod,consignment',
            'pr_number'          => 'nullable|string|max:50',
        ]);

        try {
            DB::beginTransaction();

            $cartItems  = collect($validated['cart']);
            $supplierId = $validated['supplier_id'];
            $prNumber   = trim($request->input('pr_number') ?? '');

            // Check if this PR number is already used in any order
            if ($prNumber !== '') {
                $existingOrder = Order::where('pr_number', $prNumber)
                    ->first(['id', 'order_number']);

                if ($existingOrder) {
                    $orderRef = $existingOrder->order_number 
                        ? $existingOrder->order_number 
                        : "ID #{$existingOrder->id}";

                    throw new \Exception(
                        "PR number {$prNumber} has already been used in order {$orderRef}."
                    );
                }
            }

            $products = Product::with(['stocks' => fn($q) => $q->where('supplier_id', $supplierId)])
                ->whereIn('id', $cartItems->pluck('id'))
                ->get()
                ->keyBy('id');

            $total = 0;

            foreach ($cartItems as $item) {
                $product = $products[$item['id']] ?? null;
                if (!$product) {
                    throw new \Exception("Product not found.");
                }

                $stock = $product->stocks->first();
                if (!$stock) {
                    throw new \Exception("{$product->name} not available from selected supplier.");
                }

                if ($item['quantity'] > $stock->stock) {
                    throw new \Exception("Not enough stock for {$product->name}. Only {$stock->stock} left.");
                }

                // Use CAPITAL as the order price (buying from other supplier)
                $itemPrice = $stock->capital;

                $total += $itemPrice * $item['quantity'];
            }

            $order = Order::create([
                'user_id'        => $user->id,
                'supplier_id'    => $supplierId,
                'order_type'     => $validated['order_type'],
                'payment_method' => $validated['payment_method'],
                'subtotal'       => $total,
                'total'          => $total,
                'status'         => 'pending',
                'pr_number'      => $prNumber ?: null,
            ]);

            foreach ($cartItems as $item) {
                $product = $products[$item['id']];
                $stock   = $product->stocks->first();

                OrderItem::create([
                    'order_id'   => $order->id,
                    'product_id' => $product->id,
                    'quantity'   => $item['quantity'],
                    'price'      => $stock->capital,     // ← CAPITAL price
                    'total'      => $stock->capital * $item['quantity'],
                ]);

                $stock->decrement('stock', $item['quantity']);
            }

            DB::commit();

            $successMessage = 'Order placed successfully!';
            if ($prNumber !== '') {
                $successMessage .= " (PR: {$prNumber})";
            }

            return redirect()->route('shop.index')
                ->with('success', $successMessage);

        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['cart' => $e->getMessage()]);
        }
    }

    public function update(Request $request, Order $order)
    {
        $user = Auth::user();

        if ($order->user_id !== $user->id) abort(403);

        if ($order->status !== 'pending') {
            return back()->withErrors(['order' => 'This order can no longer be modified.']);
        }

        $validated = $request->validate([
            'items'               => 'required|array',
            'items.*.product_id'  => 'required|exists:products,id',
            'items.*.quantity'    => 'required|integer|min:0',
        ]);

        try {
            DB::beginTransaction();

            foreach ($order->items as $item) {
                $stock = ProductStock::where('product_id', $item->product_id)
                    ->where('supplier_id', $order->supplier_id)
                    ->first();
                if ($stock) $stock->increment('stock', $item->quantity);
            }

            $order->items()->delete();

            $total = 0;
            $supplierId = $order->supplier_id;

            foreach ($validated['items'] as $input) {
                if ($input['quantity'] <= 0) continue;

                $product = Product::findOrFail($input['product_id']);
                $stock   = ProductStock::where('product_id', $product->id)
                    ->where('supplier_id', $supplierId)
                    ->firstOrFail();

                if ($input['quantity'] > $stock->stock) {
                    return redirect()->route('shop.orders')->with('error', "Not enough stock for {$product->name}.");
                }

                $itemTotal = $stock->capital * $input['quantity'];

                OrderItem::create([
                    'order_id'   => $order->id,
                    'product_id' => $product->id,
                    'quantity'   => $input['quantity'],
                    'price'      => $stock->capital,
                    'total'      => $itemTotal,
                ]);

                $stock->decrement('stock', $input['quantity']);
                $total += $itemTotal;
            }

            if ($total === 0) {
                $order->update(['status' => 'cancelled']);
                DB::commit();
                return redirect()->route('shop.orders')->with('success', "Order {$order->order_number} cancelled");
            }

            $order->update(['subtotal' => $total, 'total' => $total]);

            DB::commit();

            return redirect()->route('shop.orders')->with('success', "Order {$order->order_number} updated");
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => $e->getMessage()]);
        }
    }

    public function cancel(Order $order)
    {
        $user = Auth::user();

        if ($order->user_id !== $user->id || $order->status !== 'pending') {
            return back()->withErrors(['error' => 'You cannot cancel this order.']);
        }

        try {
            DB::beginTransaction();

            foreach ($order->items as $item) {
                $stock = ProductStock::where('product_id', $item->product_id)
                    ->where('supplier_id', $order->supplier_id)
                    ->first();
                if ($stock) $stock->increment('stock', $item->quantity);
            }

            $order->update(['status' => 'cancelled']);

            DB::commit();

            return redirect()->route('shop.orders')->with('success', "Order {$order->order_number} cancelled.");
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['error' => 'Failed to cancel order.']);
        }
    }
}