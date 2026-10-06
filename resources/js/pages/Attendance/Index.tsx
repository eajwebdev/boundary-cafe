import { Head, router, usePage } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Fingerprint, Loader2, LocateFixed, MapPin, ScanFace, Users, XCircle } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

import {
    Chip,
    controlCls,
    EmptyRow,
    FormField,
    inputCls,
    PageHeader,
    Panel,
    Stat,
    StatStrip,
    StatusPill,
    thCls,
    useFlashToasts,
} from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AdminLayout from '@/layouts/AdminLayout';
import { getPosition } from '@/lib/face-capture';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

const GeofenceMap = lazy(() => import('@/components/GeofenceMap'));

interface Log {
    id: number;
    time: string;
    type: 'in' | 'out';
    status: 'accepted' | 'rejected';
    reason: string | null;
    distance_m: number | null;
    accuracy_m: number | null;
    face_distance: number | null;
    has_photo: boolean;
    employee: { id: number; name: string; code: string; position: string | null } | null;
    branch: string | null;
}

interface BranchArea {
    id: number;
    name: string;
    code: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    radius_m: number;
}

interface PageProps {
    logs: Log[];
    stats: { present: number; on_duty: number; punches: number; rejected: number; employees: number };
    branches: BranchArea[];
    filters: { date: string; branch_id: number | null; status: string | null };
    face_threshold: number;
    is_admin: boolean;
    [key: string]: unknown;
}

