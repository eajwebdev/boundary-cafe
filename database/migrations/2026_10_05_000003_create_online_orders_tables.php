<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Customer online orders (delivery within Mabinay, or pickup).
     *
     * NOTE: the existing `orders` table holds supplier purchase orders and is
     * intentionally not reused here.
     *
     * Status flow:
     *   pending → accepted → preparing → ready → out_for_delivery → completed
     *   (pickup skips out_for_delivery)
     *   pending → cancelled | rejected,  accepted → cancelled (staff, with reason)
     */
    public function up(): void
    {
        Schema::create('online_orders', function (Blueprint $table) {
            $table->id();
            $table->string('order_number', 30)->unique();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('branch_id')->constrained()->restrictOnDelete();
            $table->string('fulfillment_type', 20)->default('delivery');   // delivery | pickup
            $table->string('status', 30)->default('pending');
            $table->string('payment_method', 30)->default('cod');           // cod | pay_at_pickup (gcash later)
            $table->string('payment_status', 20)->default('unpaid');        // unpaid | paid | refunded

            $table->decimal('subtotal', 12, 2)->default(0);
            $table->foreignId('promo_id')->nullable()->constrained('promos')->nullOnDelete();
            $table->string('promo_label', 120)->nullable();
            $table->decimal('promo_discount', 12, 2)->default(0);
            $table->decimal('vat_amount', 12, 2)->default(0);
            $table->unsignedInteger('loyalty_points_redeemed')->default(0);
            $table->decimal('loyalty_discount', 12, 2)->default(0);
            $table->unsignedInteger('loyalty_points_to_earn')->default(0);
            $table->decimal('delivery_fee', 10, 2)->default(0);
            $table->decimal('total', 12, 2)->default(0);

            // Address snapshot (delivery only) — kept even if the saved address changes later
            $table->string('contact_name', 120);
            $table->string('contact_number', 20);
            $table->string('barangay', 80)->nullable();
            $table->string('street', 191)->nullable();
            $table->string('landmark', 191)->nullable();
            $table->string('notes_for_rider', 255)->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->text('customer_note')->nullable();

            $table->unsignedSmallInteger('estimated_minutes')->nullable();
            $table->timestamp('estimated_ready_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('preparing_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('out_for_delivery_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 255)->nullable();
            $table->string('cancelled_by', 20)->nullable();                 // customer | staff

            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->unique()->constrained('sales')->nullOnDelete();
            $table->timestamps();

            $table->index(['branch_id', 'status']);
            $table->index(['customer_id', 'created_at']);
            $table->index('created_at');
        });

        Schema::create('online_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('online_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('product_name', 191);
            $table->string('variant_name', 120)->nullable();
            $table->decimal('price', 12, 2);
            $table->unsignedInteger('quantity');
            $table->decimal('total', 12, 2);
            $table->boolean('is_taxable')->default(true);
            $table->string('note', 255)->nullable();
            $table->timestamps();
        });

        Schema::create('online_order_status_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('online_order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('actor', 20)->default('staff');                  // staff | customer | system
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['online_order_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('online_order_status_logs');
        Schema::dropIfExists('online_order_items');
        Schema::dropIfExists('online_orders');
    }
};
