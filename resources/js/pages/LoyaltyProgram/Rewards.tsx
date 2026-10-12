import { router, useForm } from '@inertiajs/react';
import { Gift, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Chip, EmptyRow, FormField, PageHeader, Panel, StatusPill, inputCls, thCls, useFlashToasts } from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import LoyaltyNav from './LoyaltyNav';

interface Reward {
    id: number;
    product_id: number;
    variant_id: number | null;
    name: string;
    category: string | null;
    image: string | null;
    points_cost: number;
    max_per_claim: number | null;
    retail_price: number;
    branch_ids: number[] | null;
    is_active: boolean;
    sort_order: number;
    product_status: string | null;
    times_claimed: number;
}

interface ProductOption {
    id: number;
    name: string;
    category: string | null;
    image: string | null;
    price: number;
    variants: { id: number; name: string }[];
}

interface Props {
    rewards: Reward[];
    products: ProductOption[];
    branches: { id: number; name: string }[];
}

interface RewardForm {
    product_id: number | '';
    product_variant_id: number | '';
    points_cost: number;
    is_active: boolean;
    max_per_claim: number | '';
    branch_ids: number[];
    sort_order: number;
}

const blank: RewardForm = { product_id: '', product_variant_id: '', points_cost: 50, is_active: true, max_per_claim: '', branch_ids: [], sort_order: 0 };
const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LoyaltyRewards({ rewards, products, branches }: Props) {
    useFlashToasts();
    const [editing, setEditing] = useState<Reward | null>(null);
    const [open, setOpen] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const form = useForm<RewardForm>(blank);
    const errors = form.errors as Record<string, string>;

    const selectedProduct = products.find((p) => p.id === form.data.product_id) ?? null;
    const filteredProducts = useMemo(() => {
        const q = productSearch.trim().toLowerCase();
        return q ? products.filter((p) => p.name.toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)) : products;
    }, [products, productSearch]);

    const openForm = (reward: Reward | null) => {
        setEditing(reward);
        form.clearErrors();
        form.setData(
            reward
                ? {
                      product_id: reward.product_id,
                      product_variant_id: reward.variant_id ?? '',
                      points_cost: reward.points_cost,
                      is_active: reward.is_active,
                      max_per_claim: reward.max_per_claim ?? '',
                      branch_ids: reward.branch_ids ?? [],
                      sort_order: reward.sort_order,
                  }
                : blank,
        );
        setProductSearch('');
        setOpen(true);
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((data) => ({
            ...data,
            product_variant_id: data.product_variant_id || null,
            max_per_claim: data.max_per_claim || null,
            branch_ids: data.branch_ids.length ? data.branch_ids : null,
        }));
        const options = { preserveScroll: true, onSuccess: () => setOpen(false) };
        if (editing) form.patch(`/loyalty-program/rewards/${editing.id}`, options);
        else form.post('/loyalty-program/rewards', options);
    };

    const toggleActive = (reward: Reward) =>
        router.patch(
            `/loyalty-program/rewards/${reward.id}`,
            {
                product_id: reward.product_id,
                product_variant_id: reward.variant_id,
                points_cost: reward.points_cost,
                is_active: !reward.is_active,
                max_per_claim: reward.max_per_claim,
                branch_ids: reward.branch_ids,
                sort_order: reward.sort_order,
            },
            { preserveScroll: true },
        );

    const remove = async (reward: Reward) => {
        const ok = await confirmDialog({
            title: `Remove ${reward.name}?`,
            description: 'Customers will no longer see it. Rewards already claimed keep their history.',
            confirmLabel: 'Remove',
            tone: 'danger',
        });
        if (ok) router.delete(`/loyalty-program/rewards/${reward.id}`, { preserveScroll: true });
    };

    const branchLabel = (ids: number[] | null) =>
        !ids || ids.length === 0 ? 'All branches' : ids.map((id) => branches.find((b) => b.id === id)?.name ?? `#${id}`).join(', ');

    return (
        <AdminLayout title="Reward Catalog">
            <div className="space-y-4">
                <PageHeader title="Reward catalog" subtitle="Menu items customers can get for points. Claimed in-store with a QR at any branch, recorded as ₱0 sales.">
                    <button
                        type="button"
                        onClick={() => openForm(null)}
                        className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
                    >
                        <Plus className="h-4 w-4" /> Add reward
                    </button>
                </PageHeader>

                <LoyaltyNav />

                <Panel flush icon={Gift} title={`${rewards.length} reward${rewards.length === 1 ? '' : 's'}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/40">
                                <tr>
                                    <th className={thCls}>Item</th>
                                    <th className={cn(thCls, 'text-right')}>Points</th>
                                    <th className={cn(thCls, 'text-right')}>Menu price</th>
                                    <th className={cn(thCls, 'text-right')} title="Menu price ÷ points: how much each point is worth on this reward">
                                        ₱ / pt
                                    </th>
                                    <th className={thCls}>Limit</th>
                                    <th className={thCls}>Branches</th>
                                    <th className={cn(thCls, 'text-right')}>Claimed</th>
                                    <th className={thCls}>Active</th>
                                    <th className={thCls} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {rewards.length === 0 ? (
                                    <EmptyRow colSpan={9} icon={Gift}>
                                        No rewards yet. Add a menu item, e.g. Boundary Burger for 50 points.
                                    </EmptyRow>
                                ) : (
                                    rewards.map((r) => (
                                        <tr key={r.id} className={cn(!r.is_active && 'opacity-60')}>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                                                        {r.image ? <img src={r.image} alt="" className="h-full w-full object-cover" /> : <Gift className="m-2.5 h-5 w-5 text-muted-foreground" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold">{r.name}</p>
                                                        <p className="truncate text-[11px] text-muted-foreground">
                                                            {r.category ?? 'Menu'}
                                                            {r.product_status && r.product_status !== 'active' && (
                                                                <StatusPill tone="warning" className="ml-1.5">
                                                                    item {r.product_status}
                                                                </StatusPill>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold tabular-nums">{r.points_cost.toLocaleString()}</td>
                                            <td className="px-4 py-2 text-right tabular-nums">{peso(r.retail_price)}</td>
                                            <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                                                {r.points_cost > 0 ? peso(r.retail_price / r.points_cost) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground">{r.max_per_claim ? `${r.max_per_claim} / claim` : '—'}</td>
                                            <td className="max-w-48 truncate px-4 py-2 text-muted-foreground" title={branchLabel(r.branch_ids)}>
                                                {branchLabel(r.branch_ids)}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">{r.times_claimed.toLocaleString()}</td>
                                            <td className="px-4 py-2">
                                                <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} aria-label={`${r.name} active`} />
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openForm(r)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        aria-label={`Edit ${r.name}`}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => remove(r)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                                                        aria-label={`Remove ${r.name}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
                    <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a reward'}</DialogTitle>
                    <DialogDescription>Pick a menu item and how many points it costs. Stock is deducted when the reward is handed over.</DialogDescription>
                    <form onSubmit={submit} className="space-y-3">
                        <FormField label="Menu item" error={errors.product_id}>
                            <div className="space-y-1.5">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        value={productSearch}
                                        onChange={(e) => setProductSearch(e.target.value)}
                                        placeholder="Search the menu…"
                                        className={cn(inputCls, 'pl-8')}
                                    />
                                </div>
                                <select
                                    value={form.data.product_id}
                                    onChange={(e) => {
                                        form.setData((data) => ({ ...data, product_id: e.target.value ? Number(e.target.value) : '', product_variant_id: '' }));
                                    }}
                                    className={cn(inputCls, 'h-auto py-1.5')}
                                    size={6}
                                    required
                                >
                                    {filteredProducts.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} — {peso(p.price)}
                                            {p.category ? ` · ${p.category}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </FormField>

                        {selectedProduct && selectedProduct.variants.length > 0 && (
                            <FormField label="Option" error={errors.product_variant_id}>
                                <select
                                    value={form.data.product_variant_id}
                                    onChange={(e) => form.setData('product_variant_id', e.target.value ? Number(e.target.value) : '')}
                                    className={inputCls}
                                >
                                    <option value="">Choose…</option>
                                    {selectedProduct.variants.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                        )}

                        <div className="grid grid-cols-3 gap-2">
                            <FormField label="Points cost" error={errors.points_cost}>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.data.points_cost}
                                    onChange={(e) => form.setData('points_cost', Number(e.target.value))}
                                    className={inputCls}
                                    required
                                />
                            </FormField>
                            <FormField label="Max per claim" error={errors.max_per_claim}>
                                <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    placeholder="No limit"
                                    value={form.data.max_per_claim}
                                    onChange={(e) => form.setData('max_per_claim', e.target.value ? Number(e.target.value) : '')}
                                    className={inputCls}
                                />
                            </FormField>
                            <FormField label="Sort order" error={errors.sort_order}>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.data.sort_order}
                                    onChange={(e) => form.setData('sort_order', Number(e.target.value))}
                                    className={inputCls}
                                />
                            </FormField>
                        </div>
                        {selectedProduct && form.data.points_cost > 0 && (
                            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                                {selectedProduct.name} sells for {peso(selectedProduct.price)} — each point is worth {peso(selectedProduct.price / form.data.points_cost)} on this
                                reward.
                            </p>
                        )}

                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Claimable at (none selected = all branches)</p>
                            <div className="flex flex-wrap gap-1.5">
                                {branches.map((b) => (
                                    <Chip
                                        key={b.id}
                                        active={form.data.branch_ids.includes(b.id)}
                                        onClick={() =>
                                            form.setData(
                                                'branch_ids',
                                                form.data.branch_ids.includes(b.id) ? form.data.branch_ids.filter((id) => id !== b.id) : [...form.data.branch_ids, b.id],
                                            )
                                        }
                                    >
                                        {b.name}
                                    </Chip>
                                ))}
                            </div>
                        </div>

                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                            <span className="text-sm font-semibold">Available to customers</span>
                            <Switch checked={form.data.is_active} onCheckedChange={(on) => form.setData('is_active', on)} />
                        </label>

                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted">
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={form.processing || !form.data.product_id}
                                className="h-9 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                            >
                                {editing ? 'Save changes' : 'Add reward'}
                            </button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
