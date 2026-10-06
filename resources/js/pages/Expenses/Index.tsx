'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { DollarSign } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/AdminLayout';
import { manilaTodayStr } from '@/lib/date';

import { routes } from '@/routes';

interface Expense {
    id: number;
    description: string;
    expense_date: string;
    amount: number;
    payment_method: string;
    category?: { name: string } | null;
}

interface PageProps {
    expenses: { data: Expense[] };
    categories: { id: number; name: string }[];
    total_this_month: number;
    [key: string]: unknown;
}

export default function ExpensesIndex() {
    const { expenses, categories, total_this_month } = usePage<PageProps>().props;

    const [categoryId, setCategoryId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [expenseDate, setExpenseDate] = useState(manilaTodayStr());
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        if (!amount || !description || !categoryId) return;

        router.post(routes.expenses.store(), {
            expense_category_id: categoryId,
            amount: parseFloat(amount),
            expense_date: expenseDate,
            description: description.trim(),
            payment_method: paymentMethod,
            notes: notes.trim(),
        });
    };

    return (
        <AdminLayout>
            <Head title="Expenses" />

            <div className="mx-auto max-w-7xl space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
                        <p className="text-muted-foreground">Record and manage business expenses</p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-muted-foreground">This Month Total</div>
                        <div className="font-mono text-3xl font-bold text-red-600">
                            ₱{total_this_month.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                    {/* LEFT: New Expense */}
                    <div className="lg:col-span-3">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
                                        <DollarSign className="h-5 w-5 text-red-500" />
                                    </div>
                                    <div>
                                        <CardTitle>New Expense</CardTitle>
                                        <CardDescription>Record a new business expense</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div>
                                        <Label>Category</Label>
                                        <Select value={categoryId} onValueChange={setCategoryId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select category" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categories.map((cat) => (
                                                    <SelectItem key={cat.id} value={cat.id.toString()}>
                                                        {cat.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Amount (₱)</Label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label>Description</Label>
                                    <Input
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="What was this expense for?"
                                    />
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    <div>
                                        <Label>Date</Label>
                                        <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
                                    </div>
                                    <div>
                                        <Label>Payment Method</Label>
                                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cash">Cash</SelectItem>
                                                <SelectItem value="bank">Bank Transfer</SelectItem>
                                                <SelectItem value="card">Card</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div>
                                    <Label>Notes (optional)</Label>
                                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details..." rows={3} />
                                </div>

                                <Button onClick={handleSubmit} className="h-12 w-full text-lg" disabled={!amount || !description || !categoryId}>
                                    Record Expense
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT: Recent Expenses */}
                    <div className="lg:col-span-2">
                        <Card className="h-full shadow-lg">
                            <CardHeader>
                                <CardTitle>Recent Expenses</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[700px] space-y-4 overflow-y-auto">
                                    {expenses.data.length === 0 ? (
                                        <p className="py-12 text-center text-muted-foreground">No expenses recorded yet.</p>
                                    ) : (
                                        expenses.data.map((exp) => (
                                            <div key={exp.id} className="rounded-2xl border p-5 transition-all hover:bg-muted/50">
                                                <div className="flex justify-between">
                                                    <div>
                                                        <div className="font-medium">{exp.description}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {exp.category?.name} •{' '}
                                                            {new Date(exp.expense_date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
                                                                timeZone: 'Asia/Manila',
                                                            })}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-mono text-lg text-red-600">
                                                            -₱{exp.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </div>
                                                        <Badge variant="destructive">{exp.payment_method}</Badge>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
