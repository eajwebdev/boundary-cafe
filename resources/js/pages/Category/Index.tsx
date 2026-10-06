'use client';

import { usePage, useForm, Head } from '@inertiajs/react';
import type {
    ColumnDef,
    SortingState,
    PaginationState,
    FilterFn,
    Row} from '@tanstack/react-table';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getFilteredRowModel,
    useReactTable
} from '@tanstack/react-table';

import { Trash2, Pencil, Plus, AlertTriangle, Search, Check, ChevronsUpDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { route } from 'ziggy-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────── Types
interface Category {
    id: number;
    name: string;
    slug?: string;
    description?: string;
    is_active: boolean;
    products_count?: number;
}

interface PageProps {
    categories: Category[];
}

// ──────────────────────────────────────────────── Custom global filter – searches all relevant string fields
const globalFilterAllColumns: FilterFn<Category> = (row: Row<Category>, _columnIds: string[], filterValue: string) => {
    if (!filterValue?.trim()) return true;

    const term = filterValue.toLowerCase().trim();

    const fields = [row.original.name, row.original.slug ?? '', row.original.description ?? ''];

    return fields.some((val) => val.toLowerCase().includes(term));
};

// ──────────────────────────────────────────────── Component
export default function CategoryIndex() {
    const { props } = usePage<PageProps>();
    const { categories } = props;

    const [sorting, setSorting] = useState<SortingState>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });
    const [globalFilter, setGlobalFilter] = useState('');

    // ──────────────────────────────────────────────── Form – explicit type, clean & safe
    const form = useForm<{
        name: string;
        slug: string;
        description: string;
        is_active: '0' | '1';
    }>({
        name: '',
        slug: '',
        description: '',
        is_active: '1',
    });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<Category | null>(null);

    const getDisplayName = (item: typeof form.data | Category) => item.name?.trim() || 'Unnamed';

    const openCreate = () => {
        form.reset();
        form.setData('is_active', '1');
        setCreateOpen(true);
    };

    const openEdit = (item: Category) => {
        setSelected(item);
        form.setData({
            name: item.name,
            slug: item.slug ?? '',
            description: item.description ?? '',
            is_active: item.is_active ? '1' : '0',
        });
        setEditOpen(true);
    };

    const openDelete = (item: Category) => {
        setSelected(item);
        setDeleteOpen(true);
    };

    const handleSubmit = (e: React.FormEvent, isEdit = false) => {
        e.preventDefault();
        const name = getDisplayName(form.data);

        const options = {
            onSuccess: () => {
                toast.success(isEdit ? 'Category updated' : 'Category created', {
                    description: `${name} saved successfully.`,
                });
                form.reset();
                if (isEdit) {
                    setEditOpen(false);
                } else {
                    setCreateOpen(false);
                }
                setSelected(null);
            },
            onError: (errors) => {
                toast.error('Validation failed', {
                    description: Object.values(errors).join('\n'),
                    duration: 7000,
                });
            },
            preserveScroll: true,
        };

        if (isEdit && selected?.id) {
            form.patch(route('category.update', selected.id), options);
        } else {
            form.post(route('category.store'), options);
        }
    };

    const handleDelete = () => {
        if (!selected?.id) return;
        form.delete(route('category.destroy', selected.id), {
            onSuccess: () => {
                toast.success(`${getDisplayName(selected)} deleted`);
                setDeleteOpen(false);
                setSelected(null);
            },
            onError: () => {
                toast.error('Cannot delete — category has products.');
            },
            preserveScroll: true,
        });
    };

    // ──────────────────────────────────────────────── Columns – typed cells
    const columns = useMemo<ColumnDef<Category>[]>(
        () => [
            {
                id: 'rowNumber',
                header: '#',
                size: 60,
                cell: ({ row }) => <div className="text-center text-muted-foreground">{row.index + 1}</div>,
            },
            {
                accessorKey: 'name',
                header: 'Name',
            },
            {
                accessorKey: 'slug',
                header: 'Slug',
                cell: ({ getValue }) => {
                    const val = getValue() as string | undefined;
                    return val || '—';
                },
            },
            {
                accessorKey: 'description',
                header: 'Description',
                cell: ({ getValue }) => {
                    const val = getValue() as string | undefined;
                    return val ? (
                        <div className="max-w-xs truncate" title={val}>
                            {val}
                        </div>
                    ) : (
                        '—'
                    );
                },
            },
            {
                accessorKey: 'is_active',
                header: 'Status',
                cell: ({ row }) => (
                    <span
                        className={cn(
                            'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            row.original.is_active
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                : 'border-rose-300 bg-rose-100 text-rose-800',
                        )}
                    >
                        {row.original.is_active ? 'Active' : 'Inactive'}
                    </span>
                ),
                size: 120,
            },
            {
                accessorKey: 'products_count',
                header: 'Products',
                size: 100,
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEdit(row.original)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => openDelete(row.original)}
                            disabled={!!row.original.products_count}
                            title={row.original.products_count ? 'Has products' : ''}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                ),
                size: 110,
            },
        ],
        [],
    );

    const table = useReactTable({
        data: categories,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            sorting,
            pagination,
            globalFilter,
        },
        onSortingChange: setSorting,
        onPaginationChange: setPagination,
        onGlobalFilterChange: setGlobalFilter,
        globalFilterFn: globalFilterAllColumns,
    });

    // ──────────────────────────────────────────────── Reusable Yes/No Combobox
    const YesNoCombobox = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
        const [open, setOpen] = useState(false);
        const options = [
            { value: '1', label: 'Yes (Active)' },
            { value: '0', label: 'No (Inactive)' },
        ];

        const selected = options.find((o) => o.value === value);

        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between">
                        {selected ? selected.label : 'Select status...'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                    <Command>
                        <CommandInput placeholder="Search status..." />
                        <CommandList>
                            <CommandEmpty>No results.</CommandEmpty>
                            <CommandGroup>
                                {options.map((opt) => (
                                    <CommandItem
                                        key={opt.value}
                                        value={opt.value}
                                        onSelect={() => {
                                            onChange(opt.value);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check className={cn('mr-2 h-4 w-4', value === opt.value ? 'opacity-100' : 'opacity-0')} />
                                        {opt.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        );
    };

    // ──────────────────────────────────────────────── Render
    return (
        <AdminLayout>
            <Head title="Categories" />

            <div className="space-y-6 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
                        <p className="mt-1 text-muted-foreground">{categories.length} total</p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Category
                    </Button>
                </div>

                <div className="relative max-w-md">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, slug, description..."
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="pr-10 pl-9"
                    />
                    {globalFilter && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
                            onClick={() => setGlobalFilter('')}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle>Category List</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map((hg) => (
                                        <TableRow key={hg.id}>
                                            {hg.headers.map((h) => (
                                                <TableHead
                                                    key={h.id}
                                                    className={cn(
                                                        h.column.getCanSort() ? 'cursor-pointer select-none' : '',
                                                        h.column.id === 'rowNumber' && 'text-center',
                                                    )}
                                                    onClick={h.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(h.column.columnDef.header, h.getContext())}
                                                    {{
                                                        asc: ' ↑',
                                                        desc: ' ↓',
                                                    }[h.column.getIsSorted() as string] ?? null}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                                                No categories found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        <div className="flex flex-col items-center justify-between gap-4 border-t px-4 py-3 text-sm sm:flex-row">
                            <div>
                                Showing{' '}
                                <strong>
                                    {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                                    {Math.min(
                                        (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                                        table.getFilteredRowModel().rows.length,
                                    )}
                                </strong>{' '}
                                of <strong>{table.getFilteredRowModel().rows.length}</strong>
                            </div>

                            <div className="flex items-center gap-4">
                                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                                    Previous
                                </Button>

                                <span className="text-muted-foreground">
                                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                                </span>

                                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Create / Edit Dialog */}
                <Dialog
                    open={createOpen || editOpen}
                    onOpenChange={(open) => {
                        if (!open) {
                            setCreateOpen(false);
                            setEditOpen(false);
                            form.reset();
                            setSelected(null);
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-[540px]">
                        <DialogHeader>
                            <DialogTitle>{editOpen ? 'Edit Category' : 'Create Category'}</DialogTitle>
                        </DialogHeader>

                        <form onSubmit={(e) => handleSubmit(e, editOpen)} className="space-y-6 py-4">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Name *</Label>
                                    <Input
                                        value={form.data.name}
                                        onChange={(e) => form.setData('name', e.target.value)}
                                        placeholder="e.g. Electronics"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Slug (optional)</Label>
                                    <Input
                                        value={form.data.slug}
                                        onChange={(e) => form.setData('slug', e.target.value)}
                                        placeholder="e.g. electronics"
                                    />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label>Description</Label>
                                    <Input
                                        value={form.data.description}
                                        onChange={(e) => form.setData('description', e.target.value)}
                                        placeholder="Short category description..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Active?</Label>
                                    <YesNoCombobox value={form.data.is_active} onChange={(v) => form.setData('is_active', v)} />
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setCreateOpen(false);
                                        setEditOpen(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={form.processing}>
                                    {form.processing ? (editOpen ? 'Saving...' : 'Creating...') : editOpen ? 'Save Changes' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* Delete Dialog */}
                <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                Delete Category
                            </DialogTitle>
                            <DialogDescription>
                                Permanently delete <strong>{selected ? getDisplayName(selected) : ''}</strong>?
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" onClick={handleDelete} disabled={form.processing}>
                                {form.processing ? 'Deleting...' : 'Delete'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </AdminLayout>
    );
}
