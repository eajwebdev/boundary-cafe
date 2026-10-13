// Shared types for POS Index and layout components

export interface Variant {
    id: number;
    name: string;
    extra_price: number;
    attributes: Record<string, string>;
    is_available: boolean;
    stock: number;
}

export interface BundleItem {
    name: string;
    qty: number;
    required: boolean;
}
export interface RecipeItem {
    name: string;
    quantity: number;
    unit: string;
}

export interface Product {
    id: number;
    name: string;
    unit?: string;
    barcode: string | null;
    product_img: string | null;
    product_type: string;
    description?: string | null;
    duration_minutes?: number | null;
    status?: string | null;
    price: number;
    stock: number;
    category: { id: number; name: string } | null;
    variants: Variant[];
    has_variants: boolean;
    bundle_items: BundleItem[] | null;
    recipe_items: RecipeItem[] | null;
}

export interface Category {
    id: number;
    name: string;
}

export interface CartItem {
    key: string;
    product_id: number;
    variant_id: number | null;
    name: string;
    unit?: string;
    barcode?: string | null;
    product_img?: string | null;
    variant_name: string | null;
    price: number;
    qty: number;
    stock: number;
    product_type: string;
    bundle_items: BundleItem[] | null;
    recipe_items: RecipeItem[] | null;
}

export interface ActivePromo {
    id: number;
    name: string;
    code: string | null;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    applies_to: 'all' | 'specific_products' | 'specific_categories';
    minimum_purchase: number | null;
    product_ids: number[];
    category_ids: number[];
    expires_at: string | null;
}

/** A scanned reward QR waiting in the order (PosController::scanReward → LoyaltyRewardService::claimToPos). */
export interface RewardClaimInCart {
    code: string;
    points: number;
    expires_at: string;
    customer: { id: number; name: string; customer_number: string; contact_number: string | null; loyalty_points: number };
    items: {
        product_id: number;
        variant_id: number | null;
        name: string;
        quantity: number;
        points: number;
        image: string | null;
        retail_price: number;
    }[];
}

/** A member identified by scanning their loyalty card or looking up their mobile number. */
export interface LinkedMember {
    id: number;
    name: string;
    customer_number: string;
    contact_number: string | null;
    points: number;
    reserved_points: number;
    /** Today's daily mission, when the member got one. */
    mission?: DailyMission | null;
}

export interface CustomerOption {
    id: number;
    name: string;
    contact_number: string | null;
    email: string | null;
    /** Removed with the credit/utang module — may be absent. */
    credit_balance?: number;
    customer_number: string;
    loyalty_points: number;
}

// Helper to identify weighted / per-kg products (Rice, Feeds, Grains, etc.)
export const isWeightedKgItem = (unit?: string | null, name?: string | null): boolean => {
    const u = (unit || '').trim().toLowerCase();
    if (u === 'kg' || u === 'kilo' || u === 'kilogram') return true;
    if (u === 'sack' || u === 'bag' || u === 'pc' || u === 'pack' || u === 'can' || u === 'bottle' || u === 'box') return false;
    const n = (name || '').toLowerCase();
    if (n.includes('sack') || n.includes('bag') || n.includes('pack') || n.includes('can') || n.includes('bottle')) return false;
    return n.includes('rice') || n.includes('feed') || n.includes('palay') || n.includes('corn') || n.includes('grain');
};

/** A member's mission for today (DailyMissionService::toFrontend). */
export interface DailyMission {
    id: number;
    title: string;
    type: 'spend' | 'items' | 'category';
    target: number;
    reward_points: number;
    progress: number;
    percent: number;
    progress_label: string;
    remaining_label: string;
    category: string | null;
    completed: boolean;
    completed_at: string | null;
    ends_at: string;
}
