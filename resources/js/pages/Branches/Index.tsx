'use client';

import { usePage, router } from '@inertiajs/react';
import { Plus, Search, X, Edit2, Trash2, AlertTriangle, CircleDot, Users, Phone, MapPin, Store } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Chip, controlCls, EmptyRow, PageHeader, Panel, Stat, StatStrip, StatusPill, thCls, useFlashToasts } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
    id: number;
    name: string;
}

interface Branch {
    id: number;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    contact_person: string | null;
    is_active: boolean;
    business_type: string;
    business_type_label: string;
    supplier_id: number | null;
    supplier: { id: number; name: string } | null;
    feature_flags: Record<string, boolean>;
    use_table_ordering: boolean;
    use_variants: boolean;
    use_expiry_tracking: boolean;
    use_recipe_system: boolean;
    use_bundles: boolean;
    users_count: number;
    product_stocks_count: number;
    created_at: string;
}

interface PageProps {
    branches: Branch[];
    suppliers: Supplier[];
    businessTypes: Record<string, string>;
    auth: { user: { is_super_admin: boolean; is_administrator: boolean } | null };
    flash: { message?: { type: string; text: string } };
    [key: string]: unknown;
}

type FormMode = 'create' | 'edit';

interface BranchForm {
    name: string;
    code: string;
    address: string;
    phone: string;
    contact_person: string;
    supplier_id: string;
    business_type: string;
    use_table_ordering: boolean;
    use_variants: boolean;
    use_expiry_tracking: boolean;
    use_recipe_system: boolean;
    use_bundles: boolean;
    is_active: boolean;
}

const EMPTY_FORM: BranchForm = {
    name: '',
    code: '',
    address: '',
    phone: '',
    contact_person: '',
    supplier_id: '',
    business_type: 'retail',
    use_table_ordering: false,
    use_variants: false,
    use_expiry_tracking: false,
    use_recipe_system: false,
    use_bundles: false,
    is_active: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeBadge: Record<string, string> = {
    cafe: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    restaurant: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    food_stall: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    bakery: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
    bar: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    retail: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    pharmacy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    hardware: 'bg-stone-500/10 text-stone-700 dark:text-stone-400',
    salon: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400',
    laundry: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    school: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    warehouse: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
    mixed: 'bg-teal-500/10 text-teal-700 dark:text-teal-400',
};

const typeIcon: Record<string, string> = {
    cafe: '☕',
    restaurant: '🍽',
    food_stall: '🥘',
    bakery: '🥐',
    bar: '🍺',
    retail: '🛒',
    pharmacy: '💊',
    hardware: '🔧',
    salon: '✂️',
    laundry: '👕',
    school: '🎓',
    warehouse: '🏭',
    mixed: '🏪',
};

const defaultFlags: Record<string, Partial<BranchForm>> = {
    cafe: { use_table_ordering: false, use_variants: true, use_expiry_tracking: false, use_recipe_system: true, use_bundles: false },
    restaurant: { use_table_ordering: true, use_variants: false, use_expiry_tracking: false, use_recipe_system: true, use_bundles: false },
    food_stall: { use_table_ordering: false, use_variants: false, use_expiry_tracking: false, use_recipe_system: true, use_bundles: false },
    bakery: { use_table_ordering: false, use_variants: true, use_expiry_tracking: true, use_recipe_system: true, use_bundles: true },
    bar: { use_table_ordering: true, use_variants: true, use_expiry_tracking: false, use_recipe_system: true, use_bundles: true },
    retail: { use_table_ordering: false, use_variants: true, use_expiry_tracking: true, use_recipe_system: false, use_bundles: true },
    pharmacy: { use_table_ordering: false, use_variants: false, use_expiry_tracking: true, use_recipe_system: false, use_bundles: false },
    hardware: { use_table_ordering: false, use_variants: true, use_expiry_tracking: false, use_recipe_system: false, use_bundles: true },
    salon: { use_table_ordering: false, use_variants: true, use_expiry_tracking: false, use_recipe_system: false, use_bundles: true },
    laundry: { use_table_ordering: false, use_variants: true, use_expiry_tracking: false, use_recipe_system: false, use_bundles: true },
    school: { use_table_ordering: false, use_variants: false, use_expiry_tracking: false, use_recipe_system: false, use_bundles: true },
    warehouse: { use_table_ordering: false, use_variants: true, use_expiry_tracking: true, use_recipe_system: false, use_bundles: false },
    mixed: { use_table_ordering: true, use_variants: true, use_expiry_tracking: true, use_recipe_system: true, use_bundles: true },
};

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
    checked,
    onChange,
    label,
    description,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <label
            className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-all select-none',
                checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-accent/50',
            )}
        >
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
            <div
                onClick={() => onChange(!checked)}
                className={cn('relative h-5 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}
            >
                <div
                    className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                        checked ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                />
            </div>
        </label>
    );
}

