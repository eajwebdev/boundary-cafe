<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Branch;
use App\Models\LoyaltyReward;
use App\Models\LoyaltyRewardClaimItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\LoyaltyRewardService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Reward catalog (menu 44): which menu items customers can get for points, and how many points each costs.
 */
class LoyaltyRewardController extends Controller
{
    public function __construct(private LoyaltyRewardService $rewards) {}

    public function index(): Response
    {
        $claimedQuantities = LoyaltyRewardClaimItem::query()
            ->whereHas('claim', fn ($q) => $q->where('status', 'redeemed'))
            ->selectRaw('loyalty_reward_id, SUM(quantity) as quantity')
            ->groupBy('loyalty_reward_id')
            ->pluck('quantity', 'loyalty_reward_id');

        $rewards = LoyaltyReward::with(['product.category:id,name', 'product.stocks', 'variant'])
            ->orderBy('sort_order')->orderBy('points_cost')->get()
            ->map(fn (LoyaltyReward $reward) => $this->rewards->rewardToFrontend($reward) + [
                'sort_order' => $reward->sort_order,
                'product_status' => $reward->product?->status,
                'times_claimed' => (int) ($claimedQuantities[$reward->id] ?? 0),
            ])->values();

        $products = Product::with(['category:id,name', 'stocks', 'variants' => fn ($q) => $q->where('is_available', true)->orderBy('sort_order')])
            ->sellable()->active()->orderBy('name')->get()
            ->map(fn (Product $product) => [
                'id' => $product->id,
                'name' => $product->name,
                'category' => $product->category?->name,
                'image' => Product::resolveImageUrl($product->product_img),
                'price' => (float) ($product->stocks->first()?->price ?? 0),
                'variants' => $product->variants->map(fn (ProductVariant $variant) => ['id' => $variant->id, 'name' => $variant->name])->values(),
            ])->values();

        return Inertia::render('LoyaltyProgram/Rewards', [
            'rewards' => $rewards,
            'products' => $products,
            'branches' => Branch::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $reward = LoyaltyReward::create($data);
        $this->audit($request, 'loyalty_reward_created', $reward, "Added reward {$reward->load('product', 'variant')->displayName()} for {$reward->points_cost} pts");

        return back()->with('success', 'Reward added to the catalog.');
    }

    public function update(Request $request, LoyaltyReward $loyaltyReward): RedirectResponse
    {
        $before = $loyaltyReward->only(['product_id', 'product_variant_id', 'points_cost', 'is_active', 'max_per_claim', 'branch_ids', 'sort_order']);
        $loyaltyReward->update($this->validated($request, $loyaltyReward));
        $this->audit($request, 'loyalty_reward_updated', $loyaltyReward, "Updated reward {$loyaltyReward->load('product', 'variant')->displayName()}", [
            'from' => $before,
            'to' => $loyaltyReward->only(array_keys($before)),
        ]);

        return back()->with('success', 'Reward updated.');
    }

    public function destroy(Request $request, LoyaltyReward $loyaltyReward): RedirectResponse
    {
        $name = $loyaltyReward->load('product', 'variant')->displayName();
        $loyaltyReward->delete();
        $this->audit($request, 'loyalty_reward_deleted', $loyaltyReward, "Removed reward {$name}");

        return back()->with('success', 'Reward removed. Rewards already claimed keep their history.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?LoyaltyReward $existing = null): array
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'points_cost' => ['required', 'integer', 'min:1', 'max:1000000'],
            'is_active' => ['required', 'boolean'],
            'max_per_claim' => ['nullable', 'integer', 'min:1', 'max:'.LoyaltyRewardService::MAX_QUANTITY],
            'branch_ids' => ['nullable', 'array'],
            'branch_ids.*' => ['integer', 'exists:branches,id'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
        ]);

        $product = Product::findOrFail($data['product_id']);
        if ($product->product_type === 'ingredient') {
            throw ValidationException::withMessages(['product_id' => 'Choose a menu item, not an ingredient.']);
        }
        if (! empty($data['product_variant_id']) && ! $product->variants()->whereKey($data['product_variant_id'])->exists()) {
            throw ValidationException::withMessages(['product_variant_id' => "That option does not belong to {$product->name}."]);
        }
        if (empty($data['product_variant_id']) && $product->variants()->where('is_available', true)->exists()) {
            throw ValidationException::withMessages(['product_variant_id' => "Choose which {$product->name} option is the reward."]);
        }

        $duplicate = LoyaltyReward::where('product_id', $data['product_id'])
            ->where('product_variant_id', $data['product_variant_id'] ?? null)
            ->when($existing, fn ($q) => $q->whereKeyNot($existing->id))
            ->exists();
        if ($duplicate) {
            throw ValidationException::withMessages(['product_id' => "{$product->name} is already in the reward catalog."]);
        }

        $data['branch_ids'] = ! empty($data['branch_ids']) ? array_values(array_unique(array_map('intval', $data['branch_ids']))) : null;
        $data['sort_order'] ??= 0;

        return $data;
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function audit(Request $request, string $action, LoyaltyReward $reward, string $description, array $extra = []): void
    {
        ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => $action,
            'subject_type' => LoyaltyReward::class,
            'subject_id' => $reward->id,
            'properties' => ['description' => $description, 'points_cost' => $reward->points_cost] + $extra,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'method' => $request->method(),
            'url' => $request->fullUrl(),
        ]);
    }
}
