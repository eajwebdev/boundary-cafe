import { useCallback, useEffect, useMemo, useState } from 'react';

// ─── Shared types for the customer ordering app ───────────────────────────────

export interface CustomerSession {
    id: number;
    name: string;
    first_name: string;
    contact_number: string | null;
    email: string | null;
    barangay: string | null;
    customer_number: string | null;
    loyalty_points: number;
}

export interface MenuVariant {
    id: number;
    name: string;
    extra_price: number;
    sold_out: boolean;
}

export interface MenuProduct {
    id: number;
    name: string;
    description: string | null;
    image: string | null;
    price: number;
    category_id: number | null;
    category: string | null;
    sold_out: boolean;
    max_quantity: number;
    variants: MenuVariant[];
}

export interface CartLine {
    key: string;
    product_id: number;
    variant_id: number | null;
    name: string;
    variant_name: string | null;
    image: string | null;
    unit_price: number;
    quantity: number;
    note: string;
}

export interface StorefrontPromo {
    id: number;
    name: string;
    description: string | null;
    code: string | null;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    minimum_purchase: number | null;
    applies_to: string;
    banner: string | null;
    expires_at: string | null;
    auto_apply: boolean;
}

export interface SavedAddress {
    id: number;
    label: string;
    barangay: string;
    street: string | null;
    landmark: string | null;
    notes_for_rider: string | null;
    lat: number;
    lng: number;
    formatted_address: string | null;
    is_default: boolean;
    summary: string;
}

export interface DeliveryZone {
    center: { lat: number; lng: number };
    radius_km: number;
    uses_polygon: boolean;
    polygon: [number, number][];
    barangays: { name: string; lat: number | null; lng: number | null }[];
}

export interface StoreStatus {
    is_open: boolean;
    opens_at: string;
    closes_at: string;
    message: string | null;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function peso(n: number | string | null | undefined): string {
    const v = Number(n ?? 0);
    return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

export function pesoExact(n: number | string | null | undefined): string {
    return '₱' + Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

export function manilaTime(iso: string | null | undefined, withDate = false): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        ...(withDate ? { month: 'short', day: 'numeric' } : {}),
    });
}

// ─── JSON requests (CSRF-safe after session regeneration) ─────────────────────

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export async function jsonRequest<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    const res = await fetch(url, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        signal: options.signal,
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            'X-XSRF-TOKEN': xsrfToken(),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
            const data = await res.json();
            message = data?.message ?? (data?.errors ? (Object.values(data.errors)[0] as string[])[0] : message);
        } catch {
            /* non-JSON error */
        }
        throw Object.assign(new Error(message), { status: res.status });
    }
    return res.json() as Promise<T>;
}

// ─── Cart (persisted per customer in localStorage) ────────────────────────────

const CART_VERSION = 1;
const cartKey = (customerId: number | null | undefined) => `bc-cart:v${CART_VERSION}:${customerId ?? 'guest'}`;

function readCart(key: string): CartLine[] {
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.product_id === 'number' && l.quantity > 0) : [];
    } catch {
        return [];
    }
}

function writeCart(key: string, lines: CartLine[]) {
    try {
        window.localStorage.setItem(key, JSON.stringify(lines));
        window.dispatchEvent(new CustomEvent('bc-cart-changed', { detail: key }));
    } catch {
        /* storage blocked — cart stays in memory only */
    }
}

/** Shared cart state. A guest cart is merged into the customer's cart after they log in. */
export function useCart(customerId: number | null | undefined) {
    const key = cartKey(customerId);
    const [lines, setLines] = useState<CartLine[]>(() => (typeof window === 'undefined' ? [] : readCart(key)));

    useEffect(() => {
        let current = readCart(key);
        if (customerId) {
            const guest = readCart(cartKey(null));
            if (guest.length) {
                for (const g of guest) {
                    const existing = current.find((l) => l.key === g.key);
                    current = existing
                        ? current.map((l) => (l.key === g.key ? { ...l, quantity: Math.min(50, l.quantity + g.quantity) } : l))
                        : [...current, g];
                }
                writeCart(key, current);
                try {
                    window.localStorage.removeItem(cartKey(null));
                } catch {
                    /* ignore */
                }
            }
        }
        setLines(current);

        const sync = (e: Event) => {
            if ((e as CustomEvent).detail === key) setLines(readCart(key));
        };
        const storage = (e: StorageEvent) => {
            if (e.key === key) setLines(readCart(key));
        };
        window.addEventListener('bc-cart-changed', sync);
        window.addEventListener('storage', storage);
        return () => {
            window.removeEventListener('bc-cart-changed', sync);
            window.removeEventListener('storage', storage);
        };
    }, [key, customerId]);

    const persist = useCallback((next: CartLine[]) => writeCart(key, next), [key]);

    const add = useCallback(
        (line: Omit<CartLine, 'key'>) => {
            const k = `${line.product_id}-${line.variant_id ?? 'base'}-${line.note.trim().toLowerCase()}`;
            const current = readCart(key);
            const existing = current.find((l) => l.key === k);
            persist(
                existing
                    ? current.map((l) => (l.key === k ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l))
                    : [...current, { ...line, key: k }],
            );
        },
        [key, persist],
    );

    const setQuantity = useCallback(
        (k: string, quantity: number) => {
            const current = readCart(key);
            persist(quantity <= 0 ? current.filter((l) => l.key !== k) : current.map((l) => (l.key === k ? { ...l, quantity: Math.min(50, quantity) } : l)));
        },
        [key, persist],
    );

    const clear = useCallback(() => persist([]), [persist]);

    const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);
    const subtotal = useMemo(() => Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100, [lines]);

    return { lines, add, setQuantity, clear, count, subtotal };
}

export const STATUS_TONE: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    accepted: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
    preparing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300',
    ready: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
    out_for_delivery: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
    completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    cancelled: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
};
