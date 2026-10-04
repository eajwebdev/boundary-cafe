'use client';

import { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { routes } from '@/routes';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardCheck, Plus, CheckCircle2, Clock, XCircle, ChevronRight, Package, LayoutList, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

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
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Session['status'] }) {
    if (status === 'committed')
        return (
            <Badge variant="outline" className="gap-1 border-green-300 text-green-600">
                <CheckCircle2 className="h-3 w-3" /> Committed
            </Badge>
        );
    if (status === 'cancelled')
        return (
            <Badge variant="outline" className="gap-1 border-border text-muted-foreground">
                <XCircle className="h-3 w-3" /> Cancelled
            </Badge>
        );
    return (
        <Badge variant="outline" className="gap-1 border-orange-300 text-orange-600">
            <Clock className="h-3 w-3" /> In Progress
        </Badge>
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

    function handleBranchChange(val: string) {
        router.get(routes.stockCount.index(), { branch_id: val }, { preserveState: false });
    }

    return (
        <AdminLayout>
            <Head title="Stock Count" />
            <div className="mx-auto max-w-4xl space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-wrap items-center gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold">
                            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                            Stock Count
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Physical inventory — count daily, weekly, or monthly while sales continue
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {is_admin && branches.length > 0 && (
                            <Select value={String(branch_id)} onValueChange={handleBranchChange}>
                                <SelectTrigger className="h-8 w-44 text-sm">
                                    <SelectValue placeholder="Branch" />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Button size="sm" onClick={() => setNewOpen(true)}>
                            <Plus className="mr-1 h-4 w-4" />
                            New Count
                        </Button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-orange-600">{draft.length}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">In Progress</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold text-green-600">{committed.length}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Committed</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4 pb-3 text-center">
                            <p className="text-2xl font-bold">{sessions.length}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">Total</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Sessions table */}
                {sessions.length === 0 ? (
                    <Card>
                        <CardContent className="py-16 text-center text-sm text-muted-foreground">
                            No count sessions yet.
                            <br />
                            <Button variant="link" className="mt-1 h-auto p-0 text-sm" onClick={() => setNewOpen(true)}>
                                Start your first count
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40">
                                    <TableHead>Session</TableHead>
                                    <TableHead className="hidden sm:table-cell">Type</TableHead>
                                    <TableHead className="w-40 text-right">Progress</TableHead>
                                    <TableHead className="hidden w-24 text-right md:table-cell">Adjusted</TableHead>
                                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessions.map((s) => (
                                    <TableRow
                                        key={s.id}
                                        className={cn('cursor-pointer hover:bg-muted/30', s.status === 'cancelled' && 'opacity-50')}
                                        onClick={() => router.visit(routes.stockCount.show(s.id))}
                                    >
                                        <TableCell>
                                            <p className="text-sm font-medium">{s.name}</p>
                                            <div className="mt-0.5 flex items-center gap-2">
                                                <StatusBadge status={s.status} />
                                                <span className="text-xs text-muted-foreground">{s.counted_by}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <Badge variant="secondary" className="text-xs capitalize">
                                                {s.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {s.status !== 'cancelled' && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                                        <div
                                                            className="h-full rounded-full bg-primary transition-all"
                                                            style={{ width: `${s.progress}%` }}
                                                        />
                                                    </div>
                                                    <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                                                        {s.items_counted}/{s.items_total}
                                                    </span>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden text-right md:table-cell">
                                            {s.status === 'committed' && s.items_adjusted > 0 ? (
                                                <Badge variant="outline" className="border-orange-300 text-orange-600">
                                                    {s.items_adjusted}
                                                </Badge>
                                            ) : s.status === 'committed' ? (
                                                <Badge variant="outline" className="border-green-300 text-green-600">
                                                    0
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                                            {s.committed_at ?? s.created_at}
                                        </TableCell>
                                        <TableCell>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Card>
                )}
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
