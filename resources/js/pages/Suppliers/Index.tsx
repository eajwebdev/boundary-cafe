'use client';

import { usePage, useForm, Head } from '@inertiajs/react';
import { Link } from '@inertiajs/react';
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
import { Trash2, Pencil, Plus, AlertTriangle, Search, X, ClipboardList } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { route } from 'ziggy-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminLayout from '@/layouts/AdminLayout';

import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────── Types
interface Supplier {
    id: number;
    name: string;
    contact_person?: string;
    phone?: string;
    address?: string;
    branches_count?: number;
    orders_count?: number;
}

interface PageProps {
    suppliers: Supplier[];
}

// ──────────────────────────────────────────────── Custom global filter – searches all relevant string fields
const globalFilterAllColumns: FilterFn<Supplier> = (row: Row<Supplier>, _columnIds: string[], filterValue: string) => {
    if (!filterValue?.trim()) return true;

    const term = filterValue.toLowerCase().trim();

    // Search these fields (add more if needed)
    const fields = [row.original.name, row.original.contact_person ?? '', row.original.phone ?? '', row.original.address ?? ''];

    return fields.some((val) => val.toLowerCase().includes(term));
};

// ──────────────────────────────────────────────── Component
export default function SupplierIndex() {
    const { props } = usePage<PageProps>();
    const { suppliers } = props;

    const [sorting, setSorting] = useState<SortingState>([]);
    const [pagination, setPagination] = useState<PaginationState>({
        pageIndex: 0,
        pageSize: 10,
    });
    const [globalFilter, setGlobalFilter] = useState('');

    // ──────────────────────────────────────────────── Form – explicit type, no intersection, no red lines
    const form = useForm<{
        name: string;
        contact_person: string;
        phone: string;
        address: string;
    }>({
        name: '',
        contact_person: '',
        phone: '',
        address: '',
    });

    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [selected, setSelected] = useState<Supplier | null>(null);

    const getDisplayName = (item: typeof form.data | Supplier) => item.name?.trim() || 'Unnamed';

    const openCreate = () => {
        form.reset();
        setCreateOpen(true);
    };

    const openEdit = (item: Supplier) => {
        setSelected(item);
        form.setData({
            name: item.name,
            contact_person: item.contact_person ?? '',
            phone: item.phone ?? '',
            address: item.address ?? '',
        });
        setEditOpen(true);
    };

    const openDelete = (item: Supplier) => {
        setSelected(item);
        setDeleteOpen(true);
    };

    const handleSubmit = (e: React.FormEvent, isEdit = false) => {
        e.preventDefault();
        const name = getDisplayName(form.data);

        const options = {
            onSuccess: () => {
                toast.success(isEdit ? 'Supplier updated' : 'Supplier created', {
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
            form.patch(route('suppliers.update', selected.id), options);
        } else {
            form.post(route('suppliers.store'), options);
        }
    };

    const handleDelete = () => {
        if (!selected?.id) return;
        form.delete(route('suppliers.destroy', selected.id), {
            onSuccess: () => {
                toast.success(`${getDisplayName(selected)} deleted`);
                setDeleteOpen(false);
                setSelected(null);
            },
            onError: () => {
                toast.error('Cannot delete — supplier has products or orders.');
            },
            preserveScroll: true,
        });
    };

    // ──────────────────────────────────────────────── Columns – typed cells
    const columns = useMemo<ColumnDef<Supplier>[]>(
        () => [
            {
                id: 'rowNumber',
                header: '#',
                size: 60,
                cell: ({ row }) => <div className="text-center text-muted-foreground">{row.index + 1}</div>,
            },
            {
                accessorKey: 'name',
                header: 'Supplier Name',
            },
            {
                accessorKey: 'contact_person',
                header: 'Contact Person',
                cell: ({ getValue }) => {
                    const val = getValue() as string | undefined;
                    return val || '—';
                },
            },
            {
                accessorKey: 'phone',
                header: 'Phone',
                cell: ({ getValue }) => {
                    const val = getValue() as string | undefined;
                    return val || '—';
                },
            },
            {
                accessorKey: 'address',
                header: 'Address',
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
                accessorKey: 'branches_count',
                header: 'Branches',
                size: 100,
            },
            {
                accessorKey: 'orders_count',
                header: 'Orders',
                size: 100,
            },
            {
                id: 'actions',
                header: () => <div className="text-right">Actions</div>,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" asChild title="View Orders">
                            <Link href={route('suppliers.orders', row.original.id)}>
                                <ClipboardList className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => openEdit(row.original)}>
                            <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => openDelete(row.original)}
                            disabled={!!row.original.orders_count}
                            title={row.original.orders_count ? 'Has associated orders' : ''}
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
        data: suppliers,
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

    // ──────────────────────────────────────────────── Render
    return (
        <AdminLayout>
            <Head title="Suppliers" />

            <div className="space-y-6 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
                        <p className="mt-1 text-muted-foreground">{suppliers.length} total</p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        New Supplier
                    </Button>
                </div>

                <div className="relative max-w-md">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search name, contact, phone, address..."
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
                        <CardTitle>Supplier List</CardTitle>
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
                                                No suppliers found.
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
                            <DialogTitle>{editOpen ? 'Edit Supplier' : 'Create Supplier'}</DialogTitle>
                        </DialogHeader>

                        <form onSubmit={(e) => handleSubmit(e, editOpen)} className="space-y-6 py-4">
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Name *</Label>
                                    <Input
                                        value={form.data.name}
                                        onChange={(e) => form.setData('name', e.target.value)}
                                        placeholder="e.g. ABC Distributors"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Contact Person</Label>
                                    <Input
                                        value={form.data.contact_person}
                                        onChange={(e) => form.setData('contact_person', e.target.value)}
                                        placeholder="e.g. Juan Dela Cruz"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Phone</Label>
                                    <Input
                                        value={form.data.phone}
                                        onChange={(e) => form.setData('phone', e.target.value)}
                                        placeholder="e.g. +63 917 123 4567"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Address</Label>
                                    <Input
                                        value={form.data.address}
                                        onChange={(e) => form.setData('address', e.target.value)}
                                        placeholder="Full address"
                                    />
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
                                Delete Supplier
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
