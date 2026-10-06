import { Head, usePage, router } from '@inertiajs/react';
import {
    Settings,
    Globe,
    ShoppingCart,
    Receipt,
    Package,
    Banknote,
    Bell,
    Layers,
    ChevronDown,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Save,
    RotateCcw,
    Shield,
    Sparkles,
    Zap,
    Palette,
    Upload,
    ImageIcon,
} from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingDef {
    key: string;
    label: string;
    description?: string | null;
    type: 'string' | 'boolean' | 'integer' | 'decimal' | 'select' | 'image';
    options?: string[] | null;
    is_readonly: boolean;
    super_only: boolean;
    global_value: string;
    value: string;
    is_overridden: boolean;
}

interface Branch {
    id: number;
    name: string;
    code: string;
    business_type: string;
}

interface PageProps {
    settings: Record<string, Record<string, SettingDef>>;
    module_settings: Record<string, boolean>;
    menu_groups: Record<string, Record<string, string>>;
    branches: Branch[] | null;
    active_branch_id: number | null;
    is_super_admin: boolean;
    is_administrator: boolean;
    app: { currency: string };
    flash?: { message?: { type: string; text: string } | null };
    [key: string]: unknown;
}

// ─── Module Presets ───────────────────────────────────────────────────────────

const PRESETS: Record<
    string,
    {
        label: string;
        icon: React.ElementType;
        color: string;
        description: string;
        ids: string[];
        aiChat: boolean;
    }
> = {
    Standard: {
        label: 'Standard',
        icon: Zap,
        color: 'text-blue-500 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20',
        description: 'Dashboard, POS, online orders, table ordering, customers & loyalty, products, cash management, basic reports, users, settings',
        // 1 Dashboard · 2 POS · 3 Sales History · 6 Products · 7 Categories · 14–17 Cash
        // 18–20 Reports · 22 Logs · 23 Users · 27 Expense Categories · 28 Settings · 33 Inventory
        // 36 Stock Count · 39 Customers · 40 Online Orders · 41 Table Ordering · 42 Dining Tables
        // 43 Delivery Zone · 44 Loyalty Program
        ids: ['1', '2', '3', '6', '7', '14', '15', '16', '17', '18', '19', '20', '22', '23', '27', '28', '33', '36', '39', '40', '41', '42', '43', '44'],
        aiChat: false,
    },
    Advance: {
        label: 'Advance',
        icon: Sparkles,
        color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20',
        description:
            'Everything in Standard + variants, bundles, recipes, purchase orders, suppliers, stock transfers, losses/damages, promos, all reports, branches and the AI assistant',
        ids: ['1', '2', '3', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '27', '28', '29', '30', '31', '33', '34', '36', '39', '40', '41', '42', '43', '44'],
        aiChat: true,
    },
};

// ─── Group meta ───────────────────────────────────────────────────────────────

const GROUP_META: Record<string, { label: string; icon: React.ElementType; desc: string; color: string }> = {
    general: { label: 'General', icon: Globe, desc: 'Business info, currency, timezone', color: 'text-blue-500' },
    tax: { label: 'Tax', icon: Receipt, desc: 'VAT, service charge', color: 'text-amber-500' },
    pos: { label: 'POS', icon: ShoppingCart, desc: 'Cashier behavior and limits', color: 'text-emerald-500' },
    receipt: { label: 'Receipt', icon: Receipt, desc: 'What prints on receipts', color: 'text-purple-500' },
    inventory: { label: 'Inventory', icon: Package, desc: 'Stock alerts and automation', color: 'text-cyan-500' },
    cash: { label: 'Cash', icon: Banknote, desc: 'Sessions, petty cash, over/short', color: 'text-green-500' },
    notification: { label: 'Notifications', icon: Bell, desc: 'Dashboard alerts', color: 'text-rose-500' },
    modules: { label: 'Modules', icon: Layers, desc: 'Enable or disable system features', color: 'text-indigo-500' },
};

const inp =
    'w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all';
const sel = inp + ' cursor-pointer';

// ─── Logo upload ──────────────────────────────────────────────────────────────

