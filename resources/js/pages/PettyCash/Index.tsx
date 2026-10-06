'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { Wallet, CheckCircle, XCircle, AlertCircle, PenLine, Ticket } from 'lucide-react';
import { useState } from 'react';

import { controlCls, FormField, PageHeader, Panel, Stat, StatStrip, StatusPill, useFlashToasts } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';

import { routes } from '@/routes';

interface PettyCashFund {
    id: number;
    fund_name: string;
    current_balance: number;
}

interface PettyCashVoucher {
    id: number;
    voucher_number: string;
    status: string;
    purpose: string;
    amount: number;
    requested_by?: { fname: string; lname: string } | null;
}

interface PageProps {
    active_fund: PettyCashFund | null;
    vouchers: { data: PettyCashVoucher[] };
    categories: { id: number; name: string }[];
    is_manager: boolean;
    current_user?: { name: string; role: string } | null;
    [key: string]: unknown;
}

const peso = (n: number) => '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PettyCashIndex() {
    const { active_fund, vouchers, categories, is_manager } = usePage<PageProps>().props;
    useFlashToasts();

    // Voucher form
    const [voucherType, setVoucherType] = useState<'withdrawal' | 'replenishment'>('withdrawal');
    const [amount, setAmount] = useState('');
    const [payee, setPayee] = useState('');
    const [purpose, setPurpose] = useState('');
    const [categoryId, setCategoryId] = useState('');

    // The "new fund" dialog is not built yet. Its state and submit handler are kept, unused, until it is.
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const [showNewFund, setShowNewFund] = useState(false);
    const [fundName, setFundName] = useState('');
    const [initialAmount, setInitialAmount] = useState('');

    const handleCreateFund = () => {
        if (!fundName || !initialAmount) return;

        router.post(
            routes.pettyCash.funds.store(),
            {
                fund_name: fundName.trim(),
                fund_amount: parseFloat(initialAmount),
            },
            {
                onSuccess: () => {
                    setShowNewFund(false);
                    setFundName('');
                    setInitialAmount('');
                },
            },
        );
    };
    /* eslint-enable @typescript-eslint/no-unused-vars */

    // Approval dialog
    const [showApproveDialog, setShowApproveDialog] = useState(false);
    const [selectedApproveId, setSelectedApproveId] = useState<number | null>(null);

    // Rejection dialog
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [selectedRejectId, setSelectedRejectId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    const handleVoucherSubmit = () => {
        if (!amount || !payee || !purpose) return;

        router.post(routes.pettyCash.store(), {
            fund_id: active_fund?.id,
            voucher_type: voucherType,
            amount: parseFloat(amount),
            payee: payee.trim(),
            purpose: purpose.trim(),
            expense_category_id: voucherType === 'withdrawal' ? categoryId : null,
        });
    };

    const openApproveDialog = (voucherId: number) => {
        setSelectedApproveId(voucherId);
        setShowApproveDialog(true);
    };

    const handleApproveConfirm = () => {
        if (!selectedApproveId) return;

        router.post(
            routes.pettyCash.approve(selectedApproveId),
            {},
            {
                onSuccess: () => {
                    setShowApproveDialog(false);
                    setSelectedApproveId(null);
                },
            },
        );
    };

    const openRejectDialog = (voucherId: number) => {
        setSelectedRejectId(voucherId);
        setRejectionReason('');
        setShowRejectDialog(true);
    };

    const handleRejectConfirm = () => {
        if (!selectedRejectId || !rejectionReason.trim()) return;

        router.post(
            routes.pettyCash.reject(selectedRejectId),
            {
                reason: rejectionReason.trim(),
            },
            {
                onSuccess: () => {
                    setShowRejectDialog(false);
                    setSelectedRejectId(null);
                    setRejectionReason('');
                },
            },
        );
    };

    const pending = vouchers.data.filter((v) => v.status === 'pending');
    const approvedTotal = vouchers.data.filter((v) => v.status === 'approved').reduce((sum, v) => sum + Number(v.amount), 0);
    const canSubmit = !!amount && !!payee.trim() && !!purpose.trim() && (voucherType !== 'withdrawal' || !!categoryId);

    return (
        <AdminLayout>
            <Head title="Petty Cash" />

            <div className="space-y-4">
                <PageHeader title="Petty Cash" subtitle="Small cash payouts from the drawer fund, with manager approval." />

                <StatStrip count={4}>
                    <Stat
                        icon={Wallet}
                        label={active_fund ? `Balance · ${active_fund.fund_name}` : 'Fund balance'}
                        value={active_fund ? peso(active_fund.current_balance) : 'No open fund'}
                        tone={active_fund ? 'success' : 'muted'}
                    />
                    <Stat
                        icon={AlertCircle}
                        label="Waiting for approval"
                        value={pending.length.toLocaleString()}
                        tone={pending.length > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={CheckCircle} label="Approved · recent" value={peso(approvedTotal)} />
                    <Stat icon={Ticket} label="Recent vouchers" value={vouchers.data.length.toLocaleString()} />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
                    <Panel icon={PenLine} title="New voucher" className="self-start">
                        {!active_fund && (
                            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                There is no open petty cash fund for this branch yet.
                            </p>
                        )}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleVoucherSubmit();
                            }}
                            className="grid grid-cols-2 gap-x-3 gap-y-2.5"
                        >
                            <FormField label="Type">
                                <select
                                    value={voucherType}
                                    onChange={(e) => setVoucherType(e.target.value as 'withdrawal' | 'replenishment')}
                                    className={cn(controlCls, 'h-9 w-full')}
                                >
                                    <option value="withdrawal">Withdrawal (expense)</option>
                                    <option value="replenishment">Replenishment (add funds)</option>
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
                                />
                            </FormField>
                            <FormField label="Paid to" className="col-span-2">
                                <input
                                    value={payee}
                                    onChange={(e) => setPayee(e.target.value)}
                                    placeholder="Who receives the cash?"
                                    className={cn(controlCls, 'h-9 w-full')}
                                />
                            </FormField>
                            <FormField label="Purpose" className="col-span-2">
                                <input
                                    value={purpose}
                                    onChange={(e) => setPurpose(e.target.value)}
                                    placeholder="What is it for?"
                                    className={cn(controlCls, 'h-9 w-full')}
                                />
                            </FormField>
                            {voucherType === 'withdrawal' && (
                                <FormField label="Expense category" className="col-span-2">
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className={cn(controlCls, 'h-9 w-full')}
                                    >
                                        <option value="">Select…</option>
                                        {categories.map((cat) => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </FormField>
                            )}
                            <Button type="submit" className="col-span-2 h-9" disabled={!canSubmit || !active_fund}>
                                Submit voucher
                            </Button>
                            <p className="col-span-2 text-[11px] text-muted-foreground">
                                {is_manager
                                    ? 'Vouchers you submit are approved straight away.'
                                    : 'A manager approves your voucher before the cash is released.'}
                            </p>
                        </form>
                    </Panel>

                    <Panel
                        flush
                        icon={Ticket}
                        title="Recent vouchers"
                        actions={pending.length > 0 && <StatusPill tone="warning">{pending.length} pending</StatusPill>}
                    >
                        {vouchers.data.length === 0 ? (
                            <p className="py-12 text-center text-sm text-muted-foreground">No vouchers recorded yet.</p>
                        ) : (
                            <ul className="max-h-160 divide-y divide-border overflow-y-auto">
                                {vouchers.data.map((v) => (
                                    <li key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{v.purpose}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                <span className="font-mono">#{v.voucher_number}</span> ·{' '}
                                                {v.requested_by ? `${v.requested_by.fname} ${v.requested_by.lname}` : '—'}
                                            </p>
                                        </div>
                                        <StatusPill tone={v.status === 'approved' ? 'success' : v.status === 'rejected' ? 'danger' : 'warning'}>
                                            {v.status}
                                        </StatusPill>
                                        <span className="w-24 text-right font-bold tabular-nums">{peso(Number(v.amount))}</span>
                                        {is_manager && v.status === 'pending' && (
                                            <div className="flex gap-1">
                                                <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => openApproveDialog(v.id)}>
                                                    <CheckCircle className="h-3.5 w-3.5" /> Approve
                                                </Button>
                                                <button
                                                    onClick={() => openRejectDialog(v.id)}
                                                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    aria-label={`Reject voucher ${v.voucher_number}`}
                                                    title="Reject"
                                                >
                                                    <XCircle className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>

            {/* APPROVAL DIALOG */}
            <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Approve Voucher</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to approve this voucher?
                            <br />
                            The petty cash fund balance will be updated immediately.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowApproveDialog(false);
                                setSelectedApproveId(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleApproveConfirm} className="bg-green-600 hover:bg-green-700">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Yes, Approve Voucher
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* REJECTION DIALOG */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Voucher</DialogTitle>
                        <DialogDescription>Please provide a reason for rejecting this voucher.</DialogDescription>
                    </DialogHeader>

                    <div className="py-4">
                        <Label htmlFor="rejection-reason">Rejection Reason</Label>
                        <Textarea
                            id="rejection-reason"
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Enter detailed reason for rejection..."
                            rows={5}
                            className="mt-2"
                        />
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={handleRejectConfirm} disabled={!rejectionReason.trim()}>
                            Confirm Rejection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
