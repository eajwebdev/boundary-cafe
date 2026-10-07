<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\LoyaltyTransaction;
use App\Models\OnlineOrder;
use App\Models\OnlineOrderStatusLog;
use App\Models\Product;
use App\Models\Promo;
use App\Models\User;
use App\Services\SaleService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Demo data for the customer ordering app (idempotent).
 *
 *   • 3 registered customers (password: "password") with Mabinay addresses and points
 *   • 2 storefront promos (one auto-applied with the banner image, one coded)
 *   • online orders in several statuses with full status logs
 */
class OnlineOrderingDemoSeeder extends Seeder
{
    public function run(): void
    {
        $branch = Branch::where('code', 'BC-MAB')->first();
        if (! $branch) {
            $this->command?->warn('BC-MAB branch missing — skipping online ordering demo data.');

            return;
        }

        $customers = $this->customers($branch);
        $this->promos();

        if (OnlineOrder::exists()) {
            $this->command?->info('Online orders already present — demo orders not re-created.');

            return;
        }

        $staff = User::where('username', 'cashier_mab')->first() ?? User::where('role', User::ROLE_ADMINISTRATOR)->first();
        $menu = Product::whereHas('stocks', fn ($q) => $q->where('branch_id', $branch->id))
            ->with(['stocks' => fn ($q) => $q->where('branch_id', $branch->id)])
            ->whereIn('name', ['Fiesta Meal A', 'Boundary Burger', 'Strawberry Sparkle', "Cookies n' Cream", 'Tocino Meal', 'Matcha Latte', 'Barkada Burgers', 'Fresh Calamansi'])
            ->get()->keyBy('name');

        $scenarios = [
            [$customers[0], 'delivery', OnlineOrder::STATUS_COMPLETED, [['Fiesta Meal A', 2], ['Strawberry Sparkle', 2]], 3],
            [$customers[1], 'pickup', OnlineOrder::STATUS_COMPLETED, [['Boundary Burger', 1], ["Cookies n' Cream", 1]], 2],
            [$customers[2], 'delivery', OnlineOrder::STATUS_CANCELLED, [['Barkada Burgers', 1]], 1],
            [$customers[0], 'delivery', OnlineOrder::STATUS_PREPARING, [['Tocino Meal', 1], ['Matcha Latte', 1]], 0],
            [$customers[1], 'delivery', OnlineOrder::STATUS_PENDING, [['Fiesta Meal A', 1], ['Fresh Calamansi', 1]], 0],
        ];

        foreach ($scenarios as [$customer, $type, $status, $lines, $daysAgo]) {
            DB::transaction(fn () => $this->order($branch, $customer, $type, $status, $lines, $daysAgo, $menu, $staff));
        }

        $this->command?->info('Online ordering demo data seeded ('.count($scenarios).' orders).');
    }

    /** @return array<int, Customer> */
    private function customers(Branch $branch): array
    {
        $people = [
            ['Marco Reyes', '09170000002', 'marco@example.test', 'Poblacion', 'Purok 3, near the public market', 9.7362, 122.9271, '1992-'.now()->format('m').'-15'],
            ['Joy Dela Cruz', '09171234567', 'joy@example.test', 'Poblacion', 'Rizal Street', 9.7341, 122.9248, '1995-03-08'],
            ['Paolo Tan', '09181234567', 'paolo@example.test', 'Bato', 'Sitio Proper', 9.7458, 122.9365, null],
        ];

        $result = [];
        foreach ($people as [$name, $phone, $email, $barangay, $street, $lat, $lng, $birthday]) {
            $customer = Customer::updateOrCreate(['contact_number' => $phone], [
                'branch_id' => $branch->id,
                'name' => $name,
                'email' => $email,
                'password' => 'password',
                'barangay' => $barangay,
                'birthday' => $birthday,
                'is_active' => true,
                'loyalty_enabled' => true,
                'notes' => 'Boundary Rewards member (online demo)',
            ]);

            CustomerAddress::firstOrCreate(
                ['customer_id' => $customer->id, 'label' => 'Home'],
                [
                    'barangay' => $barangay, 'street' => $street, 'landmark' => 'Across the barangay hall',
                    'notes_for_rider' => 'Please call when you arrive.', 'lat' => $lat, 'lng' => $lng,
                    'formatted_address' => "{$street}, {$barangay}, Mabinay", 'is_default' => true,
                ]
            );

            // Starting points so redemption can be tried right away.
            if (! LoyaltyTransaction::where('customer_id', $customer->id)->where('type', LoyaltyTransaction::TYPE_ADJUSTMENT)->exists()) {
                $start = 120;
                $customer->increment('loyalty_points', $start);
                $customer->increment('lifetime_points_earned', $start);
                LoyaltyTransaction::create([
                    'customer_id' => $customer->id, 'branch_id' => $branch->id, 'type' => LoyaltyTransaction::TYPE_ADJUSTMENT,
                    'points' => $start, 'balance_after' => $customer->fresh()->loyalty_points, 'reason' => 'Welcome points (demo)',
                ]);
            }

            $result[] = $customer->fresh();
        }

        return $result;
    }