function LogoUpload({ currentValue, branchId }: { currentValue: string; branchId: number | null }) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    const logoUrl = preview ?? (currentValue ? `/storage/${currentValue}` : null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Show local preview immediately
        setPreview(URL.createObjectURL(file));
        const data = new FormData();
        data.append('logo', file);
        if (branchId) data.append('branch_id', String(branchId));
        setUploading(true);
        router.post(routes.settings.logo(), data, {
            forceFormData: true,
            preserveScroll: true,
            onFinish: () => setUploading(false),
        });
        // Reset so same file can be re-selected
        e.target.value = '';
    };

    return (
        <div className="flex items-center gap-3">
            {logoUrl ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                    <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                </div>
            ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
                    <ImageIcon className="h-4 w-4" />
                </div>
            )}
            <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {uploading ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
                ) : (
                    <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? 'Uploading…' : 'Change logo'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
    );
}

// ─── Individual setting row ───────────────────────────────────────────────────

function SettingRow({
    def,
    value,
    onChange,
    onReset,
    isSuper,
    branchId,
}: {
    def: SettingDef;
    value: string;
    onChange: (val: string) => void;
    onReset?: () => void;
    isSuper: boolean;
    branchId: number | null;
}) {
    const isReadonly = def.is_readonly || (def.super_only && !isSuper);
    const optionLabel = (option: string) => option.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

    const renderInput = () => {
        // Detect boolean by value when type is missing/unknown (old DB rows)
        const resolvedType = def.type || (value === 'true' || value === 'false' ? 'boolean' : 'string');

        if (resolvedType === 'image') {
            return <LogoUpload currentValue={value} branchId={branchId} />;
        }

        if (resolvedType === 'boolean') {
            const checked = value === 'true';
            return (
                <button
                    type="button"
                    disabled={isReadonly}
                    onClick={() => !isReadonly && onChange(checked ? 'false' : 'true')}
                    className={cn(
                        'relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors',
                        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
                        isReadonly ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                    )}
                >
                    <span
                        className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                            checked ? 'translate-x-5' : 'translate-x-0.5',
                        )}
                    />
                </button>
            );
        }

        if (resolvedType === 'select' && def.options) {
            return (
                <select
                    value={value}
                    disabled={isReadonly}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(sel, 'w-48', isReadonly && 'cursor-not-allowed opacity-40')}
                >
                    {def.options.map((o) => (
                        <option key={o} value={o}>
                            {optionLabel(o)}
                        </option>
                    ))}
                </select>
            );
        }

        if (resolvedType === 'integer' || resolvedType === 'decimal') {
            return (
                <input
                    type="number"
                    value={value}
                    disabled={isReadonly}
                    step={resolvedType === 'decimal' ? '0.01' : '1'}
                    onChange={(e) => onChange(e.target.value)}
                    className={cn(inp, 'w-32 text-right tabular-nums', isReadonly && 'cursor-not-allowed opacity-40')}
                />
            );
        }

        return (
            <input
                type="text"
                value={value}
                disabled={isReadonly}
                onChange={(e) => onChange(e.target.value)}
                className={cn(inp, 'w-64', isReadonly && 'cursor-not-allowed opacity-40')}
            />
        );
    };

    return (
        <div
            className={cn(
                'flex gap-4 px-5 py-4 transition-colors',
                def.description ? 'items-start' : 'items-center',
                isReadonly ? 'opacity-60' : 'hover:bg-muted/10',
            )}
        >
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{def.label || def.key}</p>
                    {def.is_overridden && branchId && (
                        <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-500">Overridden</span>
                    )}
                </div>
                {def.description && <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>}
                {def.is_overridden && branchId && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Global default: <span className="font-mono">{def.global_value}</span>
                    </p>
                )}
            </div>
            <div className={cn('flex shrink-0 items-center gap-2', def.description && 'mt-0.5')}>
                {renderInput()}
                {def.is_overridden && branchId && onReset && (
                    <button
                        onClick={onReset}
                        title="Reset to global default"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Module toggle row ────────────────────────────────────────────────────────

function ModuleRow({
    menuId,
    label,
    enabled,
    group,
    onChange,
}: {
    menuId: string;
    label: string;
    enabled: boolean;
    group: string;
    onChange: (id: string, val: boolean) => void;
}) {
    const groupColor: Record<string, string> = {
        Sales: 'text-emerald-500',
        Inventory: 'text-cyan-500',
        Cash: 'text-green-500',
        Reports: 'text-amber-500',
        Management: 'text-purple-500',
    };

    return (
        <div className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-muted/10">
            <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className={cn('text-[10px] font-bold tracking-wide uppercase', groupColor[group] ?? 'text-muted-foreground')}>{group}</p>
            </div>
            <button
                type="button"
                onClick={() => onChange(menuId, !enabled)}
                className={cn(
                    'relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 transition-colors',
                    enabled ? 'border-primary bg-primary' : 'border-border bg-muted',
                )}
            >
                <span
                    className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        enabled ? 'translate-x-5' : 'translate-x-0.5',
                    )}
                />
            </button>
        </div>
    );
}

