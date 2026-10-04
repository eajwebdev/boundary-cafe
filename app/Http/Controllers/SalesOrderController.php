<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\ProductStock;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\Auth;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\RedirectResponse;

class SalesOrderController extends Controller
{
    public function index()
    {
        $currentSupplierId = Auth::user()->supplier_id;

        if (!$currentSupplierId) {
            abort(403, 'You are not associated with any supplier account.');
        }

        $orders = Order::with([
            'user.supplier:id,name,phone,address,contact_person,is_campus',
            'items.product:id,name',  // ← cleaned: no longer need product.price
        ])
            ->where('supplier_id', $currentSupplierId)
            ->latest()
            ->get()
            ->map(function ($order) {
                $buyerSupplier = $order->user?->supplier;

                return [
                    'id'             => $order->id,
                    'order_number'   => $order->order_number,
                    'buyer_supplier' => $buyerSupplier ? [
                        'name'           => $buyerSupplier->name,
                        'phone'          => $buyerSupplier->phone ?? '—',
                        'address'        => $buyerSupplier->address ?? '—',
                        'contact_person' => $buyerSupplier->contact_person ?? '—',
                        'is_campus'      => $buyerSupplier->is_campus,
                    ] : null,
                    'status'         => $order->status,
                    'order_type'     => $order->order_type,
                    'payment_method' => $order->payment_method,
                    'subtotal'       => (float) $order->subtotal,
                    'total'          => (float) $order->total,
                    'created_at'     => $order->created_at->format('M d, Y • h:i A'),
                    'can_manage'     => in_array($order->status, ['pending', 'confirmed']),
                    'items'          => $order->items->map(function ($item) {
                        return [
                            'name'     => $item->product?->name ?? '(Deleted Product)',
                            'price'    => (float) $item->price,      // ← comes from OrderItem (selling price)
                            'quantity' => (int) $item->quantity,
                            'total'    => (float) $item->total,
                        ];
                    })->toArray(),
                ];
            });

        return Inertia::render('Suppliers/Orders', [
            'orders' => $orders,
            'supplier' => Auth::user()->supplier ? [
                'name'           => Auth::user()->supplier->name,
                'is_campus'      => Auth::user()->supplier->is_campus,
                'phone'          => Auth::user()->supplier->phone ?? '—',
                'address'        => Auth::user()->supplier->address ?? '—',
                'contact_person' => Auth::user()->supplier->contact_person ?? '—',
            ] : null,
        ]);
    }

    /**
     * Show detailed view of a single order
     */
    public function show(Order $order)
    {
        $this->authorizeSupplier($order);

        $order->load([
            'user.supplier:id,name,phone,address,contact_person,is_campus',
            'items.product:id,name',  // ← cleaned: no longer need product.price
        ]);

        $buyerSupplier = $order->user?->supplier;

        return Inertia::render('Suppliers/OrderShow', [
            'order' => [
                'id'             => $order->id,
                'order_number'   => $order->order_number,
                'status'         => $order->status,
                'order_type'     => $order->order_type,
                'payment_method' => $order->payment_method,
                'subtotal'       => (float) $order->subtotal,
                'total'          => (float) $order->total,
                'created_at'     => $order->created_at->format('M d, Y h:i A'),
                'buyer_supplier' => $buyerSupplier ? [
                    'name'           => $buyerSupplier->name,
                    'phone'          => $buyerSupplier->phone ?? '—',
                    'address'        => $buyerSupplier->address ?? '—',
                    'contact_person' => $buyerSupplier->contact_person ?? '—',
                    'is_campus'      => $buyerSupplier->is_campus,
                ] : null,
                'items'          => $order->items->map(function ($item) {
                    return [
                        'name'     => $item->product?->name ?? '(Deleted Product)',
                        'price'    => (float) $item->price,
                        'quantity' => (int) $item->quantity,
                        'total'    => (float) $item->total,
                    ];
                }),
            ],
            'supplier' => Auth::user()->supplier ? [
                'name'           => Auth::user()->supplier->name,
                'is_campus'      => Auth::user()->supplier->is_campus,
                'phone'          => Auth::user()->supplier->phone ?? '—',
                'address'        => Auth::user()->supplier->address ?? '—',
                'contact_person' => Auth::user()->supplier->contact_person ?? '—',
            ] : null,
        ]);
    }

    /**
     * Confirm a pending order.
     */
    public function confirm(Order $order)
    {
        $this->authorizeSupplier($order);

        if ($order->status !== 'pending') {
            return back()->withErrors(['status' => 'This order can no longer be confirmed.']);
        }

        $order->update(['status' => 'confirmed']);

        return back()->with('success', "Order {$order->order_number} confirmed successfully.");
    }

