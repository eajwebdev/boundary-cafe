import { Link, useForm } from '@inertiajs/react';
import {
    Award,
    Clock,
    Coins,
    Filter,
    Gift,
    Loader2,
    Plus,
    QrCode,
    Save,
    Target,
    Trash2,
    TrendingDown,
    TrendingUp,
    Trophy,
    Users,
} from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { Chip, PageHeader, Panel, Stat, StatStrip } from '@/components/AdminKit';
import { Switch } from '@/components/ui/switch';
import { useRewardsName } from '@/hooks/use-business-name';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import LoyaltyNav from './LoyaltyNav';

interface Tier {
    name: string;
    min: number;
    multiplier: number;
}

type Channel = 'counter' | 'dine_in' | 'online';

interface Rules {
    enabled: boolean;
    spend_increment: number;
    points_per_increment: number;
    earn_channels: Channel[];
    excluded_category_ids: number[];
    allow_peso_discount: boolean;
    peso_per_point: number;
    minimum_redeem: number;
    maximum_redeem: number;
    claim_expiry_minutes: number;
    points_expiry_months: number;
    tiers_enabled: boolean;
    tiers: Tier[];
    birthday_bonus: number;
}

interface Props {
    rules: Rules;
    categories: { id: number; name: string }[];
    stats: {
        members: number;
        online_accounts: number;
        outstanding_points: number;
        reserved_points: number;
        pending_claims: number;
        issued_30d: number;
        redeemed_30d: number;
        rewards_value_30d: number;
        tier_counts: Record<string, number>;
    };
    top_members: { id: number; name: string; customer_number: string; points: number; lifetime: number }[];
    missions: MissionSettings & {
        max: number;
        stats: { assigned: number; completed: number; points_awarded: number; completion_rate_7d: number | null };
    };
    flash?: { success?: string | null };
}

type MissionType = 'spend' | 'items' | 'category';

interface MissionTemplate {
    type: MissionType;
    target: number;
    points: number;
    category_id: number | null;
}

interface MissionSettings {
    enabled: boolean;
    share: number;
    missions: MissionTemplate[];
}

const MISSION_TYPES: { value: MissionType; label: string }[] = [
    { value: 'spend', label: 'Spend at least' },
    { value: 'items', label: 'Order items' },
    { value: 'category', label: 'Order from category' },
];

const CHANNELS: { value: Channel; label: string }[] = [
    { value: 'counter', label: 'Counter / takeout' },
    { value: 'dine_in', label: 'Dine-in' },
    { value: 'online', label: 'Online orders' },
];

const inputCls =
    'h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
const money = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesos = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

