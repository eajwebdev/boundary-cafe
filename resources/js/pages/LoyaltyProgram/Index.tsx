import { Link, useForm } from '@inertiajs/react';
import { Award, Coins, Gift, Loader2, Plus, Save, Trash2, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import AdminLayout from '@/layouts/AdminLayout';

interface Tier {
    name: string;
    min: number;
    multiplier: number;
}

interface Props {
    rules: {
        enabled: boolean;
        spend_per_point: number;
        peso_per_point: number;
        minimum_redeem: number;
        maximum_redeem: number;
        tiers_enabled: boolean;
        tiers: Tier[];
        birthday_bonus: number;
    };
    stats: {
        members: number;
        online_accounts: number;
        outstanding_points: number;
        liability: number;
        issued_30d: number;
        redeemed_30d: number;
        tier_counts: Record<string, number>;
    };
    top_members: { id: number; name: string; customer_number: string; points: number; lifetime: number }[];
    flash?: { success?: string | null };
}

const inputCls = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
const money = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LoyaltyProgram({ rules, stats, top_members, flash }: Props) {
    const form = useForm({ ...rules });
    const d = form.data;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
    }, [flash]);

    const setTier = (i: number, patch: Partial<Tier>) => form.setData('tiers', d.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

    return (
        <AdminLayout title="Loyalty Program">
            <div className="space-y-5">
                <div>
                    <h1 className="text-xl font-bold">Boundary Rewards</h1>
                    <p className="text-sm text-muted-foreground">One points programme for counter, dine-in and online orders. Points are earned when a sale is completed and reversed if it is voided.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                    <Stat icon={Users} label="Members" value={stats.members.toLocaleString()} />
                    <Stat icon={Users} label="Online accounts" value={stats.online_accounts.toLocaleString()} />
                    <Stat icon={Coins} label="Outstanding points" value={stats.outstanding_points.toLocaleString()} />
                    <Stat icon={Gift} label="Points liability" value={money(stats.liability)} />
                    <Stat icon={TrendingUp} label="Issued (30 days)" value={stats.issued_30d.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Redeemed (30 days)" value={stats.redeemed_30d.toLocaleString()} />
                </div>

                <form
                    className="grid gap-5 lg:grid-cols-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.put('/loyalty-program', { preserveScroll: true });
                    }}
                >
                    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                        <h2 className="font-bold">Earning & redeeming</h2>
                        <label className="flex items-center justify-between text-sm">
                            Programme enabled
                            <input type="checkbox" role="switch" checked={d.enabled} onChange={(e) => form.setData('enabled', e.target.checked)} className="h-5 w-5 accent-primary" />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Spend per 1 point (₱)" error={form.errors.spend_per_point}>
                                <input className={inputCls} type="number" min="1" step="1" value={d.spend_per_point} onChange={(e) => form.setData('spend_per_point', Number(e.target.value))} />
                            </Field>
                            <Field label="Value of 1 point (₱)" error={form.errors.peso_per_point}>
                                <input className={inputCls} type="number" min="0.01" step="0.01" value={d.peso_per_point} onChange={(e) => form.setData('peso_per_point', Number(e.target.value))} />
                            </Field>
                            <Field label="Minimum points to redeem" error={form.errors.minimum_redeem}>
                                <input className={inputCls} type="number" min="1" value={d.minimum_redeem} onChange={(e) => form.setData('minimum_redeem', Number(e.target.value))} />
                            </Field>
                            <Field label="Maximum points per order" error={form.errors.maximum_redeem}>
                                <input className={inputCls} type="number" min="0" value={d.maximum_redeem} onChange={(e) => form.setData('maximum_redeem', Number(e.target.value))} />
                            </Field>
                            <Field label="Birthday bonus points" error={form.errors.birthday_bonus}>
                                <input className={inputCls} type="number" min="0" value={d.birthday_bonus} onChange={(e) => form.setData('birthday_bonus', Number(e.target.value))} />
                            </Field>
                        </div>
                        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                            Example: a {money(d.spend_per_point * 5)} order earns {5} points (more on higher tiers); {d.minimum_redeem} points take {money(d.minimum_redeem * d.peso_per_point)} off.
                        </p>
                    </section>

                    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="flex items-center gap-2 font-bold">
                                <Award className="h-4 w-4 text-primary" /> Membership tiers
                            </h2>
                            <label className="flex items-center gap-2 text-sm">
                                Enabled
                                <input type="checkbox" role="switch" checked={d.tiers_enabled} onChange={(e) => form.setData('tiers_enabled', e.target.checked)} className="h-5 w-5 accent-primary" />
                            </label>
                        </div>
                        <div className="space-y-2">
                            <div className="grid grid-cols-[1fr_110px_90px_40px] gap-2 text-xs font-semibold text-muted-foreground">
                                <span>Tier name</span>
                                <span>Lifetime pts from</span>
                                <span>Earn ×</span>
                                <span />
                            </div>
                            {d.tiers.map((t, i) => (
                                <div key={i} className="grid grid-cols-[1fr_110px_90px_40px] items-center gap-2">
                                    <input className={inputCls} value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} />
                                    <input className={inputCls} type="number" min="0" value={t.min} onChange={(e) => setTier(i, { min: Number(e.target.value) })} />
                                    <input className={inputCls} type="number" min="1" max="5" step="0.05" value={t.multiplier} onChange={(e) => setTier(i, { multiplier: Number(e.target.value) })} />
                                    <button
                                        type="button"
                                        disabled={d.tiers.length <= 1}
                                        onClick={() => form.setData('tiers', d.tiers.filter((_, idx) => idx !== i))}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-30"
                                        aria-label="Remove tier"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    <span className="col-span-4 -mt-1 text-[11px] text-muted-foreground">{stats.tier_counts[t.name] ?? 0} members</span>
                                </div>
                            ))}
                            {(form.errors as Record<string, string>).tiers && <p className="text-sm text-destructive">{(form.errors as Record<string, string>).tiers}</p>}
                            <button
                                type="button"
                                disabled={d.tiers.length >= 6}
                                onClick={() => form.setData('tiers', [...d.tiers, { name: 'New tier', min: (d.tiers.at(-1)?.min ?? 0) + 1000, multiplier: 1 }])}
                                className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-sm font-semibold disabled:opacity-40"
                            >
                                <Plus className="h-4 w-4" /> Add tier
                            </button>
                        </div>
                    </section>

                    <div className="lg:col-span-2">
                        <button type="submit" disabled={form.processing} className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
                            {form.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rewards settings
                        </button>
                    </div>
                </form>

                <section className="rounded-xl border border-border bg-card">
                    <h2 className="border-b border-border px-4 py-3 font-bold">Top members (lifetime points)</h2>
                    {top_members.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
                    ) : (
                        <ul className="divide-y divide-border">
                            {top_members.map((m, i) => (
                                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                    <span className="w-6 font-bold text-muted-foreground">{i + 1}</span>
                                    <Link href={`/customers/${m.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-primary">
                                        {m.name} <span className="font-mono text-xs text-muted-foreground">{m.customer_number}</span>
                                    </Link>
                                    <span className="text-muted-foreground">{m.points.toLocaleString()} pts now</span>
                                    <span className="w-28 text-right font-bold">{m.lifetime.toLocaleString()} lifetime</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </AdminLayout>
    );
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {label}
            </div>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
        </div>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            {children}
            {error && <span className="block text-xs text-destructive">{error}</span>}
        </label>
    );
}
