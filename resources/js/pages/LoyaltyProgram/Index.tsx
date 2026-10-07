import { Link, useForm } from '@inertiajs/react';
import { Award, Coins, Gift, Loader2, Plus, Save, Trash2, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { PageHeader, Panel, Stat, StatStrip } from '@/components/AdminKit';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

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

const inputCls =
    'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
const money = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LoyaltyProgram({ rules, stats, top_members, flash }: Props) {
    const form = useForm({ ...rules });
    const d = form.data;
    const errors = form.errors as Record<string, string>;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
    }, [flash]);

    const setTier = (i: number, patch: Partial<Tier>) =>
        form.setData(
            'tiers',
            d.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
        );

    return (
        <AdminLayout title="Loyalty Program">
            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.put('/loyalty-program', { preserveScroll: true });
                }}
            >
                {/* ── Header: title, programme switch, save ─────────────── */}
                <PageHeader
                    title="Boundary Rewards"
                    subtitle="Points for counter, dine-in and online orders — earned on completed sales, reversed on voids."
                >
                    <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold">
                        <Switch checked={d.enabled} onCheckedChange={(on) => form.setData('enabled', on)} />
                        {d.enabled ? 'Programme on' : 'Programme off'}
                    </label>
                    {form.isDirty && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Unsaved changes</span>}
                    <button
                        type="submit"
                        disabled={form.processing || !form.isDirty}
                        className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
                    >
                        {form.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                    </button>
                </PageHeader>

                {/* ── Stats strip ──────────────────────────────────────── */}
                <StatStrip count={6}>
                    <Stat icon={Users} label="Members" value={stats.members.toLocaleString()} />
                    <Stat icon={Users} label="Online accounts" value={stats.online_accounts.toLocaleString()} />
                    <Stat icon={Coins} label="Outstanding pts" value={stats.outstanding_points.toLocaleString()} />
                    <Stat icon={Gift} label="Points liability" value={money(stats.liability)} />
                    <Stat icon={TrendingUp} label="Issued · 30d" value={stats.issued_30d.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Redeemed · 30d" value={stats.redeemed_30d.toLocaleString()} />
                </StatStrip>

                <div className={cn('grid gap-4 lg:grid-cols-2 xl:grid-cols-3', !d.enabled && 'opacity-70')}>
                    {/* ── Earning & redeeming ──────────────────────────── */}
                    <Panel icon={Coins} title="Earning & redeeming">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <Field label="Spend for 1 point" error={form.errors.spend_per_point}>
                                <Num prefix="₱" min="1" step="1" value={d.spend_per_point} onChange={(v) => form.setData('spend_per_point', v)} />
                            </Field>
                            <Field label="1 point is worth" error={form.errors.peso_per_point}>
                                <Num prefix="₱" min="0.01" step="0.01" value={d.peso_per_point} onChange={(v) => form.setData('peso_per_point', v)} />
                            </Field>
                            <Field label="Min. to redeem" error={form.errors.minimum_redeem}>
                                <Num suffix="pts" min="1" value={d.minimum_redeem} onChange={(v) => form.setData('minimum_redeem', v)} />
                            </Field>
                            <Field label="Max. per order" error={form.errors.maximum_redeem}>
                                <Num suffix="pts" min="0" value={d.maximum_redeem} onChange={(v) => form.setData('maximum_redeem', v)} />
                            </Field>
                            <Field label="Birthday bonus" error={form.errors.birthday_bonus}>
                                <Num suffix="pts" min="0" value={d.birthday_bonus} onChange={(v) => form.setData('birthday_bonus', v)} />
                            </Field>
                        </div>
                        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                            {money(d.spend_per_point * 5)} order → 5 pts{d.tiers_enabled ? ' (more on higher tiers)' : ''} · {d.minimum_redeem} pts ={' '}
                            {money(d.minimum_redeem * d.peso_per_point)} off
                        </p>
                    </Panel>

                    {/* ── Membership tiers ─────────────────────────────── */}
                    <Panel
                        icon={Award}
                        title="Membership tiers"
                        actions={
                            <Switch
                                checked={d.tiers_enabled}
                                onCheckedChange={(on) => form.setData('tiers_enabled', on)}
                                aria-label="Tiers enabled"
                            />
                        }
                    >
                        <div className={cn('space-y-1.5', !d.tiers_enabled && 'opacity-50')}>
                            <div className="grid grid-cols-[1fr_76px_60px_44px_28px] gap-1.5 px-0.5 text-[11px] font-semibold text-muted-foreground">
                                <span>Tier</span>
                                <span>From pts</span>
                                <span>Earn ×</span>
                                <span className="text-right">Members</span>
                                <span />
                            </div>
                            {d.tiers.map((t, i) => (
                                <div key={i} className="grid grid-cols-[1fr_76px_60px_44px_28px] items-center gap-1.5">
                                    <input
                                        className={inputCls}
                                        value={t.name}
                                        onChange={(e) => setTier(i, { name: e.target.value })}
                                        aria-label="Tier name"
                                    />
                                    <input
                                        className={inputCls}
                                        type="number"
                                        min="0"
                                        value={t.min}
                                        onChange={(e) => setTier(i, { min: Number(e.target.value) })}
                                        aria-label="Lifetime points from"
                                    />
                                    <input
                                        className={inputCls}
                                        type="number"
                                        min="1"
                                        max="5"
                                        step="0.05"
                                        value={t.multiplier}
                                        onChange={(e) => setTier(i, { multiplier: Number(e.target.value) })}
                                        aria-label="Earn multiplier"
                                    />
                                    <span className="text-right text-sm text-muted-foreground tabular-nums">{stats.tier_counts[t.name] ?? 0}</span>
                                    <button
                                        type="button"
                                        disabled={d.tiers.length <= 1}
                                        onClick={() =>
                                            form.setData(
                                                'tiers',
                                                d.tiers.filter((_, idx) => idx !== i),
                                            )
                                        }
                                        className="flex h-7 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30"
                                        aria-label="Remove tier"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            {errors.tiers && <p className="text-xs text-destructive">{errors.tiers}</p>}
                            <button
                                type="button"
                                disabled={d.tiers.length >= 6}
                                onClick={() =>
                                    form.setData('tiers', [...d.tiers, { name: 'New tier', min: (d.tiers.at(-1)?.min ?? 0) + 1000, multiplier: 1 }])
                                }
                                className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add tier
                            </button>
                        </div>
                    </Panel>

                    {/* ── Top members ──────────────────────────────────── */}
                    <Panel
                        flush
                        icon={Trophy}
                        title="Top members"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">lifetime · now</span>}
                        className="lg:col-span-2 xl:col-span-1"
                    >
                        {top_members.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
                        ) : (
                            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                                {top_members.map((m, i) => (
                                    <li key={m.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                        <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                                        <Link href={`/customers/${m.id}`} className="min-w-0 flex-1 hover:text-primary">
                                            <span className="block truncate font-semibold">{m.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{m.customer_number}</span>
                                        </Link>
                                        <span className="text-right tabular-nums">
                                            <span className="font-bold">{m.lifetime.toLocaleString()}</span>
                                            <span className="text-muted-foreground"> · {m.points.toLocaleString()}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </form>
        </AdminLayout>
    );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
            {children}
            {error && <span className="block text-xs text-destructive">{error}</span>}
        </label>
    );
}

/** Number input with an inline unit (₱ before or "pts" after). */
function Num({
    value,
    onChange,
    prefix,
    suffix,
    ...rest
}: { value: number; onChange: (value: number) => void; prefix?: string; suffix?: string } & Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'prefix'
>) {
    return (
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
            <input
                type="number"
                className={cn(inputCls, prefix && 'pl-6', suffix && 'pr-9')}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                {...rest}
            />
            {suffix && (
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
            )}
        </div>
    );
}
