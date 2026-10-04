'use client';

import { useState, useMemo } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import { Plus, Edit2, Trash2, Table2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiningTable {
    id: number;
    table_number: string;
    section: string | null;
    label: string;
    capacity: number;
    status: string;
    is_active: boolean;
}

interface PageProps {
    tables: DiningTable[];
    flash: { message?: { type: string; text: string } };
    [key: string]: unknown;
}

const STATUS_COLORS: Record<string, string> = {
    available: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    occupied: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    reserved: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    cleaning: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
};

const EMPTY_FORM = { table_number: '', section: '', capacity: '4' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiningTablesIndex() {
    const { tables, flash } = usePage<PageProps>().props;

    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const [busy, setBusy] = useState(false);

    // Group by section for display
    const sections = useMemo(() => {
        const map: Record<string, DiningTable[]> = {};
        tables.forEach((t) => {
            const s = t.section ?? 'Main';
            if (!map[s]) map[s] = [];
            map[s].push(t);
        });
        return map;
    }, [tables]);

    const handleCreate = () => {
        if (!form.table_number.trim()) return;
        setBusy(true);
        router.post(
            routes.diningTables.store(),
            {
                table_number: form.table_number.trim(),
                section: form.section.trim() || null,
                capacity: parseInt(form.capacity) || 4,
            },
            {
                onFinish: () => setBusy(false),
                onSuccess: () => setForm(EMPTY_FORM),
            },
        );
    };

    const startEdit = (t: DiningTable) => {
        setEditingId(t.id);
        setEditForm({
            table_number: t.table_number,
            section: t.section ?? '',
            capacity: String(t.capacity),
        });
    };

    const handleUpdate = () => {
        if (!editingId || !editForm.table_number.trim()) return;
        setBusy(true);
        router.patch(
            routes.diningTables.update(editingId),
            {
                table_number: editForm.table_number.trim(),
                section: editForm.section.trim() || null,
                capacity: parseInt(editForm.capacity) || 4,
            },
            {
                onFinish: () => setBusy(false),
                onSuccess: () => setEditingId(null),
            },
        );
    };

    const handleToggleActive = (t: DiningTable) => {
        router.patch(routes.diningTables.update(t.id), { is_active: !t.is_active });
    };

    const handleDelete = (t: DiningTable) => {
        if (!confirm(`Delete table "${t.label}"? This cannot be undone.`)) return;
        router.delete(routes.diningTables.destroy(t.id));
    };

    const isEditing = editingId !== null;
    const activeForm = isEditing ? editForm : form;
    const setActiveForm = isEditing
        ? (v: Partial<typeof EMPTY_FORM>) => setEditForm((p) => ({ ...p, ...v }))
        : (v: Partial<typeof EMPTY_FORM>) => setForm((p) => ({ ...p, ...v }));

    return (
        <AdminLayout>
            <Head title="Dining Tables" />

            <div className="mx-auto max-w-7xl space-y-8">
                {/* Flash */}
                {flash?.message && (
                    <div
                        className={cn(
                            'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium',
                            flash.message.type === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                : 'border-red-500/30 bg-red-500/10 text-red-700',
                        )}
                    >
                        {flash.message.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                        ) : (
                            <AlertCircle className="h-4 w-4 shrink-0" />
                        )}
                        {flash.message.text}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <Table2 className="h-6 w-6 text-primary" />
                            Dining Tables
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">Configure tables for your restaurant layout</p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {tables.length} table{tables.length !== 1 ? 's' : ''}
                    </Badge>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                    {/* ── Form ── */}
                    <div className="lg:col-span-2">
                        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
                            <h2 className="text-base font-semibold">{isEditing ? 'Edit Table' : 'Add New Table'}</h2>

                            <div className="space-y-3">
                                <div>
                                    <Label className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Table Number / Name *
                                    </Label>
                                    <Input
                                        placeholder="e.g. 1, A1, VIP-2"
                                        value={activeForm.table_number}
                                        onChange={(e) => setActiveForm({ table_number: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <Label className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Section (optional)
                                    </Label>
                                    <Input
                                        placeholder="e.g. Indoor, Outdoor, VIP"
                                        value={activeForm.section}
                                        onChange={(e) => setActiveForm({ section: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <Label className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        Capacity (seats)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={50}
                                        value={activeForm.capacity}
                                        onChange={(e) => setActiveForm({ capacity: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                                {isEditing && (
                                    <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">
                                        Cancel
                                    </Button>
                                )}
                                <Button
                                    onClick={isEditing ? handleUpdate : handleCreate}
                                    disabled={busy || !activeForm.table_number.trim()}
                                    className="flex-1"
                                >
                                    <Plus className="mr-1.5 h-4 w-4" />
                                    {isEditing ? 'Save Changes' : 'Add Table'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ── Table List ── */}
                    <div className="space-y-6 lg:col-span-3">
                        {tables.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                                <Table2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                                <p className="text-sm font-medium text-muted-foreground">No tables yet</p>
                                <p className="mt-1 text-xs text-muted-foreground/70">Add your first table using the form</p>
                            </div>
                        ) : (
                            Object.entries(sections).map(([section, sectionTables]) => (
                                <div key={section}>
                                    <p className="mb-2 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{section}</p>
                                    <div className="space-y-2">
                                        {sectionTables.map((t) => (
                                            <div
                                                key={t.id}
                                                className={cn(
                                                    'flex items-center justify-between rounded-xl border p-4 transition-colors',
                                                    editingId === t.id ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-muted/40',
                                                    !t.is_active && 'opacity-60',
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={cn(
                                                            'flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-black',
                                                            STATUS_COLORS[t.status] ?? 'border-border bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        {t.table_number}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{t.label}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {t.capacity} seat{t.capacity !== 1 ? 's' : ''} · {t.status}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={t.is_active}
                                                        onCheckedChange={() => handleToggleActive(t)}
                                                        title={t.is_active ? 'Deactivate' : 'Activate'}
                                                    />
                                                    <Button size="icon" variant="ghost" onClick={() => startEdit(t)} title="Edit">
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="icon" variant="ghost" onClick={() => handleDelete(t)} title="Delete">
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