// ─── Color theme picker ───────────────────────────────────────────────────────

const COLOR_THEMES = [
    { key: 'ea', label: 'Boundary Cafe', description: 'Royal Blue & Orange', swatch: 'linear-gradient(135deg, #062581 0 56%, #FF5A0A 56% 100%)', ring: '#FF5A0A' },
    { key: 'indigo', label: 'Indigo', description: 'Deep blue-purple', swatch: 'linear-gradient(135deg, #3730a3 0%, #4f46e5 100%)', ring: '#4f46e5' },
    { key: 'violet', label: 'Violet', description: 'Rich purple', swatch: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)', ring: '#7c3aed' },
    { key: 'emerald', label: 'Emerald', description: 'Fresh green', swatch: 'linear-gradient(135deg, #065f46 0%, #059669 100%)', ring: '#059669' },
    { key: 'teal', label: 'Teal', description: 'Cool teal', swatch: 'linear-gradient(135deg, #134e4a 0%, #0d9488 100%)', ring: '#0d9488' },
    { key: 'cyan', label: 'Cyan', description: 'Bright sky blue', swatch: 'linear-gradient(135deg, #164e63 0%, #0891b2 100%)', ring: '#0891b2' },
    { key: 'amber', label: 'Amber', description: 'Warm golden', swatch: 'linear-gradient(135deg, #92400e 0%, #d97706 100%)', ring: '#d97706' },
    { key: 'orange', label: 'Orange', description: 'Vibrant orange', swatch: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)', ring: '#ea580c' },
    { key: 'rose', label: 'Rose', description: 'Bold red-pink', swatch: 'linear-gradient(135deg, #9f1239 0%, #e11d48 100%)', ring: '#e11d48' },
    { key: 'slate', label: 'Slate', description: 'Neutral dark grey', swatch: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)', ring: '#475569' },
] as const;

function ColorThemePicker({ currentTheme, onApply }: { currentTheme: string; onApply: (key: string) => void }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Palette className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-foreground">Color Theme</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Brand color palette applied system-wide across all modules.</p>
                </div>
            </div>
            <div className="grid grid-cols-5 gap-3 px-5 py-5">
                {COLOR_THEMES.map((t) => {
                    const active = currentTheme === t.key;
                    return (
                        <button
                            key={t.key}
                            onClick={() => onApply(t.key)}
                            className={cn(
                                'flex flex-col items-center gap-2 rounded-xl border p-3 transition-all',
                                active ? 'border-2' : 'border-border hover:bg-muted/30',
                            )}
                            style={active ? { borderColor: t.ring, boxShadow: `0 0 0 3px ${t.ring}22` } : undefined}
                        >
                            {/* Swatch */}
                            <span className="relative h-10 w-full rounded-lg shadow-sm" style={{ background: t.swatch }}>
                                {active && <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 drop-shadow" style={{ color: '#fff' }} />}
                            </span>
                            {/* Label */}
                            <p className="text-center text-xs leading-none font-semibold text-foreground">{t.label}</p>
                            <p className="text-center text-[10px] leading-tight text-muted-foreground">{t.description}</p>
                        </button>
                    );
                })}
            </div>
            <p className="px-5 pb-4 text-[11px] text-muted-foreground">
                Changes take effect immediately and are saved with the rest of your settings.
            </p>
        </div>
    );
}

// ─── Group section ────────────────────────────────────────────────────────────

