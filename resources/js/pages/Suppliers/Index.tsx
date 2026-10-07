'use client';

import { usePage, useForm, Head } from '@inertiajs/react';
import type { ColumnDef, SortingState, PaginationState, FilterFn, Row } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getSortedRowModel, getPaginationRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table';
import { Trash2, Pencil, Plus, AlertTriangle, Search, X, ClipboardList, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { route } from 'ziggy-js';
import { controlCls, EmptyRow, PageHeader, Panel, SimplePager, Stat, StatStrip, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    [key: string]: unknown;
}

// ──────────────────────────────────────────────── Custom global filter – searches all relevant string fields
const globalFilterAllColumns: FilterFn<Supplier> = (row: Row<Supplier>, _columnId: string, filterValue: string) => {
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
            onError: (errors: Record<string, string>) => {
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
                accessorKey: 'name',
                header: 'Supplier',
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate font-semibold">{row.original.name}</p>
                        {row.original.address && (
                            <p className="max-w-72 truncate text-[11px] text-muted-foreground" title={row.original.address}>
                                {row.original.address}
                            </p>
                        )}
                    </div>
                ),
            },
            {
                accessorKey: 'contact_person',
                header: 'Contact',
                cell: ({ row }) => (
                    <div className="text-xs">
                        <p>{row.original.contact_person || '—'}</p>
                        {row.original.phone && <p className="text-muted-foreground">{row.original.phone}</p>}
                    </div>
                ),
            },
            {
                accessorKey: 'branches_count',
                header: 'Branches',
                cell: ({ getValue }) => <span className="tabular-nums">{(getValue() as number | undefined) ?? 0}</span>,
            },
            {
                accessorKey: 'orders_count',
                header: 'Orders',
                cell: ({ getValue }) => <span className="font-semibold tabular-nums">{(getValue() as number | undefined) ?? 0}</span>,
            },
            {
                id: 'actions',
                header: () => null,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-0.5">
                        <button
                            onClick={() => openEdit(row.original)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Edit ${row.original.name}`}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => openDelete(row.original)}
                            disabled={!!row.original.orders_count}
                            title={row.original.orders_count ? 'Has orders, so it cannot be deleted' : 'Delete'}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                            aria-label={`Delete ${row.original.name}`}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ),
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

    const filteredCount = table.getFilteredRowModel().rows.length;
    const { pageIndex, pageSize } = table.getState().pagination;
    const withOrders = suppliers.filter((sup) => (sup.orders_count ?? 0) > 0).length;
    const totalOrders = suppliers.reduce((sum, sup) => sum + (sup.orders_count ?? 0), 0);

    // ──────────────────────────────────────────────── Render
    return (
        <AdminLayout>
            <Head title="Suppliers" />

            <div className="space-y-4">
                <PageHeader title="Suppliers" subtitle="Where ingredients and stock are bought from.">
                    <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
                        <Plus className="h-4 w-4" /> Add supplier
                    </Button>
                </PageHeader>

                <StatStrip count={3}>
                    <Stat icon={Truck} label="Suppliers" value={suppliers.length.toLocaleString()} />
                    <Stat icon={ClipboardList} label="With orders" value={withOrders.toLocaleString()} />
                    <Stat icon={ClipboardList} label="Orders placed" value={totalOrders.toLocaleString()} />
                </StatStrip>

                <Panel
                    flush
                    icon={Truck}
                    title="Supplier list"
                    actions={
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                                placeholder="Name, contact, phone or address"
                                value={globalFilter}
                                onChange={(e) => setGlobalFilter(e.target.value)}
                                className={cn(controlCls, 'w-full pr-8 pl-8')}
                            />
                            {globalFilter && (
                                <button
                                    onClick={() => setGlobalFilter('')}
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear search"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                {table.getHeaderGroups().map((hg) => (
                                    <tr key={hg.id}>
                                        {hg.headers.map((h) => (
                                            <th
                                                key={h.id}
                                                className={cn(thCls, h.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground')}
                                                onClick={h.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                                {{ asc: ' ↑', desc: ' ↓' }[h.column.getIsSorted() as string] ?? null}
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody className="divide-y divide-border">
                                {table.getRowModel().rows.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <tr key={row.id} className="hover:bg-muted/30">
                                            {row.getVisibleCells().map((cell) => (
                                                <td key={cell.id} className="px-4 py-2">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : (
                                    <EmptyRow colSpan={columns.length} icon={Truck}>
                                        {globalFilter ? 'No suppliers match your search.' : 'No suppliers yet.'}
                                    </EmptyRow>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {table.getPageCount() > 1 && (
                        <SimplePager
                            from={filteredCount === 0 ? 0 : pageIndex * pageSize + 1}
                            to={Math.min((pageIndex + 1) * pageSize, filteredCount)}
                            total={filteredCount}
                            page={pageIndex + 1}
                            lastPage={table.getPageCount()}
                            onPage={(page) => table.setPageIndex(page - 1)}
                        />
                    )}
                </Panel>

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