// ─── Branch Drawer ────────────────────────────────────────────────────────────

function BranchDrawer({
    mode,
    branch,
    suppliers,
    businessTypes,
    onClose,
}: {
    mode: FormMode;
    branch: Branch | null;
    suppliers: Supplier[];
    businessTypes: Record<string, string>;
    onClose: () => void;
}) {
    const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
    const [tab, setTab] = useState<'info' | 'flags'>('info');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (mode === 'edit' && branch) {
            setForm({
                name: branch.name,
                code: branch.code,
                address: branch.address ?? '',
                phone: branch.phone ?? '',
                contact_person: branch.contact_person ?? '',
                supplier_id: branch.supplier_id?.toString() ?? '',
                business_type: branch.business_type,
                use_table_ordering: branch.use_table_ordering,
                use_variants: branch.use_variants,
                use_expiry_tracking: branch.use_expiry_tracking,
                use_recipe_system: branch.use_recipe_system,
                use_bundles: branch.use_bundles,
                is_active: branch.is_active,
            });
        } else {
            setForm(EMPTY_FORM);
        }
        setTab('info');
        setErrors({});
    }, [mode, branch]);

    const set = <K extends keyof BranchForm>(k: K, v: BranchForm[K]) => {
        setForm((f) => {
            const next = { ...f, [k]: v };
            const flags = k === 'business_type' ? defaultFlags[String(v)] : undefined;
            return flags ? { ...next, ...flags } : next;
        });
        setErrors((e) => ({ ...e, [k]: '' }));
    };

    const handleSubmit = () => {
        setLoading(true);
        setErrors({});
        const payload = { ...form, supplier_id: form.supplier_id || null };
        const isCreate = mode === 'create';
        const url = isCreate ? routes.branches.store() : routes.branches.update(branch!.id);

        if (isCreate) {
            router.post(url, payload, {
                preserveScroll: true,
                onSuccess: () => {
                    setLoading(false);
                    onClose();
                },
                onError: (e) => {
                    setErrors(e);
                    setLoading(false);
                    setTab('info');
                },
            });
        } else {
            router.patch(url, payload, {
                preserveScroll: true,
                onSuccess: () => {
                    setLoading(false);
                    onClose();
                },
                onError: (e) => {
                    setErrors(e);
                    setLoading(false);
                    setTab('info');
                },
            });
        }
    };

    const flagCount = [form.use_table_ordering, form.use_variants, form.use_expiry_tracking, form.use_recipe_system, form.use_bundles].filter(
        Boolean,
    ).length;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[540px]">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="font-bold text-foreground">{mode === 'create' ? 'Create Branch' : `Edit — ${branch?.name}`}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {mode === 'create' ? 'Add a new branch location' : 'Update branch details and settings'}
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
                    {(['info', 'flags'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                'flex-1 py-2.5 text-sm font-semibold transition-colors',
                                tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t === 'info' ? (
                                'Branch Info'
                            ) : (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                    Feature Flags
                                    {flagCount > 0 && (
                                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                                            {flagCount}
                                        </span>
                                    )}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {tab === 'info' ? (
                        <div className="space-y-4">
                            {/* Name + Code */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="field-label">
                                        Branch Name <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => set('name', e.target.value)}
                                        placeholder="e.g. Main Branch"
                                        className={cn('mt-1 h-9', errors.name && 'border-destructive')}
                                    />
                                    {errors.name && <p className="field-error">{errors.name}</p>}
                                </div>
                                <div>
                                    <label className="field-label">
                                        Code <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                        value={form.code}
                                        onChange={(e) => set('code', e.target.value.toUpperCase())}
                                        placeholder="ABC1"
                                        maxLength={20}
                                        className={cn('mt-1 h-9 font-mono tracking-widest uppercase', errors.code && 'border-destructive')}
                                    />
                                    {errors.code && <p className="field-error">{errors.code}</p>}
                                </div>
                            </div>

                            {/* Business Type */}
                            <div>
                                <label className="field-label">
                                    Business Type <span className="text-destructive">*</span>
                                </label>
                                <div className="mt-1 grid grid-cols-2 gap-2">
                                    {Object.entries(businessTypes).map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => set('business_type', val)}
                                            className={cn(
                                                'flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all',
                                                form.business_type === val
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border hover:border-primary/30 hover:bg-accent',
                                            )}
                                        >
                                            <span className="text-xl">{typeIcon[val]}</span>
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className={cn(
                                                        'text-xs font-semibold',
                                                        form.business_type === val ? 'text-primary' : 'text-foreground',
                                                    )}
                                                >
                                                    {label}
                                                </p>
                                            </div>
                                            {form.business_type === val && <CircleDot className="h-3.5 w-3.5 shrink-0 text-primary" />}
                                        </button>
                                    ))}
                                </div>
                                {errors.business_type && <p className="field-error">{errors.business_type}</p>}
                            </div>

                            {/* Supplier */}
                            <div>
                                <label className="field-label">Linked Supplier</label>
                                <select
                                    value={form.supplier_id}
                                    onChange={(e) => set('supplier_id', e.target.value)}
                                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                >
                                    <option value="">No supplier linked</option>
                                    {suppliers.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Phone + Contact */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="field-label">Phone</label>
                                    <Input
                                        value={form.phone}
                                        onChange={(e) => set('phone', e.target.value)}
                                        placeholder="+63 912 345 6789"
                                        className="mt-1 h-9"
                                    />
                                </div>
                                <div>
                                    <label className="field-label">Contact Person</label>
                                    <Input
                                        value={form.contact_person}
                                        onChange={(e) => set('contact_person', e.target.value)}
                                        placeholder="Juan Dela Cruz"
                                        className="mt-1 h-9"
                                    />
                                </div>
                            </div>

                            {/* Address */}
                            <div>
                                <label className="field-label">Address</label>
                                <textarea
                                    value={form.address}
                                    onChange={(e) => set('address', e.target.value)}
                                    rows={2}
                                    placeholder="Street, City, Province"
                                    className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>

                            {/* Active */}
                            <Toggle
                                checked={form.is_active}
                                onChange={(v) => set('is_active', v)}
                                label="Active"
                                description="Inactive branches are hidden from operations"
                            />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="pb-1 text-xs text-muted-foreground">
                                Flags are auto-set when you pick a business type but can be customized here.
                            </p>
                            <Toggle
                                checked={form.use_table_ordering}
                                onChange={(v) => set('use_table_ordering', v)}
                                label="Table Ordering"
                                description="Dine-in table management and kitchen orders"
                            />
                            <Toggle
                                checked={form.use_variants}
                                onChange={(v) => set('use_variants', v)}
                                label="Product Variants"
                                description="Size / color / flavor variant support"
                            />
                            <Toggle
                                checked={form.use_expiry_tracking}
                                onChange={(v) => set('use_expiry_tracking', v)}
                                label="Expiry Tracking"
                                description="Track batch numbers and expiry dates on stock"
                            />
                            <Toggle
                                checked={form.use_recipe_system}
                                onChange={(v) => set('use_recipe_system', v)}
                                label="Recipe / BOM"
                                description="Made-to-order products with ingredient recipes"
                            />
                            <Toggle
                                checked={form.use_bundles}
                                onChange={(v) => set('use_bundles', v)}
                                label="Product Bundles"
                                description="Bundle multiple products into one sellable item"
                            />
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
                        {mode === 'create' ? 'Create Branch' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Delete Dialog ────────────────────────────────────────────────────────────

function DeleteDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleDelete = () => {
        setLoading(true);
        setError('');
        router.delete(routes.branches.destroy(branch.id), {
            data: { reason },
            preserveScroll: true,
            onSuccess: () => {
                setLoading(false);
                onClose();
            },
            onError: (e) => {
                setError(Object.values(e)[0] as string);
                setLoading(false);
            },
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
                        <p className="font-bold text-foreground">Delete branch?</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            <span className="font-semibold">{branch.name}</span>
                            <span className="ml-1.5 font-mono opacity-60">({branch.code})</span>
                        </p>
                    </div>
                </div>

                {/* Warnings if branch has dependents */}
                {(branch.users_count > 0 || branch.product_stocks_count > 0) && (
                    <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
                        {branch.users_count > 0 && (
                            <p>
                                ⚠ {branch.users_count} user{branch.users_count !== 1 ? 's' : ''} assigned to this branch
                            </p>
                        )}
                        {branch.product_stocks_count > 0 && (
                            <p>
                                ⚠ {branch.product_stocks_count.toLocaleString()} stock record{branch.product_stocks_count !== 1 ? 's' : ''} attached
                            </p>
                        )}
                    </div>
                )}

                <div>
                    <label className="field-label">Reason (optional)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. Branch closed permanently…"
                        className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex gap-2">
                    <Button variant="outline" className="h-9 flex-1" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button variant="destructive" className="h-9 flex-1 gap-2" onClick={handleDelete} disabled={loading}>
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

export default function BranchesIndex() {
    const { branches, suppliers, businessTypes, auth } = usePage<PageProps>().props;
    useFlashToasts();

    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [drawer, setDrawer] = useState<{ mode: FormMode; branch: Branch | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

    const filtered = useMemo(() => {
        let list = branches;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q) || (b.address ?? '').toLowerCase().includes(q),
            );
        }
        if (typeFilter) list = list.filter((b) => b.business_type === typeFilter);
        if (statusFilter) list = list.filter((b) => (statusFilter === 'active' ? b.is_active : !b.is_active));
        return list;
    }, [branches, search, typeFilter, statusFilter]);

    const canManage = auth?.user?.is_super_admin || auth?.user?.is_administrator;
    const activeCount = branches.filter((b) => b.is_active).length;

    const handleToggle = (b: Branch) => {
        router.patch(routes.branches.toggle(b.id), {}, { preserveScroll: true });
    };

    const staffCount = branches.reduce((sum, b) => sum + (b.users_count ?? 0), 0);
    const typesInUse = Object.entries(businessTypes).filter(([type]) => branches.some((b) => b.business_type === type));
    const hasFilters = !!(search || typeFilter || statusFilter);

    return (
        <AdminLayout>
            <div className="space-y-4">
                <PageHeader title="Branches" subtitle="Each store location, its business type and the features it uses.">
                    {canManage && (
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => setDrawer({ mode: 'create', branch: null })}>
                            <Plus className="h-4 w-4" /> Add branch
                        </Button>
                    )}
                </PageHeader>

                <StatStrip count={4}>
                    <Stat icon={Store} label="Branches" value={branches.length.toLocaleString()} />
                    <Stat icon={CircleDot} label="Active" value={activeCount.toLocaleString()} tone="success" />
                    <Stat
                        icon={CircleDot}
                        label="Inactive"
                        value={(branches.length - activeCount).toLocaleString()}
                        tone={branches.length - activeCount > 0 ? 'muted' : undefined}
                    />
                    <Stat icon={Users} label="Staff accounts" value={staffCount.toLocaleString()} />
                </StatStrip>

                <Panel
                    flush
                    icon={Store}
                    title="All branches"
                    actions={
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Name, code or address"
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
                        <Chip active={typeFilter === ''} onClick={() => setTypeFilter('')}>
                            All types
                        </Chip>
                        {typesInUse.map(([type, label]) => (
                            <Chip key={type} active={typeFilter === type} onClick={() => setTypeFilter(typeFilter === type ? '' : type)}>
                                {typeIcon[type]} {label} <span className="opacity-60">{branches.filter((b) => b.business_type === type).length}</span>
                            </Chip>
                        ))}
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className={cn(controlCls, 'ml-auto h-7 text-xs')}
                            aria-label="Status"
                        >
                            <option value="">Any status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        {hasFilters && (
                            <button
                                onClick={() => {
                                    setSearch('');
                                    setTypeFilter('');
                                    setStatusFilter('');
                                }}
                                className="h-7 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Branch</th>
                                    <th className={thCls}>Type</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Contact</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Features</th>
                                    <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Staff</th>
                                    <th className={thCls}>Active</th>
                                    <th className="w-20" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={Store}>
                                        {hasFilters ? 'No branches match these filters.' : 'No branches yet.'}
                                    </EmptyRow>
                                ) : (
                                    filtered.map((b) => {
                                        const features = [
                                            b.use_table_ordering && 'Tables',
                                            b.use_variants && 'Variants',
                                            b.use_expiry_tracking && 'Expiry',
                                            b.use_recipe_system && 'Recipes',
                                            b.use_bundles && 'Bundles',
                                        ].filter(Boolean) as string[];
                                        return (
                                            <tr key={b.id} className={cn('hover:bg-muted/30', !b.is_active && 'opacity-60')}>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base">
                                                            {typeIcon[b.business_type]}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold">{b.name}</p>
                                                            <p className="font-mono text-[11px] text-muted-foreground">{b.code}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span
                                                        className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', typeBadge[b.business_type])}
                                                    >
                                                        {b.business_type_label || b.business_type}
                                                    </span>
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs md:table-cell">
                                                    {b.contact_person || b.phone || b.address ? (
                                                        <div className="min-w-0 space-y-0.5">
                                                            {b.contact_person && <p className="truncate font-semibold">{b.contact_person}</p>}
                                                            {b.phone && (
                                                                <p className="flex items-center gap-1 text-muted-foreground">
                                                                    <Phone className="h-3 w-3" /> {b.phone}
                                                                </p>
                                                            )}
                                                            {b.address && (
                                                                <p className="flex max-w-56 items-center gap-1 truncate text-muted-foreground">
                                                                    <MapPin className="h-3 w-3 shrink-0" /> {b.address}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                    {features.length ? features.join(' · ') : 'None'}
                                                </td>
                                                <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{b.users_count}</td>
                                                <td className="px-4 py-2">
                                                    {canManage ? (
                                                        <Switch
                                                            checked={b.is_active}
                                                            onCheckedChange={() => handleToggle(b)}
                                                            aria-label={b.is_active ? `Deactivate ${b.name}` : `Activate ${b.name}`}
                                                        />
                                                    ) : (
                                                        <StatusPill tone={b.is_active ? 'success' : 'muted'}>
                                                            {b.is_active ? 'Active' : 'Inactive'}
                                                        </StatusPill>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2">
                                                    {canManage && (
                                                        <div className="flex justify-end gap-0.5">
                                                            <button
                                                                onClick={() => setDrawer({ mode: 'edit', branch: b })}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                aria-label={`Edit ${b.name}`}
                                                            >
                                                                <Edit2 className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteTarget(b)}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                                aria-label={`Delete ${b.name}`}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </div>

            {drawer && (
                <BranchDrawer
                    mode={drawer.mode}
                    branch={drawer.branch}
                    suppliers={suppliers}
                    businessTypes={businessTypes}
                    onClose={() => setDrawer(null)}
                />
            )}

            {deleteTarget && <DeleteDialog branch={deleteTarget} onClose={() => setDeleteTarget(null)} />}
        </AdminLayout>
    );
}