    private function promos(): void
    {
        Promo::updateOrCreate(['name' => 'Barkada Treat'], [
            'code' => null,
            'description' => '10% off orders of ₱500 or more — applied automatically at checkout.',
            'discount_type' => 'percent', 'discount_value' => 10, 'applies_to' => 'all',
            'minimum_purchase' => 500, 'is_active' => true, 'show_on_storefront' => true,
            'banner_image' => file_exists(public_path('uploads/optimized/banner.webp')) ? '/uploads/optimized/banner.webp' : '/uploads/banner.png',
            'channels' => 'both',
        ]);

        Promo::updateOrCreate(['code' => 'WELCOME50'], [
            'name' => 'Welcome ₱50 off',
            'description' => '₱50 off your online order of ₱300 or more. Use code WELCOME50.',
            'discount_type' => 'fixed', 'discount_value' => 50, 'applies_to' => 'all',
            'minimum_purchase' => 300, 'max_uses_per_customer' => 1, 'is_active' => true, 'show_on_storefront' => true,
            'banner_image' => null, 'channels' => 'online',
        ]);
    }

    private function order(Branch $branch, Customer $customer, string $type, string $status, array $lines, int $daysAgo, $menu, ?User $staff): void
    {
        $sales = app(SaleService::class);
        $placedAt = now()->subDays($daysAgo)->setTime(11 + $daysAgo, 15);
        $address = $customer->addresses()->first();

        $items = [];
        $subtotal = 0;
        foreach ($lines as [$name, $qty]) {
            $product = $menu->get($name);
            if (! $product) {
                continue;
            }
            $price = $sales->unitPrice($product, $branch->id);
            $items[] = ['product' => $product, 'price' => $price, 'qty' => $qty, 'total' => round($price * $qty, 2)];
            $subtotal += $price * $qty;
        }
        if (! $items) {
            return;
        }

        $fee = $type === 'delivery' ? 49.0 : 0.0;
        $earn = (int) floor($subtotal / 100);

        $order = OnlineOrder::create([
            'customer_id' => $customer->id, 'branch_id' => $branch->id, 'fulfillment_type' => $type,
            'status' => OnlineOrder::STATUS_PENDING, 'payment_method' => $type === 'pickup' ? 'pay_at_pickup' : 'cod',
            'subtotal' => $subtotal, 'delivery_fee' => $fee, 'total' => $subtotal + $fee, 'loyalty_points_to_earn' => $earn,
            'contact_name' => $customer->name, 'contact_number' => $customer->contact_number,
            'barangay' => $type === 'delivery' ? $address?->barangay : null,
            'street' => $type === 'delivery' ? $address?->street : null,
            'landmark' => $type === 'delivery' ? $address?->landmark : null,
            'notes_for_rider' => $type === 'delivery' ? $address?->notes_for_rider : null,
            'lat' => $type === 'delivery' ? $address?->lat : null,
            'lng' => $type === 'delivery' ? $address?->lng : null,
            'estimated_minutes' => $type === 'delivery' ? 45 : 25,
        ]);
        $order->forceFill(['created_at' => $placedAt, 'updated_at' => $placedAt])->saveQuietly();

        foreach ($items as $i) {
            $order->items()->create([
                'product_id' => $i['product']->id, 'product_name' => $i['product']->name, 'price' => $i['price'],
                'quantity' => $i['qty'], 'total' => $i['total'], 'is_taxable' => true,
            ]);
        }

        $path = match ($status) {
            OnlineOrder::STATUS_COMPLETED => $type === 'pickup'
                ? ['accepted', 'preparing', 'ready', 'completed']
                : ['accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'],
            OnlineOrder::STATUS_PREPARING => ['accepted', 'preparing'],
            OnlineOrder::STATUS_CANCELLED => ['cancelled'],
            default => [],
        };

        $this->log($order, null, 'pending', null, 'customer', 'Order placed online', $placedAt);
        $at = $placedAt->copy();
        $from = 'pending';
        foreach ($path as $step) {
            $at = $at->copy()->addMinutes(match ($step) {
                'accepted' => 3, 'preparing' => 2, 'ready' => 18, 'out_for_delivery' => 4, default => 15
            });
            $isCancel = $step === 'cancelled';
            $updates = ['status' => $step, OnlineOrder::STATUS_TIMESTAMPS[$step] => $at, 'handled_by' => $isCancel ? null : $staff?->id];
            if ($step === 'accepted') {
                $updates['estimated_ready_at'] = $at->copy()->addMinutes($order->estimated_minutes);
            }
            if ($isCancel) {
                $updates += ['cancel_reason' => 'Ordered by mistake', 'cancelled_by' => 'customer'];
            }
            if ($step === 'completed' && $staff) {
                $sale = $sales->recordOnlineOrder($order, $staff, null);
                $sale->forceFill(['created_at' => $at, 'updated_at' => $at])->saveQuietly();
                $order->refresh();
            }
            $order->forceFill($updates + ['updated_at' => $at])->saveQuietly();
            $this->log($order, $from, $step, $isCancel ? null : $staff, $isCancel ? 'customer' : 'staff', $isCancel ? 'Ordered by mistake' : null, $at);
            $from = $step;
        }
    }

    private function log(OnlineOrder $order, ?string $from, string $to, ?User $user, string $actor, ?string $note, $at): void
    {
        OnlineOrderStatusLog::create([
            'online_order_id' => $order->id, 'from_status' => $from, 'to_status' => $to,
            'user_id' => $user?->id, 'actor' => $actor, 'note' => $note, 'created_at' => $at,
        ]);
    }
}
