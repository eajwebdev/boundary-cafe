'use client';

import { Head, usePage, router } from '@inertiajs/react';
import { format } from 'date-fns';
import {
    Plus,
    Search,
    X,
    Edit2,
    Trash2,
    AlertTriangle,
    Tag,
    Percent,
    DollarSign,
    Users,
    CheckCircle,
    XCircle,
    Clock,
    CalendarX,
    Ticket,
    Trophy,
} from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Chip, controlCls, PageHeader, Panel, Stat, StatStrip } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
    id: number;
    name: string;
    product_type: string;
}
interface Category {
    id: number;
    name: string;
}

interface Promo {
    id: number;
    name: string;
    code: string | null;
    description: string | null;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    applies_to: 'all' | 'specific_products' | 'specific_categories';
    minimum_purchase: number | null;
    max_uses: number | null;
    max_uses_per_customer: number | null;
    uses_count: number;
    starts_at: string | null;
    expires_at: string | null;
    is_active: boolean;
    show_on_storefront: boolean;
    channels: 'pos' | 'online' | 'both';
    banner_image: string | null;
    banner_url: string | null;
    status: string;
    status_label: string;
    product_ids: number[];
    product_names: string[];
    category_ids: number[];
    category_names: string[];
    created_by: string | null;
    created_at: string;
}

interface PromoForm {
    name: string;
    code: string;
    description: string;
    discount_type: 'percent' | 'fixed';
    discount_value: string;
    applies_to: 'all' | 'specific_products' | 'specific_categories';
    product_ids: number[];
    category_ids: number[];
    minimum_purchase: string;
    max_uses: string;
    max_uses_per_customer: string;
    starts_at: string;
    expires_at: string;
    is_active: boolean;
    show_on_storefront: boolean;
    channels: 'pos' | 'online' | 'both';
    banner_image: string;
    banner_upload: File | null;
    remove_banner: boolean;
}

interface PageProps {
    bannerChoices?: string[];
    promos: Promo[];
    products: Product[];
    categories: Category[];
    flash?: { message?: { type: string; text: string } };
    [key: string]: unknown;
}

const EMPTY_FORM: PromoForm = {
    name: '',
    code: '',
    description: '',
    discount_type: 'percent',
    discount_value: '',
    applies_to: 'all',
    product_ids: [],
    category_ids: [],
    minimum_purchase: '',
    max_uses: '',
    max_uses_per_customer: '',
    starts_at: '',
    expires_at: '',
    is_active: true,
    show_on_storefront: false,
    channels: 'both',
    banner_image: '',
    banner_upload: null,
    remove_banner: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inp =
    'w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all';

const statusBadge: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
    inactive: 'bg-muted text-muted-foreground border border-border',
    expired: 'bg-red-500/15 text-red-500 border border-red-500/25',
    scheduled: 'bg-blue-500/15 text-blue-500 border border-blue-500/25',
    exhausted: 'bg-amber-500/15 text-amber-500 border border-amber-500/25',
};

const statusIcon: Record<string, React.ElementType> = {
    active: CheckCircle,
    inactive: XCircle,
    expired: XCircle,
    scheduled: Clock,
    exhausted: Users,
};

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="mb-1.5 block text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</label>
            {children}
            {hint && !error && <p className="mt-1 text-xs text-muted-foreground/60">{hint}</p>}
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
    );
}

// ─── Promo Drawer ─────────────────────────────────────────────────────────────

