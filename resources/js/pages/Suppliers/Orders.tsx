'use client';

import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

import {
    Truck,
    CheckCircle2,
    XCircle,
    Clock,
    Eye,
    Download,
    Package,
    Phone,
    Building,
    Printer,
    ShoppingCart,
    Copy,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
} from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

import { cn } from '@/lib/utils';

interface OrderItem {
    name: string;
    price: number;
    quantity: number;
    total: number;
}

interface Order {
    id: number;
    order_number: string;
    status: string;
    order_type?: string;
    payment_method?: string;
    subtotal: number;
    total: number;
    created_at: string;
    buyer_supplier?: {
        name: string;
        phone?: string;
        address?: string;
        contact_person?: string;
        is_campus: boolean;
    } | null;
    items?: OrderItem[];
    can_manage: boolean;
}

interface Props {
    orders: Order[];
    supplier: {
        name: string;
        is_campus: boolean;
        phone?: string;
        address?: string;
        contact_person?: string;
    };
}

const ITEMS_PER_PAGE = 10;

export default function SupplierOrders({ orders = [], supplier }: Props) {
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [actionDialog, setActionDialog] = useState<{
        open: boolean;
        action: 'confirm' | 'reject' | 'shipped' | 'complete' | null;
        orderId: number | null;
    }>({ open: false, action: null, orderId: null });

    // Pagination
    const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedOrders = orders.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    const goToPage = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const openActionDialog = (action: 'confirm' | 'reject' | 'shipped' | 'complete', orderId: number) => {
        setActionDialog({ open: true, action, orderId });
    };

    const confirmAction = async () => {
        if (!actionDialog.action || !actionDialog.orderId) return;

        await handleAction(actionDialog.action, actionDialog.orderId);
        setActionDialog({ open: false, action: null, orderId: null });
    };

    const handleAction = async (action: 'confirm' | 'reject' | 'shipped' | 'complete', orderId: number) => {
        const actionName = action.charAt(0).toUpperCase() + action.slice(1);
        try {
            await router.post(
                route(`suppliers.orders.${action}`, orderId),
                {},
                {
                    preserveState: true,
                    preserveScroll: true,
                    onSuccess: () => {
                        toast.success(`Order ${actionName}ed successfully`);
                        router.reload({ only: ['orders'] });
                    },
                    onError: (errors) => {
                        toast.error(`Failed to ${action}`, {
                            description: Object.values(errors).join('\n') || 'Please try again.',
                        });
                    },
                },
            );
        } catch {
            toast.error('Network error');
        }
    };

    const openDetails = (order: Order) => {
        setSelectedOrder(order);
        setShowReceiptPreview(false);
    };

    const openReceiptPreview = (order: Order) => {
        setSelectedOrder(order);
        setShowReceiptPreview(true);
    };

    const downloadReceipt = (orderId: number) => {
        router.visit(route('suppliers.orders.receipt', orderId));
    };

    const copyOrderNumber = (text: string) => {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                toast.success('Order number copied');
            })
            .catch(() => {
                toast.error('Failed to copy');
            });
    };

    const statusBadge = (status: string) => {
        const colors: Record<string, string> = {
            pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
            confirmed: 'bg-blue-100 text-blue-800 border-blue-300',
            shipped: 'bg-purple-100 text-purple-800 border-purple-300',
            completed: 'bg-green-100 text-green-800 border-green-300',
            cancelled: 'bg-red-100 text-red-800 border-red-300',
        };
        return <Badge className={cn('px-3 py-1 text-sm font-medium', colors[status] || 'bg-gray-100 text-gray-800')}>{status.toUpperCase()}</Badge>;
    };

    const getActionTitle = (action: string) => {
        switch (action) {
            case 'confirm':
                return 'Confirm Order';
            case 'reject':
                return 'Reject Order';
            case 'shipped':
                return 'Mark as Shipped';
            case 'complete':
                return 'Mark as Completed';
            default:
                return 'Confirm Action';
        }
    };

    const getActionMessage = (action: string) => {
        switch (action) {
            case 'confirm':
                return 'Are you sure you want to confirm this order? The customer will be notified.';
            case 'reject':
                return 'Are you sure you want to reject this order? Stock will be restored automatically.';
            case 'shipped':
                return 'Are you sure you want to mark this order as shipped?';
            case 'complete':
                return 'Are you sure you want to mark this order as completed?';
            default:
                return 'Are you sure you want to perform this action?';
        }
    };

    return (
        <AdminLayout>
            <Head title="Manage Orders" />

            <div className="container mx-auto max-w-7xl space-y-8 px-4 py-8">
                {/* Header + Shop Info */}
                <div className="space-y-6">
                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">{supplier?.name || 'Your Shop'} Orders</h1>
                            <p className="mt-1 text-muted-foreground">View and manage incoming customer orders</p>
                        </div>
                        <Badge variant="secondary" className="px-4 py-2 text-base">
                            {orders.length} Orders
                        </Badge>
                    </div>

                    <Card>
                        <CardContent className="p-5">
                            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold">
                                <Building className="h-5 w-5" />
                                Your Shop Information
                            </h3>
                            <div className="grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
                                <div>
                                    <p className="text-muted-foreground">Name</p>
                                    <p className="font-medium">{supplier?.name || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Contact Person</p>
                                    <p className="font-medium">{supplier?.contact_person || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Phone</p>
                                    <p className="font-medium">{supplier?.phone || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-muted-foreground">Address</p>
                                    <p className="truncate font-medium">{supplier?.address || '—'}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Orders List – 2 columns */}
                {orders.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-muted/30 py-24 text-center">
                        <Truck className="mx-auto mb-6 h-24 w-24 text-muted-foreground/60" strokeWidth={1.2} />
                        <h2 className="mb-3 text-2xl font-semibold">No incoming orders yet</h2>
                        <p className="mx-auto max-w-md text-muted-foreground">
                            When customers place orders for your products, they will appear here.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {paginatedOrders.map((order) => (
                                <Card key={order.id} className="overflow-hidden border shadow-sm transition-all duration-200 hover:shadow-md">
                                    <CardContent className="p-6">
                                        <div className="mb-4 flex items-start justify-between">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-bold">#{order.order_number}</h3>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => copyOrderNumber(order.order_number)}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {statusBadge(order.status)}
                                        </div>

                                        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                                            <Building className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{order.buyer_supplier?.name || 'Guest / Individual'}</span>
                                        </p>

                                        <Separator className="my-4" />

                                        <div className="mb-5 grid grid-cols-2 gap-6 text-sm">
                                            <div>
                                                <p className="text-muted-foreground">Type</p>
                                                <p className="font-medium">{order.order_type?.toUpperCase() || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Payment</p>
                                                <p className="font-medium">{order.payment_method?.toUpperCase() || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Items</p>
                                                <p className="font-medium">{order.items?.length ?? 0}</p>
                                            </div>
                                            <div>
                                                <p className="font-medium text-muted-foreground">Total</p>
                                                <p className="text-lg font-bold text-primary">₱{Number(order.total).toLocaleString()}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" onClick={() => openDetails(order)}>
                                                <Eye className="mr-2 h-4 w-4" />
                                                Details
                                            </Button>

                                            {order.can_manage && (
                                                <>
                                                    <Button size="sm" onClick={() => openActionDialog('confirm', order.id)}>
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                        Confirm
                                                    </Button>
                                                    <Button variant="destructive" size="sm" onClick={() => openActionDialog('reject', order.id)}>
                                                        <XCircle className="mr-2 h-4 w-4" />
                                                        Reject
                                                    </Button>
                                                </>
                                            )}

                                            {order.status === 'confirmed' && (
                                                <Button variant="secondary" size="sm" onClick={() => openActionDialog('shipped', order.id)}>
                                                    <Truck className="mr-2 h-4 w-4" />
                                                    Shipped
                                                </Button>
                                            )}

                                            {(order.status === 'confirmed' || order.status === 'shipped') && (
                                                <Button size="sm" onClick={() => openActionDialog('complete', order.id)}>
                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    Complete
                                                </Button>
                                            )}

                                            <Button variant="outline" size="sm" onClick={() => openReceiptPreview(order)}>
                                                <Printer className="mr-2 h-4 w-4" />
                                                Receipt
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="mt-10 flex items-center justify-center gap-4">
                                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>
                                    <ChevronLeft className="mr-1 h-4 w-4" />
                                    Previous
                                </Button>

                                <span className="text-sm font-medium">
                                    Page {currentPage} of {totalPages}
                                </span>

                                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)}>
                                    Next
                                    <ChevronRight className="ml-1 h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </>
                )}

                {/* Action Confirmation Dialog */}
                <Dialog open={actionDialog.open} onOpenChange={(open) => setActionDialog({ ...actionDialog, open })}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                {actionDialog.action === 'reject' && <AlertTriangle className="h-5 w-5 text-destructive" />}
                                {actionDialog.action === 'confirm' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                                {actionDialog.action === 'shipped' && <Truck className="h-5 w-5 text-purple-600" />}
                                {actionDialog.action === 'complete' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                                {getActionTitle(actionDialog.action || '')}
                            </DialogTitle>
                            <DialogDescription className="pt-2">{getActionMessage(actionDialog.action || '')}</DialogDescription>
                        </DialogHeader>

                        <DialogFooter className="gap-3 pt-4 sm:gap-4">
                            <Button variant="outline" onClick={() => setActionDialog({ open: false, action: null, orderId: null })}>
                                Cancel
                            </Button>
                            <Button variant={actionDialog.action === 'reject' ? 'destructive' : 'default'} onClick={confirmAction}>
                                {actionDialog.action === 'confirm' && <CheckCircle2 className="mr-2 h-4 w-4" />}
                                {actionDialog.action === 'reject' && <XCircle className="mr-2 h-4 w-4" />}
                                {actionDialog.action === 'shipped' && <Truck className="mr-2 h-4 w-4" />}
                                {actionDialog.action === 'complete' && <CheckCircle2 className="mr-2 h-4 w-4" />}
                                {actionDialog.action === 'confirm'
                                    ? 'Confirm Order'
                                    : actionDialog.action === 'reject'
                                      ? 'Reject Order'
                                      : actionDialog.action === 'shipped'
                                        ? 'Mark as Shipped'
                                        : 'Mark as Completed'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Details Dialog */}
                {selectedOrder && !showReceiptPreview && (
                    <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                            <DialogHeader className="border-b pb-6">
                                <DialogTitle className="flex items-center justify-between gap-4 text-2xl">
                                    <span>Order {selectedOrder.order_number}</span>
                                    <Button variant="ghost" size="icon" onClick={() => copyOrderNumber(selectedOrder.order_number)}>
                                        <Copy className="h-5 w-5" />
                                    </Button>
                                </DialogTitle>
                                <DialogDescription className="mt-2 flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    {selectedOrder.created_at} • {statusBadge(selectedOrder.status)}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-8 py-6">
                                {/* Buyer Supplier */}
                                <section>
                                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                                        <Building className="h-5 w-5" />
                                        Buyer / Ordering Supplier
                                    </h3>
                                    {selectedOrder.buyer_supplier ? (
                                        <div className="grid grid-cols-1 gap-6 rounded-lg bg-muted/30 p-5 text-sm md:grid-cols-2">
                                            <div>
                                                <p className="text-muted-foreground">Name</p>
                                                <p className="font-medium">{selectedOrder.buyer_supplier.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Contact Person</p>
                                                <p className="font-medium">{selectedOrder.buyer_supplier.contact_person || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Phone</p>
                                                <p className="font-medium">{selectedOrder.buyer_supplier.phone || '—'}</p>
                                            </div>
                                            <div>
                                                <p className="text-muted-foreground">Address</p>
                                                <p className="font-medium">{selectedOrder.buyer_supplier.address || '—'}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-lg bg-muted/30 p-5 text-center text-muted-foreground italic">
                                            Guest / Individual order – no supplier associated
                                        </div>
                                    )}
                                </section>

                                {/* Summary */}
                                <section>
                                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                                        <Clock className="h-5 w-5" />
                                        Order Summary
                                    </h3>
                                    <div className="grid grid-cols-2 gap-6 rounded-lg bg-muted/30 p-5 text-sm md:grid-cols-4">
                                        <div>
                                            <p className="text-muted-foreground">Type</p>
                                            <p className="font-medium">{selectedOrder.order_type?.toUpperCase() || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Payment</p>
                                            <p className="font-medium">{selectedOrder.payment_method?.toUpperCase() || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Subtotal</p>
                                            <p className="font-medium">₱{Number(selectedOrder.subtotal).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="font-bold text-muted-foreground">Total</p>
                                            <p className="text-2xl font-bold text-primary">₱{Number(selectedOrder.total).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </section>

                                {/* Items */}
                                <section>
                                    <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                                        <ShoppingCart className="h-5 w-5" />
                                        Items ({selectedOrder.items?.length ?? 0})
                                    </h3>
                                    {selectedOrder.items?.length ? (
                                        <div className="space-y-4 rounded-lg bg-muted/30 p-5">
                                            {selectedOrder.items.map((item, index) => (
                                                <div key={index} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                                    <div className="flex-1">
                                                        <p className="font-medium">{item.name}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            ₱{Number(item.price).toLocaleString()} × {item.quantity}
                                                        </p>
                                                    </div>
                                                    <p className="font-medium">₱{Number(item.total).toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="rounded-lg bg-muted/30 p-8 text-center text-muted-foreground">No items in this order</div>
                                    )}
                                </section>
                            </div>

                            <DialogFooter className="flex-col gap-3 border-t pt-6 sm:flex-row sm:gap-4">
                                <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                                    Close
                                </Button>

                                <Button variant="outline" onClick={() => openReceiptPreview(selectedOrder)}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    View Receipt
                                </Button>

                                {selectedOrder.can_manage && (
                                    <div className="flex flex-wrap gap-3">
                                        <Button
                                            onClick={() => {
                                                openActionDialog('confirm', selectedOrder.id);
                                            }}
                                        >
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            Confirm
                                        </Button>

                                        <Button
                                            variant="destructive"
                                            onClick={() => {
                                                openActionDialog('reject', selectedOrder.id);
                                            }}
                                        >
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Reject
                                        </Button>

                                        {selectedOrder.status === 'confirmed' && (
                                            <Button
                                                variant="secondary"
                                                onClick={() => {
                                                    openActionDialog('shipped', selectedOrder.id);
                                                }}
                                            >
                                                <Truck className="mr-2 h-4 w-4" />
                                                Mark Shipped
                                            </Button>
                                        )}

                                        {(selectedOrder.status === 'confirmed' || selectedOrder.status === 'shipped') && (
                                            <Button
                                                onClick={() => {
                                                    openActionDialog('complete', selectedOrder.id);
                                                }}
                                            >
                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                Complete
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Receipt Preview Dialog */}
                {selectedOrder && showReceiptPreview && (
                    <Dialog open={showReceiptPreview} onOpenChange={() => setShowReceiptPreview(false)}>
                        <DialogContent className="max-h-[95vh] overflow-y-auto p-0 sm:max-w-4xl">
                            <div className="min-h-[600px] bg-white p-6 sm:p-10">
                                <DialogHeader className="mb-8 text-center">
                                    <DialogTitle className="text-3xl font-bold">{supplier?.name || 'Your Shop'}</DialogTitle>
                                    <DialogDescription className="mt-2 text-lg">
                                        Official Receipt • Order {selectedOrder.order_number}
                                    </DialogDescription>
                                    <p className="mt-1 text-sm text-muted-foreground">Generated on {new Date().toLocaleString()}</p>
                                </DialogHeader>

                                <div className="space-y-8 text-sm">
                                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                        <div>
                                            <p className="font-medium">Order Date</p>
                                            <p>{selectedOrder.created_at}</p>
                                        </div>
                                        <div>
                                            <p className="font-medium">Buyer</p>
                                            <p>{selectedOrder.buyer_supplier?.name || 'Guest / Individual'}</p>
                                            {selectedOrder.buyer_supplier?.phone && <p>Phone: {selectedOrder.buyer_supplier.phone}</p>}
                                        </div>
                                    </div>

                                    <Separator />

                                    <div>
                                        <h4 className="mb-4 font-semibold">Order Items ({selectedOrder.items?.length ?? 0})</h4>
                                        <div className="overflow-hidden rounded-lg border">
                                            <table className="w-full">
                                                <thead className="bg-muted">
                                                    <tr>
                                                        <th className="p-4 text-left">Item</th>
                                                        <th className="p-4 text-right">Price</th>
                                                        <th className="p-4 text-right">Qty</th>
                                                        <th className="p-4 text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {selectedOrder.items?.length ? (
                                                        selectedOrder.items.map((item, i) => (
                                                            <tr key={i} className="border-t hover:bg-muted/50">
                                                                <td className="p-4">{item.name}</td>
                                                                <td className="p-4 text-right">₱{Number(item.price).toLocaleString()}</td>
                                                                <td className="p-4 text-right">{item.quantity}</td>
                                                                <td className="p-4 text-right font-medium">₱{Number(item.total).toLocaleString()}</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                                                No items in this order
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end space-y-3 border-t pt-6">
                                        <div className="flex w-64 justify-between font-medium">
                                            <span>Subtotal</span>
                                            <span>₱{Number(selectedOrder.subtotal).toLocaleString()}</span>
                                        </div>
                                        <div className="flex w-64 justify-between text-xl font-bold">
                                            <span>Total</span>
                                            <span className="text-primary">₱{Number(selectedOrder.total).toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>

                                <DialogFooter className="mt-10 gap-4">
                                    <Button variant="outline" onClick={() => setShowReceiptPreview(false)}>
                                        Close
                                    </Button>

                                    <Button variant="outline" onClick={() => window.print()}>
                                        <Printer className="mr-2 h-4 w-4" />
                                        Print
                                    </Button>

                                    <Button onClick={() => downloadReceipt(selectedOrder.id)}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Download PDF
                                    </Button>
                                </DialogFooter>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </AdminLayout>
    );
}
