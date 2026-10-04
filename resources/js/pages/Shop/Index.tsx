'use client';

import { Head, router } from '@inertiajs/react';
import { useState, useMemo, useEffect } from 'react';
import AdminLayout from '@/layouts/AdminLayout';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Search, ShoppingBag, Plus, Minus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import ProductThumbnail from '@/components/ProductThumbnail';

type Stock = {
    supplier_id: number;
    supplier_name: string;
    stock: number;
    capital: number;
    markup: number;
    price: number;
    formatted_price: string;
    status: string;
};

type Product = {
    id: number;
    name: string;
    product_img?: string | null; // ← Added for image
    unit?: string | null;
    stocks: Stock[];
    total_stock: number;
    category?: { id: number; name: string };
    supplier?: { id: number; name: string } | null;
    has_own_stock?: boolean;
};

type CartItem = {
    id: number;
    name: string;
    price: number;
    quantity: number;
    supplier: { id: number; name: string } | null;
};

type PaymentMethod = 'cod' | 'consignment' | null;
type OrderType = 'delivery' | 'pickup' | null;

interface PageProps {
    products: Product[];
    suppliers: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    userRole: number;
    userSupplierId: number | null;
}

export default function ModernShopPage({ products, suppliers, categories, userRole, userSupplierId }: PageProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
    const [orderType, setOrderType] = useState<OrderType>(null);

    // --- PR Integration ---
    const [prNumber, setPrNumber] = useState('');
    const [grandTotal, setGrandTotal] = useState<number | null>(null);
    const [prError, setPrError] = useState<string | null>(null);

    const ITEMS_PER_PAGE = 8;
    const isAdmin = userRole === 1;

    const supplierOptions = useMemo(() => {
        let filtered = suppliers;
        if (!isAdmin && userSupplierId) {
            filtered = filtered.filter((sup) => sup.id !== userSupplierId);
        }
        return [{ id: 0, name: 'All Suppliers' }, ...filtered];
    }, [suppliers, isAdmin, userSupplierId]);

    const filteredProducts = useMemo(() => {
        let result = products;

        if (searchQuery.trim()) {
            const lower = searchQuery.toLowerCase();
            result = result.filter(
                (p) =>
                    p.name.toLowerCase().includes(lower) ||
                    p.category?.name?.toLowerCase().includes(lower) ||
                    p.supplier?.name?.toLowerCase().includes(lower),
            );
        }

        if (selectedSupplier && selectedSupplier !== 'All Suppliers') {
            result = result.filter((p) => p.supplier?.name === selectedSupplier);
        }

        return result;
    }, [products, searchQuery, selectedSupplier]);

    const totalItems = filteredProducts.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredProducts, currentPage]);

    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(1);
        }
    }, [totalPages]);

    const cartSupplier = cart.length > 0 ? cart[0].supplier?.name : null;

    const addToCart = (product: Product) => {
        const visibleStock = product.stocks[0];
        if (!visibleStock || visibleStock.stock <= 0) {
            toast.error('Out of stock', { description: `${product.name} is currently unavailable.` });
            return;
        }

        if (cartSupplier && product.supplier?.name !== cartSupplier) {
            toast.error('Cannot mix suppliers', {
                description: `Cart contains items from ${cartSupplier}. Clear cart first.`,
                duration: 5000,
            });
            return;
        }

        setCart((prev) => {
            const existing = prev.find((item) => item.id === product.id);
            const currentQty = existing?.quantity ?? 0;
            const newQty = currentQty + 1;

            if (newQty > visibleStock.stock) {
                toast.error('Not enough stock', {
                    description: `Only ${visibleStock.stock} available for ${product.name}.`,
                });
                return prev;
            }

            const buyPrice = visibleStock.capital;

            if (existing) {
                return prev.map((item) => (item.id === product.id ? { ...item, quantity: newQty } : item));
            }

            return [
                ...prev,
                {
                    id: product.id,
                    name: product.name,
                    price: buyPrice,
                    quantity: 1,
                    supplier: product.supplier,
                },
            ];
        });

        toast.success('Added to cart', {
            description: `${product.name} (${product.supplier?.name || 'Various'})`,
        });
    };

    const updateQuantity = (id: number, delta: number) => {
        setCart((prev) =>
            prev
                .map((item) => {
                    if (item.id !== id) return item;
                    const newQty = Math.max(1, item.quantity + delta);
                    const product = products.find((p) => p.id === id);
                    const maxStock = product?.stocks[0]?.stock ?? 0;
                    if (newQty > maxStock) {
                        toast.error('Not enough stock', { description: `Max: ${maxStock}` });
                        return item;
                    }
                    return { ...item, quantity: newQty };
                })
                .filter((item) => item.quantity > 0),
        );
    };

    const removeFromCart = (id: number) => {
        setCart((prev) => prev.filter((item) => item.id !== id));
    };

    const clearCart = () => {
        setCart([]);
        toast.info('Cart cleared');
    };

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // --- PR API fetch ---
    const fetchPR = async () => {
        if (!prNumber.trim()) {
            setGrandTotal(null);
            setPrError('Please enter a PR number');
            return;
        }

        const trimmed = prNumber.trim();

        try {
            const baseUrl = import.meta.env.VITE_PR_API_BASE_URL ?? 'http://172.16.126.239/cpsuprv3/public/api';
            const apiToken = import.meta.env.VITE_PR_API_TOKEN ?? 'pr-secret-token-23-03-2026-vswegfdfddfh';

            const res = await fetch(`${baseUrl}/approved-pr-number/${encodeURIComponent(trimmed)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-TOKEN': apiToken,
                },
            });

            if (!res.ok) {
                if (res.status === 401) {
                    setGrandTotal(null);
                    setPrError('Unauthorized. Invalid API token.');
                } else {
                    setGrandTotal(null);
                    setPrError(`Error fetching PR (Status ${res.status})`);
                }
                return;
            }

            const json = await res.json();
            const prArray: { pr_no: string; grand_total: number }[] = json.data || [];
            const prObj = prArray.find((pr) => pr.pr_no === trimmed);

            if (prObj) {
                setGrandTotal(Number(prObj.grand_total));
                setPrError(null);
            } else {
                setGrandTotal(null);
                setPrError('PR not found or invalid');
            }
        } catch (err) {
            console.error('Fetch PR error:', err);
            setGrandTotal(null);
            setPrError('Error fetching PR');
        }
    };

    const isWithinBudget = grandTotal !== null ? subtotal <= grandTotal : true;

    const handleCheckout = async () => {
        if (!orderType) {
            toast.error('Please choose Pickup or Delivery');
            return;
        }
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }
        if (!cart.length || !cart[0].supplier?.id) {
            toast.error('Invalid supplier');
            return;
        }

        if (grandTotal === null) {
            toast.error('Please validate PR number first');
            return;
        }

        if (!isWithinBudget) {
            toast.error('Order exceeds PR budget');
            return;
        }

        const cartData = cart.map((item) => ({
            id: item.id,
            quantity: item.quantity,
        }));

        await router.post(
            route('shop.store'),
            {
                cart: cartData,
                supplier_id: cart[0].supplier.id,
                order_type: orderType,
                payment_method: paymentMethod,
                pr_number: prNumber,
            },
            {
                preserveState: true,
                preserveScroll: true,
                onSuccess: () => {
                    toast.success('Order placed successfully!', {
                        description: `${orderType === 'pickup' ? 'Pickup' : 'Delivery'} • ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Consignment'} • ₱${subtotal.toLocaleString()}`,
                        duration: 8000,
                    });

                    setCart([]);
                    setShowCheckoutDialog(false);
                    setPaymentMethod(null);
                    setOrderType(null);
                    setPrNumber('');
                    setGrandTotal(null);
                    setPrError(null);
                },
                onError: (errors) => {
                    const message = Object.values(errors).join('\n') || 'Failed to place order.';
                    toast.error('Order failed', { description: message });
                },
            },
        );
    };

    // --- Return JSX ---
    return (
        <AdminLayout>
            <Head title="Shop" />

            <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
                <div className="container mx-auto max-w-7xl px-4 py-6">
                    {/* Navigation / Tabs */}
                    <div className="mb-6 flex border-b">
                        <button className={cn('px-6 py-3 text-lg font-medium transition-colors', 'border-b-2 border-primary text-primary')}>
                            Shop
                        </button>

                        <button
                            onClick={() => router.visit(route('shop.orders'))}
                            className={cn(
                                'px-6 py-3 text-lg font-medium transition-colors',
                                'text-muted-foreground hover:border-b-2 hover:border-primary/50 hover:text-foreground',
                            )}
                        >
                            My Orders
                        </button>
                    </div>

                    {/* Header */}
                    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-3">
                            <ShoppingBag className="h-7 w-7 text-primary" />
                            <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
                        </div>

                        <div className="flex gap-3">
                            {cart.length > 0 && (
                                <Button variant="outline" size="sm" onClick={clearCart} className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Clear Cart
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                        {/* Products Section */}
                        <div className="space-y-6 lg:col-span-8 xl:col-span-9">
                            {/* Filters */}
                            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                                <div className="relative max-w-md flex-1">
                                    <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search products..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-10 pl-11"
                                    />
                                </div>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" className="min-w-[220px] justify-between">
                                            {selectedSupplier || 'All Suppliers'}
                                            <ChevronRight className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[220px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search supplier..." />
                                            <CommandList>
                                                <CommandEmpty>No supplier found.</CommandEmpty>
                                                <CommandGroup>
                                                    {supplierOptions.map((sup) => (
                                                        <CommandItem
                                                            key={sup.id}
                                                            onSelect={() => setSelectedSupplier(sup.name === 'All Suppliers' ? null : sup.name)}
                                                        >
                                                            {sup.name}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-semibold tracking-tight">
                                    Products
                                    <Badge variant="secondary" className="ml-3 text-sm">
                                        {filteredProducts.length}
                                    </Badge>
                                </h2>
                            </div>

                            {filteredProducts.length === 0 ? (
                                <div className="rounded-lg border border-dashed bg-muted/30 py-12 text-center">
                                    <Search className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                                    <p className="text-lg font-medium">No matching products</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                        {paginatedProducts.map((product) => {
                                            const visibleStock = product.stocks[0];
                                            const isOutOfStock = !visibleStock || visibleStock.stock <= 0;
                                            const isLowStock = visibleStock && visibleStock.stock > 0 && visibleStock.stock <= 5;

                                            let stockBadgeVariant: 'destructive' | 'secondary' | 'outline' = 'outline';
                                            let stockText = visibleStock ? `${visibleStock.stock} in stock` : 'Out of stock';

                                            if (isOutOfStock) {
                                                stockBadgeVariant = 'destructive';
                                                stockText = 'Out of stock';
                                            } else if (isLowStock) {
                                                stockBadgeVariant = 'secondary';
                                                stockText = `Only ${visibleStock.stock} left`;
                                            }

                                            return (
                                                <Card
                                                    key={product.id}
                                                    className={cn(
                                                        'overflow-hidden border transition-all duration-200',
                                                        isOutOfStock ? 'opacity-60' : 'hover:border-primary/40 hover:shadow',
                                                    )}
                                                >
                                                    {/* ==================== IMAGE SECTION ==================== */}
                                                    <div className="relative overflow-hidden">
                                                        <ProductThumbnail
                                                            src={product.product_img}
                                                            name={product.name}
                                                            categoryName={product.category?.name}
                                                            unit={product.unit}
                                                            aspect="aspect-[4/3]"
                                                            className="bg-muted/50"
                                                            imgClassName="group-hover:scale-105 transition-transform duration-300"
                                                            padding="p-4"
                                                        />

                                                        <Badge variant="outline" className="absolute top-2 right-2 bg-background/80 text-xs">
                                                            {product.supplier?.name || 'Various Suppliers'}
                                                        </Badge>

                                                        <Badge variant={stockBadgeVariant} className="absolute top-2 left-2 bg-background/80 text-xs">
                                                            {stockText}
                                                        </Badge>
                                                    </div>
                                                    {/* ==================== END IMAGE SECTION ==================== */}

                                                    <CardContent className="space-y-3 p-4">
                                                        <h3 className="line-clamp-2 min-h-[2.5rem] leading-tight font-medium">{product.name}</h3>

                                                        <div className="flex items-center justify-between">
                                                            <div className="text-lg font-bold text-primary">
                                                                ₱{visibleStock ? Number(visibleStock.capital).toLocaleString() : '—'}
                                                            </div>

                                                            <Button
                                                                size="sm"
                                                                className="rounded-full px-4"
                                                                onClick={() => addToCart(product)}
                                                                disabled={isOutOfStock}
                                                            >
                                                                <Plus className="mr-1 h-4 w-4" />
                                                                Add
                                                            </Button>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            );
                                        })}
                                    </div>

                                    {totalPages > 1 && (
                                        <div className="mt-8 flex items-center justify-center gap-3">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <span className="text-sm font-medium">
                                                Page {currentPage} of {totalPages}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                disabled={currentPage === totalPages}
                                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Cart Sidebar */}
                        <div className="lg:col-span-4 xl:col-span-3">
                            <Card className="sticky top-6 border-border/60 shadow-sm">
                                <div className="p-4 sm:p-5">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <ShoppingCart className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-semibold">Your Cart</h3>
                                        </div>
                                        {cart.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">{cart.length}</Badge>
                                                <Badge variant="outline">{cartSupplier || '—'}</Badge>
                                            </div>
                                        )}
                                    </div>

                                    {cart.length === 0 ? (
                                        <div className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground/80">
                                            <ShoppingBag className="mx-auto mb-2 h-8 w-8 opacity-70" strokeWidth={1.5} />
                                            <p>Cart is empty</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="-mr-1 max-h-[50vh] space-y-3 overflow-y-auto pr-1 pb-1">
                                                {cart.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        className="flex items-start justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
                                                            <p className="mt-0.5 text-xs text-primary">
                                                                ₱{Number(item.price).toLocaleString()} × {item.quantity}
                                                            </p>
                                                        </div>

                                                        <div className="flex shrink-0 items-center gap-1">
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-7 w-7"
                                                                onClick={() => updateQuantity(item.id, -1)}
                                                            >
                                                                <Minus className="h-3.5 w-3.5" />
                                                            </Button>
                                                            <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-7 w-7"
                                                                onClick={() => updateQuantity(item.id, 1)}
                                                            >
                                                                <Plus className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>

                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 text-destructive hover:text-destructive/80"
                                                            onClick={() => removeFromCart(item.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>

                                            <Separator className="my-4" />

                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">Subtotal</span>
                                                    <span>₱{subtotal.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                                                    <span>Total</span>
                                                    <span className="text-primary">₱{subtotal.toLocaleString()}</span>
                                                </div>
                                            </div>

                                            <Button className="mt-5 h-10 w-full" onClick={() => setShowCheckoutDialog(true)}>
                                                Proceed to Checkout
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>
                </div>

                {/* Checkout Dialog */}
                <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Confirm Your Order</DialogTitle>
                            <DialogDescription>
                                Total amount: <strong>₱{subtotal.toLocaleString()}</strong>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-6 py-5">
                            {/* PR Input */}
                            <div className="space-y-2">
                                <Label>PR Number</Label>
                                <div className="flex gap-2">
                                    <Input value={prNumber} onChange={(e) => setPrNumber(e.target.value)} placeholder="Enter PR No." />
                                    <Button type="button" onClick={fetchPR}>
                                        Check
                                    </Button>
                                </div>

                                {grandTotal !== null && (
                                    <p className="text-sm text-muted-foreground">
                                        PR Budget: <strong>₱{grandTotal.toLocaleString()}</strong>
                                    </p>
                                )}

                                {prError && <p className="text-sm text-destructive">{prError}</p>}

                                {grandTotal !== null && subtotal > grandTotal && <p className="text-sm text-destructive">Total exceeds PR budget!</p>}
                            </div>

                            <div>
                                <h4 className="mb-3 text-sm font-medium">How would you like to receive your order?</h4>
                                <RadioGroup value={orderType ?? ''} onValueChange={(v) => setOrderType(v as OrderType)} className="space-y-3">
                                    <div className="flex cursor-pointer items-center space-x-3 rounded-md border p-4 transition-colors hover:bg-accent/50">
                                        <RadioGroupItem value="pickup" id="pickup" />
                                        <Label htmlFor="pickup" className="flex-1 cursor-pointer">
                                            <div className="font-medium">Pickup</div>
                                            <div className="text-xs text-muted-foreground">Come to our location</div>
                                        </Label>
                                    </div>

                                    <div className="flex cursor-pointer items-center space-x-3 rounded-md border p-4 transition-colors hover:bg-accent/50">
                                        <RadioGroupItem value="delivery" id="delivery" />
                                        <Label htmlFor="delivery" className="flex-1 cursor-pointer">
                                            <div className="font-medium">Delivery</div>
                                            <div className="text-xs text-muted-foreground">We bring it to you</div>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <Separator />

                            <div>
                                <h4 className="mb-3 text-sm font-medium">Payment Method</h4>
                                <RadioGroup
                                    value={paymentMethod ?? ''}
                                    onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                                    className="space-y-3"
                                >
                                    <div className="flex cursor-pointer items-center space-x-3 rounded-md border p-3 hover:bg-accent/50">
                                        <RadioGroupItem value="cod" id="cod" />
                                        <Label htmlFor="cod" className="flex-1 cursor-pointer">
                                            Cash on Delivery
                                        </Label>
                                    </div>
                                    <div className="flex cursor-pointer items-center space-x-3 rounded-md border p-3 hover:bg-accent/50">
                                        <RadioGroupItem value="consignment" id="consignment" />
                                        <Label htmlFor="consignment" className="flex-1 cursor-pointer">
                                            Consignment (Pay later / Invoice)
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>

                        <DialogFooter className="gap-3 sm:gap-0">
                            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleCheckout} disabled={!orderType || !paymentMethod || !isWithinBudget}>
                                Place Order
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </AdminLayout>
    );
}
