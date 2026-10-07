'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { CalendarDays, PenLine, Receipt, Wallet } from 'lucide-react';
import { useState } from 'react';
import { controlCls, FormField, PageHeader, Panel, Stat, StatStrip, StatusPill, useFlashToasts } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { manilaTodayStr } from '@/lib/date';
import { cn } from '@/lib/utils';
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

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpensesIndex() {
    const { expenses, categories, total_this_month } = usePage<PageProps>().props;
    useFlashToasts();

    const [categoryId, setCategoryId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [expenseDate, setExpenseDate] = useState(manilaTodayStr());
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const canSave = !!amount && !!description.trim() && !!categoryId;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setSaving(true);
        router.post(
            routes.expenses.store(),
            {
                expense_category_id: categoryId,
                amount: parseFloat(amount),
                expense_date: expenseDate,
                description: description.trim(),
                payment_method: paymentMethod,
                notes: notes.trim(),
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setAmount('');
                    setDescription('');
                    setNotes('');
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    const today = manilaTodayStr();
    const todayTotal = expenses.data.filter((e) => e.expense_date === today).reduce((sum, e) => sum + Number(e.amount), 0);

    return (
        <AdminLayout>
            <Head title="Expenses" />

            <div className="space-y-4">
                <PageHeader title="Expenses" subtitle="Record what the branch spends, from supplies to utilities." />

                <StatStrip count={3}>
                    <Stat
                        icon={Wallet}
                        label="Spent · this month"
                        value={peso(Number(total_this_month))}
                        tone={total_this_month > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={CalendarDays} label="Spent · today" value={peso(todayTotal)} />
                    <Stat icon={Receipt} label="Recent entries" value={expenses.data.length.toLocaleString()} />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
                    <Panel icon={PenLine} title="New expense" className="self-start">
                        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                            <FormField label="Category">
                                <select
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                    className={cn(controlCls, 'h-9 w-full')}
                                    required
                                >
                                    <option value="">Select…</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </FormField>
                            <FormField label="Amount (₱)">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className={cn(controlCls, 'h-9 w-full tabular-nums')}
                                    required
                                />
                            </FormField>
                            <FormField label="What was it for?" className="col-span-2">
                                <input
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="e.g. LPG refill"
                                    className={cn(controlCls, 'h-9 w-full')}
                                    required
                                />
                            </FormField>
                            <FormField label="Date">
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(e) => setExpenseDate(e.target.value)}
                                    className={cn(controlCls, 'h-9 w-full')}
                                />
                            </FormField>
                            <FormField label="Paid with">
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className={cn(controlCls, 'h-9 w-full')}
                                >
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank transfer</option>
                                    <option value="card">Card</option>
                                </select>
                            </FormField>
                            <FormField label="Notes (optional)" className="col-span-2">
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                />
                            </FormField>
                            <Button type="submit" className="col-span-2 h-9" disabled={!canSave || saving}>
                                {saving ? 'Saving…' : 'Record expense'}
                            </Button>
                        </form>
                    </Panel>

                    <Panel flush icon={Receipt} title="Recent expenses">
                        {expenses.data.length === 0 ? (
                            <p className="py-12 text-center text-sm text-muted-foreground">No expenses recorded yet.</p>
                        ) : (
                            <ul className="max-h-160 divide-y divide-border overflow-y-auto">
                                {expenses.data.map((exp) => (
                                    <li key={exp.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{exp.description}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {exp.category?.name ?? 'Uncategorised'} ·{' '}
                                                {new Date(exp.expense_date + 'T00:00:00+08:00').toLocaleDateString('en-PH', {
                                                    timeZone: 'Asia/Manila',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </p>
                                        </div>
                                        <StatusPill tone="muted">{exp.payment_method}</StatusPill>
                                        <span className="w-28 text-right font-bold tabular-nums">{peso(Number(exp.amount))}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}
