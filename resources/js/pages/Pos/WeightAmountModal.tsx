import React, { useState, useEffect } from 'react';
import { X, Scale, Banknote, Calculator, Check, ArrowRight } from 'lucide-react';
import { fmtMoney, fmtQty } from './ReceiptTemplate';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CartItem } from './posTypes';

interface WeightAmountModalProps {
    item: CartItem;
    currency: string;
    onApply: (newQty: number) => void;
    onClose: () => void;
}

export default function WeightAmountModal({ item, currency, onApply, onClose }: WeightAmountModalProps) {
    const unit = item.unit || 'kg';
    const isKg = unit.toLowerCase() === 'kg';
    const unitPrice = item.price;

    // Tabs: 'amount' (By Pesos ₱) or 'weight' (By kg/units)
    const [mode, setMode] = useState<'amount' | 'weight'>('amount');

    // Values
    const [amountInput, setAmountInput] = useState<string>(() => {
        // If current qty * price is close to a whole number, initialize amount
        const currentAmt = Math.round(item.qty * unitPrice * 100) / 100;
        return currentAmt > 0 ? String(currentAmt) : '50';
    });

    const [weightInput, setWeightInput] = useState<string>(() => {
        return String(item.qty || 1);
    });

    // Calculated states
    const numericAmount = parseFloat(amountInput) || 0;
    const computedWeightFromAmount = unitPrice > 0 ? Math.round((numericAmount / unitPrice) * 1000) / 1000 : 0;

    const numericWeight = parseFloat(weightInput) || 0;
    const computedAmountFromWeight = Math.round(numericWeight * unitPrice * 100) / 100;

    // Active applied weight based on mode
    const finalQty = mode === 'amount' ? computedWeightFromAmount : numericWeight;
    const finalAmount = Math.round(finalQty * unitPrice * 100) / 100;

    // When mode switches, sync the other input
    const handleSwitchMode = (newMode: 'amount' | 'weight') => {
        setMode(newMode);
        if (newMode === 'amount') {
            setAmountInput(String(Math.round(computedAmountFromWeight * 100) / 100));
        } else {
            setWeightInput(String(computedWeightFromAmount));
        }
    };

    // Quick presets
    const amountPresets = [10, 20, 30, 40, 50, 75, 100, 150, 200, 500];
    const weightPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.4, 1.5, 2, 2.5, 3, 5, 10, 25];

    // Keypad handler
    const handleKeypadPress = (val: string) => {
        if (mode === 'amount') {
            if (val === 'C') {
                setAmountInput('');
            } else if (val === '⌫') {
                setAmountInput((prev) => prev.slice(0, -1));
            } else if (val === '.') {
                if (!amountInput.includes('.')) setAmountInput((prev) => (prev || '0') + '.');
            } else {
                setAmountInput((prev) => (prev === '0' ? val : prev + val));
            }
        } else {
            if (val === 'C') {
                setWeightInput('');
            } else if (val === '⌫') {
                setWeightInput((prev) => prev.slice(0, -1));
            } else if (val === '.') {
                if (!weightInput.includes('.')) setWeightInput((prev) => (prev || '0') + '.');
            } else {
                setWeightInput((prev) => (prev === '0' ? val : prev + val));
            }
        }
    };

    const handleConfirm = () => {
        if (finalQty > 0) {
            onApply(finalQty);
            onClose();
        }
    };

    // Handle Enter and Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [finalQty]);

    return (
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 p-3 backdrop-blur-xs duration-150 fade-in">
            <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border bg-muted/20 p-4">
                    <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2">
                            <span className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400">
                                <Scale className="h-5 w-5" />
                            </span>
                            <div>
                                <h3 className="truncate text-base leading-tight font-black text-foreground">{item.name}</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Price:{' '}
                                    <strong className="font-mono text-primary">
                                        {fmtMoney(unitPrice, currency)} / {unit}
                                    </strong>
                                    {item.variant_name && <span className="ml-1 text-primary">[{item.variant_name}]</span>}
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="space-y-4 overflow-y-auto p-4">
                    {/* Mode Selector Tabs */}
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted p-1 text-xs font-bold">
                        <button
                            type="button"
                            onClick={() => handleSwitchMode('amount')}
                            className={cn(
                                'flex items-center justify-center gap-2 rounded-lg py-2 transition-all',
                                mode === 'amount'
                                    ? 'border border-border/80 bg-background font-black text-amber-600 text-foreground shadow-xs dark:text-amber-400'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Banknote className="h-4 w-4" />
                            <span>Pabili ng Halaga (₱ Amount)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSwitchMode('weight')}
                            className={cn(
                                'flex items-center justify-center gap-2 rounded-lg py-2 transition-all',
                                mode === 'weight'
                                    ? 'border border-border/80 bg-background font-black text-emerald-600 text-foreground shadow-xs dark:text-emerald-400'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Scale className="h-4 w-4" />
                            <span>Pabili ng Timbang ({unit})</span>
                        </button>
                    </div>

                    {/* Mode A: By Cash Amount */}
                    {mode === 'amount' ? (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="flex items-center justify-between text-xs font-bold text-foreground">
                                    <span>Target Amount (Pesos ₱)</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">Type or tap quick buttons below</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-lg font-bold text-muted-foreground">
                                        ₱
                                    </span>
                                    <input
                                        type="number"
                                        step="any"
                                        min="1"
                                        autoFocus
                                        value={amountInput}
                                        onChange={(e) => setAmountInput(e.target.value)}
                                        placeholder="50"
                                        className="h-12 w-full rounded-xl border-2 border-primary/40 bg-background pr-4 pl-8 font-mono text-2xl font-black text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                    />
                                </div>
                            </div>

                            {/* Quick Amount Chips */}
                            <div>
                                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                                    Quick Amount Presets
                                </span>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {amountPresets.map((amt) => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => setAmountInput(String(amt))}
                                            className={cn(
                                                'rounded-lg border px-2 py-1.5 font-mono text-xs font-bold transition-all',
                                                numericAmount === amt
                                                    ? 'scale-102 border-amber-600 bg-amber-500 text-white shadow-xs'
                                                    : 'border-border bg-background text-foreground hover:border-amber-500/50 hover:bg-amber-500/10',
                                            )}
                                        >
                                            ₱{amt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Real-time Calculation Card */}
                            <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                                        <Scale className="h-4 w-4" /> System Auto-Detected Weight:
                                    </span>
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                        ₱{numericAmount.toFixed(2)} ÷ ₱{unitPrice.toFixed(2)}/{unit}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <div>
                                        <span className="font-mono text-3xl font-black text-emerald-700 dark:text-emerald-300">
                                            {fmtQty(computedWeightFromAmount)}
                                        </span>
                                        <span className="ml-1 text-base font-bold text-emerald-700 dark:text-emerald-300">{unit}</span>
                                        {isKg && (
                                            <span className="ml-2 font-mono text-xs text-emerald-600/80 dark:text-emerald-400/80">
                                                ({Math.round(computedWeightFromAmount * 1000)} grams)
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs text-muted-foreground">Actual Total:</span>
                                        <span className="font-mono text-base font-black text-foreground">
                                            {fmtMoney(computedWeightFromAmount * unitPrice, currency)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Mode B: By Exact Weight */
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="flex items-center justify-between text-xs font-bold text-foreground">
                                    <span>Exact Weight / Quantity ({unit})</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">Type or tap quick weight presets</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="any"
                                        min="0.001"
                                        autoFocus
                                        value={weightInput}
                                        onChange={(e) => setWeightInput(e.target.value)}
                                        placeholder="1.5"
                                        className="h-12 w-full rounded-xl border-2 border-primary/40 bg-background px-4 font-mono text-2xl font-black text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                                    />
                                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-base font-bold text-muted-foreground uppercase">
                                        {unit}
                                    </span>
                                </div>
                            </div>

                            {/* Quick Weight Chips */}
                            <div>
                                <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                                    Quick Weight Presets
                                </span>
                                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                                    {weightPresets.map((w) => (
                                        <button
                                            key={w}
                                            type="button"
                                            onClick={() => setWeightInput(String(w))}
                                            className={cn(
                                                'rounded-lg border px-2 py-1.5 font-mono text-xs font-bold transition-all',
                                                numericWeight === w
                                                    ? 'scale-102 border-emerald-600 bg-emerald-600 text-white shadow-xs'
                                                    : 'border-border bg-background text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10',
                                            )}
                                        >
                                            {w} {w === 0.25 ? '(¼)' : w === 0.5 ? '(½)' : w === 0.75 ? '(¾)' : 'k'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Real-time Total Price Card */}
                            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/10 p-3.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-bold text-primary">
                                        <Banknote className="h-4 w-4" /> Computed Total Price:
                                    </span>
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                        {numericWeight} {unit} × {fmtMoney(unitPrice, currency)}
                                    </span>
                                </div>
                                <div className="flex items-baseline justify-between">
                                    <div className="font-mono text-3xl font-black text-primary">{fmtMoney(computedAmountFromWeight, currency)}</div>
                                    <div className="text-right text-xs text-muted-foreground">
                                        Weight:{' '}
                                        <strong className="text-foreground">
                                            {fmtQty(numericWeight)} {unit}
                                        </strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Touch Keypad */}
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-2">
                        <div className="grid grid-cols-4 gap-1.5">
                            {['7', '8', '9', 'C', '4', '5', '6', '⌫', '1', '2', '3', '.'].map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleKeypadPress(key)}
                                    className={cn(
                                        'flex h-10 items-center justify-center rounded-lg border font-mono text-sm font-bold transition-all',
                                        key === 'C'
                                            ? 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20'
                                            : key === '⌫'
                                              ? 'border-border bg-muted text-foreground hover:bg-muted/80'
                                              : 'border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/10 active:scale-95',
                                    )}
                                >
                                    {key}
                                </button>
                            ))}
                            <div className="col-span-4 grid grid-cols-4 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleKeypadPress('0')}
                                    className="col-span-2 h-10 rounded-lg border border-border bg-background font-mono text-sm font-bold text-foreground hover:bg-primary/10 active:scale-95"
                                >
                                    0
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleKeypadPress('00')}
                                    className="col-span-2 h-10 rounded-lg border border-border bg-background font-mono text-sm font-bold text-foreground hover:bg-primary/10 active:scale-95"
                                >
                                    00
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 p-4">
                    <Button type="button" variant="outline" onClick={onClose} className="h-11 px-4 text-xs font-bold">
                        Cancel [Esc]
                    </Button>

                    <Button
                        type="button"
                        onClick={handleConfirm}
                        disabled={finalQty <= 0}
                        className="h-11 flex-1 gap-2 bg-emerald-600 text-sm font-black text-white shadow-md hover:bg-emerald-500"
                    >
                        <Check className="h-4 w-4" />
                        <span>
                            Apply {fmtQty(finalQty)} {unit} ({fmtMoney(finalAmount, currency)}) [Enter]
                        </span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
