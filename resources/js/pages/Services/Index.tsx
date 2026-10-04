import { useState } from 'react';
import type React from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';
import { Clock, ImageIcon, Pencil, Plus, Search, Trash2, Wrench, X } from 'lucide-react';

interface Service {
    id: number;
    name: string;
    description: string | null;
    barcode: string | null;
    category: { id: number; name: string } | null;
    product_img: string | null;
    is_taxable: boolean;
    price: number;
    duration_minutes: number | null;
    status: 'active' | 'inactive';
}

interface Category {
    id: number;
    name: string;
}

interface PageProps {
    services: { data: Service[]; total: number; current_page: number; last_page: number };
    categories: Category[];
    branch_id: number;
    is_admin: boolean;
    filters: { search?: string; category_id?: string; status?: string };
    currency: string;
    [key: string]: unknown;
}

const inp = 'w-full h-[42px] rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const sel = `${inp} appearance-none`;

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{label}</Label>
            {children}
            {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
    );
}

const durationLabel = (minutes: number | null) => {
    if (!minutes) return 'No duration';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ');
};

export default function ServicesIndex() {
    const { props } = usePage<PageProps>();
    const { services, categories, branch_id, is_admin, filters, currency } = props;

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Service | null>(null);
    const [deleting, setDeleting] = useState<Service | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [durationMinutes, setDurationMinutes] = useState('');
    const [statusValue, setStatusValue] = useState<'active' | 'inactive'>('active');
    const [barcode, setBarcode] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [isTaxable, setIsTaxable] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const [search, setSearch] = useState(filters.search ?? '');
    const [statusFilter, setStatusFilter] = useState(filters.status ?? '');

    const fmt = (n: number) => `${currency}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    function resetForm(service?: Service) {
        setEditing(service ?? null);
        setName(service?.name ?? '');
        setDescription(service?.description ?? '');
        setPrice(service ? String(service.price) : '');
        setDurationMinutes(service?.duration_minutes ? String(service.duration_minutes) : '');
        setStatusValue(service?.status ?? 'active');
        setBarcode(service?.barcode ?? '');
        setCategoryId(String(service?.category?.id ?? ''));
        setIsTaxable(service?.is_taxable ?? true);
        setImageFile(null);
        setImagePreview(null);
        setErrors({});
    }

    function openNew() {
        resetForm();
        setDrawerOpen(true);
    }

    function openEdit(service: Service) {
        resetForm(service);
        setDrawerOpen(true);
    }

    function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    }

    function handleSubmit(e?: React.FormEvent) {
        e?.preventDefault();
        setSaving(true);
        setErrors({});

        const fd = new FormData();
        fd.append('name', name);
        fd.append('description', description);
        fd.append('price', price);
        fd.append('duration_minutes', durationMinutes);
        fd.append('status', statusValue);
        fd.append('barcode', barcode);
        fd.append('category_id', categoryId);
        fd.append('is_taxable', isTaxable ? '1' : '0');
        if (is_admin) fd.append('branch_id', String(branch_id));
        if (imageFile) fd.append('product_img', imageFile);

        const url = editing ? routes.services.update(editing.id) : routes.services.store();
        router.post(url, fd as any, {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                setDrawerOpen(false);
                setSaving(false);
            },
            onError: (e) => {
                setErrors(e);
                setSaving(false);
            },
        });
    }

    function applyFilters(e?: React.FormEvent) {
        e?.preventDefault();
        router.get(
            routes.services.index(),
            {
                search: search || undefined,
                status: statusFilter || undefined,
            },
            { preserveState: true, replace: true },
        );
    }

    function handleDelete() {
        if (!deleting) return;
        router.delete(routes.services.destroy(deleting.id), {
            preserveScroll: true,
            onSuccess: () => setDeleting(null),
        });
    }

    return (
        <AdminLayout>
            <Head title="Services" />
            <div className="mx-auto max-w-[1400px] space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Wrench className="h-5 w-5 text-primary" />
                        <div>
                            <h1 className="text-xl font-bold text-foreground">Services</h1>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {services.total} service{services.total !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" className="gap-1.5" onClick={openNew}>
                        <Plus className="h-4 w-4" />
                        Add Service
                    </Button>
                </div>

                <form onSubmit={applyFilters} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
                    <div className="relative min-w-[220px] flex-1">
                        <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services..." className="h-9 pl-9" />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
                    >
                        <option value="">All status</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                    <Button size="sm" className="h-9 gap-2" type="submit">
                        Apply
                    </Button>
                </form>

                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border bg-muted/40">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Service
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase md:table-cell">
                                        Category
                                    </th>
                                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase lg:table-cell">
                                        Duration
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Price
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                        Status
                                    </th>
                                    <th className="w-20" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {services.data.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                                            No services found.
                                        </td>
                                    </tr>
                                ) : (
                                    services.data.map((service) => (
                                        <tr key={service.id} className="transition-colors hover:bg-muted/20">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {service.product_img ? (
                                                        <img
                                                            src={service.product_img}
                                                            alt={service.name}
                                                            className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).src = '/images/products/default-product.svg';
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                                                            <Wrench className="h-4 w-4 text-primary" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="font-medium text-foreground">{service.name}</p>
                                                        <p className="max-w-[420px] truncate text-xs text-muted-foreground">
                                                            {service.description || service.barcode || 'Available in cashiering'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{service.category?.name ?? '-'}</td>
                                            <td className="hidden px-4 py-3 lg:table-cell">
                                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {durationLabel(service.duration_minutes)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-primary tabular-nums">{fmt(service.price)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span
                                                    className={cn(
                                                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold capitalize',
                                                        service.status === 'active'
                                                            ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                                                            : 'bg-muted text-muted-foreground',
                                                    )}
                                                >
                                                    {service.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={() => openEdit(service)}
                                                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleting(service)}
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
                    <div className="flex w-full max-w-md flex-col bg-background shadow-2xl">
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                            <div className="flex items-center gap-2">
                                <Wrench className="h-4 w-4 text-primary" />
                                <h2 className="text-sm font-semibold">{editing ? 'Edit Service' : 'New Service'}</h2>
                            </div>
                            <button onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                            <div className="flex items-center gap-4">
                                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30">
                                    {imagePreview || editing?.product_img ? (
                                        <img src={imagePreview ?? editing?.product_img ?? ''} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                                    )}
                                </div>
                                <div>
                                    <label className="cursor-pointer">
                                        <span className="text-xs font-medium text-primary hover:underline">
                                            {editing?.product_img || imagePreview ? 'Change image' : 'Upload image'}
                                        </span>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                                    </label>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">Optional, max 5 MB</p>
                                    {errors.product_img && <p className="text-[11px] text-destructive">{errors.product_img}</p>}
                                </div>
                            </div>

                            <Field label="Service name" error={errors.name}>
                                <input className={inp} value={name} onChange={(e) => setName(e.target.value)} required />
                            </Field>
                            <Field label="Description" error={errors.description}>
                                <textarea
                                    className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={`Price (${currency})`} error={errors.price}>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className={inp}
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        required
                                    />
                                </Field>
                                <Field label="Duration (minutes)" error={errors.duration_minutes}>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className={inp}
                                        value={durationMinutes}
                                        onChange={(e) => setDurationMinutes(e.target.value)}
                                    />
                                </Field>
                            </div>
                            <Field label="Category" error={errors.category_id}>
                                <select className={sel} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                                    <option value="">Select category...</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Status" error={errors.status}>
                                    <select
                                        className={sel}
                                        value={statusValue}
                                        onChange={(e) => setStatusValue(e.target.value as 'active' | 'inactive')}
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </Field>
                                <Field label="Barcode / SKU" error={errors.barcode}>
                                    <input className={inp} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                                </Field>
                            </div>
                            <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
                                <div>
                                    <p className="text-sm font-medium">Taxable</p>
                                    <p className="text-[11px] text-muted-foreground">Apply tax when sold at POS</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsTaxable((v) => !v)}
                                    className={cn(
                                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 transition-colors',
                                        isTaxable ? 'border-primary bg-primary' : 'border-border bg-muted',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform',
                                            isTaxable ? 'translate-x-4' : 'translate-x-0.5',
                                        )}
                                    />
                                </button>
                            </label>
                        </form>

                        <div className="flex shrink-0 gap-2 border-t border-border px-5 py-4">
                            <Button variant="outline" className="flex-1" onClick={() => setDrawerOpen(false)}>
                                Cancel
                            </Button>
                            <Button className="flex-1" onClick={() => handleSubmit()} disabled={saving}>
                                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Service'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {deleting && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDeleting(null)} />
                    <div className="relative w-full max-w-sm rounded-xl bg-background p-6 shadow-2xl">
                        <h3 className="text-base font-semibold">Delete Service?</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            <strong>{deleting.name}</strong> will be permanently removed.
                        </p>
                        <div className="mt-4 flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setDeleting(null)}>
                                Cancel
                            </Button>
                            <Button variant="destructive" className="flex-1" onClick={handleDelete}>
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
}
