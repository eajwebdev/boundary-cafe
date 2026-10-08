import { Head, router, usePage } from '@inertiajs/react';
import {
    Camera,
    CheckCircle2,
    Clock,
    Edit2,
    ExternalLink,
    IdCard,
    KeyRound,
    Loader2,
    Plus,
    ScanFace,
    Search,
    Smartphone,
    Trash2,
    UserX,
    X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

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
import { CameraFeed, useCamera } from '@/components/CameraFeed';
import { confirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import AdminLayout from '@/layouts/AdminLayout';
import { captureFace, findInconsistentSample, MIN_ENROLL_SAMPLES, type FaceCapture } from '@/lib/face-capture';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

interface Employee {
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string | null;
    full_name: string;
    position: string | null;
    phone: string | null;
    branch_id: number | null;
    branch: { id: number; name: string; code: string } | null;
    username: string | null;
    is_active: boolean;
    has_pin: boolean;
    has_face: boolean;
    face_samples: number;
    face_enrolled_at: string | null;
    device_registered_at: string | null;
    today: { type: 'in' | 'out'; time: string } | null;
}

interface PageProps {
    employees: Employee[];
    branches: { id: number; name: string; code: string }[];
    filters: { branch_id: number | null };
    is_admin: boolean;
    [key: string]: unknown;
}

type Filter = 'all' | 'not_ready' | 'on_duty' | 'inactive';

const initials = (e: Employee) => `${e.first_name[0] ?? ''}${e.last_name?.[0] ?? ''}`.toUpperCase();

export default function EmployeesIndex() {
    const { employees, branches, filters, is_admin } = usePage<PageProps>().props;
    useFlashToasts();

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [editing, setEditing] = useState<Employee | 'new' | null>(null);
    const [enrolling, setEnrolling] = useState<Employee | null>(null);

    const active = employees.filter((e) => e.is_active);
    const notReady = active.filter((e) => !e.has_face || !e.has_pin);
    const onDuty = active.filter((e) => e.today?.type === 'in');

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter((e) => {
            if (q && !`${e.full_name} ${e.employee_code} ${e.position ?? ''}`.toLowerCase().includes(q)) return false;
            if (filter === 'not_ready') return e.is_active && (!e.has_face || !e.has_pin);
            if (filter === 'on_duty') return e.today?.type === 'in';
            if (filter === 'inactive') return !e.is_active;
            return true;
        });
    }, [employees, search, filter]);

    const remove = async (e: Employee) => {
        const ok = await confirmDialog({
            title: `Remove ${e.full_name}?`,
            description: 'Employees with attendance history or a staff account are deactivated instead, so their records are kept.',
            confirmLabel: 'Remove',
            tone: 'danger',
        });
        if (ok) router.delete(routes.employees.destroy(e.id), { preserveScroll: true });
    };

    const resetDevice = async (e: Employee) => {
        const ok = await confirmDialog({
            title: `Reset ${e.full_name}'s phone?`,
            description: 'Do this when they change or lose their phone. The next phone they clock in with becomes their registered phone.',
            confirmLabel: 'Reset phone',
        });
        if (ok) router.delete(routes.employees.resetDevice(e.id), { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title="Employees" />

            <div className="space-y-4">
                <PageHeader
                    title="Employees"
                    subtitle="Everyone who clocks in at a branch. Staff users (except administrators) are added here automatically."
                >
                    <a
                        href={routes.timeClock.show()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <ExternalLink className="h-4 w-4" /> Open time clock
                    </a>
                    <Button size="sm" className="h-9 gap-1.5" onClick={() => setEditing('new')}>
                        <Plus className="h-4 w-4" /> Add employee
                    </Button>
                </PageHeader>

                <StatStrip count={5}>
                    <Stat icon={IdCard} label="Active employees" value={active.length.toLocaleString()} />
                    <Stat icon={ScanFace} label="Face enrolled" value={`${active.filter((e) => e.has_face).length} of ${active.length}`} />
                    <Stat icon={KeyRound} label="PIN set" value={`${active.filter((e) => e.has_pin).length} of ${active.length}`} />
                    <Stat
                        icon={UserX}
                        label="Not ready to clock in"
                        value={notReady.length.toLocaleString()}
                        tone={notReady.length > 0 ? 'warning' : undefined}
                    />
                    <Stat icon={Clock} label="On duty now" value={onDuty.length.toLocaleString()} tone="success" />
                </StatStrip>

                <Panel
                    flush
                    icon={IdCard}
                    title="Employee list"
                    actions={
                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                            {is_admin && branches.length > 1 && (
                                <select
                                    value={filters.branch_id ?? ''}
                                    onChange={(e) =>
                                        router.get(routes.employees.index(), { branch_id: e.target.value || undefined }, { preserveState: true })
                                    }
                                    className={controlCls}
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
                            <div className="relative min-w-48 flex-1 sm:w-64 sm:flex-none">
                                <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Name, code or position"
                                    className={cn(controlCls, 'w-full pl-8')}
                                />
                            </div>
                        </div>
                    }
                >
                    <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/20 px-4 py-2">
                        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
                            All <span className="opacity-60">{employees.length}</span>
                        </Chip>
                        <Chip active={filter === 'not_ready'} onClick={() => setFilter('not_ready')}>
                            Needs face or PIN <span className="opacity-60">{notReady.length}</span>
                        </Chip>
                        <Chip active={filter === 'on_duty'} onClick={() => setFilter('on_duty')}>
                            On duty <span className="opacity-60">{onDuty.length}</span>
                        </Chip>
                        <Chip active={filter === 'inactive'} onClick={() => setFilter('inactive')}>
                            Inactive <span className="opacity-60">{employees.length - active.length}</span>
                        </Chip>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-border">
                                <tr>
                                    <th className={thCls}>Employee</th>
                                    <th className={cn(thCls, 'hidden md:table-cell')}>Branch</th>
                                    <th className={thCls}>Ready to clock in</th>
                                    <th className={cn(thCls, 'hidden sm:table-cell')}>Today</th>
                                    <th className="w-28" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {visible.length === 0 ? (
                                    <EmptyRow colSpan={5} icon={IdCard}>
                                        No employees here.
                                    </EmptyRow>
                                ) : (
                                    visible.map((e) => (
                                        <tr key={e.id} className={cn('hover:bg-muted/30', !e.is_active && 'opacity-60')}>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-2.5">
                                                    {e.has_face ? (
                                                        <img
                                                            src={`${routes.employees.face(e.id)}?v=${encodeURIComponent(e.face_enrolled_at ?? '')}`}
                                                            alt=""
                                                            className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                                            {initials(e)}
                                                        </span>
                                                    )}
                                                    <div className="min-w-0">
                                                        <p className="truncate font-semibold">{e.full_name}</p>
                                                        <p className="truncate text-[11px] text-muted-foreground">
                                                            <span className="font-mono font-bold text-foreground/80">{e.employee_code}</span>
                                                            {e.position && ` · ${e.position}`}
                                                            {e.username && ` · @${e.username}`}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs md:table-cell">
                                                {e.branch?.name ?? <span className="text-amber-700 dark:text-amber-400">No branch</span>}
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex flex-wrap gap-1">
                                                    <StatusPill tone={e.has_face ? 'success' : 'warning'}>
                                                        <ScanFace className="h-3 w-3" /> {e.has_face ? `Face · ${e.face_samples}` : 'No face'}
                                                    </StatusPill>
                                                    <StatusPill tone={e.has_pin ? 'success' : 'warning'}>
                                                        <KeyRound className="h-3 w-3" /> {e.has_pin ? 'PIN' : 'No PIN'}
                                                    </StatusPill>
                                                    <StatusPill tone={e.device_registered_at ? 'success' : 'muted'}>
                                                        <Smartphone className="h-3 w-3" />{' '}
                                                        {e.device_registered_at ? 'Phone' : 'Phone set on first clock-in'}
                                                    </StatusPill>
                                                </div>
                                            </td>
                                            <td className="hidden px-4 py-2 text-xs sm:table-cell">
                                                {e.today ? (
                                                    <StatusPill tone={e.today.type === 'in' ? 'success' : 'muted'}>
                                                        {e.today.type === 'in' ? `In since ${e.today.time}` : `Out at ${e.today.time}`}
                                                    </StatusPill>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-2 py-2">
                                                <div className="flex justify-end gap-0.5">
                                                    <button
                                                        onClick={() => setEnrolling(e)}
                                                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        aria-label={`Enroll face for ${e.full_name}`}
                                                        title={e.has_face ? 'Re-enroll face' : 'Enroll face'}
                                                    >
                                                        <Camera className="h-3.5 w-3.5" />
                                                    </button>
                                                    {e.device_registered_at && (
                                                        <button
                                                            onClick={() => resetDevice(e)}
                                                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                            aria-label={`Reset registered phone for ${e.full_name}`}
                                                            title="Reset registered phone"
                                                        >
                                                            <Smartphone className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => setEditing(e)}
                                                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                                                        aria-label={`Edit ${e.full_name}`}
                                                        title="Edit / set PIN"
                                                    >
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => remove(e)}
                                                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label={`Remove ${e.full_name}`}
                                                        title="Remove"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            </div>

            {editing && <EmployeeDialog employee={editing === 'new' ? null : editing} branches={branches} onClose={() => setEditing(null)} />}
            {enrolling && <FaceEnrollDialog employee={enrolling} onClose={() => setEnrolling(null)} />}
        </AdminLayout>
    );
}

// ─── Add / edit ──────────────────────────────────────────────────────────────

function EmployeeDialog({ employee, branches, onClose }: { employee: Employee | null; branches: PageProps['branches']; onClose: () => void }) {
    const [form, setForm] = useState({
        first_name: employee?.first_name ?? '',
        last_name: employee?.last_name ?? '',
        position: employee?.position ?? '',
        phone: employee?.phone ?? '',
        branch_id: String(employee?.branch_id ?? branches[0]?.id ?? ''),
        pin: '',
        is_active: employee?.is_active ?? true,
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        const options = {
            preserveScroll: true,
            onSuccess: onClose,
            onError: (errs: Record<string, string>) => setErrors(errs),
            onFinish: () => setSaving(false),
        };
        if (employee) {
            router.patch(routes.employees.update(employee.id), form, options);
        } else {
            router.post(routes.employees.store(), form, options);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{employee ? `Edit ${employee.full_name}` : 'Add employee'}</DialogTitle>
                    <DialogDescription>
                        {employee
                            ? `${employee.employee_code} · leave the PIN empty to keep the current one.`
                            : 'A code like EMP-0006 is assigned automatically.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <FormField label="First name" error={errors.first_name}>
                        <input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} className={inputCls} required />
                    </FormField>
                    <FormField label="Last name" error={errors.last_name}>
                        <input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} className={inputCls} />
                    </FormField>
                    <FormField label="Position" error={errors.position}>
                        <input
                            value={form.position}
                            onChange={(e) => set('position', e.target.value)}
                            placeholder="e.g. Barista"
                            className={inputCls}
                        />
                    </FormField>
                    <FormField label="Phone" error={errors.phone}>
                        <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
                    </FormField>
                    <FormField label="Branch" error={errors.branch_id} className="col-span-2">
                        <select
                            value={form.branch_id}
                            onChange={(e) => set('branch_id', e.target.value)}
                            className={inputCls}
                            disabled={branches.length <= 1}
                        >
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </FormField>
                    <FormField label={employee?.has_pin ? 'New PIN (4–6 digits, optional)' : 'PIN (4–6 digits)'} error={errors.pin}>
                        <input
                            value={form.pin}
                            onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="••••"
                            className={cn(inputCls, 'tracking-widest tabular-nums')}
                            required={!employee}
                        />
                    </FormField>
                    <label className="flex items-end justify-between gap-2 pb-2 text-sm font-semibold">
                        Active
                        <Switch checked={form.is_active} onCheckedChange={(on) => set('is_active', on)} />
                    </label>
                    <DialogFooter className="col-span-2 mt-1">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── Face enrollment ─────────────────────────────────────────────────────────

/** Slightly different poses make the stored face reliable from more angles. */
const POSES = [
    { label: 'Look straight at the camera', hint: 'Face centred inside the oval' },
    { label: 'Turn your head slightly to the left', hint: 'A small turn, eyes still visible' },
    { label: 'Turn your head slightly to the right', hint: 'A small turn, eyes still visible' },
    { label: 'Look straight, chin slightly up', hint: 'Keep the whole face inside the oval' },
];

function FaceEnrollDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
    const [samples, setSamples] = useState<FaceCapture[]>([]);
    const [busy, setBusy] = useState<'capturing' | 'saving' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const done = samples.length >= MIN_ENROLL_SAMPLES;
    const camera = useCamera(!done);
    const pose = POSES[Math.min(samples.length, POSES.length - 1)];

    const takeSample = async () => {
        if (!camera.videoRef.current) return;
        setBusy('capturing');
        setError(null);
        try {
            const sample = await captureFace(camera.videoRef.current, { strict: true });
            const next = [...samples, sample];
            if (next.length >= MIN_ENROLL_SAMPLES) {
                const outlier = findInconsistentSample(next.map((s) => s.descriptor));
                if (outlier !== null) {
                    setSamples([]);
                    setError(
                        `Sample ${outlier + 1} did not look like the others, so all samples were cleared. Make sure only ${employee.first_name} is in view and start again.`,
                    );
                    return;
                }
            }
            setSamples(next);
        } catch (e) {
            setError((e as Error).message || 'The face model could not be loaded.');
        } finally {
            setBusy(null);
        }
    };

    const save = () => {
        if (!done) return;
        setBusy('saving');
        router.post(
            routes.employees.enrollFace(employee.id),
            { descriptors: samples.map((s) => s.descriptor), photo: samples[0].photo },
            {
                preserveScroll: true,
                onSuccess: onClose,
                onError: (errs) => setError(Object.values(errs)[0] ?? 'Could not save the face.'),
                onFinish: () => setBusy(null),
            },
        );
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Enroll face · {employee.full_name}</DialogTitle>
                    <DialogDescription>
                        {MIN_ENROLL_SAMPLES} photos from slightly different angles, in good light, with nothing covering the face (no cap, mask or
                        sunglasses).
                    </DialogDescription>
                </DialogHeader>

                {/* Progress: one slot per required sample */}
                <div className="grid grid-cols-4 gap-2">
                    {POSES.map((p, index) => (
                        <div
                            key={p.label}
                            className={cn(
                                'relative aspect-square overflow-hidden rounded-lg border-2',
                                samples[index]
                                    ? 'border-emerald-500'
                                    : index === samples.length
                                      ? 'border-dashed border-primary'
                                      : 'border-dashed border-border',
                            )}
                        >
                            {samples[index] ? (
                                <>
                                    <img src={samples[index].photo} alt={`Sample ${index + 1}`} className="h-full w-full object-cover" />
                                    <CheckCircle2 className="absolute right-1 bottom-1 h-4 w-4 rounded-full bg-white text-emerald-600" />
                                </>
                            ) : (
                                <span className="flex h-full items-center justify-center text-sm font-bold text-muted-foreground">{index + 1}</span>
                            )}
                        </div>
                    ))}
                </div>

                {done ? (
                    <p className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" /> {samples.length} matching samples captured. Ready to save.
                    </p>
                ) : (
                    <>
                        <div className="rounded-lg bg-primary/5 px-3 py-2 text-center">
                            <p className="text-sm font-bold">
                                {samples.length + 1} of {MIN_ENROLL_SAMPLES}: {pose.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{pose.hint}</p>
                        </div>
                        <CameraFeed videoRef={camera.videoRef} ready={camera.ready} error={camera.error} />
                    </>
                )}

                {error && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        <X className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </p>
                )}

                <DialogFooter>
                    {samples.length > 0 && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSamples([]);
                                setError(null);
                            }}
                            disabled={busy !== null}
                            className="sm:mr-auto"
                        >
                            Start over
                        </Button>
                    )}
                    {done ? (
                        <Button onClick={save} disabled={busy !== null}>
                            {busy === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save face'}
                        </Button>
                    ) : (
                        <>
                            {samples.length === 0 && (
                                <Button variant="outline" onClick={onClose}>
                                    Cancel
                                </Button>
                            )}
                            <Button onClick={takeSample} disabled={!camera.ready || busy !== null} className="gap-1.5">
                                {busy === 'capturing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                {busy === 'capturing' ? 'Hold still…' : `Capture ${samples.length + 1} of ${MIN_ENROLL_SAMPLES}`}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
