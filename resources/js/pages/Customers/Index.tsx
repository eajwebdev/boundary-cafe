import { Head, Link, router, usePage } from '@inertiajs/react';
import { Coins, Globe, Mail, Pencil, Phone, Plus, Search, Trash2, User, UserCheck, Users, Wallet, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';
import { toast } from 'sonner';
import { controlCls, PageHeader, Pager, Panel, Stat, StatStrip, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

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
    customer_number: string | null;
    loyalty_points: number | null;
    has_online_account: number | boolean;
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
    stats: {
        total: number;
        active: number;
        online_accounts: number;
        loyalty_points: number;
        owing_count: number;
        credit_outstanding: number;
    };
    owing: { id: number; name: string; customer_number: string | null; credit_balance: number }[];
    flash?: { success?: string | null; error?: string | null };
    [key: string]: unknown;
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');

const emptyForm = { name: '', contact_number: '', email: '', address: '', notes: '', is_active: true };

export default function CustomersIndex() {
    const { props } = usePage<PageProps>();
    const { customers, filters, currency, stats, owing, flash } = props;
    const [search, setSearch] = useState(filters.search ?? '');
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Customer | null>(null);
    const [deleting, setDeleting] = useState<Customer | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

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
            <div className="space-y-4">
                <PageHeader title="Customers" subtitle="Everyone who buys from the cafe: walk-ins, loyalty members and online accounts.">
                    <Button size="sm" className="h-9 gap-1.5" onClick={openNew}>
                        <Plus className="h-4 w-4" /> Add customer
                    </Button>
                </PageHeader>

                <StatStrip count={6}>
                    <Stat icon={Users} label="Customers" value={stats.total.toLocaleString()} />
                    <Stat icon={UserCheck} label="Active" value={stats.active.toLocaleString()} />
                    <Stat icon={Globe} label="Online accounts" value={stats.online_accounts.toLocaleString()} />
                    <Stat icon={Coins} label="Loyalty pts held" value={stats.loyalty_points.toLocaleString()} />
                    <Stat
                        icon={Wallet}
                        label="Owing credit"
                        value={stats.owing_count.toLocaleString()}
                        tone={stats.owing_count > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={Wallet}
                        label="Credit outstanding"
                        value={fmt(stats.credit_outstanding)}
                        tone={stats.credit_outstanding > 0 ? 'warning' : undefined}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                    <Panel
                        flush
                        icon={User}
                        title="Customer list"
                        actions={
                            <form onSubmit={applySearch} className="relative w-full sm:w-72">
                                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Name, phone or email, then Enter"
                                    className={cn(controlCls, 'w-full pl-8')}
                                />
                            </form>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className={thCls}>Customer</th>
                                        <th className={cn(thCls, 'hidden md:table-cell')}>Contact</th>
                                        <th className={cn(thCls, 'text-right')}>Purchases</th>
                                        <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Points</th>
                                        <th className={cn(thCls, 'text-right')}>Credit</th>
                                        <th className="w-20" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {customers.data.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                                                {filters.search ? `No customers match "${filters.search}".` : 'No customers yet.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        customers.data.map((customer) => (
                                            <tr key={customer.id} className={cn('hover:bg-muted/30', !customer.is_active && 'opacity-60')}>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                                            {initials(customer.name)}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <Link
                                                                href={routes.customers.show(customer.id)}
                                                                className="flex items-center gap-1.5 font-semibold hover:text-primary"
                                                            >
                                                                <span className="truncate">{customer.name}</span>
                                                                {!!customer.has_online_account && (
                                                                    <span className="rounded bg-sky-500/10 px-1 py-px text-[10px] font-bold text-sky-700 dark:text-sky-400">
                                                                        Online
                                                                    </span>
                                                                )}
                                                                {!customer.is_active && (
                                                                    <span className="rounded bg-muted px-1 py-px text-[10px] font-bold text-muted-foreground">
                                                                        Archived
                                                                    </span>
                                                                )}
                                                            </Link>
                                                            <p className="truncate text-[11px] text-muted-foreground">
                                                                <span className="font-mono">{customer.customer_number ?? '-'}</span> ·{' '}
                                                                {customer.transactions_count} visit{customer.transactions_count !== 1 ? 's' : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground md:table-cell">
                                                    {customer.contact_number && (
                                                        <p className="flex items-center gap-1.5">
                                                            <Phone className="h-3 w-3" /> {customer.contact_number}
                                                        </p>
                                                    )}
                                                    {customer.email && (
                                                        <p className="flex max-w-56 items-center gap-1.5 truncate">
                                                            <Mail className="h-3 w-3 shrink-0" /> {customer.email}
                                                        </p>
                                                    )}
                                                    {!customer.contact_number && !customer.email && <span>-</span>}
                                                </td>
                                                <td className="px-4 py-2 text-right font-bold tabular-nums">{fmt(customer.total_purchases)}</td>
                                                <td className="hidden px-4 py-2 text-right text-muted-foreground tabular-nums sm:table-cell">
                                                    {(customer.loyalty_points ?? 0).toLocaleString()}
                                                </td>
                                                <td
                                                    className={cn(
                                                        'px-4 py-2 text-right tabular-nums',
                                                        Number(customer.credit_balance ?? 0) > 0
                                                            ? 'font-bold text-amber-700 dark:text-amber-400'
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {fmt(customer.credit_balance)}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <div className="flex justify-end gap-0.5">
                                                        <button
                                                            onClick={() => openEdit(customer)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            aria-label={`Edit ${customer.name}`}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleting(customer)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                            aria-label={`Delete ${customer.name}`}
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
                        {customers.last_page > 1 && (
                            <Pager
                                from={customers.from}
                                to={customers.to}
                                total={customers.total}
                                links={customers.links}
                                onVisit={(url) => router.get(url, {}, { preserveState: true, preserveScroll: true })}
                            />
                        )}
                    </Panel>

                    <Panel
                        flush
                        icon={Wallet}
                        title="Owing credit"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">balance due</span>}
                        className="self-start"
                    >
                        {owing.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No unpaid credit.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {owing.map((c) => (
                                    <li key={c.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                        <Link href={routes.customers.show(c.id)} className="min-w-0 flex-1 hover:text-primary">
                                            <span className="block truncate font-semibold">{c.name}</span>
                                            <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                                {c.customer_number ?? '-'}
                                            </span>
                                        </Link>
                                        <span className="font-bold text-amber-700 tabular-nums dark:text-amber-400">{fmt(c.credit_balance)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
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
