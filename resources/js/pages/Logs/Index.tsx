'use client';

import { Head, router, usePage } from '@inertiajs/react';
import type { ColumnDef, SortingState, PaginationState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { endOfDay, format, startOfDay, startOfMonth, subDays } from 'date-fns';
import { Clock, History, Info, Loader2, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DateRange } from 'react-day-picker';
import { Chip, controlCls, EmptyRow, PageHeader, Panel, SimplePager, Stat, StatStrip, StatusPill, thCls } from '@/components/AdminKit';
import type { Tone } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate, manilaNow } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

// ──────────────────────────────────────────────── Types
interface ActivityLog {
    id: number;
    user_id: number | null;
    action: string;
    subject_type: string | null;
    subject_id: number | null;
    properties: Record<string, unknown>;
    ip_address: string | null;
    user_agent: string | null;
    method: string | null;
    url: string | null;
    created_at: string;
    user?: { id: number; fname: string; lname: string; username: string } | null;
}

interface PaginatedLogs {
    data: ActivityLog[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

interface FilterOption {
    value: string;
    label: string;
}

interface PageProps {
    logs: PaginatedLogs;
    users: Record<number, ActivityLog['user']>;
    usersForFilter: FilterOption[];
    actions: FilterOption[];
    filters: Record<string, string | undefined>;
    [key: string]: unknown;
}

const PRESETS = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 days', value: 'last7' },
    { label: 'Last 30 days', value: 'last30' },
    { label: 'This month', value: 'thisMonth' },
];

/** Colour an action by what it did: created / updated / deleted / anything else. */
function actionTone(action: string): Tone {
    if (/(created|opened|approved|completed|added)$/.test(action)) return 'success';
    if (/(updated|changed|toggled|adjusted)$/.test(action)) return 'info';
    if (/(deleted|voided|rejected|cancelled|closed|removed)$/.test(action)) return 'danger';
    return 'muted';
}

function presetRange(preset: string): DateRange | undefined {
    const today = startOfDay(manilaNow());
    switch (preset) {
        case 'today':
            return { from: today, to: endOfDay(today) };
        case 'yesterday': {
            const yesterday = subDays(today, 1);
            return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
        }
        case 'last7':
            return { from: subDays(today, 7), to: today };
        case 'last30':
            return { from: subDays(today, 30), to: today };
        case 'thisMonth':
            return { from: startOfMonth(today), to: today };
        default:
            return undefined;
    }
}

// ──────────────────────────────────────────────── Component
export default function LogsIndex() {
    const { props } = usePage<PageProps>();
    const { logs, users = {}, usersForFilter = [], actions = [], filters = {} } = props;

    const [selectedUser, setSelectedUser] = useState<string>(filters.user_id ? String(filters.user_id) : 'all');
    // Treat backend "0" or missing action as "all" in UI
    const [selectedAction, setSelectedAction] = useState<string>(filters.action === '0' || !filters.action ? 'all' : filters.action);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        filters.from && filters.to ? { from: new Date(filters.from), to: new Date(filters.to) } : undefined,
    );
    const [preset, setPreset] = useState('');
    const [sorting, setSorting] = useState<SortingState>(filters.sort ? [{ id: filters.sort, desc: filters.direction === 'desc' }] : []);
    const [page, setPage] = useState(logs.current_page ?? 1);
    const [perPage, setPerPage] = useState(logs.per_page ?? 10);
    const [isLoading, setIsLoading] = useState(false);

    const pagination: PaginationState = { pageIndex: page - 1, pageSize: perPage };

    const userMap = useMemo<Record<number, string>>(() => {
        const map: Record<number, string> = {};
        Object.values(users).forEach((u) => {
            if (u) map[u.id] = [u.fname, u.lname].filter(Boolean).join(' ') || u.username || `User #${u.id}`;
        });
        return map;
    }, [users]);

    const columns = useMemo<ColumnDef<ActivityLog>[]>(
        () => [
            {
                accessorKey: 'created_at',
                header: 'When',
                cell: ({ row }) => <span className="text-xs whitespace-nowrap">{fmtDate(row.original.created_at, 'MMM d, yyyy · h:mm a')}</span>,
            },
            {
                accessorKey: 'action',
                header: 'Action',
                cell: ({ row }) => <StatusPill tone={actionTone(row.original.action)}>{row.original.action.replace(/_/g, ' ')}</StatusPill>,
            },
            {
                id: 'actor',
                header: 'By',
                cell: ({ row }) => {
                    const uid = row.original.user_id;
                    return <span className="font-semibold">{uid ? userMap[uid] || `User #${uid}` : 'System'}</span>;
                },
            },
            {
                id: 'target',
                header: 'Record',
                cell: ({ row }) => {
                    const type = row.original.subject_type?.split('\\').pop() || '—';
                    const id = row.original.subject_id;
                    return (
                        <span className="text-xs text-muted-foreground">
                            {type} {id ? <span className="font-mono">#{id}</span> : ''}
                        </span>
                    );
                },
            },
            {
                id: 'properties',
                header: 'Details',
                cell: ({ row }) => {
                    const details = row.original.properties || {};
                    const hasData = Object.keys(details).length > 0;
                    return (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={!hasData}>
                                    <Info className="h-3.5 w-3.5" /> View
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="max-h-[80vh] w-96 overflow-auto p-3 text-sm">
                                <pre className="rounded-lg border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                                    {JSON.stringify(details, null, 2)}
                                </pre>
                            </PopoverContent>
                        </Popover>
                    );
                },
            },
            {
                accessorKey: 'ip_address',
                header: 'IP',
                cell: ({ row }) => <span className="font-mono text-[11px] text-muted-foreground">{row.original.ip_address || '—'}</span>,
            },
        ],
        [userMap],
    );

    const table = useReactTable({
        data: logs.data ?? [],
        columns,
        pageCount: logs.last_page ?? -1,
        rowCount: logs.total ?? 0,
        manualPagination: true,
        manualSorting: true,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        state: { sorting, pagination },
        onSortingChange: setSorting,
    });

    const navigate = useCallback(() => {
        setIsLoading(true);

        const params: Record<string, string | number | undefined> = {
            page,
            per_page: perPage,
            user_id: selectedUser !== 'all' ? selectedUser : undefined,
            // Send "0" when user wants ALL actions
            action: selectedAction === 'all' ? '0' : selectedAction,
            from: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
            to: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
        };

        if (sorting.length > 0) {
            params.sort = sorting[0].id;
            params.direction = sorting[0].desc ? 'desc' : 'asc';
        }

        router.get(routes.logs.index(), params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onFinish: () => setIsLoading(false),
        });
    }, [page, perPage, selectedUser, selectedAction, dateRange, sorting]);

