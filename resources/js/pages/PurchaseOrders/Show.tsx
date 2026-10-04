'use client';

import { Head, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

interface PurchaseItem {
    product_name: string;
    barcode: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
}

interface Purchase {
    id: number;
    grn_number: string;
    or_number: string | null;
    payment_method: string | null;
    check_date: string | null;
    check_number: string | null;
    paid_at: string | null;
    is_paid: boolean;
    received_date: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    supplier: {
        id: number;
        name: string;
        phone: string | null;
        address: string | null;
        contact_person: string | null;
    } | null;
    dest_type: string;
    dest_name: string;
    received_by: string;
    total: number;
    items: PurchaseItem[];
}

interface PageProps {
    purchase: Purchase;
}

const paymentLabel: Record<string, string> = {
    cash: 'Cash',
    credit: 'Credit',
    postdated_check: 'Postdated Check',
};

export default function PurchaseOrdersShow() {
    const { props } = usePage<PageProps>();
    const { purchase } = props;

    return (
        <AdminLayout>
            <Head title={`Purchase ${purchase.grn_number}`} />
            <div className="mx-auto max-w-3xl space-y-6 p-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => router.visit(routes.purchaseOrders.index())}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="font-mono text-xl font-semibold">{purchase.grn_number}</h1>
                        <p className="text-sm text-muted-foreground">Purchase details</p>
                    </div>
                    <div className="ml-auto">
                        {purchase.is_paid ? (
                            <Badge variant="outline" className="gap-1 border-green-300 text-green-600">
                                <CheckCircle2 className="h-3 w-3" /> Paid
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="gap-1 border-orange-300 text-orange-600">
                                <AlertCircle className="h-3 w-3" /> Unpaid
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Info cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Supplier</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <p className="font-medium">{purchase.supplier?.name ?? '—'}</p>
                            {purchase.supplier?.contact_person && <p className="text-muted-foreground">{purchase.supplier.contact_person}</p>}
                            {purchase.supplier?.phone && <p className="text-muted-foreground">{purchase.supplier.phone}</p>}
                            {purchase.supplier?.address && <p className="text-muted-foreground">{purchase.supplier.address}</p>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Payment</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <p className="font-medium">{purchase.payment_method ? paymentLabel[purchase.payment_method] : '—'}</p>
                            {purchase.or_number && <p className="text-muted-foreground">OR: {purchase.or_number}</p>}
                            {purchase.payment_method === 'postdated_check' && (
                                <>
                                    {purchase.check_number && <p className="text-muted-foreground">Check #: {purchase.check_number}</p>}
                                    {purchase.check_date && <p className="text-muted-foreground">Check Date: {purchase.check_date}</p>}
                                </>
                            )}
                            {purchase.paid_at && <p className="text-green-600">Paid on: {purchase.paid_at}</p>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <p>
                                <span className="text-muted-foreground">Date received:</span> {purchase.received_date ?? '—'}
                            </p>
                            <p>
                                <span className="text-muted-foreground">Stock sent to:</span>{' '}
                                <span className="font-medium">{purchase.dest_name}</span>{' '}
                                <span className="text-xs text-muted-foreground">({purchase.dest_type})</span>
                            </p>
                            <p>
                                <span className="text-muted-foreground">Received by:</span> {purchase.received_by}
                            </p>
                            <p>
                                <span className="text-muted-foreground">Created:</span> {purchase.created_at}
                            </p>
                            {purchase.notes && <p className="mt-2 text-muted-foreground italic">{purchase.notes}</p>}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <p>
                                <span className="text-muted-foreground">Items:</span> {purchase.items.length}
                            </p>
                            <p>
                                <span className="text-muted-foreground">Total qty:</span> {purchase.items.reduce((s, i) => s + i.quantity, 0)}
                            </p>
                            <Separator className="my-2" />
                            <p className="text-base font-semibold">₱{purchase.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Items */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Items Purchased</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40">
                                    <TableHead>Product</TableHead>
                                    <TableHead className="w-24 text-right">Qty</TableHead>
                                    <TableHead className="w-32 text-right">Unit Cost</TableHead>
                                    <TableHead className="w-28 text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchase.items.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <p className="text-sm font-medium">{item.product_name}</p>
                                            {item.barcode && <p className="text-xs text-muted-foreground">{item.barcode}</p>}
                                        </TableCell>
                                        <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                                        <TableCell className="text-right text-sm">
                                            ₱{item.unit_cost.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-medium">
                                            ₱{item.line_total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="bg-muted/30 font-semibold">
                                    <TableCell colSpan={3} className="text-right">
                                        Grand Total
                                    </TableCell>
                                    <TableCell className="text-right">
                                        ₱{purchase.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}
