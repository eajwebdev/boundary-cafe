<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Sale;
use App\Models\SystemSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    private function branchId(): ?int
    {
        $user = Auth::user();

        return $user->isAdmin() ? request()->integer('branch_id') ?: $user->branch_id : $user->branch_id;
    }

    public function index(Request $request): Response
    {
        $branchId = $this->branchId();

        $inBranch = fn ($q) => $q->when($branchId, fn ($q) => $q->where(fn ($inner) => $inner->where('branch_id', $branchId)->orWhereNull('branch_id')));
        $unpaidCredit = fn ($q) => $q->where('status', 'completed')->whereIn('payment_status', ['unpaid', 'partial'])->where('balance_due', '>', 0);

        $customers = Customer::query()
            ->select('customers.*')
            ->selectRaw('password IS NOT NULL as has_online_account')
            ->withSum(['sales as total_purchases' => fn ($q) => $q->where('status', 'completed')], 'total')
            ->withSum(['sales as credit_balance' => $unpaidCredit], 'balance_due')
            ->withCount(['sales as transactions_count' => fn ($q) => $q->where('status', 'completed')])
            ->tap($inBranch)
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = $request->search;
                $q->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$s}%")
                    ->orWhere('contact_number', 'like', "%{$s}%")
                    ->orWhere('email', 'like', "%{$s}%"));
            })
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString();

        $owing = Customer::query()
            ->tap($inBranch)
            ->whereHas('sales', $unpaidCredit)
            ->withSum(['sales as credit_balance' => $unpaidCredit], 'balance_due')
            ->orderByDesc('credit_balance')
            ->limit(6)
            ->get(['id', 'name', 'customer_number'])
            ->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'customer_number' => $c->customer_number,
                'credit_balance' => round((float) $c->credit_balance, 2),
            ]);

        $all = Customer::query()->tap($inBranch);

        return Inertia::render('Customers/Index', [
            'customers' => $customers,
            'stats' => [
                'total' => (clone $all)->count(),
                'active' => (clone $all)->where('is_active', true)->count(),
                'online_accounts' => (clone $all)->whereNotNull('password')->count(),
                'loyalty_points' => (int) (clone $all)->sum('loyalty_points'),
                'owing_count' => (clone $all)->whereHas('sales', $unpaidCredit)->count(),
                'credit_outstanding' => round((float) Sale::query()
                    ->whereIn('customer_id', (clone $all)->select('id'))
                    ->tap($unpaidCredit)
                    ->sum('balance_due'), 2),
            ],
            'owing' => $owing,
            'filters' => $request->only('search'),
            'currency' => SystemSetting::currencySymbol(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validateCustomer($request);
        $validated['branch_id'] = Auth::user()->branch_id;
        Customer::create($validated);

        return back()->with('success', 'Customer created.');
    }

    public function update(Request $request, Customer $customer): RedirectResponse
    {
        $this->authorizeCustomer($customer);
        $customer->update($this->validateCustomer($request, $customer));

        return back()->with('success', 'Customer updated.');
    }

    public function destroy(Customer $customer): RedirectResponse
    {
        $this->authorizeCustomer($customer);

        if ($customer->sales()->exists() || $customer->payments()->exists()) {
            $customer->update(['is_active' => false]);

            return back()->with('success', 'Customer has history, so it was archived.');
        }

        $customer->delete();

        return back()->with('success', 'Customer deleted.');
    }

    public function show(Customer $customer): Response
    {
        $this->authorizeCustomer($customer);

        $customer->load(['branch:id,name']);
        $loyaltyTransactions = $customer->loyaltyTransactions()
            ->with(['branch:id,name', 'user:id,fname,lname'])
            ->limit(50)->get()->map(fn ($entry) => [
                'id' => $entry->id, 'type' => $entry->type, 'points' => $entry->points,
                'balance_after' => $entry->balance_after, 'reason' => $entry->reason,
                'created_at' => $entry->created_at?->toIso8601String(), 'branch' => $entry->branch?->name,
                'user' => $entry->user ? trim("{$entry->user->fname} {$entry->user->lname}") : null,
            ]);

        $sales = $customer->sales()
            ->with(['items.product', 'items.variant', 'user:id,fname,lname'])
            ->latest()
            ->paginate(15)
            ->through(fn (Sale $sale) => [
                'id' => $sale->id,
                'receipt_number' => $sale->receipt_number,
                'created_at' => $sale->created_at?->toIso8601String(),
                'total' => (float) $sale->total,
                'amount_paid' => (float) $sale->amount_paid,
                'balance_due' => (float) $sale->balance_due,
                'payment_method' => $sale->payment_method,
                'payment_status' => $sale->payment_status,
                'due_date' => $sale->due_date?->toDateString(),
                'notes' => $sale->credit_notes ?: $sale->notes,
                'cashier' => $sale->user ? trim("{$sale->user->fname} {$sale->user->lname}") : null,
                'items' => $sale->items->map(fn ($item) => [
                    'name' => $item->product?->name ?? '(deleted)',
                    'variant_name' => $item->variant?->name,
                    'qty' => (float) $item->quantity,
                    'total' => (float) $item->total,
                ])->values(),
            ]);

        return Inertia::render('Customers/Show', [
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'contact_number' => $customer->contact_number,
                'email' => $customer->email,
                'address' => $customer->address,
                'notes' => $customer->notes,
                'is_active' => $customer->is_active,
                'total_purchases' => $customer->total_purchases,
                'customer_number' => $customer->customer_number,
                'loyalty_token' => $customer->loyalty_token,
                'loyalty_points' => $customer->loyalty_points,
                'lifetime_points_earned' => $customer->lifetime_points_earned,
                'lifetime_points_redeemed' => $customer->lifetime_points_redeemed,
                'has_online_account' => $customer->hasOnlineAccount(),
                'barangay' => $customer->barangay,
                'last_login_at' => $customer->last_login_at?->toIso8601String(),
                'online_orders_count' => $customer->onlineOrders()->count(),
            ],
            'sales' => $sales,
            'currency' => SystemSetting::currencySymbol(),
            'loyaltyTransactions' => $loyaltyTransactions,
        ]);
    }

    private function validateCustomer(Request $request, ?Customer $customer = null): array
    {
        $request->merge([
            'contact_number' => Customer::normalisePhone($request->input('contact_number')),
            'email' => $request->filled('email') ? strtolower(trim((string) $request->input('email'))) : null,
        ]);

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:40', Rule::unique('customers', 'contact_number')->ignore($customer?->id)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('customers', 'email')->ignore($customer?->id)],
            'address' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function authorizeCustomer(Customer $customer): void
    {
        $user = Auth::user();
        if ($user->isAdmin()) {
            return;
        }
        if ($customer->branch_id && $customer->branch_id !== $user->branch_id) {
            abort(403);
        }
    }
}