function PromoDrawer({
    mode,
    promo,
    products,
    categories,
    onClose,
    bannerChoices = [],
}: {
    mode: 'create' | 'edit';
    promo: Promo | null;
    products: Product[];
    categories: Category[];
    onClose: () => void;
    bannerChoices?: string[];
}) {
    const [form, setForm] = useState<PromoForm>(EMPTY_FORM);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'details' | 'scope' | 'limits'>('details');
    const [prodSearch, setProdSearch] = useState('');

    useEffect(() => {
        if (promo && mode === 'edit') {
            setForm({
                name: promo.name,
                code: promo.code ?? '',
                description: promo.description ?? '',
                discount_type: promo.discount_type,
                discount_value: promo.discount_value.toString(),
                applies_to: promo.applies_to,
                product_ids: promo.product_ids,
                category_ids: promo.category_ids,
                minimum_purchase: promo.minimum_purchase?.toString() ?? '',
                max_uses: promo.max_uses?.toString() ?? '',
                max_uses_per_customer: promo.max_uses_per_customer?.toString() ?? '',
                starts_at: promo.starts_at ? promo.starts_at.slice(0, 16) : '',
                expires_at: promo.expires_at ? promo.expires_at.slice(0, 16) : '',
                is_active: promo.is_active,
                show_on_storefront: promo.show_on_storefront ?? false,
                channels: promo.channels ?? 'both',
                banner_image: promo.banner_image ?? '',
                banner_upload: null,
                remove_banner: false,
            });
        } else {
            setForm(EMPTY_FORM);
        }
        setErrors({});
        setTab('details');
        setProdSearch('');
    }, [promo, mode]);

    const set = <K extends keyof PromoForm>(k: K, v: PromoForm[K]) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((e) => ({ ...e, [k]: '' }));
    };

    const toggleProduct = (id: number) => {
        set('product_ids', form.product_ids.includes(id) ? form.product_ids.filter((x) => x !== id) : [...form.product_ids, id]);
    };

    const toggleCategory = (id: number) => {
        set('category_ids', form.category_ids.includes(id) ? form.category_ids.filter((x) => x !== id) : [...form.category_ids, id]);
    };

    const handleSubmit = () => {
        setLoading(true);
        setErrors({});
        const payload = {
            ...form,
            code: form.code.trim().toUpperCase() || null,
            minimum_purchase: form.minimum_purchase || null,
            max_uses: form.max_uses || null,
            max_uses_per_customer: form.max_uses_per_customer || null,
            starts_at: form.starts_at || null,
            expires_at: form.expires_at || null,
            banner_image: form.banner_image || null,
            banner_upload: form.banner_upload ?? undefined,
        };
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                setLoading(false);
                onClose();
            },
            onError: (e: Record<string, string>) => {
                setErrors(e);
                setLoading(false);
                setTab('details');
            },
        };
        // File uploads need multipart; PATCH is spoofed through POST for that case.
        const withFile = { ...opts, forceFormData: !!form.banner_upload };
        if (mode === 'create') {
            router.post(routes.promos.store(), payload, withFile);
        } else if (form.banner_upload) {
            router.post(routes.promos.update(promo!.id), { ...payload, _method: 'patch' }, withFile);
        } else {
            router.patch(routes.promos.update(promo!.id), payload, opts);
        }
    };

    // Preview discount
    const previewDiscount = () => {
        const val = parseFloat(form.discount_value) || 0;
        if (!val) return null;
        return form.discount_type === 'percent' ? `${val}% off` : `₱${val.toFixed(2)} off`;
    };

    const filteredProducts = products.filter((p) => !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()));

    const TABS = [
        { key: 'details' as const, label: 'Promo Details' },
        { key: 'scope' as const, label: 'Applies To' },
        { key: 'limits' as const, label: 'Limits & Dates' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[540px]">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="font-bold text-foreground">{mode === 'create' ? 'Create Promo' : `Edit — ${promo?.name}`}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {mode === 'create' ? 'Set up a discount or promo code' : 'Update promo settings'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex shrink-0 border-b border-border">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={cn(
                                'flex-1 py-2.5 text-xs font-semibold transition-colors',
                                tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* ── Details tab ──────────────────────────────────── */}
                    {tab === 'details' && (
                        <div className="space-y-4">
                            <Field label="Promo Name *" error={errors.name}>
                                <Input
                                    value={form.name}
                                    onChange={(e) => set('name', e.target.value)}
                                    placeholder="e.g. Summer Sale, Buy 1 Get 1"
                                    className="mt-1 h-9"
                                />
                            </Field>

                            {/* Promo code */}
                            <Field label="Promo Code" error={errors.code} hint="Optional. Customers enter this at checkout (e.g. SAVE20).">
                                <div className="relative mt-1">
                                    <Tag className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={form.code}
                                        onChange={(e) => set('code', e.target.value.toUpperCase())}
                                        placeholder="SUMMER20 — leave blank for automatic"
                                        className={cn('h-9 pl-9 font-mono tracking-widest', errors.code && 'border-destructive')}
                                    />
                                </div>
                            </Field>

                            {/* Discount type + value */}
                            <Field label="Discount *" error={errors.discount_value}>
                                <div className="mt-1 flex gap-2">
                                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
                                        {(['percent', 'fixed'] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => set('discount_type', t)}
                                                className={cn(
                                                    'flex h-9 items-center gap-1.5 px-3.5 text-xs font-bold transition-colors',
                                                    form.discount_type === t
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'text-muted-foreground hover:bg-muted',
                                                )}
                                            >
                                                {t === 'percent' ? <Percent className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />}
                                                {t === 'percent' ? '%' : '₱'}
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        max={form.discount_type === 'percent' ? 100 : undefined}
                                        value={form.discount_value}
                                        onChange={(e) => set('discount_value', e.target.value)}
                                        placeholder={form.discount_type === 'percent' ? '20' : '50.00'}
                                        className={cn('h-9', errors.discount_value && 'border-destructive')}
                                    />
                                </div>
                                {previewDiscount() && (
                                    <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                                        <Tag className="h-3 w-3" />
                                        <span>{previewDiscount()} discount</span>
                                    </div>
                                )}
                            </Field>

                            {/* Description */}
                            <Field label="Description" error={errors.description}>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => set('description', e.target.value)}
                                    rows={2}
                                    placeholder="Optional notes about this promo"
                                    className={inp + ' mt-1 resize-none'}
                                />
                            </Field>

                            {/* Active toggle */}
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors select-none hover:bg-muted/30">
                                <div
                                    className={cn(
                                        'relative h-5 w-10 shrink-0 rounded-full transition-colors',
                                        form.is_active ? 'bg-primary' : 'bg-muted',
                                    )}
                                    onClick={() => set('is_active', !form.is_active)}
                                >
                                    <div
                                        className={cn(
                                            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                                            form.is_active ? 'translate-x-5' : 'translate-x-0.5',
                                        )}
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">Active</p>
                                    <p className="text-xs text-muted-foreground">Inactive promos cannot be applied at checkout</p>
                                </div>
                            </label>

                            {/* Channel & customer storefront */}
                            <div className="space-y-3 rounded-xl border border-border p-3">
                                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Where it works</p>
                                <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                                    {(
                                        [
                                            ['both', 'POS + Online'],
                                            ['pos', 'POS only'],
                                            ['online', 'Online only'],
                                        ] as const
                                    ).map(([v, l]) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => set('channels', v)}
                                            className={cn(
                                                'h-8 rounded-md text-xs font-semibold',
                                                form.channels === v ? 'bg-background shadow-sm' : 'text-muted-foreground',
                                            )}
                                        >
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                <label className="flex cursor-pointer items-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 accent-primary"
                                        checked={form.show_on_storefront}
                                        disabled={form.channels === 'pos'}
                                        onChange={(e) => set('show_on_storefront', e.target.checked)}
                                    />
                                    <span>
                                        <span className="block text-sm font-medium">Show on the customer ordering site</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Appears in the “Deals for you” banners immediately. Without a code it is applied automatically at online
                                            checkout.
                                        </span>
                                    </span>
                                </label>
                                {form.show_on_storefront && form.channels !== 'pos' && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-semibold text-muted-foreground">Banner image</p>
                                        {(form.banner_upload || form.banner_image) && !form.remove_banner && (
                                            <div className="relative overflow-hidden rounded-lg border border-border">
                                                <img
                                                    src={form.banner_upload ? URL.createObjectURL(form.banner_upload) : form.banner_image}
                                                    alt="Banner preview"
                                                    className="h-28 w-full object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        set('banner_upload', null);
                                                        set('banner_image', '');
                                                        set('remove_banner', true);
                                                    }}
                                                    className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0] ?? null;
                                                set('banner_upload', f);
                                                if (f) set('remove_banner', false);
                                            }}
                                            className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-foreground"
                                        />
                                        {errors.banner_upload && <p className="text-xs text-destructive">{errors.banner_upload}</p>}
                                        {bannerChoices.length > 0 && (
                                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                                                {bannerChoices.map((src) => (
                                                    <button
                                                        key={src}
                                                        type="button"
                                                        onClick={() => {
                                                            set('banner_image', src);
                                                            set('banner_upload', null);
                                                            set('remove_banner', false);
                                                        }}
                                                        className={cn(
                                                            'h-12 w-20 shrink-0 overflow-hidden rounded-md border-2',
                                                            form.banner_image === src && !form.banner_upload
                                                                ? 'border-primary'
                                                                : 'border-transparent',
                                                        )}
                                                        title={src}
                                                    >
                                                        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Scope tab ─────────────────────────────────────── */}
                    {tab === 'scope' && (
                        <div className="space-y-4">
                            <Field label="Applies To" error={errors.applies_to}>
                                <div className="mt-1 space-y-2">
                                    {(
                                        [
                                            { val: 'all', label: 'All products', desc: 'Applies to every product in the cart' },
                                            { val: 'specific_products', label: 'Specific products', desc: 'Only applies to products you select' },
                                            {
                                                val: 'specific_categories',
                                                label: 'Specific categories',
                                                desc: 'Only applies to products in selected categories',
                                            },
                                        ] as const
                                    ).map((opt) => (
                                        <button
                                            key={opt.val}
                                            type="button"
                                            onClick={() => set('applies_to', opt.val)}
                                            className={cn(
                                                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                                                form.applies_to === opt.val ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                                                    form.applies_to === opt.val ? 'border-primary' : 'border-border',
                                                )}
                                            >
                                                {form.applies_to === opt.val && <div className="h-2 w-2 rounded-full bg-primary" />}
                                            </div>
                                            <div>
                                                <p
                                                    className={cn(
                                                        'text-sm font-semibold',
                                                        form.applies_to === opt.val ? 'text-primary' : 'text-foreground',
                                                    )}
                                                >
                                                    {opt.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{opt.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Field>

                            {/* Product selector */}
                            {form.applies_to === 'specific_products' && (
                                <Field label={`Select Products (${form.product_ids.length} selected)`}>
                                    <div className="mt-1 space-y-2">
                                        <div className="relative">
                                            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                value={prodSearch}
                                                onChange={(e) => setProdSearch(e.target.value)}
                                                placeholder="Search products…"
                                                className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                        </div>
                                        <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                                            {filteredProducts.length === 0 ? (
                                                <p className="py-6 text-center text-xs text-muted-foreground">No products found</p>
                                            ) : (
                                                filteredProducts.map((p) => {
                                                    const checked = form.product_ids.includes(p.id);
                                                    return (
                                                        <label
                                                            key={p.id}
                                                            className={cn(
                                                                'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors select-none',
                                                                checked ? 'bg-primary/5' : 'hover:bg-muted/30',
                                                            )}
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-all',
                                                                    checked ? 'border-primary bg-primary' : 'border-border',
                                                                )}
                                                            >
                                                                {checked && (
                                                                    <svg
                                                                        className="h-2.5 w-2.5 text-white"
                                                                        fill="none"
                                                                        viewBox="0 0 24 24"
                                                                        stroke="currentColor"
                                                                        strokeWidth={3}
                                                                    >
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm text-foreground">{p.name}</p>
                                                                <p className="text-xs text-muted-foreground capitalize">
                                                                    {p.product_type.replace('_', ' ')}
                                                                </p>
                                                            </div>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => toggleProduct(p.id)}
                                                                className="sr-only"
                                                            />
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                        {form.product_ids.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => set('product_ids', [])}
                                                className="text-xs text-muted-foreground hover:text-destructive"
                                            >
                                                Clear all
                                            </button>
                                        )}
                                    </div>
                                </Field>
                            )}

                            {/* Category selector */}
                            {form.applies_to === 'specific_categories' && (
                                <Field label={`Select Categories (${form.category_ids.length} selected)`}>
                                    <div className="mt-1 max-h-60 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                                        {categories.map((c) => {
                                            const checked = form.category_ids.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className={cn(
                                                        'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors select-none',
                                                        checked ? 'bg-primary/5' : 'hover:bg-muted/30',
                                                    )}
                                                >
                                                    <div
                                                        className={cn(
                                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2',
                                                            checked ? 'border-primary bg-primary' : 'border-border',
                                                        )}
                                                    >
                                                        {checked && (
                                                            <svg
                                                                className="h-2.5 w-2.5 text-white"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                                strokeWidth={3}
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <span className="text-sm text-foreground">{c.name}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleCategory(c.id)}
                                                        className="sr-only"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                </Field>
                            )}
                        </div>
                    )}

                    {/* ── Limits & Dates tab ────────────────────────────── */}
                    {tab === 'limits' && (
                        <div className="space-y-4">
                            <Field label="Minimum Purchase (₱)" error={errors.minimum_purchase} hint="Leave blank for no minimum">
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.minimum_purchase}
                                    onChange={(e) => set('minimum_purchase', e.target.value)}
                                    placeholder="e.g. 500.00"
                                    className="mt-1 h-9"
                                />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Usage Limit" error={errors.max_uses} hint="Total uses across all customers. Blank = unlimited.">
                                    <Input
                                        type="number"
                                        min="1"
                                        value={form.max_uses}
                                        onChange={(e) => set('max_uses', e.target.value)}
                                        placeholder="Unlimited"
                                        className="mt-1 h-9"
                                    />
                                </Field>
                                <Field
                                    label="Per Customer"
                                    error={errors.max_uses_per_customer}
                                    hint="Uses allowed per customer — 1 for one-time. At the POS a customer must be selected."
                                >
                                    <Input
                                        type="number"
                                        min="1"
                                        value={form.max_uses_per_customer}
                                        onChange={(e) => set('max_uses_per_customer', e.target.value)}
                                        placeholder="Unlimited"
                                        className="mt-1 h-9"
                                    />
                                </Field>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Start Date" error={errors.starts_at}>
                                    <input
                                        type="datetime-local"
                                        value={form.starts_at}
                                        onChange={(e) => set('starts_at', e.target.value)}
                                        className={inp + ' mt-1 h-9'}
                                    />
                                </Field>
                                <Field label="Expiry Date" error={errors.expires_at}>
                                    <input
                                        type="datetime-local"
                                        value={form.expires_at}
                                        onChange={(e) => set('expires_at', e.target.value)}
                                        className={inp + ' mt-1 h-9'}
                                    />
                                </Field>
                            </div>

                            {form.expires_at && form.starts_at && form.expires_at < form.starts_at && (
                                <p className="text-xs text-destructive">Expiry must be after start date.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex shrink-0 gap-3 border-t border-border p-4">
                    <Button variant="outline" className="h-10 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button className="h-10 flex-1 gap-2 font-semibold" onClick={handleSubmit} disabled={loading}>
                        {loading && (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                        )}
                        {mode === 'create' ? 'Create Promo' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

function DeleteDialog({ promo, onClose }: { promo: Promo; onClose: () => void }) {
    const [loading, setLoading] = useState(false);
    const handle = () => {
        setLoading(true);
        router.delete(routes.promos.destroy(promo.id), {
            preserveScroll: true,
            onSuccess: () => {
                setLoading(false);
                onClose();
            },
            onError: () => setLoading(false),
        });
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl">
                <div className="flex items-center gap-3">
                    <div className="shrink-0 rounded-full bg-destructive/10 p-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                        <p className="font-bold text-foreground">Delete promo?</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            <span className="font-semibold">{promo.name}</span>
                            {promo.code && <span className="ml-1.5 font-mono opacity-60">({promo.code})</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-9 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="destructive" className="h-9 flex-1 gap-2" onClick={handle} disabled={loading}>
                        {loading && (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-destructive-foreground/30 border-t-destructive-foreground" />
                        )}
                        Delete
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<Promo['channels'], string> = { both: 'POS + Online', pos: 'POS only', online: 'Online only' };

function PromoRow({ promo, onToggle, onEdit, onDelete }: { promo: Promo; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
    const scope =
        promo.applies_to === 'all'
            ? 'All products'
            : promo.applies_to === 'specific_products'
              ? `${promo.product_ids.length} product${promo.product_ids.length !== 1 ? 's' : ''}`
              : `${promo.category_ids.length} categor${promo.category_ids.length !== 1 ? 'ies' : 'y'}`;
    const scopeTitle = promo.applies_to === 'specific_products' ? promo.product_names.join(', ') : promo.category_names.join(', ');

    const meta = [
        promo.minimum_purchase ? `Min ₱${promo.minimum_purchase.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : null,
        CHANNEL_LABEL[promo.channels] ?? CHANNEL_LABEL.both,
        promo.max_uses_per_customer ? `${promo.max_uses_per_customer}× per customer` : null,
        promo.starts_at && promo.status === 'scheduled' ? `Starts ${format(new Date(promo.starts_at), 'MMM d')}` : null,
        promo.expires_at ? `Until ${format(new Date(promo.expires_at), 'MMM d, yyyy')}` : null,
    ].filter(Boolean);

    const StatusIcon = statusIcon[promo.status] ?? Tag;

    return (
        <li className={cn('flex items-center gap-3 px-4 py-2.5', !promo.is_active && 'opacity-60')}>
            <span
                className={cn(
                    'flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg text-primary',
                    promo.status === 'active' ? 'bg-primary/10' : 'bg-muted text-muted-foreground',
                )}
            >
                <span className="text-sm leading-none font-extrabold tabular-nums">
                    {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `₱${promo.discount_value.toLocaleString()}`}
                </span>
                <span className="mt-0.5 text-[9px] font-bold tracking-wide uppercase opacity-70">off</span>
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <button onClick={onEdit} className="truncate text-left text-sm font-semibold hover:text-primary">
                        {promo.name}
                    </button>
                    {promo.code ? (
                        <span className="rounded bg-primary/10 px-1.5 py-px font-mono text-[11px] font-bold text-primary">{promo.code}</span>
                    ) : (
                        <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">automatic</span>
                    )}
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold', statusBadge[promo.status])}>
                        <StatusIcon className="h-2.5 w-2.5" /> {promo.status_label}
                    </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                    <span title={scopeTitle || undefined}>{scope}</span>
                    {meta.map((item) => (
                        <span key={item}> · {item}</span>
                    ))}
                </p>
            </div>

            <div className="hidden w-20 shrink-0 text-right sm:block">
                <p className="text-sm font-bold tabular-nums">
                    {promo.uses_count.toLocaleString()}
                    {promo.max_uses && <span className="font-normal text-muted-foreground">/{promo.max_uses.toLocaleString()}</span>}
                </p>
                {promo.max_uses ? (
                    <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, (promo.uses_count / promo.max_uses) * 100)}%` }}
                        />
                    </div>
                ) : (
                    <p className="text-[11px] text-muted-foreground">uses</p>
                )}
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                <Switch
                    checked={promo.is_active}
                    onCheckedChange={onToggle}
                    aria-label={promo.is_active ? 'Switch off' : 'Switch on'}
                    className="mr-1.5"
                />
                <button
                    onClick={onEdit}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Edit ${promo.name}`}
                >
                    <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                    onClick={onDelete}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${promo.name}`}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </li>
    );
}

export default function PromosIndex() {
    const { promos, products, categories, flash, bannerChoices = [] } = usePage<PageProps>().props;

    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [drawer, setDrawer] = useState<{ mode: 'create' | 'edit'; promo: Promo | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Promo | null>(null);

    useEffect(() => {
        if (!flash?.message) return;
        if (flash.message.type === 'success') toast.success(flash.message.text);
        else toast.error(flash.message.text);
    }, [flash]);

    const filtered = useMemo(() => {
        let list = promos;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q));
        }
        if (statusFilter) list = list.filter((p) => p.status === statusFilter);
        if (typeFilter) list = list.filter((p) => p.discount_type === typeFilter);
        return list;
    }, [promos, search, statusFilter, typeFilter]);

    const handleToggle = (promo: Promo) => {
        router.patch(routes.promos.toggle(promo.id), {}, { preserveScroll: true });
    };

    const countBy = (status: string) => promos.filter((p) => p.status === status).length;
    const stats = {
        total: promos.length,
        active: countBy('active'),
        scheduled: countBy('scheduled'),
        ended: countBy('expired') + countBy('exhausted'),
        inactive: countBy('inactive'),
        uses: promos.reduce((sum, p) => sum + p.uses_count, 0),
    };

    const mostUsed = [...promos]
        .filter((p) => p.uses_count > 0)
        .sort((a, b) => b.uses_count - a.uses_count)
        .slice(0, 5);

    const soon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const attention = promos
        .filter((p) => p.status === 'active')
        .map((p) => {
            if (p.expires_at && new Date(p.expires_at).getTime() <= soon) {
                return { promo: p, note: `Ends ${format(new Date(p.expires_at), 'MMM d')}` };
            }
            if (p.max_uses && p.uses_count / p.max_uses >= 0.8) {
                return { promo: p, note: `${p.max_uses - p.uses_count} uses left` };
            }
            return null;
        })
        .filter((row): row is { promo: Promo; note: string } => row !== null);

    const statusChips = [
        { value: '', label: 'All', count: stats.total },
        { value: 'active', label: 'Active', count: stats.active },
        { value: 'scheduled', label: 'Scheduled', count: stats.scheduled },
        { value: 'inactive', label: 'Inactive', count: stats.inactive },
        { value: 'expired', label: 'Expired', count: countBy('expired') },
        { value: 'exhausted', label: 'Limit reached', count: countBy('exhausted') },
    ].filter((chip) => chip.value === '' || chip.count > 0);

    return (
        <AdminLayout>
            <Head title="Promos" />

            <div className="space-y-4">
                <PageHeader title="Promos & Discounts" subtitle="Codes and automatic discounts for the counter and the online store.">
                    <Button className="h-9 gap-1.5" onClick={() => setDrawer({ mode: 'create', promo: null })}>
                        <Plus className="h-4 w-4" /> Add promo
                    </Button>
                </PageHeader>

                <StatStrip count={6}>
                    <Stat icon={Tag} label="Promos" value={stats.total.toLocaleString()} />
                    <Stat icon={CheckCircle} label="Active" value={stats.active.toLocaleString()} tone="success" />
                    <Stat icon={Clock} label="Scheduled" value={stats.scheduled.toLocaleString()} />
                    <Stat icon={CalendarX} label="Ended" value={stats.ended.toLocaleString()} tone={stats.ended > 0 ? 'muted' : undefined} />
                    <Stat
                        icon={XCircle}
                        label="Switched off"
                        value={stats.inactive.toLocaleString()}
                        tone={stats.inactive > 0 ? 'muted' : undefined}
                    />
                    <Stat icon={Users} label="Total uses" value={stats.uses.toLocaleString()} />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                    <Panel
                        flush
                        icon={Ticket}
                        title="All promos"
                        actions={
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search name or code"
                                    className={cn(controlCls, 'w-full pr-8 pl-8')}
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch('')}
                                        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label="Clear search"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        }
                    >
                        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-2">
                            {statusChips.map((chip) => (
                                <Chip key={chip.value} active={statusFilter === chip.value} onClick={() => setStatusFilter(chip.value)}>
                                    {chip.label} <span className="opacity-60">{chip.count}</span>
                                </Chip>
                            ))}
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className={cn(controlCls, 'ml-auto h-7 text-xs')}
                                aria-label="Discount type"
                            >
                                <option value="">Any discount</option>
                                <option value="percent">Percentage</option>
                                <option value="fixed">Fixed amount</option>
                            </select>
                        </div>

                        {filtered.length === 0 ? (
                            <div className="py-14 text-center text-sm text-muted-foreground">
                                <Tag className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                {promos.length === 0 ? 'No promos yet.' : 'No promos match these filters.'}
                            </div>
                        ) : (
                            <ul className="divide-y divide-border">
                                {filtered.map((promo) => (
                                    <PromoRow
                                        key={promo.id}
                                        promo={promo}
                                        onToggle={() => handleToggle(promo)}
                                        onEdit={() => setDrawer({ mode: 'edit', promo })}
                                        onDelete={() => setDeleteTarget(promo)}
                                    />
                                ))}
                            </ul>
                        )}
                    </Panel>

                    <div className="space-y-4">
                        <Panel
                            flush
                            icon={Trophy}
                            title="Most used"
                            actions={<span className="text-[11px] font-semibold text-muted-foreground">uses</span>}
                        >
                            {mostUsed.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">No promo has been used yet.</p>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {mostUsed.map((promo, i) => (
                                        <li key={promo.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                            <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                                            <button
                                                onClick={() => setDrawer({ mode: 'edit', promo })}
                                                className="min-w-0 flex-1 text-left hover:text-primary"
                                            >
                                                <span className="block truncate font-semibold">{promo.name}</span>
                                                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                                    {promo.code ?? 'automatic'}
                                                </span>
                                            </button>
                                            <span className="font-bold tabular-nums">{promo.uses_count.toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>

                        <Panel flush icon={AlertTriangle} title="Needs attention">
                            {attention.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">Nothing ending or running out this week.</p>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {attention.map(({ promo, note }) => (
                                        <li key={promo.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                            <button
                                                onClick={() => setDrawer({ mode: 'edit', promo })}
                                                className="min-w-0 flex-1 truncate text-left font-semibold hover:text-primary"
                                            >
                                                {promo.name}
                                            </button>
                                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{note}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Panel>
                    </div>
                </div>
            </div>

            {drawer && (
                <PromoDrawer
                    mode={drawer.mode}
                    promo={drawer.promo}
                    products={products}
                    categories={categories}
                    bannerChoices={bannerChoices}
                    onClose={() => setDrawer(null)}
                />
            )}
            {deleteTarget && <DeleteDialog promo={deleteTarget} onClose={() => setDeleteTarget(null)} />}
        </AdminLayout>
    );
}
