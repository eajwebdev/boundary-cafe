'use client';

import { usePage, router } from '@inertiajs/react';
import { format } from 'date-fns';
import {
    Plus,
    Search,
    X,
    Edit2,
    Trash2,
    ChevronDown,
    Eye,
    EyeOff,
    CheckSquare,
    Square,
    AlertTriangle,
    CircleDot,
    LayoutGrid,
    Tablet,
    List,
    Coffee,
    UtensilsCrossed,
    Scissors,
    Monitor,
    Smartphone,
    Users as UsersIcon,
    ShieldCheck,
    Briefcase,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Chip, controlCls, EmptyRow, PageHeader, Panel, Stat, StatStrip, StatusPill, thCls, useFlashToasts } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
    id: number;
    name: string;
    code: string;
    business_type: string;
}
interface UserRow {
    id: number;
    fname: string;
    lname: string;
    full_name: string;
    username: string;
    role: string;
    role_label: string;
    branch_id: number | null;
    branch: Branch | null;
    access: string[];
    pos_layout: string;
    pos_layout_label: string;
    created_at: string;
    is_self: boolean;
}
interface MenuGroup {
    [menuId: string]: string;
}
interface PageProps {
    users: UserRow[];
    branches: Branch[];
    roles: Record<string, string>;
    menus: Record<string, MenuGroup>;
    menuIds: string[];
    auth: { user: { is_super_admin: boolean; is_administrator: boolean } | null };
    flash: { message?: { type: string; text: string } };
    [key: string]: unknown;
}

type FormMode = 'create' | 'edit';

interface UserForm {
    fname: string;
    lname: string;
    username: string;
    password: string;
    role: string;
    branch_id: string;
    access: string[];
    pos_layout: string;
}

const EMPTY_FORM: UserForm = {
    fname: '',
    lname: '',
    username: '',
    password: '',
    role: 'cashier',
    branch_id: '',
    access: [],
    pos_layout: 'grid',
};

// ─── POS Layout definitions ───────────────────────────────────────────────────

interface PosLayoutDef {
    value: string;
    label: string;
    icon: React.ElementType;
    desc: string;
    /** Business types this layout suits best */
    bestFor: string[];
}

const POS_LAYOUTS: PosLayoutDef[] = [
    {
        value: 'grid',
        label: 'PC / Standard',
        icon: LayoutGrid,
        desc: 'Image cards, 4–5 columns. Best for retail & general use.',
        bestFor: ['retail', 'hardware', 'pharmacy', 'warehouse', 'school', 'laundry', 'mixed'],
    },
    { value: 'tablet', label: 'Tablet / Touch', icon: Tablet, desc: 'Large touch targets, 3 columns. Good for any tablet POS.', bestFor: [] },
    { value: 'grocery', label: 'Grocery / Fast', icon: List, desc: 'Compact rows with barcode. Best for high-volume item scanning.', bestFor: [] },
    {
        value: 'cafe',
        label: 'Cafe / Quick',
        icon: Coffee,
        desc: 'Category-first, text tiles, no images. Fast for F&B ordering.',
        bestFor: ['cafe', 'bakery', 'food_stall'],
    },
    {
        value: 'restaurant',
        label: 'Restaurant / Table',
        icon: UtensilsCrossed,
        desc: 'Table map + dine-in orders. For seated service.',
        bestFor: ['restaurant', 'bar'],
    },
    {
        value: 'salon',
        label: 'Salon / Service',
        icon: Scissors,
        desc: 'Service cards with duration. Customer name required at checkout.',
        bestFor: ['salon'],
    },
    {
        value: 'kiosk',
        label: 'Kiosk / Self-serve',
        icon: Monitor,
        desc: 'Fullscreen large cards, floating checkout bar. Self-service POS.',
        bestFor: [],
    },
    {
        value: 'mobile',
        label: 'Mobile / Phone',
        icon: Smartphone,
        desc: 'Compact vertical layout for Android phones. Single-column, thumb-friendly.',
        bestFor: [],
    },
];

