<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Sale;
use App\Models\SystemSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
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

        $customers = Customer::query()
            ->withSum(['sales as total_purchases' => fn ($q) => $q->where('status', 'completed')], 'total')
            ->withSum(['sales as credit_balance' => fn ($q) => $q->where('status', 'completed')->whereIn('payment_status', ['unpaid', 'partial'])], 'balance_due')
            ->withCount(['sales as transactions_count' => fn ($q) => $q->where('status', 'completed')])
            ->when($branchId, fn ($q) => $q->where(fn ($inner) => $inner->where('branch_id', $branchId)->orWhereNull('branch_id')))
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

        return Inertia::render('Customers/Index', [
            'customers' => $customers,
            'filters'   => $request->only('search'),
            'currency'  => SystemSetting::currencySymbol(),
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
                'id'              => $sale->id,
                'receipt_number'  => $sale->receipt_number,
                'created_at'      => $sale->created_at?->toIso8601String(),
                'total'           => (float) $sale->total,
                'amount_paid'     => (float) $sale->amount_paid,
                'balance_due'     => (float) $sale->balance_due,
                'payment_method'  => $sale->payment_method,
                'payment_status'  => $sale->payment_status,
                'due_date'        => $sale->due_date?->toDateString(),
                'notes'           => $sale->credit_notes ?: $sale->notes,
                'cashier'         => $sale->user ? trim("{$sale->user->fname} {$sale->user->lname}") : null,
                'items'           => $sale->items->map(fn ($item) => [
                    'name' => $item->product?->name ?? '(deleted)',
                    'variant_name' => $item->variant?->name,
                    'qty' => (float) $item->quantity,
                    'total' => (float) $item->total,
                ])->values(),
            ]);

        $payments = $customer->payments()
            ->with(['sale:id,receipt_number', 'receivedBy:id,fname,lname'])
            ->latest('payment_date')
            ->latest()
            ->get()
            ->map(fn (CustomerPayment $payment) => [
                'id'             => $payment->id,
                'sale_id'        => $payment->sale_id,
                'receipt_number' => $payment->sale?->receipt_number,
                'payment_date'   => $payment->payment_date?->toDateString(),
                'amount'         => (float) $payment->amount,
                'payment_method' => $payment->payment_method,
                'notes'          => $payment->notes,
                'received_by'    => $payment->receivedBy ? trim("{$payment->receivedBy->fname} {$payment->receivedBy->lname}") : null,
            ]);

        $openCredits = $customer->sales()
            ->where('status', 'completed')
            ->where('balance_due', '>', 0)
            ->orderByRaw('due_date IS NULL, due_date ASC')
            ->get(['id', 'receipt_number', 'total', 'amount_paid', 'balance_due', 'payment_status', 'due_date']);

        $ledger = collect()
            ->merge($customer->sales()->where('status', 'completed')->get()->map(fn ($sale) => [
                'date' => $sale->created_at?->toDateString(),
                'type' => 'credit',
                'reference' => $sale->receipt_number,
                'debit' => (float) $sale->total,
                'credit' => 0,
                'balance' => (float) $sale->balance_due,
                'notes' => $sale->credit_notes ?: $sale->notes,
            ]))
            ->merge($customer->payments()->get()->map(fn ($payment) => [
                'date' => $payment->payment_date?->toDateString(),
                'type' => 'payment',
                'reference' => $payment->sale?->receipt_number,
                'debit' => 0,
                'credit' => (float) $payment->amount,
                'balance' => null,
                'notes' => $payment->notes,
            ]))
            ->sortByDesc('date')
            ->values();

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
                'credit_balance' => $customer->credit_balance,
                'payments_total' => (float) $customer->payments()->sum('amount'),
                'customer_number' => $customer->customer_number,
                'loyalty_token' => $customer->loyalty_token,
                'loyalty_points' => $customer->loyalty_points,
                'lifetime_points_earned' => $customer->lifetime_points_earned,
                'lifetime_points_redeemed' => $customer->lifetime_points_redeemed,
            ],
            'sales'       => $sales,
            'payments'    => $payments,
            'openCredits' => $openCredits,
            'ledger'      => $ledger,
            'currency'    => SystemSetting::currencySymbol(),
            'loyaltyTransactions' => $loyaltyTransactions,
        ]);
    }

    public function pay(Request $request, Customer $customer): RedirectResponse
    {
        $this->authorizeCustomer($customer);

        $validated = $request->validate([
            'sale_id'        => ['nullable', 'exists:sales,id'],
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(['cash', 'gcash', 'card', 'bank', 'others'])],
            'payment_date'   => ['nullable', 'date'],
            'notes'          => ['nullable', 'string', 'max:500'],
        ]);

        try {
            DB::transaction(function () use ($customer, $validated) {
                $remaining = round((float) $validated['amount'], 2);
                $date = $validated['payment_date'] ?? today()->toDateString();

                $sales = $customer->sales()
                    ->where('status', 'completed')
                    ->where('balance_due', '>', 0)
                    ->when(! empty($validated['sale_id']), fn ($q) => $q->where('id', $validated['sale_id']))
                    ->orderByRaw('due_date IS NULL, due_date ASC')
                    ->orderBy('created_at')
                    ->lockForUpdate()
                    ->get();

                if ($sales->isEmpty()) {
                    throw new \RuntimeException('No open customer balance found.');
                }

                foreach ($sales as $sale) {
                    if ($remaining <= 0) break;

                    $applied = min($remaining, (float) $sale->balance_due);
                    CustomerPayment::create([
                        'customer_id'    => $customer->id,
                        'sale_id'        => $sale->id,
                        'branch_id'      => $sale->branch_id,
                        'received_by'    => Auth::id(),
                        'amount'         => $applied,
                        'payment_method' => $validated['payment_method'],
                        'payment_date'   => $date,
                        'notes'          => $validated['notes'] ?? null,
                    ]);

                    $sale->amount_paid = round((float) $sale->amount_paid + $applied, 2);
                    $sale->refreshPaymentStatus();
                    $remaining = round($remaining - $applied, 2);
                }
            });
        } catch (\RuntimeException $e) {
            return back()->withErrors(['error' => $e->getMessage()]);
        }

        return back()->with('success', 'Customer payment recorded.');
    }

    private function validateCustomer(Request $request, ?Customer $customer = null): array
    {
        return $request->validate([
            'name'           => ['required', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:40'],
            'email'          => ['nullable', 'email', 'max:255'],
            'address'        => ['nullable', 'string', 'max:1000'],
            'notes'          => ['nullable', 'string', 'max:1000'],
            'is_active'      => ['sometimes', 'boolean'],
        ]);
    }

    private function authorizeCustomer(Customer $customer): void
    {
        $user = Auth::user();
        if ($user->isAdmin()) return;
        if ($customer->branch_id && $customer->branch_id !== $user->branch_id) abort(403);
    }
}
