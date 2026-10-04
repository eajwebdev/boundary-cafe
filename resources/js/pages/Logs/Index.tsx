'use client';

import { Head, router, usePage } from '@inertiajs/react';
import AdminLayout from '@/layouts/AdminLayout';
import { useMemo, useState, useCallback, useEffect } from 'react';
import { ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, SortingState, PaginationState, useReactTable } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, Info, Filter, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns';
import { fmtDate, manilaNow } from '@/lib/date';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────── Types
interface ActivityLog {
    id: number;
    user_id: number | null;
    action: string;
    subject_type: string | null;
    subject_id: number | null;
    properties: Record<string, any>;
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
    filters: Record<string, any>;
}

// ──────────────────────────────────────────────── Component
export default function LogsIndex() {
    const { props } = usePage<PageProps>();
    const { logs, users = {}, usersForFilter = [], actions = [], filters = {} } = props;

    const [selectedUser, setSelectedUser] = useState<string | undefined>(filters.user_id ? String(filters.user_id) : 'all');

    // Treat backend "0" or missing action as "all" in UI
    const [selectedAction, setSelectedAction] = useState<string | undefined>(filters.action === '0' || !filters.action ? 'all' : filters.action);

    const [dateRange, setDateRange] = useState<DateRange | undefined>(
        filters.from && filters.to ? { from: new Date(filters.from), to: new Date(filters.to) } : undefined,
    );

    const [sorting, setSorting] = useState<SortingState>(filters.sort ? [{ id: filters.sort, desc: filters.direction === 'desc' }] : []);

    const [isLoading, setIsLoading] = useState(false);

    const pagination: PaginationState = {
        pageIndex: (logs.current_page ?? 1) - 1,
        pageSize: logs.per_page ?? 10,
    };

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
                id: 'rowNumber',
                header: '#',
                size: 60,
                cell: ({ row }) => <div className="text-center text-muted-foreground">{(logs.from ?? 0) + row.index}</div>,
            },
            {
                accessorKey: 'created_at',
                header: 'Date / Time',
                cell: ({ row }) => {
                    return (
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span>{fmtDate(row.original.created_at, 'MMM d, yyyy • h:mm a')}</span>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'action',
                header: 'Action',
                cell: ({ row }) => {
                    const action = row.original.action;
                    const colorMap: Record<string, string> = {
                        user_created: 'bg-green-100 text-green-800 border-green-200',
                        user_updated: 'bg-blue-100 text-blue-800 border-blue-200',
                        user_deleted: 'bg-red-100 text-red-800 border-red-200',
                        category_created: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                        category_updated: 'bg-cyan-100 text-cyan-800 border-cyan-200',
                        category_deleted: 'bg-rose-100 text-rose-800 border-rose-200',
                    };
                    return (
                        <Badge
                            variant="outline"
                            className={cn('px-2.5 py-0.5 text-xs font-medium', colorMap[action] || 'border-gray-200 bg-gray-100 text-gray-800')}
                        >
                            {action.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                    );
                },
                size: 180,
            },
            {
                id: 'actor',
                header: 'Performed By',
                cell: ({ row }) => {
                    const uid = row.original.user_id;
                    const name = uid ? userMap[uid] || `User #${uid}` : 'System / Guest';
                    return (
                        <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{name}</span>
                        </div>
                    );
                },
                size: 220,
            },
            {
                id: 'target',
                header: 'Target',
                cell: ({ row }) => {
                    const type = row.original.subject_type?.split('\\').pop() || '—';
                    const id = row.original.subject_id;
                    return (
                        <div className="text-muted-foreground">
                            {type} {id ? <span className="font-mono text-xs">#{id}</span> : ''}
                        </div>
                    );
                },
                size: 180,
            },
            {
                id: 'properties',
                header: 'Details',
                cell: ({ row }) => {
                    const props = row.original.properties || {};
                    const hasData = Object.keys(props).length > 0;
                    return (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={!hasData}>
                                    <Info className="h-4 w-4" />
                                    <span className="hidden sm:inline">Details</span>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="max-h-[80vh] w-96 overflow-auto p-4 text-sm">
                                <pre className="rounded border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                                    {JSON.stringify(props, null, 2)}
                                </pre>
                            </PopoverContent>
                        </Popover>
                    );
                },
                size: 120,
            },
            {
                accessorKey: 'ip_address',
                header: 'IP',
                cell: ({ row }) => <div className="font-mono text-xs text-muted-foreground">{row.original.ip_address || '—'}</div>,
                size: 140,
            },
        ],
        [userMap, logs.from],
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
        const state = table.getState();

        const params: Record<string, any> = {
            page: state.pagination.pageIndex + 1,
            per_page: state.pagination.pageSize,
            user_id: selectedUser !== 'all' ? selectedUser : undefined,
            // Send "0" when user wants ALL actions
            action: selectedAction === 'all' ? '0' : selectedAction,
        };

        if (dateRange?.from) {
            params.from = format(dateRange.from, 'yyyy-MM-dd');
        }
        if (dateRange?.to) {
            params.to = format(dateRange.to, 'yyyy-MM-dd');
        }

        if (sorting.length > 0) {
            params.sort = sorting[0].id;
            params.direction = sorting[0].desc ? 'desc' : 'asc';
        }

        router.get(route('logs.index'), params, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onFinish: () => setIsLoading(false),
        });
    }, [table, selectedUser, selectedAction, dateRange, sorting, route]);

    useEffect(() => {
        const timer = setTimeout(navigate, 350);
        return () => clearTimeout(timer);
    }, [navigate]);

    const resetFilters = () => {
        setSelectedUser('all');
        setSelectedAction('all');
        setDateRange(undefined);
        setSorting([]);
        table.setPageIndex(0);
        table.setPageSize(10);
    };

    const setPreset = (preset: string) => {
        const today = startOfDay(manilaNow());
        let range: DateRange | undefined;

        switch (preset) {
            case 'today':
                range = { from: today, to: endOfDay(today) };
                break;
            case 'yesterday':
                const yesterday = subDays(today, 1);
                range = { from: startOfDay(yesterday), to: endOfDay(yesterday) };
                break;
            case 'last7':
                range = { from: subDays(today, 7), to: today };
                break;
            case 'last30':
                range = { from: subDays(today, 30), to: today };
                break;
            case 'thisMonth':
                range = { from: startOfMonth(today), to: today };
                break;
            default:
                range = undefined;
        }

        setDateRange(range);
    };

    return (
        <AdminLayout>
            <Head title="Activity Logs" />

            <div className="space-y-6 p-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Activity Logs</h1>
                        <p className="mt-1.5 flex items-center gap-2 text-muted-foreground">
                            <span>{logs.total ?? 0} entries loaded</span>
                            <Badge variant="secondary" className="text-xs">
                                Page {logs.current_page ?? 1} of {logs.last_page ?? 1}
                            </Badge>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-sm whitespace-nowrap text-muted-foreground">Rows per page</span>
                        <Select value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))}>
                            <SelectTrigger className="w-24">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[5, 10, 25, 50, 100].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Filters */}
                <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Filter className="h-5 w-5 text-primary" />
                            Filter Logs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <Label className="mb-1.5 block text-sm font-medium">Performed By</Label>
                                <Select value={selectedUser ?? 'all'} onValueChange={(v) => setSelectedUser(v === 'all' ? 'all' : v)}>
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="All users" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All users</SelectItem>
                                        {usersForFilter.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="mb-1.5 block text-sm font-medium">Action</Label>
                                <Select value={selectedAction ?? 'all'} onValueChange={(v) => setSelectedAction(v)}>
                                    <SelectTrigger className="h-10">
                                        <SelectValue placeholder="All actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All actions</SelectItem>
                                        {actions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="col-span-full md:col-span-2 lg:col-span-2">
                                <Label className="mb-1.5 block text-sm font-medium">Date Range</Label>
                                <div className="flex items-center gap-2">
                                    <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
                                    {dateRange && (
                                        <Button variant="ghost" size="sm" onClick={() => setDateRange(undefined)} className="h-10 px-2">
                                            Clear
                                        </Button>
                                    )}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {[
                                        { label: 'Today', value: 'today' },
                                        { label: 'Yesterday', value: 'yesterday' },
                                        { label: 'Last 7 days', value: 'last7' },
                                        { label: 'Last 30 days', value: 'last30' },
                                        { label: 'This month', value: 'thisMonth' },
                                    ].map((preset) => (
                                        <Button
                                            key={preset.value}
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPreset(preset.value)}
                                            className={cn('text-xs', dateRange && 'border-primary text-primary')}
                                        >
                                            {preset.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <Button variant="outline" size="sm" onClick={resetFilters}>
                                Reset Filters
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <Clock className="h-5 w-5 text-primary" />
                            Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="relative p-0">
                        {isLoading && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-lg bg-background/60">
                                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map((hg) => (
                                        <TableRow key={hg.id}>
                                            {hg.headers.map((h) => (
                                                <TableHead
                                                    key={h.id}
                                                    className={cn(
                                                        h.column.getCanSort() ? 'cursor-pointer transition-colors select-none hover:bg-muted/50' : '',
                                                        h.column.id === 'rowNumber' && 'text-center',
                                                    )}
                                                    onClick={h.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(h.column.columnDef.header, h.getContext())}
                                                    {h.column.getIsSorted() && (
                                                        <span className="ml-1">{h.column.getIsSorted() === 'asc' ? '↑' : '↓'}</span>
                                                    )}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id} className="transition-colors hover:bg-muted/30">
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id} className="py-3">
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={columns.length} className="h-64 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center justify-center gap-2 py-8">
                                                    <Filter className="h-10 w-10 text-muted-foreground/50" />
                                                    <p className="text-lg font-medium">No logs found</p>
                                                    <p className="text-sm">No activity logs match your current filters.</p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => router.reload({ preserveScroll: true })}
                                                        className="mt-4"
                                                    >
                                                        Refresh Page
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination */}
                        <div className="flex flex-col items-center justify-between gap-4 border-t bg-muted/20 px-6 py-4 text-sm sm:flex-row">
                            <div className="text-muted-foreground">
                                Showing{' '}
                                <strong>
                                    {logs.from ?? 0}–{logs.to ?? 0}
                                </strong>{' '}
                                of <strong>{logs.total ?? 0}</strong> entries
                            </div>

                            <div className="flex items-center gap-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage() || isLoading}
                                >
                                    Previous
                                </Button>

                                <div className="text-sm font-medium">
                                    Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                                </div>

                                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage() || isLoading}>
                                    Next
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}
