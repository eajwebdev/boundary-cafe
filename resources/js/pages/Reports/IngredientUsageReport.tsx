import { router } from '@inertiajs/react';
import { Head } from '@inertiajs/react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ChevronDown, ChevronRight, Download, FlaskConical, Package, Trophy } from 'lucide-react';
import { Fragment, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { BranchSelect, Chip, EmptyRow, FilterBar, PageHeader, Panel, Stat, StatStrip, thCls } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import AdminLayout from '@/layouts/AdminLayout';
import { cn } from '@/lib/utils';
import { reportRoutes, getReportTitle, openLivePdfPreview } from './Files';

interface UsageItem {
    ingredient_id: number;
    ingredient_name: string;
    unit: string;
    total_used: number;
    recipes_used_in: Array<{
        product_name: string;
        quantity_per_unit: number;
        total_sold: number;
    }>;
}

interface Props {
    usage: UsageItem[];
    branches: Array<{ id: number; name: string }> | null;
}

const QUICK_RANGES: { label: string; range: () => DateRange }[] = [
    { label: 'Last 7 days', range: () => ({ from: subDays(new Date(), 6), to: new Date() }) },
    { label: 'Last 30 days', range: () => ({ from: subDays(new Date(), 29), to: new Date() }) },
    { label: 'This month', range: () => ({ from: startOfMonth(new Date()), to: new Date() }) },
    { label: 'Last month', range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
];

const amount = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function IngredientUsageReport({ usage, branches }: Props) {
    const today = new Date();

    const [branchId, setBranchId] = useState<number | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(today, 6),
        to: today,
    });
    const [quickRange, setQuickRange] = useState('Last 7 days');
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const getParams = () => ({
        branch_id: branchId,
        from_date: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        to_date: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
    });

    const handleGenerate = () => {
        setLoading(true);
        router.get(reportRoutes.ingredientUsage(), getParams(), {
            preserveState: true,
            preserveScroll: true,
            onFinish: () => setLoading(false),
        });
    };

    const toggleExpand = (id: number) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const products = new Set(usage.flatMap((item) => item.recipes_used_in.map((r) => r.product_name))).size;
    const top = usage.slice(0, 5);

    return (
        <AdminLayout>
            <Head title={getReportTitle('ingredient-usage')} />

            <div className="space-y-4">
                <PageHeader title={getReportTitle('ingredient-usage')} subtitle="How much of each ingredient went into what was sold.">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5"
                        disabled={usage.length === 0}
                        onClick={() => openLivePdfPreview('ingredient-usage', getParams())}
                    >
                        <Download className="h-4 w-4" /> PDF preview
                    </Button>
                </PageHeader>

                <FilterBar onApply={handleGenerate} loading={loading} disabled={!dateRange?.from} applyLabel="Show usage">
                    <BranchSelect branches={branches} value={branchId} onChange={(v) => setBranchId(v ? Number(v) : undefined)} />
                    <div className="min-w-60">
                        <DateRangePicker
                            dateRange={dateRange}
                            onDateRangeChange={(range) => {
                                setDateRange(range);
                                setQuickRange('');
                            }}
                        />
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {QUICK_RANGES.map(({ label, range }) => (
                            <Chip
                                key={label}
                                active={quickRange === label}
                                onClick={() => {
                                    setDateRange(range());
                                    setQuickRange(label);
                                }}
                            >
                                {label}
                            </Chip>
                        ))}
                    </div>
                </FilterBar>

                <StatStrip count={3}>
                    <Stat icon={FlaskConical} label="Ingredients used" value={usage.length.toLocaleString()} />
                    <Stat icon={Package} label="Products sold" value={products.toLocaleString()} />
                    <Stat
                        icon={Trophy}
                        label="Most consumed"
                        value={usage[0] ? `${usage[0].ingredient_name}` : '—'}
                        tone={usage[0] ? undefined : 'muted'}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
                    <Panel
                        flush
                        icon={FlaskConical}
                        title="Ingredient consumption"
                        actions={<span className="text-[11px] font-semibold text-muted-foreground">click a row for the products</span>}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className="w-8" />
                                        <th className={thCls}>Ingredient</th>
                                        <th className={cn(thCls, 'text-right')}>Used</th>
                                        <th className={cn(thCls, 'text-right')}>In</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {usage.length === 0 ? (
                                        <EmptyRow colSpan={4} icon={FlaskConical}>
                                            No ingredients used in this period. Pick a range and press Show usage.
                                        </EmptyRow>
                                    ) : (
                                        usage.map((item) => {
                                            const open = expanded.has(item.ingredient_id);
                                            return (
                                                <Fragment key={item.ingredient_id}>
                                                    <tr className="cursor-pointer hover:bg-muted/30" onClick={() => toggleExpand(item.ingredient_id)}>
                                                        <td className="py-2 pl-4 text-muted-foreground">
                                                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                        </td>
                                                        <td className="px-4 py-2 font-semibold">{item.ingredient_name}</td>
                                                        <td className="px-4 py-2 text-right font-bold tabular-nums">
                                                            {amount(item.total_used)}{' '}
                                                            <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                                                        </td>
                                                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                                                            {item.recipes_used_in.length} product{item.recipes_used_in.length !== 1 ? 's' : ''}
                                                        </td>
                                                    </tr>
                                                    {open &&
                                                        item.recipes_used_in.map((recipe) => (
                                                            <tr key={recipe.product_name} className="bg-muted/20 text-xs text-muted-foreground">
                                                                <td />
                                                                <td className="px-4 py-1.5 pl-8">{recipe.product_name}</td>
                                                                <td className="px-4 py-1.5 text-right tabular-nums">
                                                                    {amount(recipe.quantity_per_unit)} {item.unit} each
                                                                </td>
                                                                <td className="px-4 py-1.5 text-right tabular-nums">
                                                                    {Number(recipe.total_sold).toLocaleString()} sold
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={Trophy} title="Top 5" className="self-start">
                        {top.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
                        ) : (
                            <ul className="divide-y divide-border">
                                {top.map((item, i) => (
                                    <li key={item.ingredient_id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
                                        <span className="w-4 text-xs font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                                        <span className="min-w-0 flex-1 truncate font-semibold">{item.ingredient_name}</span>
                                        <span className="font-bold tabular-nums">
                                            {amount(item.total_used)} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                                        </span>
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
