<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\Product;
use App\Models\ProductStock;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class BrochureController extends Controller
{
    public function index(Request $request): Response
    {
        $user     = Auth::user();
        $isAdmin  = $user->isSuperAdmin() || $user->isAdministrator();
        $branchId = $isAdmin && $request->filled('branch_id')
            ? (int) $request->branch_id
            : $user->branch_id;

        // Load all sellable products with their price for the branch
        $products = Product::whereIn('product_type', ['standard', 'made_to_order', 'bundle'])
            ->with(['category:id,name', 'stocks'])
            ->orderBy('name')
            ->get()
            ->map(function (Product $p) use ($branchId) {
                // Prefer branch-specific stock, fall back to first available
                $stock = $branchId
                    ? $p->stocks->firstWhere('branch_id', $branchId)
                    : $p->stocks->first();

                return [
                    'id'          => $p->id,
                    'name'        => $p->name,
                    'barcode'     => $p->barcode,
                    'category'    => $p->category?->name,
                    'price'       => $stock ? (float) $stock->price : 0.00,
                    'product_img' => \App\Models\Product::resolveImageUrl($p->product_img),
                ];
            });

        $branches = $isAdmin
            ? Branch::where('is_active', true)->orderBy('name')->get(['id', 'name'])
            : collect();

        return Inertia::render('Brochure/Index', [
            'products'   => $products,
            'shop_name'  => (string) SystemSetting::get('general.business_name', null, config('app.name')),
            'currency'   => SystemSetting::currencySymbol(),
            'branch_id'  => $branchId,
            'branches'   => $branches,
            'is_admin'   => $isAdmin,
        ]);
    }
}
