<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Validation\Rule;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $suppliers = Supplier::query()
            ->withCount(['orders', 'branches'])
            ->get();                            

        return Inertia::render('Suppliers/Index', [
            'suppliers' => $suppliers,          
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name'           => 'required|string|max:255|unique:suppliers,name',
            'is_campus'      => 'nullable|boolean',
            'phone'          => 'nullable|string|max:50',
            'address'        => 'nullable|string|max:255',
            'contact_person' => 'nullable|string|max:100',
        ], [
            'name.unique' => 'A supplier with this name already exists.',
            'name.required' => 'Please enter a supplier name.',
            'name.max'      => 'The name cannot be longer than 255 characters.',
        ]);

        Supplier::create([
            'name'           => trim($validated['name']),
            'is_campus'      => $validated['is_campus'] ?? false,
            'phone'          => $validated['phone'] ?? null,
            'address'        => $validated['address'] ?? null,
            'contact_person' => $validated['contact_person'] ?? null,
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => 'Supplier created successfully!',
        ]);
    }

    public function update(Request $request, Supplier $supplier)
    {
        $validated = $request->validate([
            'name'           => [
                'required',
                'string',
                'max:255',
                Rule::unique('suppliers', 'name')->ignore($supplier->id),
            ],
            'is_campus'      => 'nullable|boolean',
            'phone'          => 'nullable|string|max:50',
            'address'        => 'nullable|string|max:255',
            'contact_person' => 'nullable|string|max:100',
        ], [
            'name.required' => 'Please enter a supplier name.',
            'name.max'      => 'Name cannot be longer than 255 characters.',
            'name.unique'   => 'A supplier with this name already exists.',
        ]);

        $supplier->update([
            'name'           => trim($validated['name']),
            'is_campus'      => $validated['is_campus'] ?? $supplier->is_campus,
            'phone'          => $validated['phone'] ?? $supplier->phone,
            'address'        => $validated['address'] ?? $supplier->address,
            'contact_person' => $validated['contact_person'] ?? $supplier->contact_person,
        ]);

        return back()->with('message', [
            'type' => 'success',
            'text' => 'Supplier updated successfully!',
        ]);
    }

    public function orders(Supplier $supplier): Response
    {
        $orders = Order::with([
                'items' => fn($q) => $q->with(['product:id,name', 'variant:id,name']),
                'branch.supplier:id,name,phone,address,contact_person,is_campus',
            ])
            ->where('supplier_id', $supplier->id)
            ->latest()
            ->get()
            ->map(fn($order) => [
                'id'             => $order->id,
                'order_number'   => $order->order_number,
                'status'         => $order->status,
                'order_type'     => $order->order_type,
                'payment_method' => $order->payment_method,
                'subtotal'       => $order->subtotal,
                'total'          => $order->total,
                'created_at'     => $order->created_at->format('M d, Y h:i A'),
                'can_manage'     => $order->status === 'pending',
                'buyer_supplier' => $order->branch?->supplier ? [
                    'name'           => $order->branch->supplier->name,
                    'phone'          => $order->branch->supplier->phone,
                    'address'        => $order->branch->supplier->address,
                    'contact_person' => $order->branch->supplier->contact_person,
                    'is_campus'      => $order->branch->supplier->is_campus,
                ] : null,
                'items' => $order->items->map(fn($item) => [
                    'name'     => $item->display_name,
                    'price'    => $item->price,
                    'quantity' => $item->quantity,
                    'total'    => $item->total,
                ]),
            ]);

        return Inertia::render('Suppliers/Orders', [
            'orders'   => $orders,
            'supplier' => $supplier->only(['name', 'is_campus', 'phone', 'address', 'contact_person']),
        ]);
    }

    public function confirmOrder(Order $order)
    {
        if ($order->status !== 'pending') {
            return back()->withErrors(['error' => 'Only pending orders can be confirmed.']);
        }
        $order->update(['status' => 'confirmed']);
        return back()->with('message', ['type' => 'success', 'text' => 'Order confirmed.']);
    }

    public function rejectOrder(Order $order)
    {
        if (!in_array($order->status, ['pending', 'confirmed'])) {
            return back()->withErrors(['error' => 'Order cannot be rejected at this stage.']);
        }
        $order->update(['status' => 'cancelled']);
        return back()->with('message', ['type' => 'success', 'text' => 'Order rejected.']);
    }

    public function markShipped(Order $order)
    {
        if ($order->status !== 'confirmed') {
            return back()->withErrors(['error' => 'Only confirmed orders can be marked as shipped.']);
        }
        $order->update(['status' => 'shipped']);
        return back()->with('message', ['type' => 'success', 'text' => 'Order marked as shipped.']);
    }

    public function completeOrder(Order $order)
    {
        if (!in_array($order->status, ['confirmed', 'shipped'])) {
            return back()->withErrors(['error' => 'Order cannot be completed at this stage.']);
        }
        $order->update(['status' => 'delivered']);
        return back()->with('message', ['type' => 'success', 'text' => 'Order completed.']);
    }

    public function orderReceipt(Order $order)
    {
        return back();
    }

    public function destroy(Supplier $supplier)
    {
        if ($supplier->orders()->exists()) {
            throw ValidationException::withMessages([
                'error' => 'Cannot delete supplier that has associated orders.',
            ]);
        }

        $supplier->delete();

        return back()->with('message', [
            'type' => 'success',
            'text' => 'Supplier deleted successfully!',
        ]);
    }
}