'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '@/layouts/AdminLayout';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, ChevronDown, ChevronUp, ShoppingBag, Plus, Minus, Trash2, RotateCcw, XCircle, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrderItem {
    product_id: number;
    name: string;
    price: number; // ← This is now the CAPITAL price from the seller
    quantity: number;
    total: number;
    stock?: number;
}

interface Order {
    id: number;
    order_number: string;
    status: 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled';
    order_type: string;
    payment_method: string;
    subtotal: number;
    total: number;
    created_at: string;
    supplier: string;
    can_edit: boolean;
    items: OrderItem[];
}

interface Props {
    orders: Order[];
    userRole: number;
}

const ITEMS_PER_PAGE = 10;

export default function OrdersPage({ orders: allOrders }: Props) {
    const [activeTab, setActiveTab] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [editItems, setEditItems] = useState<OrderItem[]>([]);
    const [showCancelDialog, setShowCancelDialog] = useState<number | null>(null);

    const { flash } = usePage().props as any;

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    const filteredOrders = useMemo(() => (activeTab === 'all' ? allOrders : allOrders.filter((o) => o.status === activeTab)), [allOrders, activeTab]);

    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

    const paginatedOrders = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredOrders, currentPage]);

    const toggleExpand = (id: number) => setExpandedOrder((prev) => (prev === id ? null : id));

    const copyOrderNumber = (num: string) => {
        navigator.clipboard.writeText(num);
        toast.success('Order number copied');
    };

    const requestCancel = (id: number) => setShowCancelDialog(id);

    const confirmCancel = async () => {
        if (!showCancelDialog) return;
        try {
            await router.post(
                route('shop.orders.cancel', showCancelDialog),
                {},
                {
                    preserveState: true,
                    preserveScroll: true,
                    onSuccess: () => {
                        toast.success('Order cancelled successfully');
                        router.reload({ only: ['orders'] });
                    },
                    onError: (errors) => toast.error(Object.values(errors).join('\n') || 'Failed to cancel'),
                },
            );
        } catch {
            toast.error('Network error');
        } finally {
            setShowCancelDialog(null);
        }
    };

    const startEdit = (order: Order) => {
        setEditingOrder(order);
        setEditItems(order.items.map((i) => ({ ...i })));
    };

    const updateEditQty = (productId: number, delta: number) => {
        setEditItems((prev) =>
            prev.map((item) => {
                if (item.product_id !== productId) return item;
                const newQty = Math.max(0, item.quantity + delta);
                if (item.stock !== undefined && newQty > item.stock) {
                    toast.warning(`Maximum stock is ${item.stock}`);
                    return item;
                }
                return { ...item, quantity: newQty };
            }),
        );
    };

    const removeEditItem = (productId: number) => setEditItems((prev) => prev.filter((i) => i.product_id !== productId));

    const saveEdit = async () => {
        if (!editingOrder) return;
        const payload = {
            items: editItems.filter((i) => i.quantity > 0).map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
        };
        try {
            await router.patch(route('shop.orders.update', editingOrder.id), payload, {
                preserveState: true,
                preserveScroll: true,
                onSuccess: () => {
                    toast.success('Order updated successfully');
                    setEditingOrder(null);
                    setEditItems([]);
                    router.reload({ only: ['orders'] });
                },
                onError: (errors) => toast.error(Object.values(errors).join('\n') || 'Update failed'),
            });
        } catch {
            toast.error('Network error');
        }
    };

    const getStatusLabel = (s: string) => (s === 'cancelled' ? 'Cancelled' : s.charAt(0).toUpperCase() + s.slice(1));

    const getStatusColor = (s: string) => {
        const map: Record<string, string> = {
            pending: 'bg-amber-100 text-amber-800',
            confirmed: 'bg-blue-100 text-blue-800',
            shipped: 'bg-violet-100 text-violet-800',
            completed: 'bg-emerald-100 text-emerald-800',
            cancelled: 'bg-red-100 text-red-800',
        };
        return map[s] || 'bg-gray-100 text-gray-800';
    };

    const canCancel = (s: string) => s === 'pending' || s === 'confirmed';

    if (allOrders.length === 0) {
        return (
            <AdminLayout>
                <Head title="My Orders" />
                <div className="py-16 text-center">
                    <Package className="mx-auto mb-4 h-16 w-16 text-muted-foreground/70" />
                    <h2 className="text-xl font-medium">No orders yet</h2>
                    <Button variant="outline" className="mt-6" onClick={() => router.visit(route('shop.index'))}>
                        Browse Products
                    </Button>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <Head title="My Orders" />

            <div className="container mx-auto max-w-6xl px-4 py-6">
                <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <h1 className="text-2xl font-bold">My Orders</h1>
                    <Button variant="outline" size="sm" onClick={() => router.visit(route('shop.index'))}>
                        Continue Shopping
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                    <TabsList className="grid h-9 grid-cols-3 rounded-lg bg-muted/60 p-1 sm:grid-cols-6">
                        {['all', 'pending', 'confirmed', 'shipped', 'completed', 'cancelled'].map((t) => (
                            <TabsTrigger key={t} value={t} className="h-7 rounded-md text-xs sm:text-sm">
                                {t === 'all' ? 'All' : getStatusLabel(t)}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <TabsContent value={activeTab} className="mt-0 space-y-4">
                        {paginatedOrders.map((order) => {
                            const isOpen = expandedOrder === order.id;

                            return (
                                <Card key={order.id} className={cn('border shadow-xs transition-all', isOpen && 'shadow-sm')}>
                                    <div
                                        className="flex cursor-pointer flex-col justify-between gap-3 bg-muted/30 px-4 py-3 sm:flex-row sm:items-center"
                                        onClick={() => toggleExpand(order.id)}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium">#{order.order_number}</span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        copyOrderNumber(order.order_number);
                                                    }}
                                                >
                                                    <Copy className="h-3.5 w-3.5" />
                                                </Button>
                                                <Badge variant="outline" className="px-1.5 py-0 text-xs">
                                                    {order.created_at}
                                                </Badge>
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {order.supplier} • {order.order_type.toUpperCase()} • {order.payment_method.toUpperCase()}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <Badge className={cn('px-2.5 py-0.5 text-xs', getStatusColor(order.status))}>
                                                {getStatusLabel(order.status)}
                                            </Badge>
                                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </div>
                                    </div>

                                    {isOpen && (
                                        <CardContent className="space-y-4 px-4 py-4 text-sm">
                                            <div>
                                                <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                                                    <ShoppingBag className="h-4 w-4" /> Items ({order.items.length})
                                                </div>
                                                <div className="space-y-2.5">
                                                    {order.items.map((item) => (
                                                        <div key={item.product_id} className="flex items-baseline justify-between">
                                                            <span className="line-clamp-1 flex-1 pr-2">
                                                                {item.name} × {item.quantity}
                                                            </span>
                                                            <span className="font-medium whitespace-nowrap">
                                                                ₱{Number(item.total).toLocaleString()}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <Separator className="my-3" />

                                            <div className="flex justify-between font-medium">
                                                <span>Total</span>
                                                <span>₱{Number(order.total).toLocaleString()}</span>
                                            </div>

                                            <div className="flex flex-wrap gap-2 pt-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-3 text-xs"
                                                    onClick={() => copyOrderNumber(order.order_number)}
                                                >
                                                    Copy #
                                                </Button>

                                                {order.status === 'completed' && (
                                                    <Button variant="secondary" size="sm" className="h-8 px-3 text-xs">
                                                        Reorder
                                                    </Button>
                                                )}

                                                {order.can_edit && order.status === 'pending' && (
                                                    <>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-8 px-3 text-xs"
                                                            onClick={() => startEdit(order)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="destructive"
                                                            size="sm"
                                                            className="h-8 px-3 text-xs"
                                                            onClick={() => requestCancel(order.id)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </>
                                                )}

                                                {canCancel(order.status) && !order.can_edit && (
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        className="h-8 px-3 text-xs"
                                                        onClick={() => requestCancel(order.id)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            );
                        })}

                        {totalPages > 1 && (
                            <div className="mt-6 flex justify-center">
                                <Pagination>
                                    <PaginationContent className="gap-1">
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    if (currentPage > 1) setCurrentPage(currentPage - 1);
                                                }}
                                                className={cn(currentPage === 1 && 'pointer-events-none opacity-40')}
                                            />
                                        </PaginationItem>

                                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                                            let page = currentPage + i - 3;
                                            if (page < 1) page = 1 + i;
                                            if (page > totalPages) return null;
                                            return (
                                                <PaginationItem key={page}>
                                                    <PaginationLink
                                                        href="#"
                                                        isActive={page === currentPage}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            setCurrentPage(page);
                                                        }}
                                                        className="h-8 w-8"
                                                    >
                                                        {page}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            );
                                        }).filter(Boolean)}

                                        <PaginationItem>
                                            <PaginationNext
                                                href="#"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                                                }}
                                                className={cn(currentPage === totalPages && 'pointer-events-none opacity-40')}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Edit Dialog */}
            <Dialog open={!!editingOrder} onOpenChange={() => setEditingOrder(null)}>
                <DialogContent className="p-5 sm:max-w-md">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-lg">Edit #{editingOrder?.order_number}</DialogTitle>
                        <DialogDescription className="text-sm">Qty 0 = remove</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[50vh] space-y-4 overflow-y-auto py-1">
                        {editItems.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                <Trash2 className="mx-auto mb-2 h-8 w-8 opacity-60" />
                                Order will be cancelled
                            </div>
                        ) : (
                            editItems.map((item) => (
                                <div key={item.product_id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">₱{Number(item.price).toLocaleString()}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateEditQty(item.product_id, -1)}>
                                            <Minus className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-7 w-7"
                                            disabled={item.stock !== undefined && item.quantity >= item.stock}
                                            onClick={() => updateEditQty(item.product_id, 1)}
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        onClick={() => removeEditItem(item.product_id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                    <DialogFooter className="mt-4 gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditingOrder(null)}>
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant={editItems.every((i) => i.quantity === 0) ? 'destructive' : 'default'}
                            disabled={editItems.every((i) => i.quantity === 0)}
                            onClick={saveEdit}
                        >
                            {editItems.every((i) => i.quantity === 0) ? 'Cancel Order' : 'Save'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Confirmation Dialog */}
            <Dialog open={showCancelDialog !== null} onOpenChange={() => setShowCancelDialog(null)}>
                <DialogContent className="p-5 sm:max-w-sm">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="flex items-center gap-2 text-base text-red-600">
                            <XCircle className="h-5 w-5" /> Cancel order?
                        </DialogTitle>
                        <DialogDescription className="text-sm">This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowCancelDialog(null)}>
                            No
                        </Button>
                        <Button variant="destructive" size="sm" onClick={confirmCancel}>
                            Yes, cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
