'use client';

import { Head } from '@inertiajs/react';
import { useState, useMemo } from 'react';
import AdminLayout from '@/layouts/AdminLayout';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ShoppingCart, Search, ArrowLeft, ShoppingBag, Plus, Minus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type Product = {
    id: number;
    name: string;
    price: number;
    supplier: string;
    stock: number;
};

type CartItem = Product & { quantity: number };

type PaymentMethod = 'cod' | 'consignment' | null;
type OrderType = 'delivery' | 'pickup' | null;

export default function ModernShopPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
    const [orderType, setOrderType] = useState<OrderType>(null);

    const ITEMS_PER_PAGE = 8;

    const products: Product[] = [
        { id: 1, name: 'Premium White Rice 5kg', price: 280, supplier: 'CPSU Cauayan', stock: 45 },
        { id: 2, name: 'Brown Sugar 1kg', price: 75, supplier: 'CPSU Hinigaran', stock: 120 },
        { id: 3, name: 'Refined Sugar 1kg', price: 85, supplier: 'CPSU Hinoba-an', stock: 88 },
        { id: 4, name: 'All-Purpose Flour 1kg', price: 68, supplier: 'CPSU Ilog', stock: 65 },
        { id: 5, name: 'Cooking Oil 1L', price: 145, supplier: 'CPSU San Carlos', stock: 32 },
        { id: 6, name: 'Soy Sauce 1L', price: 55, supplier: 'CPSU Sipalay', stock: 95 },
        { id: 7, name: 'Vinegar 1L', price: 45, supplier: 'CPSU Victorias', stock: 110 },
        { id: 8, name: 'Salt Iodized 1kg', price: 30, supplier: 'CPSU Murcia', stock: 200 },
        { id: 9, name: 'Instant Noodles (Pack of 6)', price: 72, supplier: 'CPSU Valladolid', stock: 18 },
        { id: 10, name: 'Canned Sardines 155g', price: 22, supplier: 'CPSU Moises Padilla', stock: 5 },
        { id: 11, name: 'Canned Corned Beef 150g', price: 38, supplier: 'CPSU Cauayan', stock: 42 },
        { id: 12, name: 'Evaporated Milk 370ml', price: 48, supplier: 'CPSU Hinigaran', stock: 75 },
        { id: 13, name: 'Condensed Milk 300ml', price: 52, supplier: 'CPSU Hinoba-an', stock: 60 },
        { id: 14, name: 'Coffee 100g', price: 95, supplier: 'CPSU Ilog', stock: 28 },
        { id: 15, name: 'Powdered Milk 350g', price: 120, supplier: 'CPSU San Carlos', stock: 15 },
        { id: 16, name: 'Laundry Detergent Powder 1kg', price: 110, supplier: 'CPSU Sipalay', stock: 50 },
        { id: 17, name: 'Bath Soap 135g', price: 35, supplier: 'CPSU Victorias', stock: 0 },
        { id: 18, name: 'Toothpaste 150ml', price: 85, supplier: 'CPSU Murcia', stock: 8 },
    ];

    const suppliers = useMemo(() => {
        const unique = [...new Set(products.map((p) => p.supplier))];
        return ['All', ...unique];
    }, []);

    const filteredProducts = useMemo(() => {
        let result = products;
        if (searchQuery.trim()) {
            const lower = searchQuery.toLowerCase();
            result = result.filter((p) => p.name.toLowerCase().includes(lower) || p.supplier.toLowerCase().includes(lower));
        }
        if (selectedSupplier && selectedSupplier !== 'All') {
            result = result.filter((p) => p.supplier === selectedSupplier);
        }
        return result;
    }, [searchQuery, selectedSupplier]);

    const totalItems = filteredProducts.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredProducts, currentPage]);

    useMemo(() => {
        if (currentPage > Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)) {
            setCurrentPage(1);
        }
    }, [filteredProducts.length]);

    const cartSupplier = cart.length > 0 ? cart[0].supplier : null;

    const getStockForProduct = (productId: number) => {
        return products.find((p) => p.id === productId)?.stock ?? 0;
    };

    const addToCart = (product: Product) => {
        if (product.stock <= 0) {
            toast.error('Out of stock', { description: `${product.name} is currently unavailable.` });
            return;
        }

        if (cartSupplier && product.supplier !== cartSupplier) {
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

            if (newQty > product.stock) {
                toast.error('Not enough stock', {
                    description: `Only ${product.stock} available for ${product.name}.`,
                });
                return prev;
            }

            if (existing) {
                return prev.map((item) => (item.id === product.id ? { ...item, quantity: newQty } : item));
            }
            return [...prev, { ...product, quantity: 1 }];
        });

        toast.success('Added to cart', {
            description: `${product.name} (${product.supplier})`,
        });
    };

    const updateQuantity = (id: number, delta: number) => {
        setCart((prev) =>
            prev
                .map((item) => {
                    if (item.id !== id) return item;
                    const newQty = Math.max(1, item.quantity + delta);
                    const maxStock = getStockForProduct(id);
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

    const handleCheckout = () => {
        if (!orderType) {
            toast.error('Please choose Pickup or Delivery');
            return;
        }
        if (!paymentMethod) {
            toast.error('Please select a payment method');
            return;
        }

        toast.success('Order placed!', {
            description: `${orderType === 'pickup' ? 'Pickup' : 'Delivery'} • ${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Consignment'} • ₱${subtotal.toLocaleString()}`,
            duration: 6000,
        });

        setCart([]);
        setShowCheckoutDialog(false);
        setPaymentMethod(null);
        setOrderType(null);
    };

    return (
        <AdminLayout>
            <Head title="Shop" />

            <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
                <div className="container mx-auto max-w-7xl px-4 py-6">
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
                        {/* Products + Filters */}
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
                                        <Button variant="outline" className="min-w-[200px] justify-between">
                                            {selectedSupplier || 'All Suppliers'}
                                            <ChevronRight className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[200px] p-0">
                                        <Command>
                                            <CommandInput placeholder="Search supplier..." />
                                            <CommandList>
                                                <CommandEmpty>No supplier found.</CommandEmpty>
                                                <CommandGroup>
                                                    {suppliers.map((sup) => (
                                                        <CommandItem key={sup} onSelect={() => setSelectedSupplier(sup === 'All' ? null : sup)}>
                                                            {sup}
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
                                            const isOutOfStock = product.stock <= 0;
                                            const isLowStock = product.stock > 0 && product.stock <= 5;

                                            let stockBadgeVariant: 'destructive' | 'secondary' | 'outline' = 'outline';
                                            let stockText = `${product.stock} in stock`;

                                            if (isOutOfStock) {
                                                stockBadgeVariant = 'destructive';
                                                stockText = 'Out of stock';
                                            } else if (isLowStock) {
                                                stockBadgeVariant = 'secondary';
                                                stockText = `Only ${product.stock} left`;
                                            }

                                            return (
                                                <Card
                                                    key={product.id}
                                                    className={cn(
                                                        'overflow-hidden border transition-all duration-200',
                                                        isOutOfStock ? 'opacity-60' : 'hover:border-primary/40 hover:shadow',
                                                    )}
                                                >
                                                    <div className="relative flex aspect-[4/3] items-center justify-center bg-muted/50">
                                                        <ShoppingBag className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.2} />

                                                        <Badge variant="outline" className="absolute top-2 right-2 bg-background/80 text-xs">
                                                            {product.supplier}
                                                        </Badge>

                                                        <Badge variant={stockBadgeVariant} className="absolute top-2 left-2 bg-background/80 text-xs">
                                                            {stockText}
                                                        </Badge>
                                                    </div>

                                                    <CardContent className="space-y-3 p-4">
                                                        <h3 className="line-clamp-2 min-h-[2.5rem] leading-tight font-medium">{product.name}</h3>

                                                        <div className="flex items-center justify-between">
                                                            <div className="text-lg font-bold text-primary">₱{product.price.toLocaleString()}</div>

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
                                                <Badge variant="outline">{cartSupplier}</Badge>
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
                                                                ₱{item.price.toLocaleString()} × {item.quantity}
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
                            {/* Order Type - now single column */}
                            <div>
                                <h4 className="mb-3 text-sm font-medium">How would you like to receive your order?</h4>
                                <RadioGroup
                                    value={orderType ?? ''}
                                    onValueChange={(v) => setOrderType(v as OrderType)}
                                    className="space-y-3" // ← single column / vertical stack
                                >
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

                            {/* Payment Method */}
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
                            <Button onClick={handleCheckout} disabled={!orderType || !paymentMethod}>
                                Place Order
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </AdminLayout>
    );
}
