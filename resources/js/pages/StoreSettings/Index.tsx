import { router, useForm } from '@inertiajs/react';
import { Bike, CalendarDays, DoorClosed, DoorOpen, Loader2, Store } from 'lucide-react';

import { closeToday, reopen } from '@/actions/App/Http/Controllers/StoreSettingsController';
import { FormField, PageHeader, Panel, Stat, StatStrip, StatusPill, textareaCls, useFlashToasts } from '@/components/AdminKit';
import { confirmDialog } from '@/components/ConfirmDialog';
import AdminLayout from '@/layouts/AdminLayout';

interface BranchState {
    id: number;
    name: string;
    takes_online_orders: boolean;
    closure: { closed_on: string; note: string | null; closed_by: string | null } | null;
    status: { is_open: boolean; message: string | null; opens_at: string; closes_at: string };
}

interface Props {
    branches: BranchState[];
    canManageAllBranches: boolean;
    today: string;
}

export default function StoreSettings({ branches, canManageAllBranches, today }: Props) {
    useFlashToasts();
    const closedCount = branches.filter((b) => b.closure).length;

    return (
        <AdminLayout title="Store Settings">
            <div className="space-y-4">
                <PageHeader
                    title="Store Settings"
                    subtitle={
                        canManageAllBranches
                            ? 'Close any branch for the day, or reopen it. A closure ends on its own tomorrow.'
                            : 'Close your branch for the day, or reopen it. A closure ends on its own tomorrow.'
                    }
                />

                <StatStrip count={3}>
                    <Stat icon={CalendarDays} label="Today" value={today} />
                    <Stat icon={Store} label="Branches" value={branches.length} />
                    <Stat icon={DoorClosed} label="Closed today" value={closedCount} tone={closedCount > 0 ? 'warning' : 'muted'} />
                </StatStrip>

                {branches.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                        No active branch is assigned to your account.
                    </p>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                    {branches.map((branch) => (
                        <BranchClosurePanel key={branch.id} branch={branch} />
                    ))}
                </div>
            </div>
        </AdminLayout>
    );
}

function BranchClosurePanel({ branch }: { branch: BranchState }) {
    const form = useForm({ note: '' });
    const { closure, status } = branch;

    const closeBranch = async () => {
        const confirmed = await confirmDialog({
            title: `Close ${branch.name} for today?`,
            description: branch.takes_online_orders
                ? 'Customers can still browse the menu, but they cannot place orders until tomorrow or until you reopen.'
                : 'This branch is marked closed for today. It reopens on its own tomorrow.',
            confirmLabel: 'Close for today',
            tone: 'danger',
        });
        if (confirmed) {
            form.post(closeToday.url(branch.id), { preserveScroll: true, onSuccess: () => form.reset() });
        }
    };

    return (
        <Panel
            icon={closure ? DoorClosed : DoorOpen}
            title={branch.name}
            actions={
                <>
                    {branch.takes_online_orders && (
                        <StatusPill tone="primary">
                            <Bike className="h-3 w-3" /> Online orders
                        </StatusPill>
                    )}
                    <StatusPill tone={closure ? 'warning' : status.is_open ? 'success' : 'muted'}>
                        {closure ? 'Closed today' : status.is_open ? 'Open now' : 'Outside hours'}
                    </StatusPill>
                </>
            }
        >
            <p className="text-xs text-muted-foreground">
                Normal hours {status.opens_at} – {status.closes_at}
                {!closure && !status.is_open && status.message ? ` · ${status.message}` : ''}
            </p>

            {closure ? (
                <div className="space-y-3">
                    <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-semibold">Closed for today.</p>
                        <p>
                            {closure.note ? `Reason shown to customers: “${closure.note}”.` : 'No reason was given.'}
                            {closure.closed_by && ` Closed by ${closure.closed_by}.`} It reopens on its own tomorrow.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.delete(reopen.url(branch.id), { preserveScroll: true })}
                        className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
                    >
                        <DoorOpen className="h-4 w-4" /> Reopen now
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <FormField label="Reason shown to customers (optional)" error={form.errors.note}>
                        <textarea
                            rows={2}
                            maxLength={160}
                            value={form.data.note}
                            onChange={(e) => form.setData('note', e.target.value)}
                            placeholder="e.g. Closed for the town fiesta. See you tomorrow!"
                            className={textareaCls}
                        />
                    </FormField>
                    <button
                        type="button"
                        onClick={closeBranch}
                        disabled={form.processing}
                        className="flex h-9 items-center gap-2 rounded-lg bg-destructive px-4 text-sm font-bold text-white disabled:opacity-50"
                    >
                        {form.processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />} Close for today
                    </button>
                </div>
            )}
        </Panel>
    );
}
