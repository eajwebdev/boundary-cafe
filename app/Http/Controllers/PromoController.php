<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Product;
use App\Models\Promo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PromoController extends Controller
{
    // ── Index ──────────────────────────────────────────────────────────────────

    public function index(): Response
    {
        $promos = Promo::with(['products:id,name', 'categories:id,name', 'creator:id,fname,lname'])
            ->latest()
            ->get()
            ->map(fn (Promo $p) => $this->mapPromo($p));

        return Inertia::render('Promos/Index', [
            'promos'     => $promos,
            'products'   => Product::orderBy('name')->get(['id', 'name', 'product_type']),
            'categories' => Category::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    // ── Store ──────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name'             => ['required', 'string', 'max:255'],
            'code'             => ['nullable', 'string', 'max:50', 'unique:promos,code'],
            'description'      => ['nullable', 'string', 'max:1000'],
            'discount_type'    => ['required', 'in:percent,fixed'],
            'discount_value'   => ['required', 'numeric', 'min:0.01'],
            'applies_to'       => ['required', 'in:all,specific_products,specific_categories'],
            'product_ids'      => ['nullable', 'array'],
            'product_ids.*'    => ['exists:products,id'],
            'category_ids'     => ['nullable', 'array'],
            'category_ids.*'   => ['exists:categories,id'],
            'minimum_purchase' => ['nullable', 'numeric', 'min:0'],
            'max_uses'         => ['nullable', 'integer', 'min:1'],
            'starts_at'        => ['nullable', 'date'],
            'expires_at'       => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active'        => ['nullable', 'boolean'],
        ], [
            'code.unique'              => 'This promo code is already taken.',
            'discount_value.min'       => 'Discount must be greater than zero.',
            'expires_at.after_or_equal'=> 'Expiry must be on or after the start date.',
        ]);

        // Percent discount cannot exceed 100
        if ($validated['discount_type'] === 'percent' && $validated['discount_value'] > 100) {
            return back()->withErrors(['discount_value' => 'Percent discount cannot exceed 100%.']);
        }

        $promo = Promo::create([
            'name'             => trim($validated['name']),
            'code'             => $validated['code'] ? strtoupper(trim($validated['code'])) : null,
            'description'      => $validated['description'] ?? null,
            'discount_type'    => $validated['discount_type'],
            'discount_value'   => $validated['discount_value'],
            'applies_to'       => $validated['applies_to'],
            'minimum_purchase' => $validated['minimum_purchase'] ?? null,
            'max_uses'         => $validated['max_uses'] ?? null,
            'starts_at'        => $validated['starts_at'] ?? null,
            'expires_at'       => $validated['expires_at'] ?? null,
            'is_active'        => $validated['is_active'] ?? true,
            'created_by'       => auth()->id(),
        ]);

        // Attach products / categories
        if ($validated['applies_to'] === 'specific_products' && ! empty($validated['product_ids'])) {
            $promo->products()->sync($validated['product_ids']);
        }
        if ($validated['applies_to'] === 'specific_categories' && ! empty($validated['category_ids'])) {
            $promo->categories()->sync($validated['category_ids']);
        }

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'promo_created',
            'subject_type' => Promo::class,
            'subject_id'   => $promo->id,
            'properties'   => ['name' => $promo->name, 'code' => $promo->code, 'ip' => $request->ip()],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Promo created successfully.']);
    }

    // ── Update ─────────────────────────────────────────────────────────────────

    public function update(Request $request, Promo $promo): RedirectResponse
    {
        $validated = $request->validate([
            'name'             => ['required', 'string', 'max:255'],
            'code'             => ['nullable', 'string', 'max:50', Rule::unique('promos', 'code')->ignore($promo->id)],
            'description'      => ['nullable', 'string', 'max:1000'],
            'discount_type'    => ['required', 'in:percent,fixed'],
            'discount_value'   => ['required', 'numeric', 'min:0.01'],
            'applies_to'       => ['required', 'in:all,specific_products,specific_categories'],
            'product_ids'      => ['nullable', 'array'],
            'product_ids.*'    => ['exists:products,id'],
            'category_ids'     => ['nullable', 'array'],
            'category_ids.*'   => ['exists:categories,id'],
            'minimum_purchase' => ['nullable', 'numeric', 'min:0'],
            'max_uses'         => ['nullable', 'integer', 'min:1'],
            'starts_at'        => ['nullable', 'date'],
            'expires_at'       => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active'        => ['nullable', 'boolean'],
        ], [
            'code.unique'              => 'This promo code is already taken.',
            'expires_at.after_or_equal'=> 'Expiry must be on or after the start date.',
        ]);

        if ($validated['discount_type'] === 'percent' && $validated['discount_value'] > 100) {
            return back()->withErrors(['discount_value' => 'Percent discount cannot exceed 100%.']);
        }

        $promo->update([
            'name'             => trim($validated['name']),
            'code'             => $validated['code'] ? strtoupper(trim($validated['code'])) : null,
            'description'      => $validated['description'] ?? null,
            'discount_type'    => $validated['discount_type'],
            'discount_value'   => $validated['discount_value'],
            'applies_to'       => $validated['applies_to'],
            'minimum_purchase' => $validated['minimum_purchase'] ?? null,
            'max_uses'         => $validated['max_uses'] ?? null,
            'starts_at'        => $validated['starts_at'] ?? null,
            'expires_at'       => $validated['expires_at'] ?? null,
            'is_active'        => $validated['is_active'] ?? $promo->is_active,
        ]);

        // Re-sync pivot tables
        if ($validated['applies_to'] === 'specific_products') {
            $promo->products()->sync($validated['product_ids'] ?? []);
            $promo->categories()->detach();
        } elseif ($validated['applies_to'] === 'specific_categories') {
            $promo->categories()->sync($validated['category_ids'] ?? []);
            $promo->products()->detach();
        } else {
            $promo->products()->detach();
            $promo->categories()->detach();
        }

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'promo_updated',
            'subject_type' => Promo::class,
            'subject_id'   => $promo->id,
            'properties'   => ['name' => $promo->name, 'code' => $promo->code, 'ip' => $request->ip()],
        ]);

        return back()->with('message', ['type' => 'success', 'text' => 'Promo updated.']);
    }

    // ── Toggle active ──────────────────────────────────────────────────────────

    public function toggle(Promo $promo): RedirectResponse
    {
        $promo->update(['is_active' => ! $promo->is_active]);
        $label = $promo->is_active ? 'activated' : 'deactivated';
        return back()->with('message', ['type' => 'success', 'text' => "Promo {$label}."]);
    }

    // ── Destroy ────────────────────────────────────────────────────────────────

    public function destroy(Request $request, Promo $promo): RedirectResponse
    {
        $promo->products()->detach();
        $promo->categories()->detach();

        ActivityLog::create([
            'user_id'      => auth()->id(),
            'action'       => 'promo_deleted',
            'subject_type' => Promo::class,
            'subject_id'   => $promo->id,
            'properties'   => ['name' => $promo->name, 'code' => $promo->code, 'ip' => $request->ip()],
        ]);

        $promo->delete();

        return back()->with('message', ['type' => 'success', 'text' => 'Promo deleted.']);
    }

    // ── Apply promo code (JSON — called from POS) ──────────────────────────────

    public function apply(Request $request): JsonResponse
    {
        $request->validate([
            'code'     => ['required', 'string'],
            'subtotal' => ['required', 'numeric', 'min:0'],
        ]);

        $promo = Promo::with(['products:id', 'categories:id'])
            ->active()
            ->byCode($request->input('code'))
            ->first();

        if (! $promo) {
            return response()->json(['valid' => false, 'message' => 'Invalid or expired promo code.'], 422);
        }

        $subtotal = (float) $request->input('subtotal');
        $discount = $promo->computeDiscount($subtotal);

        return response()->json([
            'valid'          => true,
            'promo_id'       => $promo->id,
            'name'           => $promo->name,
            'code'           => $promo->code,
            'discount_type'  => $promo->discount_type,
            'discount_value' => (float) $promo->discount_value,
            'discount_amount'=> $discount,
            'final_total'    => round($subtotal - $discount, 2),
            'message'        => "Promo applied: {$promo->name} (−₱" . number_format($discount, 2) . ")",
        ]);
    }

    // ── Helper ─────────────────────────────────────────────────────────────────

    private function mapPromo(Promo $p): array
    {
        return [
            'id'               => $p->id,
            'name'             => $p->name,
            'code'             => $p->code,
            'description'      => $p->description,
            'discount_type'    => $p->discount_type,
            'discount_value'   => (float) $p->discount_value,
            'applies_to'       => $p->applies_to,
            'minimum_purchase' => $p->minimum_purchase ? (float) $p->minimum_purchase : null,
            'max_uses'         => $p->max_uses,
            'uses_count'       => $p->uses_count,
            'starts_at'        => $p->starts_at?->toDateTimeString(),
            'expires_at'       => $p->expires_at?->toDateTimeString(),
            'is_active'        => $p->is_active,
            'status'           => $p->status,
            'status_label'     => $p->status_label,
            'product_ids'      => $p->products->pluck('id')->values(),
            'product_names'    => $p->products->pluck('name')->values(),
            'category_ids'     => $p->categories->pluck('id')->values(),
            'category_names'   => $p->categories->pluck('name')->values(),
            'created_by'       => $p->creator ? trim("{$p->creator->fname} {$p->creator->lname}") : null,
            'created_at'       => $p->created_at?->toIso8601String(),
        ];
    }
}