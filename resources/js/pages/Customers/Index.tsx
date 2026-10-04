import { useState } from 'react';
import type React from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { routes } from '@/routes';
import { cn } from '@/lib/utils';
import { Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, User, X } from 'lucide-react';

interface Customer {
    id: number;
    name: string;
    contact_number: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
    total_purchases: number | null;
    credit_balance: number | null;
    transactions_count: number;
}

interface PageProps {
    customers: {
        data: Customer[];
        total: number;
        current_page: number;
        last_page: number;
        from: number;
        to: number;
        links: { url: string | null; label: string; active: boolean }[];
    };
    filters: { search?: string };
    currency: string;
    [key: string]: unknown;
}

const emptyForm = { name: '', contact_number: '', email: '', address: '', notes: '', is_active: true };

export default function CustomersIndex() {
    const { props } = usePage<PageProps>();
    const { customers, filters, currency } = props;
    const [search, setSearch] = useState(filters.search ?? '');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Customer | null>(null);
    const [deleting, setDeleting] = useState<Customer | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const fmt = (n: number | null | undefined) =>
        `${currency}${Number(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    function applySearch(e?: React.FormEvent) {
        e?.preventDefault();
        router.get(routes.customers.index(), { search: search || undefined }, { preserveState: true, replace: true });
    }

    function openNew() {
        setEditing(null);
        setForm(emptyForm);
        setErrors({});
        setDrawerOpen(true);
    }

    function openEdit(customer: Customer) {
        setEditing(customer);
        setForm({
            name: customer.name,
            contact_number: customer.contact_number ?? '',
            email: customer.email ?? '',
            address: customer.address ?? '',
            notes: customer.notes ?? '',
            is_active: customer.is_active,
        });
        setErrors({});
        setDrawerOpen(true);
    }

    function submit(e?: React.FormEvent) {
        e?.preventDefault();
        setSaving(true);
        const request = editing
            ? router.patch(routes.customers.update(editing.id), form, {
                  preserveScroll: true,
                  onSuccess: () => {
                      setDrawerOpen(false);
                      setSaving(false);
                  },
                  onError: (err) => {
                      setErrors(err);
                      setSaving(false);
                  },
              })
            : router.post(routes.customers.store(), form, {
                  preserveScroll: true,
                  onSuccess: () => {
                      setDrawerOpen(false);
                      setSaving(false);
                  },
                  onError: (err) => {
                      setErrors(err);
                      setSaving(false);
                  },
              });
        return request;
    }

    function remove() {
        if (!deleting) return;
        router.delete(routes.customers.destroy(deleting.id), {
            preserveScroll: true,
            onSuccess: () => setDeleting(null),
        });
    }

    return (
        <AdminLayout>
            <Head title="Customers" />
            <div className="mx-auto max-w-[1400px] space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        <div>
                            <h1 className="text-xl font-bold text-foreground">Customers</h1>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {customers.total} registered customer{customers.total !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" className="gap-1.5" onClick={openNew}>
                        <Plus className="h-4 w-4" />
                        Add Customer
                    </Button>
                </div>

                <form onSubmit={applySearch} className="flex gap-2 rounded-xl border border-border bg-card p-4">
                    <div className="relative flex-1">
                        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name, phone, or email..."
                            className="h-9 pl-9"
                        />
                    </div>
                    <Button size="sm" className="h-9" type="submit">
                        Search
                    </Button>
                </form>

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/40">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Customer
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase md:table-cell">
                                        Contact
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Purchases
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Credit
                                    </th>
                                    <th className="hidden px-4 py-3 text-center text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:table-cell">
                                        Status
                                    </th>
                                    <th className="w-24" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {customers.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                                            No customers found.
                                        </td>
                                    </tr>
                                ) : (
                                    customers.data.map((customer) => (
                                        <tr key={customer.id} className="hover:bg-muted/20">
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={routes.customers.show(customer.id)}
                                                    className="font-semibold text-foreground hover:text-primary"
                                                >
                                                    {customer.name}
                                                </Link>
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {customer.transactions_count} transaction{customer.transactions_count !== 1 ? 's' : ''}
                                                </p>
                                            </td>
                                            <td className="hidden space-y-1 px-4 py-3 text-xs text-muted-foreground md:table-cell">
                                                {customer.contact_number && (
                                                    <p className="flex items-center gap-1.5">
                                                        <Phone className="h-3 w-3" />
                                                        {customer.contact_number}
                                                    </p>
                                                )}
                                                {customer.email && (
                                                    <p className="flex items-center gap-1.5">
                                                        <Mail className="h-3 w-3" />
                                                        {customer.email}
                                                    </p>
                                                )}
                                                {customer.address && (
                                                    <p className="flex items-center gap-1.5">
                                                        <MapPin className="h-3 w-3" />
                                                        {customer.address}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold tabular-nums">{fmt(customer.total_purchases)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-amber-700 tabular-nums dark:text-amber-400">
                                                {fmt(customer.credit_balance)}
                                            </td>
                                            <td className="hidden px-4 py-3 text-center lg:table-cell">
                                                <span
                                                    className={cn(
                                                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold',
                                                        customer.is_active
                                                            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                                            : 'bg-muted text-muted-foreground',
                                                    )}
                                                >
                                                    {customer.is_active ? 'Active' : 'Archived'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => openEdit(customer)}
                                                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleting(customer)}
                                                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {drawerOpen && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
                    <form onSubmit={submit} className="flex w-full max-w-md flex-col bg-background shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <h2 className="text-sm font-semibold">{editing ? 'Edit Customer' : 'New Customer'}</h2>
                            <button
                                type="button"
                                onClick={() => setDrawerOpen(false)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                            {(['name', 'contact_number', 'email'] as const).map((key) => (
                                <div key={key} className="space-y-1">
                                    <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                                        {key.replace('_', ' ')}
                                    </label>
                                    <Input
                                        value={String(form[key])}
                                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                        required={key === 'name'}
                                    />
                                    {errors[key] && <p className="text-[11px] text-destructive">{errors[key]}</p>}
                                </div>
                            ))}
                            <div className="space-y-1">
                                <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Address</label>
                                <textarea
                                    value={form.address}
                                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                                    className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Notes</label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                    className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                />
                            </div>
                            {editing && (
                                <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
                                    <span className="text-sm font-medium">Active</span>
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                    />
                                </label>
                            )}
                        </div>
                        <div className="flex gap-2 border-t border-border px-5 py-4">
                            <Button type="button" variant="outline" className="flex-1" onClick={() => setDrawerOpen(false)}>
                                Cancel
                            </Button>
                            <Button className="flex-1" disabled={saving}>
                                {saving ? 'Saving...' : 'Save'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}

            {deleting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDeleting(null)} />
                    <div className="relative w-full max-w-sm rounded-xl bg-background p-6 shadow-2xl">
                        <h3 className="text-base font-semibold">Delete Customer?</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Customers with history will be archived instead.</p>
                        <div className="mt-4 flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" className="flex-1" onClick={remove}>
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
