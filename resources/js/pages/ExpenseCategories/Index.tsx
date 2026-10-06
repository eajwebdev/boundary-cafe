'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { confirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/AdminLayout';

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

    return (
        <AdminLayout>
            <Head title="Expense Categories" />

            <div className="mx-auto max-w-7xl space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Expense Categories</h1>
                        <p className="text-muted-foreground">Manage expense categories</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                    {/* LEFT: New / Edit Category */}
                    <div className="lg:col-span-3">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle>{editingId ? 'Edit Category' : 'New Category'}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <Label>Category Name</Label>
                                    <Input
                                        value={editingId ? editName : name}
                                        onChange={(e) => (editingId ? setEditName(e.target.value) : setName(e.target.value))}
                                        placeholder="e.g. Office Supplies"
                                    />
                                </div>

                                <div>
                                    <Label>Description (optional)</Label>
                                    <Textarea
                                        value={editingId ? editDescription : description}
                                        onChange={(e) => (editingId ? setEditDescription(e.target.value) : setDescription(e.target.value))}
                                        placeholder="Brief description..."
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <Label>Color</Label>
                                    <div className="flex gap-3">
                                        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />
                                        <div className="self-center text-sm text-muted-foreground">Preview color for reports</div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    {editingId ? (
                                        <>
                                            <Button onClick={() => setEditingId(null)} variant="outline" className="flex-1">
                                                Cancel
                                            </Button>
                                            <Button onClick={() => handleUpdate(editingId)} className="flex-1">
                                                Update Category
                                            </Button>
                                        </>
                                    ) : (
                                        <Button onClick={handleCreate} className="h-12 w-full" disabled={!name.trim()}>
                                            <Plus className="mr-2 h-4 w-4" />
                                            Create Category
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT: Categories List */}
                    <div className="lg:col-span-2">
                        <Card className="h-full shadow-lg">
                            <CardHeader>
                                <CardTitle>Existing Categories</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {categories.map((cat) => (
                                        <div key={cat.id} className="flex items-center justify-between rounded-2xl border p-4 hover:bg-muted/50">
                                            <div className="flex items-center gap-4">
                                                <div className="h-6 w-6 rounded-full" style={{ backgroundColor: cat.color || '#3b82f6' }} />
                                                <div>
                                                    <div className="font-medium">{cat.name}</div>
                                                    {cat.description && <div className="text-xs text-muted-foreground">{cat.description}</div>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <Badge variant={cat.is_active ? 'success' : 'secondary'}>
                                                    {cat.is_active ? 'Active' : 'Inactive'}
                                                </Badge>

                                                {is_manager && (
                                                    <div className="flex gap-1">
                                                        <Button size="icon" variant="ghost" onClick={() => startEdit(cat)}>
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" onClick={() => toggleActive(cat.id)}>
                                                            <Switch checked={cat.is_active} />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" onClick={() => handleDelete(cat.id, cat.name)}>
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
