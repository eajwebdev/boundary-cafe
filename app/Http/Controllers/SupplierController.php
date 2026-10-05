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