function GroupSection({
    groupKey,
    settings,
    values,
    onChange,
    onReset,
    isSuper,
    branchId,
    defaultOpen = false,
}: {
    groupKey: string;
    settings: Record<string, SettingDef>;
    values: Record<string, string>;
    onChange: (key: string, val: string) => void;
    onReset: (key: string) => void;
    isSuper: boolean;
    branchId: number | null;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const meta = GROUP_META[groupKey] ?? { label: groupKey, icon: Settings, desc: '', color: 'text-muted-foreground' };
    const Icon = meta.icon;
    const keys = Object.keys(settings).filter((k) => !settings[k].super_only || isSuper);
    const overriddenCount = keys.filter((k) => settings[k].is_overridden).length;

    return (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20"
            >
                <div className={cn('rounded-xl bg-muted/30 p-2', meta.color)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{meta.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{meta.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                    {overriddenCount > 0 && (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                            {overriddenCount} override{overriddenCount > 1 ? 's' : ''}
                        </span>
                    )}
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
                </div>
            </button>

            {open && (
                <div className="divide-y divide-border border-t border-border">
                    {keys.map((key) => (
                        <SettingRow
                            key={key}
                            def={settings[key]}
                            value={values[key] ?? settings[key].value}
                            onChange={(val) => onChange(key, val)}
                            onReset={() => onReset(key)}
                            isSuper={isSuper}
                            branchId={branchId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsIndex() {
    const { settings, module_settings, menu_groups, branches, active_branch_id, is_super_admin, is_administrator, flash } =
        usePage<PageProps>().props;

    // ── Local state ───────────────────────────────────────────────────────────
    const [selectedBranch, setSelectedBranch] = useState<number | null>(active_branch_id);
    const [dirty, setDirty] = useState<Record<string, string>>({});
    const [modules, setModules] = useState<Record<string, boolean>>(module_settings ?? {});
    const [modulesDirty, setModulesDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingModules, setSavingModules] = useState(false);
    const [toast, setToast] = useState(flash?.message ?? null);
    const [activePreset, setActivePreset] = useState<string | null>(null);

    // Sync modules state when props change
    useEffect(() => {
        setModules(module_settings ?? {});
        setModulesDirty(false);
    }, [module_settings]);

    // Sync flash toast when new flash messages arrive
    useEffect(() => {
        if (flash?.message) {
            setToast(flash.message);
        }
    }, [flash]);

    // Color theme — read from settings, queue changes through dirty like any other setting
    const currentTheme = dirty['general.color_theme'] ?? settings['general']?.['general.color_theme']?.value ?? 'ea';

    const handleThemeChange = (key: string) => {
        handleChange('general.color_theme', key);
        // Instant preview — update the DOM attribute immediately
        document.documentElement.dataset.theme = key;
    };

    const handleChange = useCallback((key: string, val: string) => {
        setDirty((prev) => ({ ...prev, [key]: val }));
    }, []);

    const handleModuleChange = (id: string, val: boolean) => {
        setModules((prev) => ({ ...prev, [id]: val }));
        setModulesDirty(true);
        setActivePreset(null);
    };

    const handleApplyPreset = (presetKey: string) => {
        const preset = PRESETS[presetKey];
        if (!preset) return;

        // Build new modules state: only preset IDs are enabled
        const allIds = Object.values(menu_groups).flatMap((g) => Object.keys(g));
        const newModules: Record<string, boolean> = {};
        for (const id of allIds) {
            newModules[id] = preset.ids.includes(id);
        }
        setModules(newModules);
        setModulesDirty(true);
        setActivePreset(presetKey);

        // Also queue ai_chat_enabled change in settings dirty state
        setDirty((prev) => ({ ...prev, 'general.ai_chat_enabled': preset.aiChat ? 'true' : 'false' }));
    };

    const handleReset = (key: string) => {
        router.delete(routes.settings.reset(key), {
            data: { branch_id: selectedBranch ?? undefined },
            preserveScroll: true,
            onSuccess: () =>
                setDirty((prev) => {
                    const n = { ...prev };
                    delete n[key];
                    return n;
                }),
        });
    };

    const handleDiscard = () => {
        setDirty({});
        setModules(module_settings ?? {});
        setModulesDirty(false);
        setActivePreset(null);
    };

    const handleSave = () => {
        if (Object.keys(dirty).length === 0 && !modulesDirty) return;
        setSaving(true);
        if (modulesDirty) setSavingModules(true);
        const allMenuIds = Object.values(menu_groups).flatMap((g) => Object.keys(g));
        const payload = {
            settings: dirty,
            branch_id: selectedBranch ?? undefined,
            ...(modulesDirty ? { enabled_menus: allMenuIds.filter((id) => modules[id] !== false) } : {}),
        };

        router.post(routes.settings.save(), payload, {
            preserveScroll: true,
            onSuccess: (page) => {
                setSaving(false);
                setDirty({});
                setModulesDirty(false);
                setSavingModules(false);
                setActivePreset(null);
                const fresh = (page.props as { module_settings?: Record<string, boolean> }).module_settings;
                if (fresh) {
                    setModules(fresh);
                }
            },
            onError: () => {
                setSaving(false);
                setSavingModules(false);
            },
        });
    };

    const handleSaveModules = () => {
        handleSave();
    };

    const effectiveValues = (groupSettings: Record<string, SettingDef>) => {
        const result: Record<string, string> = {};
        for (const key of Object.keys(groupSettings)) {
            result[key] = dirty[key] ?? groupSettings[key].value;
        }
        return result;
    };

    const settingsDirtyCount = Object.keys(dirty).length;
    const totalDirtyCount = settingsDirtyCount + (modulesDirty ? 1 : 0);
    const groupKeys = Object.keys(settings);

    // Admin can access global scope (null branch) for allowed groups.
    // Super admin can always access global scope.
    const canAccessGlobal = is_super_admin || is_administrator;
    const canManageModules = is_super_admin || is_administrator;

    return (
        <AdminLayout>
            <Head title="System Settings" />

            {/* Toast */}
            {toast && (
                <div
                    className={cn(
                        'fixed top-4 right-4 z-[9999] flex max-w-sm items-center gap-3 rounded-xl border px-5 py-3.5 text-sm font-medium shadow-2xl',
                        toast.type === 'success'
                            ? 'border-emerald-500/40 bg-[#0b1a10] text-emerald-300'
                            : toast.type === 'warning'
                              ? 'border-amber-500/40 bg-[#1a150b] text-amber-300'
                              : 'border-red-500/40 bg-[#1a0b0b] text-red-300',
                    )}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : toast.type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                    ) : (
                        <XCircle className="h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1">{toast.text}</span>
                    <button onClick={() => setToast(null)} className="shrink-0 opacity-50 hover:opacity-100">
                        ✕
                    </button>
                </div>
            )}

            <div className="mx-auto max-w-[860px] space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-foreground">System Settings</h1>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {is_super_admin
                                ? 'Global settings apply to all branches. Branch overrides take precedence.'
                                : 'Configure global defaults or branch-specific overrides.'}
                        </p>
                    </div>

                    {/* Save button */}
                    {totalDirtyCount > 0 && (
                        <Button className="h-9 shrink-0 gap-2 font-semibold" onClick={handleSave} disabled={saving}>
                            {saving ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save {totalDirtyCount} change{totalDirtyCount > 1 ? 's' : ''}
                        </Button>
                    )}
                </div>

                {/* Role badge */}
                <div
                    className={cn(
                        'flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium',
                        is_super_admin
                            ? 'border-purple-500/25 bg-purple-500/8 text-purple-600 dark:text-purple-400'
                            : 'border-blue-500/25 bg-blue-500/8 text-blue-600 dark:text-blue-400',
                    )}
                >
                    <Shield className="h-3.5 w-3.5 shrink-0" />
                    {is_super_admin
                        ? 'Super Admin — you can edit all settings, modules/feature flags, and branch overrides.'
                        : 'Administrator — you can configure global settings (General, Inventory, Notifications, POS, Receipt, Tax), modules/feature flags, and branch-specific overrides.'}
                </div>

                {/* Scope selector — Super Admin + Administrator */}
                {branches && branches.length > 0 && (
                    <div className="rounded-2xl border border-border bg-card p-5">
                        <p className="mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">Scope</p>
                        <div className="flex flex-wrap gap-2">
                            {/* Global option — Super Admin and Administrator */}
                            {canAccessGlobal && (
                                <button
                                    onClick={() => setSelectedBranch(null)}
                                    className={cn(
                                        'rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
                                        selectedBranch === null
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border hover:border-primary/40 hover:bg-accent',
                                    )}
                                >
                                    🌐 Global defaults
                                </button>
                            )}
                            {branches.map((b) => (
                                <button
                                    key={b.id}
                                    onClick={() => setSelectedBranch(b.id)}
                                    className={cn(
                                        'rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
                                        selectedBranch === b.id
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border hover:border-primary/40 hover:bg-accent',
                                    )}
                                >
                                    {b.name}
                                    <span className="ml-1 text-[10px] opacity-60">{b.code}</span>
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            {selectedBranch ? (
                                <>
                                    Editing branch overrides. Settings without an override use the global default. Use{' '}
                                    <RotateCcw className="mx-0.5 inline h-3 w-3" /> to reset a key back to global.
                                </>
                            ) : is_super_admin ? (
                                'Editing global defaults. These apply to all branches unless overridden.'
                            ) : (
                                'Editing global defaults for General, Inventory, Notifications, POS, Receipt, Tax, and Modules.'
                            )}
                        </p>
                    </div>
                )}

                {/* ── Color Theme ──────────────────────────────────────────────── */}
                {(is_super_admin || is_administrator) && <ColorThemePicker currentTheme={currentTheme} onApply={handleThemeChange} />}

                {/* ── Modules / Features ──────────────────── */}
                {canManageModules && Object.keys(menu_groups).length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-border bg-card">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-xl bg-muted/30 p-2 text-indigo-500">
                                    <Layers className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Modules / Features</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Enable or disable menu items system-wide. Disabled items are hidden from all users.
                                    </p>
                                </div>
                            </div>
                            {modulesDirty && (
                                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSaveModules} disabled={savingModules}>
                                    {savingModules ? (
                                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                                    ) : (
                                        <Save className="h-3.5 w-3.5" />
                                    )}
                                    Save modules
                                </Button>
                            )}
                        </div>

                        {/* ── Presets ─────────────────────────────────────── */}
                        <div className="border-b border-border bg-muted/10 px-5 py-4">
                            <p className="mb-3 text-xs font-bold tracking-widest text-muted-foreground uppercase">Quick Presets</p>
                            <div className="flex flex-wrap gap-3">
                                {Object.entries(PRESETS).map(([key, preset]) => {
                                    const Icon = preset.icon;
                                    const isActive = activePreset === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => handleApplyPreset(key)}
                                            className={cn(
                                                'flex max-w-[220px] min-w-[180px] items-start gap-2.5 rounded-xl border px-4 py-3 text-left transition-all',
                                                isActive
                                                    ? 'ring-2 ring-offset-1 ring-offset-background ' + preset.color
                                                    : 'border-border hover:bg-muted/30 ' +
                                                          preset.color
                                                              .split(' ')
                                                              .filter((c) => c.startsWith('hover:'))
                                                              .join(' '),
                                            )}
                                        >
                                            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', preset.color.split(' ')[0])} />
                                            <div>
                                                <p className={cn('text-sm font-bold', preset.color.split(' ')[0])}>{preset.label}</p>
                                                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{preset.description}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-3 text-[11px] text-muted-foreground">
                                Applying a preset sets the module toggles below. You can still enable or disable individual items after applying.
                                Preset also queues the AI Assistant setting change — save both to apply fully.
                            </p>
                        </div>

                        {/* ── Toggle list ─────────────────────────────────── */}
                        {Object.entries(menu_groups).map(([group, menus]) => (
                            <div key={group}>
                                <div className="border-b border-border bg-muted/20 px-5 py-2">
                                    <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{group}</p>
                                </div>
                                <div className="divide-y divide-border">
                                    {Object.entries(menus).map(([id, label]) => (
                                        <ModuleRow
                                            key={id}
                                            menuId={id}
                                            label={label}
                                            group={group}
                                            enabled={modules[id] !== false}
                                            onChange={handleModuleChange}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Setting groups ─────────────────────────────────────────── */}
                {groupKeys
                    .filter((groupKey) => Object.values(settings[groupKey]).some((def) => !def.super_only || is_super_admin))
                    .map((groupKey, i) => (
                        <GroupSection
                            key={groupKey}
                            groupKey={groupKey}
                            settings={settings[groupKey]}
                            values={effectiveValues(settings[groupKey])}
                            onChange={handleChange}
                            onReset={handleReset}
                            isSuper={is_super_admin}
                            branchId={selectedBranch}
                            defaultOpen={i === 0}
                        />
                    ))}

                {/* Floating save bar */}
                {totalDirtyCount > 0 && (
                    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
                        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-3 shadow-2xl">
                            <p className="text-sm text-muted-foreground">
                                <span className="font-bold text-foreground">{totalDirtyCount}</span> unsaved change{totalDirtyCount > 1 ? 's' : ''}
                            </p>
                            <Button size="sm" variant="outline" onClick={handleDiscard}>
                                Discard
                            </Button>
                            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                                {saving ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                                ) : (
                                    <Save className="h-3.5 w-3.5" />
                                )}
                                Save changes
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