export default function LoyaltyProgram({ rules, categories, stats, top_members, missions, flash }: Props) {
    const rewardsName = useRewardsName();
    const form = useForm<Rules>({ ...rules });
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
    const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    const pointsFor = (amount: number) => Math.floor(amount / Math.max(1, d.spend_increment || 1)) * (d.points_per_increment || 0);

    return (
        <AdminLayout title="Loyalty Program">
            <form
                className="space-y-4"
                onSubmit={(e) => {
                    e.preventDefault();
                    form.put('/loyalty-program', { preserveScroll: true });
                }}
            >
                <PageHeader
                    title={rewardsName}
                    subtitle="Points on every completed sale at any branch, spent on reward items claimed in-store with a QR."
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

                <LoyaltyNav pendingClaims={stats.pending_claims} />

                <StatStrip count={8}>
                    <Stat icon={Users} label="Members" value={stats.members.toLocaleString()} />
                    <Stat icon={Users} label="Online accounts" value={stats.online_accounts.toLocaleString()} />
                    <Stat icon={Coins} label="Outstanding pts" value={stats.outstanding_points.toLocaleString()} />
                    <Stat
                        icon={Clock}
                        label="Held for claims"
                        value={stats.reserved_points.toLocaleString()}
                        tone={stats.reserved_points > 0 ? 'warning' : 'muted'}
                    />
                    <Stat icon={QrCode} label="QRs waiting" value={stats.pending_claims.toLocaleString()} />
                    <Stat icon={TrendingUp} label="Issued · 30d" value={stats.issued_30d.toLocaleString()} />
                    <Stat icon={TrendingDown} label="Redeemed · 30d" value={stats.redeemed_30d.toLocaleString()} />
                    <Stat icon={Gift} label="Rewards value · 30d" value={money(stats.rewards_value_30d)} />
                </StatStrip>

                <div className={cn('grid gap-4 lg:grid-cols-2 xl:grid-cols-3', !d.enabled && 'opacity-70')}>
                    {/* ── Earning ──────────────────────────────────────── */}
                    <Panel icon={Coins} title="Earning points">
                        <p className="text-xs text-muted-foreground">Points = FLOOR(eligible amount ÷ spend increment) × points per increment</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <Field label="Every" error={errors.spend_increment}>
                                <Num prefix="₱" min="1" step="1" value={d.spend_increment} onChange={(v) => form.setData('spend_increment', v)} />
                            </Field>
                            <Field label="earns" error={errors.points_per_increment}>
                                <Num
                                    suffix="pts"
                                    min="1"
                                    step="1"
                                    value={d.points_per_increment}
                                    onChange={(v) => form.setData('points_per_increment', v)}
                                />
                            </Field>
                            <Field label="Birthday bonus" error={errors.birthday_bonus}>
                                <Num suffix="pts" min="0" value={d.birthday_bonus} onChange={(v) => form.setData('birthday_bonus', v)} />
                            </Field>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5 rounded-lg bg-muted p-2 text-center">
                            {[99, 100, 250, 490, 500].map((amount) => (
                                <div key={amount}>
                                    <p className="text-[11px] text-muted-foreground tabular-nums">{pesos(amount)}</p>
                                    <p className="text-sm font-bold tabular-nums">{pointsFor(amount)} pts</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Points are added only after payment is complete, never on ₱0 reward items, and are taken back if the sale is voided.
                        </p>
                    </Panel>

                    {/* ── Eligibility ──────────────────────────────────── */}
                    <Panel icon={Filter} title="What earns points">
                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Transactions</p>
                            <div className="flex flex-wrap gap-1.5">
                                {CHANNELS.map((c) => (
                                    <Chip
                                        key={c.value}
                                        active={d.earn_channels.includes(c.value)}
                                        onClick={() => form.setData('earn_channels', toggle(d.earn_channels, c.value))}
                                    >
                                        {c.label}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Categories that do NOT earn points</p>
                            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                                {categories.map((c) => (
                                    <Chip
                                        key={c.id}
                                        active={d.excluded_category_ids.includes(c.id)}
                                        onClick={() => form.setData('excluded_category_ids', toggle(d.excluded_category_ids, c.id))}
                                    >
                                        {c.name}
                                    </Chip>
                                ))}
                            </div>
                            {errors.excluded_category_ids && <p className="mt-1 text-xs text-destructive">{errors.excluded_category_ids}</p>}
                        </div>
                    </Panel>

                    {/* ── Claiming & expiry ────────────────────────────── */}
                    <Panel icon={QrCode} title="Claiming rewards">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <Field label="Reward QR valid for" error={errors.claim_expiry_minutes}>
                                <Num
                                    suffix="min"
                                    min="5"
                                    max="1440"
                                    value={d.claim_expiry_minutes}
                                    onChange={(v) => form.setData('claim_expiry_minutes', v)}
                                />
                            </Field>
                            <Field label="Points expire after" error={errors.points_expiry_months}>
                                <Num
                                    suffix="mo"
                                    min="0"
                                    max="120"
                                    value={d.points_expiry_months}
                                    onChange={(v) => form.setData('points_expiry_months', v)}
                                />
                            </Field>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {d.points_expiry_months > 0
                                ? `A member's balance expires after ${d.points_expiry_months} months without earning.`
                                : 'Points never expire.'}{' '}
                            Unused reward QRs return their points when they expire.
                        </p>
                        <Link
                            href="/loyalty-program/rewards"
                            className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                        >
                            <Gift className="h-4 w-4" /> Set which items customers can claim →
                        </Link>
                        <div className="border-t border-border pt-3">
                            <label className="flex cursor-pointer items-center justify-between gap-3">
                                <span>
                                    <span className="block text-sm font-semibold">Also allow points as a peso discount</span>
                                    <span className="block text-xs text-muted-foreground">Off: points are spent only on reward items, in-store.</span>
                                </span>
                                <Switch checked={d.allow_peso_discount} onCheckedChange={(on) => form.setData('allow_peso_discount', on)} />
                            </label>
                            {d.allow_peso_discount && (
                                <div className="mt-2.5 grid grid-cols-3 gap-2">
                                    <Field label="1 point =" error={errors.peso_per_point}>
                                        <Num
                                            prefix="₱"
                                            min="0.01"
                                            step="0.01"
                                            value={d.peso_per_point}
                                            onChange={(v) => form.setData('peso_per_point', v)}
                                        />
                                    </Field>
                                    <Field label="Min. use" error={errors.minimum_redeem}>
                                        <Num suffix="pts" min="1" value={d.minimum_redeem} onChange={(v) => form.setData('minimum_redeem', v)} />
                                    </Field>
                                    <Field label="Max. / order" error={errors.maximum_redeem}>
                                        <Num suffix="pts" min="0" value={d.maximum_redeem} onChange={(v) => form.setData('maximum_redeem', v)} />
                                    </Field>
                                </div>
                            )}
                        </div>
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
                        className="lg:col-span-2 xl:col-span-2"
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

            <MissionsPanel missions={missions} categories={categories} programmeOn={rules.enabled} />
        </AdminLayout>
    );
}

/**
 * Daily missions: each day a random share of members gets one of these missions, valid that day only.
 * Saved on its own (separate from the programme form above).
 */
function MissionsPanel({
    missions,
    categories,
    programmeOn,
}: {
    missions: Props['missions'];
    categories: Props['categories'];
    programmeOn: boolean;
}) {
    const form = useForm<MissionSettings>({ enabled: missions.enabled, share: missions.share, missions: missions.missions });
    const d = form.data;
    const errors = form.errors as Record<string, string>;
    const s = missions.stats;

    const setMission = (i: number, patch: Partial<MissionTemplate>) =>
        form.setData(
            'missions',
            d.missions.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
        );
    const preview = (m: MissionTemplate) => {
        const n = Math.max(1, Math.round(m.target || 0));
        const items = `${n} item${n === 1 ? '' : 's'}`;
        if (m.type === 'spend') return `Spend ${pesos(m.target || 0)} today`;
        if (m.type === 'category') return `Order ${items} from ${categories.find((c) => c.id === m.category_id)?.name ?? '…'} today`;
        return `Order ${items} today`;
    };
    const rowError = (i: number) => errors[`missions.${i}.category_id`] ?? errors[`missions.${i}.target`] ?? errors[`missions.${i}.points`];

    return (
        <form
            className="mt-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.put('/loyalty-program/missions', { preserveScroll: true });
            }}
        >
            <Panel
                icon={Target}
                title="Daily missions"
                actions={
                    <div className="flex items-center gap-2">
                        {form.isDirty && <span className="hidden text-xs font-semibold text-amber-600 sm:inline dark:text-amber-400">Unsaved</span>}
                        <Switch checked={d.enabled} onCheckedChange={(on) => form.setData('enabled', on)} aria-label="Daily missions on" />
                        <button
                            type="submit"
                            disabled={form.processing || !form.isDirty}
                            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                        >
                            {form.processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                        </button>
                    </div>
                }
            >
                <p className="text-xs text-muted-foreground">
                    Every day just after midnight, {d.share}% of members are picked at random and each gets one of these missions, valid that day
                    only. Purchases online or at the counter (with the member card) count, and the bonus is added automatically when the target is
                    met. Changes apply from the next day’s draw.
                    {!programmeOn && ' Missions pause while the rewards programme is off.'}
                </p>

                <div className={cn('space-y-3', !d.enabled && 'opacity-50')}>
                    <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-2 text-center sm:grid-cols-4">
                        <MiniStat label="Handed out today" value={s.assigned.toLocaleString()} />
                        <MiniStat label="Completed today" value={s.completed.toLocaleString()} />
                        <MiniStat label="Bonus pts today" value={s.points_awarded.toLocaleString()} />
                        <MiniStat label="Done · 7 days" value={s.completion_rate_7d === null ? '—' : `${s.completion_rate_7d}%`} />
                    </div>

                    <div className="max-w-56">
                        <Field label="Members who get a mission each day" error={errors.share}>
                            <Num suffix="%" min="1" max="100" value={d.share} onChange={(v) => form.setData('share', v)} />
                        </Field>
                    </div>

                    <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground">Missions (one is picked at random for each member)</p>
                        {d.missions.map((m, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_28px] items-start gap-1.5 rounded-lg border border-border p-2 sm:grid-cols-[170px_120px_minmax(0,1fr)_96px_28px] sm:border-0 sm:p-0"
                            >
                                <select
                                    className={cn(inputCls, 'col-span-3 sm:col-span-1')}
                                    value={m.type}
                                    onChange={(e) => {
                                        const type = e.target.value as MissionType;
                                        setMission(i, {
                                            type,
                                            target: type === 'spend' ? Math.max(m.target, 100) : Math.min(Math.max(1, Math.round(m.target)), 10),
                                            category_id: type === 'category' ? (m.category_id ?? categories[0]?.id ?? null) : null,
                                        });
                                    }}
                                    aria-label="Mission type"
                                >
                                    {MISSION_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                                <Num
                                    prefix={m.type === 'spend' ? '₱' : undefined}
                                    suffix={m.type === 'spend' ? undefined : 'items'}
                                    min="1"
                                    step={m.type === 'spend' ? '10' : '1'}
                                    value={m.target}
                                    onChange={(v) => setMission(i, { target: v })}
                                    aria-label="Target"
                                />
                                <div className="order-last col-span-3 min-w-0 sm:order-0 sm:col-span-1">
                                    {m.type === 'category' ? (
                                        <select
                                            className={inputCls}
                                            value={m.category_id ?? ''}
                                            onChange={(e) => setMission(i, { category_id: e.target.value ? Number(e.target.value) : null })}
                                            aria-label="Category"
                                        >
                                            <option value="">Pick a category…</option>
                                            {categories.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="flex h-9 items-center truncate text-sm text-muted-foreground">
                                            “{preview(m)}” → +{m.points || 0} pts
                                        </p>
                                    )}
                                    {rowError(i) && <p className="mt-0.5 text-xs text-destructive">{rowError(i)}</p>}
                                </div>
                                <Num suffix="pts" min="1" value={m.points} onChange={(v) => setMission(i, { points: v })} aria-label="Bonus points" />
                                <button
                                    type="button"
                                    disabled={d.missions.length <= 1}
                                    onClick={() =>
                                        form.setData(
                                            'missions',
                                            d.missions.filter((_, idx) => idx !== i),
                                        )
                                    }
                                    className="flex h-9 w-7 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30"
                                    aria-label="Remove mission"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))}
                        {errors.missions && <p className="text-xs text-destructive">{errors.missions}</p>}
                        <button
                            type="button"
                            disabled={d.missions.length >= missions.max}
                            onClick={() => form.setData('missions', [...d.missions, { type: 'spend', target: 300, points: 10, category_id: null }])}
                            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add mission
                        </button>
                    </div>
                </div>
            </Panel>
        </form>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-sm font-bold tabular-nums">{value}</p>
        </div>
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
                className={cn(inputCls, prefix && 'pl-6', suffix && 'pr-10')}
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