function getPosLayoutDef(value: string) {
    return POS_LAYOUTS.find((l) => l.value === value) ?? POS_LAYOUTS[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const roleBadgeColor: Record<string, string> = {
    super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    administrator: 'bg-blue-100   text-blue-700   dark:bg-blue-900/30   dark:text-blue-300',
    manager: 'bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400',
    cashier: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400',
    waiter: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

const branchTypeBadge: Record<string, string> = {
    cafe: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300',
    retail: 'bg-blue-50   text-blue-600   dark:bg-blue-900/20   dark:text-blue-300',
    restaurant: 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300',
    mixed: 'bg-teal-50   text-teal-600   dark:bg-teal-900/20   dark:text-teal-300',
};

const layoutBadgeColor: Record<string, string> = {
    grid: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
    tablet: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    grocery: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    cafe: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
    restaurant: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    salon: 'bg-pink-500/10 text-pink-700 dark:text-pink-400',
    kiosk: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
    mobile: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

// ─── Access checkbox grid ─────────────────────────────────────────────────────

function AccessGrid({ menus, value, onChange }: { menus: Record<string, MenuGroup>; value: string[]; onChange: (access: string[]) => void }) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => {
        onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
    };

    const toggleGroup = (ids: string[]) => {
        const allOn = ids.every((id) => value.includes(id));
        onChange(allOn ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])]);
    };

    const groupLabel: Record<string, string> = {
        main: 'Main',
        sales: 'Sales',
        inventory: 'Inventory',
        cash: 'Cash',
        reports: 'Reports',
        management: 'Management',
    };

    const presets: { label: string; ids: string[] }[] = [
        { label: 'All access', ids: Object.values(menus).flatMap((g) => Object.keys(g)) },
        {
            label: 'Manager preset',
            ids: ['1', '2', '3', '4', '5', '6', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '29'],
        },
        { label: 'Cashier preset', ids: ['1', '2', '4', '14', '15', '16'] },
        { label: 'Clear all', ids: [] },
    ];

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 border-b border-border/50 pb-2">
                {presets.map((p) => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => onChange(p.ids)}
                        className="h-6 rounded-full border border-border px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            {Object.entries(menus).map(([group, items]) => {
                const ids = Object.keys(items);
                const allOn = ids.every((id) => value.includes(id));
                const someOn = ids.some((id) => value.includes(id));
                const isOpen = expanded[group] !== false;
                return (
                    <div key={group} className="overflow-hidden rounded-xl border border-border">
                        <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [group]: !isOpen }))}
                            className="flex w-full items-center gap-3 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                        >
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroup(ids);
                                }}
                                className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                            >
                                {allOn ? (
                                    <CheckSquare className="h-4 w-4 text-primary" />
                                ) : someOn ? (
                                    <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-primary">
                                        <div className="h-1.5 w-1.5 rounded-sm bg-primary" />
                                    </div>
                                ) : (
                                    <Square className="h-4 w-4" />
                                )}
                            </button>
                            <span className="flex-1 text-xs font-bold tracking-wider text-foreground uppercase">{groupLabel[group] ?? group}</span>
                            <span className="mr-1 text-[10px] text-muted-foreground tabular-nums">
                                {ids.filter((id) => value.includes(id)).length}/{ids.length}
                            </span>
                            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !isOpen && '-rotate-90')} />
                        </button>
                        {isOpen && (
                            <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                                {Object.entries(items).map(([id, label]) => {
                                    const checked = value.includes(id);
                                    return (
                                        <label
                                            key={id}
                                            className={cn(
                                                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors select-none',
                                                checked ? 'bg-primary/8 dark:bg-primary/10' : 'hover:bg-accent',
                                            )}
                                        >
                                            <input type="checkbox" checked={checked} onChange={() => toggle(id)} className="sr-only" />
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
                                            <span className="text-xs leading-tight text-foreground">{label}</span>
                                            <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">{id}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
            <p className="text-right text-[11px] text-muted-foreground">
                {value.length} menu{value.length !== 1 ? 's' : ''} selected
            </p>
        </div>
    );
}

// ─── POS Settings tab ─────────────────────────────────────────────────────────

function PosSettingsTab({ value, onChange, branchBusinessType }: { value: string; onChange: (layout: string) => void; branchBusinessType?: string }) {
    const recommended = POS_LAYOUTS.filter((l) => l.bestFor.includes(branchBusinessType ?? ''));
    const others = POS_LAYOUTS.filter((l) => !l.bestFor.includes(branchBusinessType ?? ''));

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                This sets the <span className="font-semibold text-foreground">default POS layout</span> when this user logs in as cashier. They can
                still switch layouts manually from the POS screen, but this is what loads first.
            </div>

            {recommended.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[10px] font-bold tracking-widest text-primary/70 uppercase">
                        Recommended for {branchBusinessType?.replace('_', ' ')}
                    </p>
                    {recommended.map((l) => (
                        <LayoutOption key={l.value} l={l} selected={value === l.value} onSelect={onChange} />
                    ))}
                </div>
            )}

            <div className="space-y-2">
                {recommended.length > 0 && <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Other layouts</p>}
                {others.map((l) => (
                    <LayoutOption key={l.value} l={l} selected={value === l.value} onSelect={onChange} />
                ))}
            </div>
        </div>
    );
}

function LayoutOption({ l, selected, onSelect }: { l: PosLayoutDef; selected: boolean; onSelect: (v: string) => void }) {
    const Icon = l.icon;
    return (
        <button
            type="button"
            onClick={() => onSelect(l.value)}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all',
                selected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30 hover:bg-accent',
            )}
        >
            {/* Icon */}
            <div
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                    selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
            >
                <Icon className="h-4 w-4" />
            </div>

            {/* Label + desc */}
            <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}>{l.label}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{l.desc}</p>
            </div>

            {/* Selected indicator */}
            {selected ? (
                <CircleDot className="h-4 w-4 shrink-0 text-primary" />
            ) : (
                <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />
            )}
        </button>
    );
}