export default function AttendanceIndex() {
    const { logs, stats, branches, filters, face_threshold, is_admin } = usePage<PageProps>().props;
    useFlashToasts();

    const [editingArea, setEditingArea] = useState<BranchArea | null>(null);
    const [viewing, setViewing] = useState<Log | null>(null);

    const visit = (changes: Record<string, string | number | null | undefined>) =>
        router.get(
            routes.attendance.index(),
            { date: filters.date, branch_id: filters.branch_id ?? undefined, status: filters.status ?? undefined, ...changes },
            { preserveState: true, preserveScroll: true },
        );

    const unset = branches.filter((b) => b.latitude === null);

    return (
        <AdminLayout>
            <Head title="Attendance" />

            <div className="space-y-4">
                <PageHeader title="Attendance" subtitle="Time in and out from the employee time clock, checked by location and face.">
                    <input
                        type="date"
                        value={filters.date}
                        onChange={(e) => visit({ date: e.target.value })}
                        className={cn(controlCls, 'h-9')}
                        aria-label="Date"
                    />
                    {is_admin && branches.length > 1 && (
                        <select
                            value={filters.branch_id ?? ''}
                            onChange={(e) => visit({ branch_id: e.target.value || undefined })}
                            className={cn(controlCls, 'h-9')}
                            aria-label="Branch"
                        >
                            <option value="">All branches</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <a
                        href={routes.timeClock.show()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <ExternalLink className="h-4 w-4" /> Time clock
                    </a>
                </PageHeader>

                <StatStrip count={5}>
                    <Stat icon={Users} label="Came in" value={`${stats.present} of ${stats.employees}`} />
                    <Stat icon={Clock} label="On duty now" value={stats.on_duty.toLocaleString()} tone="success" />
                    <Stat icon={Fingerprint} label="Time ins / outs" value={stats.punches.toLocaleString()} />
                    <Stat
                        icon={AlertTriangle}
                        label="Rejected attempts"
                        value={stats.rejected.toLocaleString()}
                        tone={stats.rejected > 0 ? 'warning' : undefined}
                    />
                    <Stat
                        icon={MapPin}
                        label="Branches without area"
                        value={unset.length.toLocaleString()}
                        tone={unset.length > 0 ? 'warning' : undefined}
                    />
                </StatStrip>

                <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                    <Panel
                        flush
                        icon={Fingerprint}
                        title="Time log"
                        actions={
                            <div className="flex gap-1">
                                <Chip active={!filters.status} onClick={() => visit({ status: undefined })}>
                                    All
                                </Chip>
                                <Chip active={filters.status === 'rejected'} onClick={() => visit({ status: 'rejected' })}>
                                    Rejected only
                                </Chip>
                            </div>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border">
                                    <tr>
                                        <th className={thCls}>Time</th>
                                        <th className={thCls}>Employee</th>
                                        <th className={thCls}>Action</th>
                                        <th className={cn(thCls, 'hidden md:table-cell')}>Location</th>
                                        <th className={cn(thCls, 'hidden md:table-cell')}>Face</th>
                                        <th className="w-14" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {logs.length === 0 ? (
                                        <EmptyRow colSpan={6} icon={Fingerprint}>
                                            Nobody clocked in or out on this day.
                                        </EmptyRow>
                                    ) : (
                                        logs.map((log) => (
                                            <tr key={log.id} className={cn('hover:bg-muted/30', log.status === 'rejected' && 'bg-red-500/[0.03]')}>
                                                <td className="px-4 py-2 font-semibold whitespace-nowrap tabular-nums">{log.time}</td>
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{log.employee?.name ?? 'Removed employee'}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        <span className="font-mono">{log.employee?.code}</span>
                                                        {log.branch && ` · ${log.branch}`}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-2">
                                                    {log.status === 'accepted' ? (
                                                        <StatusPill tone={log.type === 'in' ? 'success' : 'info'}>
                                                            <CheckCircle2 className="h-3 w-3" /> Time {log.type}
                                                        </StatusPill>
                                                    ) : (
                                                        <StatusPill tone="danger" className="max-w-64 whitespace-normal">
                                                            <XCircle className="h-3 w-3 shrink-0" /> Rejected time {log.type}
                                                        </StatusPill>
                                                    )}
                                                    {log.reason && <p className="mt-0.5 max-w-72 text-[11px] text-muted-foreground">{log.reason}</p>}
                                                </td>
                                                <td className="hidden px-4 py-2 text-xs tabular-nums md:table-cell">
                                                    {log.distance_m !== null ? `${log.distance_m} m away` : '—'}
                                                    {log.accuracy_m !== null && (
                                                        <span className="block text-[11px] text-muted-foreground">GPS ±{log.accuracy_m} m</span>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-2 md:table-cell">
                                                    {log.face_distance !== null ? (
                                                        <StatusPill tone={log.face_distance <= face_threshold ? 'success' : 'danger'}>
                                                            <ScanFace className="h-3 w-3" />{' '}
                                                            {log.face_distance <= face_threshold ? 'Match' : 'No match'} ·{' '}
                                                            {log.face_distance.toFixed(2)}
                                                        </StatusPill>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                                <td className="px-2 py-2">
                                                    {log.has_photo && (
                                                        <button onClick={() => setViewing(log)} className="block" aria-label="View photo">
                                                            <img
                                                                src={routes.attendance.photo(log.id)}
                                                                alt=""
                                                                loading="lazy"
                                                                className="h-9 w-9 rounded-lg object-cover ring-1 ring-border hover:ring-primary"
                                                            />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>

                    <Panel flush icon={MapPin} title="Clock-in areas" className="self-start">
                        <ul className="divide-y divide-border">
                            {branches.map((b) => (
                                <li key={b.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold">{b.name}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {b.latitude !== null ? (
                                                <>
                                                    Within {b.radius_m} m · {b.latitude.toFixed(5)}, {b.longitude?.toFixed(5)}
                                                </>
                                            ) : (
                                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                                    Not set: staff cannot clock in yet
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={b.latitude === null ? 'default' : 'outline'}
                                        className="h-7 px-2.5 text-xs"
                                        onClick={() => setEditingArea(b)}
                                    >
                                        {b.latitude === null ? 'Set' : 'Edit'}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                </div>
            </div>

            {editingArea && <AreaDialog branch={editingArea} onClose={() => setEditingArea(null)} />}

            <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
                <DialogContent className="max-w-sm">
                    {viewing && (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {viewing.employee?.name} · time {viewing.type} {viewing.time}
                                </DialogTitle>
                                <DialogDescription>Photo taken by the time clock.</DialogDescription>
                            </DialogHeader>
                            <div className="grid grid-cols-2 gap-2 text-center text-[11px] font-semibold text-muted-foreground">
                                <div>
                                    <img
                                        src={routes.attendance.photo(viewing.id)}
                                        alt="At time clock"
                                        className="aspect-square w-full rounded-lg object-cover"
                                    />
                                    At the time clock
                                </div>
                                {viewing.employee && (
                                    <div>
                                        <img
                                            src={routes.employees.face(viewing.employee.id)}
                                            alt="Enrolled face"
                                            className="aspect-square w-full rounded-lg object-cover"
                                        />
                                        Enrolled face
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}

// ─── Branch clock-in area ────────────────────────────────────────────────────

function AreaDialog({ branch, onClose }: { branch: BranchArea; onClose: () => void }) {
    const [latitude, setLatitude] = useState<number | null>(branch.latitude);
    const [longitude, setLongitude] = useState<number | null>(branch.longitude);
    const [radius, setRadius] = useState(branch.radius_m || 100);
    const [locating, setLocating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const useMyLocation = async () => {
        setLocating(true);
        setError(null);
        try {
            const pos = await getPosition();
            setLatitude(Number(pos.latitude.toFixed(7)));
            setLongitude(Number(pos.longitude.toFixed(7)));
            if (pos.accuracy > 50)
                setError(`Your device's location is only accurate to ±${Math.round(pos.accuracy)} m. Fine-tune it by clicking the map.`);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLocating(false);
        }
    };

    const save = () => {
        if (latitude === null || longitude === null) return;
        setSaving(true);
        router.patch(
            routes.attendance.location(branch.id),
            { latitude, longitude, geofence_radius_m: radius },
            {
                preserveScroll: true,
                onSuccess: onClose,
                onError: (errs) => setError(Object.values(errs)[0] ?? 'Could not save.'),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Clock-in area · {branch.name}</DialogTitle>
                    <DialogDescription>
                        Click the map on the branch (or stand at the branch and use your location). Staff can only clock in inside the orange circle.
                    </DialogDescription>
                </DialogHeader>

                <div className="h-80 overflow-hidden rounded-xl border border-border">
                    <Suspense
                        fallback={
                            <div className="flex h-full items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                        }
                    >
                        <GeofenceMap
                            latitude={latitude}
                            longitude={longitude}
                            radiusM={radius}
                            onPick={(lat, lng) => {
                                setLatitude(lat);
                                setLongitude(lng);
                            }}
                        />
                    </Suspense>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <FormField label="Latitude">
                        <input
                            type="number"
                            step="0.0000001"
                            value={latitude ?? ''}
                            onChange={(e) => setLatitude(e.target.value === '' ? null : Number(e.target.value))}
                            className={cn(inputCls, 'tabular-nums')}
                        />
                    </FormField>
                    <FormField label="Longitude">
                        <input
                            type="number"
                            step="0.0000001"
                            value={longitude ?? ''}
                            onChange={(e) => setLongitude(e.target.value === '' ? null : Number(e.target.value))}
                            className={cn(inputCls, 'tabular-nums')}
                        />
                    </FormField>
                    <FormField label={`Area size: ${radius} m radius`} className="col-span-2">
                        <input
                            type="range"
                            min={20}
                            max={500}
                            step={10}
                            value={radius}
                            onChange={(e) => setRadius(Number(e.target.value))}
                            className="mt-2.5 w-full accent-primary"
                        />
                    </FormField>
                </div>

                {error && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-400">{error}</p>}

                <DialogFooter className="sm:justify-between">
                    <Button variant="outline" onClick={useMyLocation} disabled={locating} className="gap-1.5">
                        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Use my current location
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={save} disabled={saving || latitude === null || longitude === null}>
                            {saving ? 'Saving…' : 'Save area'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