    useEffect(() => {
        const timer = setTimeout(navigate, 350);
        return () => clearTimeout(timer);
    }, [navigate]);

    /** Any filter change starts again from the first page. */
    const filterChanged =
        <T,>(setter: (value: T) => void) =>
        (value: T) => {
            setter(value);
            setPage(1);
        };

    const resetFilters = () => {
        setSelectedUser('all');
        setSelectedAction('all');
        setDateRange(undefined);
        setPreset('');
        setSorting([]);
        setPage(1);
        setPerPage(10);
    };

    const hasFilters = selectedUser !== 'all' || selectedAction !== 'all' || !!dateRange;
    const actorsOnPage = new Set(logs.data.map((log) => log.user_id ?? 0)).size;

    return (
        <AdminLayout>
            <Head title="Activity Logs" />

            <div className="space-y-4">
                <PageHeader title="Activity Logs" subtitle="Who did what in the back office, newest first." />

                <StatStrip count={3}>
                    <Stat icon={History} label={hasFilters ? 'Matching entries' : 'Entries'} value={(logs.total ?? 0).toLocaleString()} />
                    <Stat icon={Users} label="People · this page" value={actorsOnPage.toLocaleString()} />
                    <Stat
                        icon={Clock}
                        label="Latest"
                        value={logs.data[0] ? fmtDate(logs.data[0].created_at, 'MMM d, h:mm a') : '—'}
                        tone={logs.data[0] ? undefined : 'muted'}
                    />
                </StatStrip>

                <Panel
                    flush
                    icon={History}
                    title="Activity"
                    actions={
                        hasFilters && (
                            <button
                                onClick={resetFilters}
                                className="h-7 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                Clear filters
                            </button>
                        )
                    }
                >
                    <div className="space-y-2 border-b border-border bg-muted/20 px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={selectedUser}
                                onChange={(e) => filterChanged(setSelectedUser)(e.target.value)}
                                className={controlCls}
                                aria-label="Performed by"
                            >
                                <option value="all">Everyone</option>
                                {usersForFilter.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={selectedAction}
                                onChange={(e) => filterChanged(setSelectedAction)(e.target.value)}
                                className={controlCls}
                                aria-label="Action"
                            >
                                <option value="all">All actions</option>
                                {actions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <div className="min-w-60">
                                <DateRangePicker
                                    dateRange={dateRange}
                                    onDateRangeChange={(range) => {
                                        filterChanged(setDateRange)(range);
                                        setPreset('');
                                    }}
                                />
                            </div>
                            <select
                                value={perPage}
                                onChange={(e) => filterChanged(setPerPage)(Number(e.target.value))}
                                className={cn(controlCls, 'ml-auto')}
                                aria-label="Rows per page"
                            >
                                {[10, 25, 50, 100].map((size) => (
                                    <option key={size} value={size}>
                                        {size} / page
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {PRESETS.map((option) => (
                                <Chip
                                    key={option.value}
                                    active={preset === option.value}
                                    onClick={() => {
                                        filterChanged(setDateRange)(presetRange(option.value));
                                        setPreset(option.value);
                                    }}
                                >
                                    {option.label}
                                </Chip>
                            ))}
                        </div>
                    </div>

                    <div className="relative overflow-x-auto">
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        )}
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                {table.getHeaderGroups().map((hg) => (
                                    <tr key={hg.id}>
                                        {hg.headers.map((h) => (
                                            <th
                                                key={h.id}
                                                className={cn(thCls, h.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground')}
                                                onClick={h.column.getToggleSortingHandler()}
                                            >
                                                {flexRender(h.column.columnDef.header, h.getContext())}
                                                {h.column.getIsSorted() && (
                                                    <span className="ml-1">{h.column.getIsSorted() === 'asc' ? '↑' : '↓'}</span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                ))}
                            </thead>
                            <tbody className="divide-y divide-border">
                                {table.getRowModel().rows.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <tr key={row.id} className="hover:bg-muted/30">
                                            {row.getVisibleCells().map((cell) => (
                                                <td key={cell.id} className="px-4 py-2">
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                ) : (
                                    <EmptyRow colSpan={columns.length} icon={History}>
                                        No activity matches these filters.
                                    </EmptyRow>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {(logs.last_page ?? 1) > 1 && (
                        <SimplePager
                            from={logs.from}
                            to={logs.to}
                            total={logs.total ?? 0}
                            page={logs.current_page ?? page}
                            lastPage={logs.last_page ?? 1}
                            onPage={setPage}
                        />
                    )}
                </Panel>
            </div>
        </AdminLayout>
    );
}
