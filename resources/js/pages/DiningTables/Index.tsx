'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Edit2, Trash2, Table2, CheckCircle2, LayoutGrid, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import { FormField, inputCls, PageHeader, Panel, Stat, StatStrip, StatusPill, useFlashToasts } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

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
    [key: string]: unknown;
}

const EMPTY_FORM = { table_number: '', section: '', capacity: '4' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function DiningTablesIndex() {
    const { tables } = usePage<PageProps>().props;
    useFlashToasts();

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

    const handleDelete = async (t: DiningTable) => {
        const confirmed = await confirmDialog({
            title: `Delete table "${t.label}"?`,
            description: 'This cannot be undone.',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        router.delete(routes.diningTables.destroy(t.id));
    };

    const isEditing = editingId !== null;
    const activeForm = isEditing ? editForm : form;
    const setActiveForm = isEditing
        ? (v: Partial<typeof EMPTY_FORM>) => setEditForm((p) => ({ ...p, ...v }))
        : (v: Partial<typeof EMPTY_FORM>) => setForm((p) => ({ ...p, ...v }));

    const STATUS_TONE: Record<string, Tone> = { available: 'success', occupied: 'warning', reserved: 'info', cleaning: 'muted' };
    const seats = tables.filter((t) => t.is_active).reduce((sum, t) => sum + t.capacity, 0);

    return (
        <AdminLayout>
            <Head title="Dining Tables" />

            <div className="space-y-4">
                <PageHeader title="Dining Tables" subtitle="The tables waiters see on the floor plan, grouped by section." />

                <StatStrip count={4}>
                    <Stat icon={Table2} label="Tables" value={tables.length.toLocaleString()} />
                    <Stat icon={Users} label="Seats" value={seats.toLocaleString()} />
                    <Stat icon={LayoutGrid} label="Sections" value={Object.keys(sections).length.toLocaleString()} />
                    <Stat
                        icon={CheckCircle2}
                        label="Free right now"
                        value={tables.filter((t) => t.is_active && t.status === 'available').length.toLocaleString()}
                        tone="success"
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
                    <Panel icon={isEditing ? Edit2 : Plus} title={isEditing ? 'Edit table' : 'Add table'} className="self-start">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (isEditing) handleUpdate();
                                else handleCreate();
                            }}
                            className="grid grid-cols-2 gap-x-3 gap-y-2.5"
                        >
                            <FormField label="Table number / name" className="col-span-2">
                                <input
                                    placeholder="e.g. 1, A1, VIP-2"
                                    value={activeForm.table_number}
                                    onChange={(e) => setActiveForm({ table_number: e.target.value })}
                                    className={inputCls}
                                />
                            </FormField>
                            <FormField label="Section (optional)">
                                <input
                                    placeholder="e.g. Indoor"
                                    value={activeForm.section}
                                    onChange={(e) => setActiveForm({ section: e.target.value })}
                                    className={inputCls}
                                />
                            </FormField>
                            <FormField label="Seats">
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={activeForm.capacity}
                                    onChange={(e) => setActiveForm({ capacity: e.target.value })}
                                    className={cn(inputCls, 'tabular-nums')}
                                />
                            </FormField>
                            <div className="col-span-2 flex gap-2 pt-1">
                                {isEditing && (
                                    <Button type="button" variant="outline" onClick={() => setEditingId(null)} className="h-9 flex-1">
                                        Cancel
                                    </Button>
                                )}
                                <Button type="submit" disabled={busy || !activeForm.table_number.trim()} className="h-9 flex-1">
                                    {isEditing ? 'Save changes' : 'Add table'}
                                </Button>
                            </div>
                        </form>
                    </Panel>

                    <div className="space-y-4">
                        {tables.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
                                <Table2 className="mx-auto mb-2 h-8 w-8 opacity-20" />
                                No tables yet. Add the first one with the form.
                            </div>
                        ) : (
                            Object.entries(sections).map(([section, sectionTables]) => (
                                <Panel
                                    key={section}
                                    flush
                                    icon={LayoutGrid}
                                    title={section}
                                    actions={
                                        <span className="text-[11px] font-semibold text-muted-foreground">
                                            {sectionTables.length} table{sectionTables.length !== 1 ? 's' : ''}
                                        </span>
                                    }
                                >
                                    <ul className="divide-y divide-border">
                                        {sectionTables.map((t) => (
                                            <li
                                                key={t.id}
                                                className={cn(
                                                    'flex items-center gap-3 px-4 py-2 text-sm',
                                                    editingId === t.id && 'bg-primary/5',
                                                    !t.is_active && 'opacity-60',
                                                )}
                                            >
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                                                    {t.table_number}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate font-semibold">{t.label}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {t.capacity} seat{t.capacity !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <StatusPill tone={STATUS_TONE[t.status] ?? 'muted'}>{t.status}</StatusPill>
                                                <Switch
                                                    checked={t.is_active}
                                                    onCheckedChange={() => handleToggleActive(t)}
                                                    aria-label={t.is_active ? 'Hide from floor plan' : 'Show on floor plan'}
                                                    className="ml-1.5"
                                                />
                                                <button
                                                    onClick={() => startEdit(t)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={`Edit ${t.label}`}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(t)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Delete ${t.label}`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </Panel>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
