'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { Trash2, Plus, Search, PackageCheck, ArrowLeft, ScanLine, Building2, Warehouse } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Supplier {
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
    contact_person: string | null;
}

interface Product {
    id: number;
    name: string;
    barcode: string | null;
    category: string | null;
}

interface CartItem {
    product_id: number;
    product_name: string;
    barcode: string | null;
    quantity: number;
    unit_cost: number;
}

interface Branch {
    id: number;
    name: string;
    code: string;
}
interface WHouse {
    id: number;
    name: string;
    code: string;
}

interface PageProps {
    suppliers: Supplier[];
    products: Product[];
    branches: Branch[];
    warehouses: WHouse[];
    user_branch_id: number | null;
    errors?: Record<string, string>;
    message?: { type: string; text: string };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PurchaseOrdersCreate() {
    const { props } = usePage<PageProps>();
    const { suppliers, products, branches, warehouses, user_branch_id, errors = {} } = props;

    // ── Form state ────────────────────────────────────────────────────────────
    const [destType, setDestType] = useState<'branch' | 'warehouse'>('branch');
    const [destId, setDestId] = useState<string>(user_branch_id ? String(user_branch_id) : '');
    const [supplierId, setSupplierId] = useState<string>('');
    const [orNumber, setOrNumber] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'postdated_check'>('cash');
    const [checkDate, setCheckDate] = useState('');
    const [checkNumber, setCheckNumber] = useState('');
    const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');

    // ── Cart ──────────────────────────────────────────────────────────────────
    const [cart, setCart] = useState<CartItem[]>([]);

    // ── Product search ────────────────────────────────────────────────────────
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const [submitting, setSubmitting] = useState(false);

    // ── Filtered products ─────────────────────────────────────────────────────
    const filteredProducts = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase().includes(q))).slice(0, 10);
    }, [search, products]);

    // ── Helpers ───────────────────────────────────────────────────────────────
    const grandTotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);

    const addProduct = (product: Product) => {
        setSearch('');
        setShowDropdown(false);
        const existing = cart.findIndex((c) => c.product_id === product.id);
        if (existing >= 0) {
            setCart((prev) => prev.map((c, i) => (i === existing ? { ...c, quantity: c.quantity + 1 } : c)));
        } else {
            setCart((prev) => [
                ...prev,
                {
                    product_id: product.id,
                    product_name: product.name,
                    barcode: product.barcode,
                    quantity: 1,
                    unit_cost: 0,
                },
            ]);
        }
        searchRef.current?.focus();
    };

    const updateCart = (index: number, field: 'quantity' | 'unit_cost', value: number) => {
        setCart((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    };

    const removeItem = (index: number) => {
        setCart((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && filteredProducts.length > 0) {
            addProduct(filteredProducts[0]);
        }
        if (e.key === 'Escape') {
            setShowDropdown(false);
        }
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = () => {
        if (!supplierId) {
            toast.error('Please select a supplier.');
            return;
        }
        if (!destId) {
            toast.error('Please select a destination (branch or warehouse).');
            return;
        }
        if (cart.length === 0) {
            toast.error('Please add at least one item.');
            return;
        }
        if (paymentMethod === 'postdated_check' && !checkDate) {
            toast.error('Check date is required.');
            return;
        }
        if (paymentMethod === 'postdated_check' && !checkNumber) {
            toast.error('Check number is required.');
            return;
        }

        const hasZeroCost = cart.some((item) => item.unit_cost <= 0);
        if (hasZeroCost) {
            toast.error('All items must have a unit cost greater than 0.');
            return;
        }

        setSubmitting(true);
        router.post(
            routes.purchaseOrders.store(),
            {
                supplier_id: Number(supplierId),
                dest_type: destType,
                dest_id: Number(destId),
                or_number: orNumber || null,
                payment_method: paymentMethod,
                check_date: paymentMethod === 'postdated_check' ? checkDate : null,
                check_number: paymentMethod === 'postdated_check' ? checkNumber : null,
                received_date: receivedDate,
                notes: notes || null,
                items: cart.map((item) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_cost: item.unit_cost,
                })),
            },
            {
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const paymentLabel: Record<string, string> = {
        cash: 'Cash',
        credit: 'Credit',
        postdated_check: 'Postdated Check',
    };

    return (
        <AdminLayout>
            <Head title="New Purchase" />
            <div className="mx-auto max-w-5xl space-y-6 p-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.visit(routes.purchaseOrders.index())}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold">New Purchase</h1>
                        <p className="text-sm text-muted-foreground">Record a purchase from a supplier and update stock automatically.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* ── LEFT: Details ─────────────────────────────────── */}
                    <div className="space-y-4 lg:col-span-1">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Purchase Details</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Destination */}
                                <div className="space-y-1.5">
                                    <Label>
                                        Stock Destination <span className="text-destructive">*</span>
                                    </Label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDestType('branch');
                                                setDestId(user_branch_id ? String(user_branch_id) : '');
                                            }}
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${destType === 'branch' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
                                        >
                                            <Building2 className="h-4 w-4" /> Branch
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setDestType('warehouse');
                                                setDestId('');
                                            }}
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors ${destType === 'warehouse' ? 'border-purple-500 bg-purple-500/10 text-purple-400' : 'border-border text-muted-foreground hover:border-muted-foreground'}`}
                                        >
                                            <Warehouse className="h-4 w-4" /> Warehouse
                                        </button>
                                    </div>
                                    <Select value={destId} onValueChange={setDestId}>
                                        <SelectTrigger className={errors.dest_id ? 'border-destructive' : ''}>
                                            <SelectValue placeholder={`Select ${destType}…`} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {destType === 'branch'
                                                ? branches.map((b) => (
                                                      <SelectItem key={b.id} value={String(b.id)}>
                                                          {b.name} ({b.code})
                                                      </SelectItem>
                                                  ))
                                                : warehouses.map((w) => (
                                                      <SelectItem key={w.id} value={String(w.id)}>
                                                          {w.name} ({w.code})
                                                      </SelectItem>
                                                  ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.dest_id && <p className="text-xs text-destructive">{errors.dest_id}</p>}
                                </div>

                                {/* Supplier */}
                                <div className="space-y-1.5">
                                    <Label>
                                        Supplier <span className="text-destructive">*</span>
                                    </Label>
                                    <Select value={supplierId} onValueChange={setSupplierId}>
                                        <SelectTrigger className={errors.supplier_id ? 'border-destructive' : ''}>
                                            <SelectValue placeholder="Select supplier..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {suppliers.map((s) => (
                                                <SelectItem key={s.id} value={String(s.id)}>
                                                    {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.supplier_id && <p className="text-xs text-destructive">{errors.supplier_id}</p>}
                                </div>

                                {/* OR Number */}
                                <div className="space-y-1.5">
                                    <Label>OR / Receipt Number</Label>
                                    <Input value={orNumber} onChange={(e) => setOrNumber(e.target.value)} placeholder="e.g. OR-2024-001" />
                                </div>

                                {/* Received Date */}
                                <div className="space-y-1.5">
                                    <Label>
                                        Date Received <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        type="date"
                                        value={receivedDate}
                                        onChange={(e) => setReceivedDate(e.target.value)}
                                        className={errors.received_date ? 'border-destructive' : ''}
                                    />
                                    {errors.received_date && <p className="text-xs text-destructive">{errors.received_date}</p>}
                                </div>

                                {/* Payment Method */}
                                <div className="space-y-1.5">
                                    <Label>
                                        Payment Method <span className="text-destructive">*</span>
                                    </Label>
                                    <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="credit">Credit</SelectItem>
                                            <SelectItem value="postdated_check">Postdated Check</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Check fields (postdated only) */}
                                {paymentMethod === 'postdated_check' && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label>
                                                Check Date <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                type="date"
                                                value={checkDate}
                                                onChange={(e) => setCheckDate(e.target.value)}
                                                className={errors.check_date ? 'border-destructive' : ''}
                                            />
                                            {errors.check_date && <p className="text-xs text-destructive">{errors.check_date}</p>}
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>
                                                Check Number <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                value={checkNumber}
                                                onChange={(e) => setCheckNumber(e.target.value)}
                                                placeholder="e.g. 001234"
                                                className={errors.check_number ? 'border-destructive' : ''}
                                            />
                                            {errors.check_number && <p className="text-xs text-destructive">{errors.check_number}</p>}
                                        </div>
                                    </>
                                )}

                                {/* Notes */}
                                <div className="space-y-1.5">
                                    <Label>Notes</Label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                        placeholder="Optional notes..."
                                        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Summary */}
                        {cart.length > 0 && (
                            <Card>
                                <CardContent className="space-y-3 pt-4">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Items</span>
                                        <span>{cart.length}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Total Qty</span>
                                        <span>{cart.reduce((s, i) => s + i.quantity, 0)}</span>
                                    </div>
                                    <Separator />
                                    <div className="flex justify-between font-semibold">
                                        <span>Grand Total</span>
                                        <span>₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {paymentMethod !== 'cash' && (
                                        <Badge variant="outline" className="w-full justify-center">
                                            {paymentLabel[paymentMethod]} — Payable to supplier
                                        </Badge>
                                    )}
                                    <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                                        <PackageCheck className="mr-2 h-4 w-4" />
                                        {submitting ? 'Saving...' : 'Save Purchase & Update Stock'}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* ── RIGHT: Cart ───────────────────────────────────── */}
                    <div className="space-y-4 lg:col-span-2">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium">Items</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Search */}
                                <div className="relative">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                ref={searchRef}
                                                value={search}
                                                onChange={(e) => {
                                                    setSearch(e.target.value);
                                                    setShowDropdown(true);
                                                }}
                                                onFocus={() => setShowDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                                                onKeyDown={handleSearchKeyDown}
                                                placeholder="Search product name or scan barcode..."
                                                className="pl-9"
                                            />
                                        </div>
                                        <ScanLine className="h-5 w-5 shrink-0 text-muted-foreground" />
                                    </div>

                                    {/* Dropdown */}
                                    {showDropdown && filteredProducts.length > 0 && (
                                        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                                            {filteredProducts.map((product) => (
                                                <button
                                                    key={product.id}
                                                    type="button"
                                                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                                                    onMouseDown={() => addProduct(product)}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">{product.name}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {product.category && <span>{product.category} · </span>}
                                                            {product.barcode ?? 'No barcode'}
                                                        </p>
                                                    </div>
                                                    <Plus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Cart table */}
                                {cart.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                        <PackageCheck className="mb-3 h-10 w-10 opacity-30" />
                                        <p className="text-sm">No items added yet.</p>
                                        <p className="mt-1 text-xs">Search for a product or scan a barcode above.</p>
                                    </div>
                                ) : (
                                    <div className="overflow-hidden rounded-md border border-border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-muted/40">
                                                    <TableHead>Product</TableHead>
                                                    <TableHead className="w-24 text-right">Qty</TableHead>
                                                    <TableHead className="w-32 text-right">Unit Cost (₱)</TableHead>
                                                    <TableHead className="w-28 text-right">Total</TableHead>
                                                    <TableHead className="w-10" />
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {cart.map((item, idx) => (
                                                    <TableRow key={idx}>
                                                        <TableCell>
                                                            <p className="text-sm font-medium">{item.product_name}</p>
                                                            {item.barcode && <p className="text-xs text-muted-foreground">{item.barcode}</p>}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Input
                                                                type="number"
                                                                min="1"
                                                                value={item.quantity}
                                                                onChange={(e) => updateCart(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                                                                className="ml-auto w-20 text-right"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={item.unit_cost}
                                                                onChange={(e) => updateCart(idx, 'unit_cost', Math.max(0, Number(e.target.value)))}
                                                                className="ml-auto w-28 text-right"
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right text-sm font-medium">
                                                            ₱{(item.quantity * item.unit_cost).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                                onClick={() => removeItem(idx)}
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}

                                {/* Mobile submit */}
                                {cart.length > 0 && (
                                    <div className="flex items-center justify-between border-t border-border pt-2 lg:hidden">
                                        <div>
                                            <p className="text-xs text-muted-foreground">Grand Total</p>
                                            <p className="font-semibold">₱{grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <Button onClick={handleSubmit} disabled={submitting}>
                                            <PackageCheck className="mr-2 h-4 w-4" />
                                            {submitting ? 'Saving...' : 'Save Purchase'}
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
