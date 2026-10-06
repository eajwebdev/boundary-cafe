'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { CheckCircle2, Edit2, Plus, Tags, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';

import { FormField, inputCls, PageHeader, Panel, Stat, StatStrip, StatusPill, textareaCls, useFlashToasts } from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

import { routes } from '@/routes';

interface ExpenseCategory {
    id: number;
    name: string;
    description: string | null;
    color: string | null;
    is_active: boolean;
}

interface PageProps {
    categories: ExpenseCategory[];
    is_manager: boolean;
    [key: string]: unknown;
}

export default function ExpenseCategoriesIndex() {
    const { categories, is_manager } = usePage<PageProps>().props;
    useFlashToasts();

    // New category form
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState('#3b82f6');

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');

    const handleCreate = () => {
        if (!name.trim()) return;

        router.post(
            routes.expenseCategories.store(),
            {
                name: name.trim(),
                description: description.trim(),
                color,
            },
            {
                onSuccess: () => {
                    setName('');
                    setDescription('');
                },
            },
        );
    };

    const startEdit = (cat: ExpenseCategory) => {
        setEditingId(cat.id);
        setEditName(cat.name);
        setEditDescription(cat.description || '');
    };

    const handleUpdate = (id: number) => {
        if (!editName.trim()) return;

        router.patch(
            routes.expenseCategories.update(id),
            {
                name: editName.trim(),
                description: editDescription.trim(),
            },
            {
                onSuccess: () => {
                    setEditingId(null);
                },
            },
        );
    };

    const toggleActive = (id: number) => {
        router.patch(routes.expenseCategories.toggle(id));
    };

    const handleDelete = async (id: number, name: string) => {
        if (!(await confirmDialog({ title: `Delete category "${name}"?`, confirmLabel: 'Delete', tone: 'danger' }))) return;
        router.delete(routes.expenseCategories.destroy(id));
    };

    const activeCount = categories.filter((c) => c.is_active).length;

    return (
        <AdminLayout>
            <Head title="Expense Categories" />

            <div className="space-y-4">
                <PageHeader title="Expense Categories" subtitle="Groups for expenses and petty cash, used in reports." />

                <StatStrip count={3}>
                    <Stat icon={Tags} label="Categories" value={categories.length.toLocaleString()} />
                    <Stat icon={CheckCircle2} label="In use" value={activeCount.toLocaleString()} tone="success" />
                    <Stat
                        icon={XCircle}
                        label="Switched off"
                        value={(categories.length - activeCount).toLocaleString()}
                        tone={categories.length - activeCount > 0 ? 'muted' : undefined}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
                    <Panel icon={editingId ? Edit2 : Plus} title={editingId ? 'Edit category' : 'New category'} className="self-start">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (editingId) handleUpdate(editingId);
                                else handleCreate();
                            }}
                            className="space-y-2.5"
                        >
                            <FormField label="Name">
                                <input
                                    value={editingId ? editName : name}
                                    onChange={(e) => (editingId ? setEditName(e.target.value) : setName(e.target.value))}
                                    placeholder="e.g. Utilities"
                                    className={inputCls}
                                />
                            </FormField>
                            <FormField label="Description (optional)">
                                <textarea
                                    value={editingId ? editDescription : description}
                                    onChange={(e) => (editingId ? setEditDescription(e.target.value) : setDescription(e.target.value))}
                                    rows={2}
                                    className={textareaCls}
                                />
                            </FormField>
                            {!editingId && (
                                <FormField label="Report colour">
                                    <input
                                        type="color"
                                        value={color}
                                        onChange={(e) => setColor(e.target.value)}
                                        className="h-9 w-16 cursor-pointer rounded-lg border border-input bg-background p-1"
                                    />
                                </FormField>
                            )}
                            <div className="flex gap-2 pt-1">
                                {editingId && (
                                    <Button type="button" variant="outline" className="h-9 flex-1" onClick={() => setEditingId(null)}>
                                        Cancel
                                    </Button>
                                )}
                                <Button type="submit" className="h-9 flex-1" disabled={!(editingId ? editName : name).trim()}>
                                    {editingId ? 'Save changes' : 'Add category'}
                                </Button>
                            </div>
                        </form>
                    </Panel>

                    <Panel flush icon={Tags} title="All categories">
                        {categories.length === 0 ? (
                            <p className="py-12 text-center text-sm text-muted-foreground">No categories yet.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {categories.map((cat) => (
                                    <li
                                        key={cat.id}
                                        className={cn(
                                            'flex items-center gap-3 px-4 py-2.5 text-sm',
                                            editingId === cat.id && 'bg-primary/5',
                                            !cat.is_active && 'opacity-60',
                                        )}
                                    >
                                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color || '#3b82f6' }} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{cat.name}</p>
                                            {cat.description && <p className="truncate text-[11px] text-muted-foreground">{cat.description}</p>}
                                        </div>
                                        {is_manager ? (
                                            <div className="flex items-center gap-0.5">
                                                <Switch
                                                    checked={cat.is_active}
                                                    onCheckedChange={() => toggleActive(cat.id)}
                                                    aria-label={cat.is_active ? 'Switch off' : 'Switch on'}
                                                    className="mr-1.5"
                                                />
                                                <button
                                                    onClick={() => startEdit(cat)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    aria-label={`Edit ${cat.name}`}
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cat.id, cat.name)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Delete ${cat.name}`}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <StatusPill tone={cat.is_active ? 'success' : 'muted'}>{cat.is_active ? 'In use' : 'Off'}</StatusPill>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}