// ─── User form drawer ─────────────────────────────────────────────────────────

function UserDrawer({
    mode,
    user,
    branches,
    roles,
    menus,
    onClose,
}: {
    mode: FormMode;
    user: UserRow | null;
    branches: Branch[];
    roles: Record<string, string>;
    menus: Record<string, MenuGroup>;
    menuIds: string[];
    onClose: () => void;
}) {
    const [form, setForm] = useState<UserForm>(
        user
            ? {
                  fname: user.fname,
                  lname: user.lname,
                  username: user.username,
                  password: '',
                  role: user.role,
                  branch_id: String(user.branch_id ?? ''),
                  access: user.access.map(String),
                  pos_layout: user.pos_layout ?? 'grid',
              }
            : { ...EMPTY_FORM },
    );
    const [showPwd, setShowPwd] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [tab, setTab] = useState<'info' | 'access' | 'pos'>('info');

    const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((e) => ({ ...e, [k]: '' }));
    };

    // When branch changes, suggest a matching layout if current one is default
    const selectedBranch = branches.find((b) => String(b.id) === String(form.branch_id));

    const handleSubmit = () => {
        setLoading(true);
        setErrors({});
        const opts = {
            preserveScroll: true,
            onSuccess: () => {
                setLoading(false);
                onClose();
            },
            onError: (e: Record<string, string>) => {
                setErrors(e);
                setLoading(false);
                setTab('info');
            },
        };
        if (mode === 'create') {
            router.post(routes.users.store(), { ...form }, opts);
        } else {
            router.patch(routes.users.update(user!.id), { ...form }, opts);
        }
    };

    const tabs: { key: 'info' | 'access' | 'pos'; label: string }[] = [
        { key: 'info', label: 'User info' },
        { key: 'access', label: 'Menu access' },
        { key: 'pos', label: 'POS Settings' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[520px]">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <div>
                        <p className="font-bold text-foreground">{mode === 'create' ? 'Create user' : `Edit — ${user?.full_name}`}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {mode === 'create' ? 'Fill in the details below' : 'Update user details and access'}
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
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={cn(
                                'flex-1 py-2.5 text-sm font-semibold transition-colors',
                                tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t.key === 'pos' ? (
                                <span className="inline-flex items-center justify-center gap-1.5">
                                    POS Settings
                                    {/* Show current layout as a tiny badge */}
                                    {form.pos_layout && (
                                        <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold', layoutBadgeColor[form.pos_layout])}>
                                            {getPosLayoutDef(form.pos_layout).label.split(' / ')[0]}
                                        </span>
                                    )}
                                </span>
                            ) : (
                                t.label
                            )}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* ── User Info tab ────────────────────────── */}
                    {tab === 'info' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="field-label">
                                        First name <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                        value={form.fname}
                                        onChange={(e) => set('fname', e.target.value)}
                                        placeholder="Juan"
                                        className={cn('mt-1 h-9', errors.fname && 'border-destructive')}
                                    />
                                    {errors.fname && <p className="field-error">{errors.fname}</p>}
                                </div>
                                <div>
                                    <label className="field-label">
                                        Last name <span className="text-destructive">*</span>
                                    </label>
                                    <Input
                                        value={form.lname}
                                        onChange={(e) => set('lname', e.target.value)}
                                        placeholder="Dela Cruz"
                                        className={cn('mt-1 h-9', errors.lname && 'border-destructive')}
                                    />
                                    {errors.lname && <p className="field-error">{errors.lname}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="field-label">
                                    Username <span className="text-destructive">*</span>
                                </label>
                                <Input
                                    value={form.username}
                                    onChange={(e) => set('username', e.target.value)}
                                    placeholder="juan.delacruz"
                                    autoComplete="off"
                                    className={cn('mt-1 h-9 font-mono', errors.username && 'border-destructive')}
                                />
                                {errors.username && <p className="field-error">{errors.username}</p>}
                            </div>

                            <div>
                                <label className="field-label">
                                    Password{' '}
                                    {mode === 'edit' && <span className="ml-1 font-normal text-muted-foreground">(leave blank to keep)</span>}
                                    {mode === 'create' && <span className="text-destructive">*</span>}
                                </label>
                                <div className="relative mt-1">
                                    <Input
                                        value={form.password}
                                        onChange={(e) => set('password', e.target.value)}
                                        type={showPwd ? 'text' : 'password'}
                                        placeholder="Min. 6 characters"
                                        autoComplete="new-password"
                                        className={cn('h-9 pr-9', errors.password && 'border-destructive')}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPwd((p) => !p)}
                                        className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </button>
                                </div>
                                {errors.password && <p className="field-error">{errors.password}</p>}
                            </div>

                            <div>
                                <label className="field-label">
                                    Role <span className="text-destructive">*</span>
                                </label>
                                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {Object.entries(roles).map(([val, label]) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => set('role', val)}
                                            className={cn(
                                                'rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-all',
                                                form.role === val
                                                    ? cn('border-primary shadow-sm', roleBadgeColor[val])
                                                    : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {errors.role && <p className="field-error">{errors.role}</p>}
                            </div>

                            <div>
                                <label className="field-label">
                                    Branch <span className="text-destructive">*</span>
                                </label>
                                <div className="mt-1 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                                    {branches.map((b) => (
                                        <button
                                            key={b.id}
                                            type="button"
                                            onClick={() => set('branch_id', String(b.id))}
                                            className={cn(
                                                'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                                                String(form.branch_id) === String(b.id)
                                                    ? 'border-primary bg-primary/5 shadow-sm'
                                                    : 'border-border hover:border-primary/30 hover:bg-accent',
                                            )}
                                        >
                                            <CircleDot
                                                className={cn(
                                                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                                                    String(form.branch_id) === String(b.id) ? 'text-primary' : 'text-muted-foreground/40',
                                                )}
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-foreground">{b.name}</p>
                                                <div className="mt-0.5 flex items-center gap-1.5">
                                                    <span className="font-mono text-[10px] text-muted-foreground">{b.code}</span>
                                                    <span
                                                        className={cn(
                                                            'rounded-sm px-1 py-0.5 text-[9px] font-bold capitalize',
                                                            branchTypeBadge[b.business_type] ?? 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        {b.business_type}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {errors.branch_id && <p className="field-error">{errors.branch_id}</p>}
                            </div>
                        </div>
                    )}

                    {/* ── Menu Access tab ──────────────────────── */}
                    {tab === 'access' &&
                        (form.role === 'waiter' ? (
                            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
                                <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Order taker — table ordering only</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        This account can only take table orders. Other menus can't be granted to an order taker; change the role to
                                        give wider access.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <AccessGrid menus={menus} value={form.access} onChange={(ids) => set('access', ids)} />
                        ))}

                    {/* ── POS Settings tab ─────────────────────── */}
                    {tab === 'pos' && (
                        <PosSettingsTab
                            value={form.pos_layout}
                            onChange={(v) => set('pos_layout', v)}
                            branchBusinessType={selectedBranch?.business_type}
                        />
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
                        {mode === 'create' ? 'Create user' : 'Save changes'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleDelete = () => {
        setLoading(true);
        setError('');
        router.delete(routes.users.destroy(user.id), {
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
                        <p className="font-bold text-foreground">Delete user?</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            <span className="font-semibold">{user.full_name}</span> · {user.username}
                        </p>
                    </div>
                </div>
                <div>
                    <label className="field-label">Reason (optional)</label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                        placeholder="e.g. Resigned, duplicate account…"
                        className="mt-1 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UsersIndex() {
    const { users, branches, roles, menus, menuIds, auth } = usePage<PageProps>().props;
    useFlashToasts();

    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [layoutFilter, setLayoutFilter] = useState('');
    const [drawer, setDrawer] = useState<{ mode: FormMode; user: UserRow | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

    const filtered = useMemo(() => {
        let list = users;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((u) => u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
        }
        if (roleFilter) list = list.filter((u) => u.role === roleFilter);
        if (branchFilter) list = list.filter((u) => String(u.branch_id) === branchFilter);
        if (layoutFilter) list = list.filter((u) => u.pos_layout === layoutFilter);
        return list;
    }, [users, search, roleFilter, branchFilter, layoutFilter]);

    const canManage = auth?.user?.is_super_admin || auth?.user?.is_administrator;

    const hasFilters = search || roleFilter || branchFilter || layoutFilter;

    const countRole = (...roleKeys: string[]) => users.filter((u) => roleKeys.includes(u.role)).length;

    return (
        <AdminLayout>
            <div className="space-y-4">
                <PageHeader title="Users" subtitle="Staff accounts, their role, branch and what they can open.">
                    {canManage && (
                        <Button size="sm" className="h-9 gap-1.5" onClick={() => setDrawer({ mode: 'create', user: null })}>
                            <Plus className="h-4 w-4" /> Add user
                        </Button>
                    )}
                </PageHeader>

                <StatStrip count={5}>
                    <Stat icon={UsersIcon} label="Accounts" value={users.length.toLocaleString()} />
                    <Stat icon={ShieldCheck} label="Admins" value={countRole('super_admin', 'administrator').toLocaleString()} />
                    <Stat icon={Briefcase} label="Managers" value={countRole('manager').toLocaleString()} />
                    <Stat icon={Monitor} label="Cashiers" value={countRole('cashier').toLocaleString()} />
                    <Stat icon={UtensilsCrossed} label="Order takers" value={countRole('waiter').toLocaleString()} />
                </StatStrip>

                <Panel
                    flush
                    icon={UsersIcon}
                    title="All users"
                    actions={
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Name or username"
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
                        <Chip active={roleFilter === ''} onClick={() => setRoleFilter('')}>
                            All roles
                        </Chip>
                        {Object.entries(roles).map(([role, label]) => (
                            <Chip key={role} active={roleFilter === role} onClick={() => setRoleFilter(roleFilter === role ? '' : role)}>
                                {label} <span className="opacity-60">{countRole(role)}</span>
                            </Chip>
                        ))}
                        <div className="ml-auto flex flex-wrap gap-1.5">
                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                className={cn(controlCls, 'h-7 text-xs')}
                                aria-label="Branch"
                            >
                                <option value="">All branches</option>
                                {branches.map((b) => (
                                    <option key={b.id} value={String(b.id)}>
                                        {b.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={layoutFilter}
                                onChange={(e) => setLayoutFilter(e.target.value)}
                                className={cn(controlCls, 'h-7 text-xs')}
                                aria-label="POS layout"
                            >
                                <option value="">Any POS layout</option>
                                {POS_LAYOUTS.map((l) => (
                                    <option key={l.value} value={l.value}>
                                        {l.label}
                                    </option>
                                ))}
                            </select>
                            {hasFilters && (
                                <button
                                    onClick={() => {
                                        setSearch('');
                                        setRoleFilter('');
                                        setBranchFilter('');
                                        setLayoutFilter('');
                                    }}
                                    className="h-7 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>User</th>
                                    <th className={thCls}>Role</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Branch</th>
                                    <th className={cn(thCls, 'hidden sm:table-cell')}>POS layout</th>
                                    <th className={cn(thCls, 'hidden lg:table-cell')}>Menu access</th>
                                    <th className={cn(thCls, 'hidden sm:table-cell')}>Joined</th>
                                    <th className="w-20" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.length === 0 ? (
                                    <EmptyRow colSpan={7} icon={UsersIcon}>
                                        {hasFilters ? 'No users match these filters.' : 'No users yet.'}
                                    </EmptyRow>
                                ) : (
                                    filtered.map((user) => {
                                        const layoutDef = getPosLayoutDef(user.pos_layout);
                                        const LayoutIcon = layoutDef.icon;
                                        return (
                                            <tr key={user.id} className="hover:bg-muted/30">
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <span
                                                            className={cn(
                                                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black',
                                                                roleBadgeColor[user.role] ?? 'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            {user.fname.charAt(0)}
                                                            {user.lname.charAt(0)}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="flex items-center gap-1.5 truncate font-semibold">
                                                                {user.full_name}
                                                                {user.is_self && <StatusPill tone="primary">you</StatusPill>}
                                                            </p>
                                                            <p className="font-mono text-[11px] text-muted-foreground">{user.username}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span
                                                        className={cn(
                                                            'rounded-full px-2 py-0.5 text-[11px] font-bold',
                                                            roleBadgeColor[user.role] ?? 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        {user.role_label}
                                                    </span>
                                                </td>
                                                <td className="hidden px-4 py-2 md:table-cell">
                                                    {user.branch ? (
                                                        <>
                                                            <p className="font-semibold">{user.branch.name}</p>
                                                            <p className="font-mono text-[11px] text-muted-foreground">{user.branch.code}</p>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">All branches</span>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-2 sm:table-cell">
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                                                            layoutBadgeColor[user.pos_layout] ?? 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        <LayoutIcon className="h-3 w-3" /> {layoutDef.label.split(' / ')[0]}
                                                    </span>
                                                </td>
                                                <td className="hidden px-4 py-2 lg:table-cell">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                                            <div
                                                                className="h-full rounded-full bg-primary"
                                                                style={{ width: `${Math.min(100, (user.access.length / menuIds.length) * 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground tabular-nums">
                                                            {user.access.length}/{menuIds.length}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground sm:table-cell">
                                                    {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
                                                </td>
                                                <td className="px-2 py-2">
                                                    {canManage && (
                                                        <div className="flex justify-end gap-0.5">
                                                            <button
                                                                onClick={() => setDrawer({ mode: 'edit', user })}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                aria-label={`Edit ${user.full_name}`}
                                                            >
                                                                <Edit2 className="h-3.5 w-3.5" />
                                                            </button>
                                                            {!user.is_self && (
                                                                <button
                                                                    onClick={() => setDeleteTarget(user)}
                                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                                    aria-label={`Delete ${user.full_name}`}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
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
                <UserDrawer
                    mode={drawer.mode}
                    user={drawer.user}
                    branches={branches}
                    roles={roles}
                    menus={menus}
                    menuIds={menuIds}
                    onClose={() => setDrawer(null)}
                />
            )}

            {deleteTarget && <DeleteDialog user={deleteTarget} onClose={() => setDeleteTarget(null)} />}
        </AdminLayout>
    );
}
