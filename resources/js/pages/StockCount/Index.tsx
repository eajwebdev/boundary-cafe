'use client';

import { Head, router, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import { ClipboardCheck, Plus, CheckCircle2, Clock, XCircle, ChevronRight, Package, LayoutList, FlaskConical } from 'lucide-react';
import { useState } from 'react';

import { controlCls, EmptyRow, PageHeader, Panel, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Session {
    id: number;
    name: string;
    type: 'full' | 'partial';
    status: 'draft' | 'committed' | 'cancelled';
    note: string | null;
    counted_by: string;
    committed_by: string | null;
    items_total: number;
    items_counted: number;
    items_adjusted: number;
    progress: number;
    committed_at: string | null;
    created_at: string;
}

interface Category {
    id: number;
    name: string;
}
interface Branch {
    id: number;
    name: string;
}

interface PageProps {
    sessions: Session[];
    categories: Category[];
    branch_id: number;
    branches: Branch[];
    is_admin: boolean;
    filters: { branch_id?: string };
    [key: string]: unknown;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Session['status'] }) {
    if (status === 'committed') {
        return (
            <StatusPill tone="success">
                <CheckCircle2 className="h-3 w-3" /> Committed
            </StatusPill>
        );
    }
    if (status === 'cancelled') {
        return (
            <StatusPill tone="muted">
                <XCircle className="h-3 w-3" /> Cancelled
            </StatusPill>
        );
    }
    return (
        <StatusPill tone="warning">
            <Clock className="h-3 w-3" /> In progress
        </StatusPill>
    );
}

// ── New Count Modal ────────────────────────────────────────────────────────────

function NewCountModal({
    open,
    onClose,
    categories,
    branchId,
    branches,
    isAdmin,
}: {
    open: boolean;
    onClose: () => void;
    categories: Category[];
    branchId: number;
    branches: Branch[];
    isAdmin: boolean;
}) {
    const today = format(new Date(), 'MMM d, yyyy');
    const [name, setName] = useState(`Full Count — ${today}`);
    const [type, setType] = useState<'full' | 'partial'>('full');
    const [note, setNote] = useState('');
    const [selectedCats, setSelectedCats] = useState<number[]>([]);
    const [targetBranch, setTargetBranch] = useState(String(branchId));
    const [inclIngredients, setInclIngredients] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    function toggleCat(id: number) {
        setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
    }

    function handleTypeChange(val: 'full' | 'partial') {
        setType(val);
        const label = val === 'full' ? 'Full Count' : 'Partial Count';
        setName(`${label} — ${today}`);
        if (val === 'full') setSelectedCats([]);
    }

    function handleSubmit() {
        if (!name.trim()) return;
        if (type === 'partial' && selectedCats.length === 0) return;
        setSubmitting(true);
        router.post(
            routes.stockCount.start(),
            {
                branch_id: isAdmin ? targetBranch : branchId,
                name: name.trim(),
                type,
                include_ingredients: inclIngredients ? 1 : 0,
                note: note.trim() || null,
                category_ids: type === 'partial' ? selectedCats : [],
            },
            {
                onSuccess: () => {
                    onClose();
                    setSubmitting(false);
                },
                onError: () => setSubmitting(false),
            },
        );
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>New Stock Count</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    {isAdmin && branches.length > 0 && (
                        <div className="space-y-1.5">
                            <Label>Branch</Label>
                            <Select value={targetBranch} onValueChange={setTargetBranch}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label>Count name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly Count – Apr 13" />
                    </div>

                    {/* Type selector */}
                    <div className="space-y-2">
                        <Label>Scope</Label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['full', 'partial'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => handleTypeChange(t)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                                        type === t
                                            ? 'border-primary bg-primary/5 font-medium text-primary'
                                            : 'border-border text-muted-foreground hover:bg-muted/40',
                                    )}
                                >
                                    {t === 'full' ? (
                                        <>
                                            <LayoutList className="h-4 w-4 shrink-0" />
                                            <span>Full — all products</span>
                                        </>
                                    ) : (
                                        <>
                                            <Package className="h-4 w-4 shrink-0" />
                                            <span>Partial — by category</span>
                                        </>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Category picker (partial only) */}
                    {type === 'partial' && (
                        <div className="space-y-1.5">
                            <Label>
                                Categories
                                {selectedCats.length > 0 && (
                                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">({selectedCats.length} selected)</span>
                                )}
                            </Label>
                            <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border">
                                {categories.length === 0 && <p className="p-3 text-sm text-muted-foreground">No categories found.</p>}
                                {categories.map((cat) => (
                                    <label key={cat.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/30">
                                        <input
                                            type="checkbox"
                                            checked={selectedCats.includes(cat.id)}
                                            onChange={() => toggleCat(cat.id)}
                                            className="rounded"
                                        />
                                        <span className="text-sm">{cat.name}</span>
                                    </label>
                                ))}
                            </div>
                            {selectedCats.length === 0 && <p className="text-xs text-destructive">Select at least one category.</p>}
                        </div>
                    )}

                    {/* Include ingredients toggle */}
                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/30">
                        <div className="flex items-center gap-2">
                            <FlaskConical className="h-4 w-4 shrink-0 text-purple-500" />
                            <div>
                                <p className="text-sm font-medium">Include ingredients</p>
                                <p className="text-xs text-muted-foreground">Also count raw ingredients used in recipes</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setInclIngredients((v) => !v)}
                            className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors',
                                inclIngredients ? 'border-primary bg-primary' : 'border-border bg-muted',
                            )}
                        >
                            <span
                                className={cn(
                                    'inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform',
                                    inclIngredients ? 'translate-x-4' : 'translate-x-0.5',
                                )}
                            />
                        </button>
                    </label>

                    <div className="space-y-1.5">
                        <Label>
                            Note <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="e.g. Monthly full count, after closing"
                            rows={2}
                        />
                    </div>

                    <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Starting a count takes an immediate snapshot of current quantities. Sales can continue normally — the system will account for
                        them on commit.
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting || !name.trim() || (type === 'partial' && selectedCats.length === 0)}>
                        {submitting ? 'Starting…' : 'Start Count'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function StockCountIndex() {
    const { props } = usePage<PageProps>();
    const { sessions, categories, branch_id, branches, is_admin } = props;

    const [newOpen, setNewOpen] = useState(false);

    const draft = sessions.filter((s) => s.status === 'draft');
    const committed = sessions.filter((s) => s.status === 'committed');

    const cancelled = sessions.filter((s) => s.status === 'cancelled');
    const adjustedItems = committed.reduce((sum, s) => sum + s.items_adjusted, 0);

    function handleBranchChange(val: string) {
        router.get(routes.stockCount.index(), { branch_id: val }, { preserveState: false });
    }

    return (
        <AdminLayout>
            <Head title="Stock Count" />
            <div className="space-y-4">
                <PageHeader title="Stock Count" subtitle="Physical inventory: count daily, weekly or monthly while sales continue.">
                    {is_admin && branches.length > 0 && (
                        <select
                            value={String(branch_id)}
                            onChange={(e) => handleBranchChange(e.target.value)}
                            className={cn(controlCls, 'h-9')}
                            aria-label="Branch"
                        >
                            {branches.map((b) => (
                                <option key={b.id} value={String(b.id)}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => setNewOpen(true)}>
                        <Plus className="h-4 w-4" /> New count
                    </Button>
                </PageHeader>

                <StatStrip count={4}>
                    <Stat icon={Clock} label="In progress" value={draft.length.toLocaleString()} tone={draft.length > 0 ? 'warning' : undefined} />
                    <Stat icon={CheckCircle2} label="Committed" value={committed.length.toLocaleString()} tone="success" />
                    <Stat icon={Package} label="Items adjusted" value={adjustedItems.toLocaleString()} />
                    <Stat
                        icon={XCircle}
                        label="Cancelled"
                        value={cancelled.length.toLocaleString()}
                        tone={cancelled.length > 0 ? 'muted' : undefined}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                    <Panel
                        flush
                        icon={ClipboardCheck}
                        title="Count sessions"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">{sessions.length} total</span>}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className={thCls}>Session</th>
                                        <th className={cn(thCls, 'hidden sm:table-cell')}>Scope</th>
                                        <th className={cn(thCls, 'text-right')}>Progress</th>
                                        <th className={cn(thCls, 'hidden text-right md:table-cell')}>Adjusted</th>
                                        <th className={cn(thCls, 'hidden lg:table-cell')}>Date</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {sessions.length === 0 ? (
                                        <EmptyRow colSpan={6} icon={ClipboardCheck}>
                                            No count sessions yet.{' '}
                                            <button className="font-semibold text-primary hover:underline" onClick={() => setNewOpen(true)}>
                                                Start your first count
                                            </button>
                                        </EmptyRow>
                                    ) : (
                                        sessions.map((s) => (
                                            <tr
                                                key={s.id}
                                                className={cn('cursor-pointer hover:bg-muted/30', s.status === 'cancelled' && 'opacity-50')}
                                                onClick={() => router.visit(routes.stockCount.show(s.id))}
                                            >
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{s.name}</p>
                                                    <div className="mt-0.5 flex items-center gap-2">
                                                        <StatusBadge status={s.status} />
                                                        <span className="text-[11px] text-muted-foreground">{s.counted_by}</span>
                                                    </div>
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground capitalize sm:table-cell">{s.type}</td>
                                                <td className="px-4 py-2">
                                                    {s.status !== 'cancelled' && (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                                                <div className="h-full rounded-full bg-primary" style={{ width: `${s.progress}%` }} />
                                                            </div>
                                                            <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">
                                                                {s.items_counted}/{s.items_total}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-2 text-right tabular-nums md:table-cell">
                                                    {s.status === 'committed' ? (
                                                        <span
                                                            className={cn(
                                                                'font-bold',
                                                                s.items_adjusted > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                                                            )}
                                                        >
                                                            {s.items_adjusted}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs text-muted-foreground lg:table-cell">
                                                    {s.committed_at ?? s.created_at}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={Clock} title="Continue counting" className="self-start">
                        {draft.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">No count in progress.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {draft.map((s) => (
                                    <li key={s.id}>
                                        <button
                                            onClick={() => router.visit(routes.stockCount.show(s.id))}
                                            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-muted/30"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-semibold">{s.name}</span>
                                                <span className="block text-[11px] text-muted-foreground">
                                                    {s.items_counted} of {s.items_total} counted
                                                </span>
                                            </span>
                                            <span className="text-xs font-bold text-primary tabular-nums">{s.progress}%</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                </div>
            </div>

            <NewCountModal
                open={newOpen}
                onClose={() => setNewOpen(false)}
                categories={categories}
                branchId={branch_id}
                branches={branches}
                isAdmin={is_admin}
            />
        </AdminLayout>
    );
}