    /**
     * Reject/cancel an order and restore stock to the SELLER.
     * 
     * FIXED: Now uses ProductStock (same pattern as complete() method)
     * Previously it was using legacy $product->increment('stock')
     */
    public function reject(Order $order)
    {
        $this->authorizeSupplier($order);

        if (!in_array($order->status, ['pending', 'confirmed'])) {
            return back()->withErrors(['status' => 'This order can no longer be rejected.']);
        }

        try {
            $updatedStocks = [];

            DB::transaction(function () use ($order, &$updatedStocks) {
                // Load items once
                $order->load('items');

                // Restore stock to THIS supplier (the seller)
                $supplierId = $order->supplier_id;

                foreach ($order->items as $item) {
                    // Lock the stock row to prevent race conditions
                    $stock = ProductStock::where('product_id', $item->product_id)
                        ->where('supplier_id', $supplierId)
                        ->lockForUpdate()
                        ->first();

                    if (!$stock) {
                        // Create stock record if it doesn't exist yet
                        $stock = ProductStock::create([
                            'product_id'  => $item->product_id,
                            'supplier_id' => $supplierId,
                            'stock'       => 0,
                            'updated_by'  => Auth::id(),
                        ]);
                    }

                    $oldStockValue = $stock->stock;

                    $stock->increment('stock', $item->quantity);

                    $newStockValue = $stock->fresh()->stock;

                    $updatedStocks[] = [
                        'product_id'     => $item->product_id,
                        'supplier_id'    => $supplierId,
                        'quantity_added' => $item->quantity,
                        'stock_before'   => $oldStockValue,
                        'stock_after'    => $newStockValue,
                    ];
                }

                $order->update(['status' => 'cancelled']);
            });

            // Audit log
            Log::info("Order rejected - stock restored to seller", [
                'order_id'        => $order->id,
                'order_number'    => $order->order_number,
                'supplier_id'     => $order->supplier_id,
                'rejected_by'     => Auth::id(),
                'restocked_items' => $updatedStocks,
            ]);

            return back()->with('success', "Order {$order->order_number} rejected and stock restored.");
        } catch (\Exception $e) {
            Log::error("Failed to reject order", [
                'order_id'     => $order->id,
                'order_number' => $order->order_number,
                'error'        => $e->getMessage(),
                'trace'        => $e->getTraceAsString(),
            ]);

            return back()->withErrors([
                'error' => 'Failed to reject the order. Please try again or contact support.'
            ]);
        }
    }

    /**
     * Mark order as shipped.
     */
    public function shipped(Order $order)
    {
        $this->authorizeSupplier($order);

        if ($order->status !== 'confirmed') {
            return back()->withErrors(['status' => 'Only confirmed orders can be marked as shipped.']);
        }

        $order->update(['status' => 'shipped']);

        return back()->with('success', "Order {$order->order_number} marked as shipped.");
    }

    /**
     * Mark order as completed.
     */
    public function complete(Order $order): RedirectResponse
    {
        $this->authorizeSupplier($order);

        if (!in_array($order->status, ['confirmed', 'shipped'])) {
            return redirect()->back()->withErrors([
                'status' => 'This order cannot be marked as completed at this time.'
            ]);
        }

        try {
            $updatedStocks = [];

            DB::transaction(function () use ($order, &$updatedStocks) {
                $order->loadMissing('user');

                $supplierId = $order->user?->supplier_id;

                if (!$supplierId) {
                    throw new \Exception("User {$order->user_id} has no supplier_id assigned.");
                }

                $order->update([
                    'status'        => 'completed',
                    'completed_at'  => now(),
                    'completed_by'  => Auth::id(),
                ]);

                foreach ($order->items as $item) {
                    $stock = ProductStock::where('product_id', $item->product_id)
                        ->where('supplier_id', $supplierId)
                        ->lockForUpdate()
                        ->first();

                    if (!$stock) {
                        // Calculate markup (10% of capital) and selling price (capital + markup)
                        // Both rounded to nearest whole number with NO decimals
                        $markup = (int) round($item->price * 0.1);
                        $price  = $item->price + $markup;

                        $stock = ProductStock::create([
                            'product_id'  => $item->product_id,
                            'supplier_id' => $supplierId,
                            'capital'     => $item->price,
                            'markup'      => $markup,
                            'price'       => $price,
                            'stock'       => 0,
                            'updated_by'  => Auth::id(),
                        ]);
                    }

                    $oldStockValue = $stock->stock;
                    $stock->increment('stock', $item->quantity);
                    $newStockValue = $stock->fresh()->stock;

                    $updatedStocks[] = [
                        'product_id'     => $item->product_id,
                        'supplier_id'    => $supplierId,
                        'quantity_added' => $item->quantity,
                        'stock_before'   => $oldStockValue,
                        'stock_after'    => $newStockValue,
                    ];
                }
            });

            Log::info("Order completed - stock returned to buyer supplier", [
                'order_id'        => $order->id,
                'order_number'    => $order->order_number,
                'user_id'         => $order->user_id,
                'supplier_id'     => $order->user->supplier_id ?? null,
                'completed_by'    => Auth::id(),
                'restocked_items' => $updatedStocks,
            ]);

            return redirect()->back()->with('success', "Order {$order->order_number} completed and stock returned.");

        } catch (\Exception $e) {
            Log::error("Failed to complete order", [
                'order_id'     => $order->id,
                'order_number' => $order->order_number,
                'error'        => $e->getMessage(),
                'trace'        => $e->getTraceAsString(),
            ]);

            return redirect()->back()->withErrors([
                'error' => 'Failed to complete the order. Please try again or contact support.'
            ]);
        }
    }

    /**
     * Generate and download receipt PDF.
     */
    public function receipt(Order $order)
    {
        $this->authorizeSupplier($order);

        $order->load([
            'user.supplier:id,name,phone,address,contact_person,is_campus',
            'items.product:id,name',
        ]);

        $pdf = Pdf::loadView('pdf.order-receipt', [
            'order'    => $order,
            'supplier' => Auth::user()->supplier,
        ]);

        return $pdf->download("receipt-{$order->order_number}.pdf");
    }

    /**
     * Ensure the order belongs to the authenticated supplier.
     */
    private function authorizeSupplier(Order $order): void
    {
        $supplierId = Auth::user()->supplier_id;

        if (!$supplierId || $order->supplier_id !== $supplierId) {
            abort(403, 'This order does not belong to your supplier account.');
        }
    }
}