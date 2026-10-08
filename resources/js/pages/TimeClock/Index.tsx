import { Head } from '@inertiajs/react';
import {
    ArrowBigLeft,
    ArrowBigRight,
    ArrowLeft,
    CheckCircle2,
    Laugh,
    Loader2,
    LocateFixed,
    LogIn,
    LogOut,
    MapPin,
    ScanFace,
    XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CameraFeed, useCamera } from '@/components/CameraFeed';
import { jsonRequest } from '@/lib/customer';
import { distanceMeters, getPosition, loadFaceApi, type Position } from '@/lib/face-capture';
import { runLivenessCheck, type LivenessAction, type LivenessPrompt, type LivenessThresholds } from '@/lib/face-liveness';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

interface EmployeeSummary {
    name: string;
    first_name: string;
    code: string;
    position: string | null;
    branch: { name: string; latitude: number | null; longitude: number | null; radius_m: number } | null;
    next: 'in' | 'out';
    blocker: string | null;
}

interface PunchResult {
    type: 'in' | 'out';
    time: string;
    distance_m: number;
    employee: EmployeeSummary;
}

interface Challenge {
    token: string;
    steps: LivenessAction[];
    expires_in: number;
}

type Step = 'pin' | 'verify' | 'done';

const RESET_AFTER_MS = 8000;

/** On-camera instructions. The preview is mirrored, so "your left" is also the screen's left. */
const PROMPTS: Record<LivenessPrompt, { label: string; icon: typeof ScanFace }> = {
    look_straight: { label: 'Look straight at the camera', icon: ScanFace },
    turn_left: { label: 'Slowly turn your head to your left', icon: ArrowBigLeft },
    turn_right: { label: 'Slowly turn your head to your right', icon: ArrowBigRight },
    open_mouth: { label: 'Open your mouth wide', icon: Laugh },
};

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    return now;
}

export default function TimeClock({ business_name, logo_url, liveness }: { business_name: string; logo_url: string; liveness: LivenessThresholds }) {
    const now = useClock();
    const [step, setStep] = useState<Step>('pin');
    const [code, setCode] = useState('');
    const [pin, setPin] = useState('');
    const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
    const [result, setResult] = useState<PunchResult | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [position, setPosition] = useState<Position | null>(null);
    const [locError, setLocError] = useState<string | null>(null);
    const [locating, setLocating] = useState(false);
    const [modelReady, setModelReady] = useState(false);
    const [prompt, setPrompt] = useState<{ prompt: LivenessPrompt; step: number; total: number } | null>(null);
    const checkAbort = useRef<AbortController | null>(null);

    const cameraOn = step === 'verify' && !!employee && !employee.blocker;
    const camera = useCamera(cameraOn);

    const reset = useCallback(() => {
        checkAbort.current?.abort();
        setStep('pin');
        setCode('');
        setPin('');
        setEmployee(null);
        setResult(null);
        setError(null);
        setPosition(null);
        setLocError(null);
    }, []);

    const locate = useCallback(async () => {
        setLocating(true);
        setLocError(null);
        try {
            setPosition(await getPosition());
        } catch (e) {
            setLocError((e as Error).message);
        } finally {
            setLocating(false);
        }
    }, []);

    // Once identified: find the phone's location and warm up the face model.
    useEffect(() => {
        if (!cameraOn) return;
        locate();
        loadFaceApi()
            .then(() => setModelReady(true))
            .catch(() => setError('The face scanner could not be loaded. Check the internet connection and try again.'));
    }, [cameraOn, locate]);

    useEffect(() => {
        if (step !== 'done') return;
        const timer = window.setTimeout(reset, RESET_AFTER_MS);
        return () => window.clearTimeout(timer);
    }, [step, reset]);

    const identify = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy('Checking…');
        setError(null);
        try {
            setEmployee(await jsonRequest<EmployeeSummary>(routes.timeClock.identify(), { method: 'POST', body: { employee_code: code, pin } }));
            setStep('verify');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(null);
        }
    };

    const punch = async () => {
        const video = camera.videoRef.current;
        if (!video || !position || !employee) return;
        setError(null);
        const abort = new AbortController();
        checkAbort.current = abort;
        try {
            setBusy('Starting the face check…');
            const challenge = await jsonRequest<Challenge>(routes.timeClock.challenge(), { method: 'POST', body: { employee_code: code, pin } });
            setBusy('Follow the steps on the camera');
            const check = await runLivenessCheck(
                video,
                challenge.steps,
                liveness,
                (next, stepNumber) => setPrompt({ prompt: next, step: stepNumber, total: challenge.steps.length }),
                abort.signal,
            );
            setPrompt(null);
            setBusy(employee.next === 'in' ? 'Timing you in…' : 'Timing you out…');
            const res = await jsonRequest<PunchResult>(routes.timeClock.punch(), {
                method: 'POST',
                body: {
                    employee_code: code,
                    pin,
                    ...position,
                    descriptor: check.face.descriptor,
                    photo: check.face.photo,
                    challenge: challenge.token,
                    liveness: { camera: check.camera, neutral: check.neutral, steps: check.steps },
                },
            });
            setResult(res);
            setStep('done');
        } catch (err) {
            if (!abort.signal.aborted) setError((err as Error).message);
        } finally {
            setPrompt(null);
            setBusy(null);
        }
    };

    const branch = employee?.branch;
    const distance =
        position && branch?.latitude != null && branch?.longitude != null
            ? distanceMeters(position, { latitude: branch.latitude, longitude: branch.longitude })
            : null;
    const inside = distance !== null && branch ? distance <= branch.radius_m : false;
    const canPunch = camera.ready && modelReady && !!position && inside && !busy;
    const action = employee?.next === 'out' ? 'Time out' : 'Time in';

    return (
        <div className="min-h-dvh bg-gradient-to-b from-primary/10 via-background to-background px-4 py-6">
            <Head title="Time Clock" />

            <div className="mx-auto w-full max-w-md space-y-4">
                <header className="flex items-center gap-3">
                    <img src={logo_url} alt="" className="h-11 w-11 rounded-xl bg-white object-contain p-1 ring-1 ring-black/5" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold">{business_name}</p>
                        <p className="text-xs text-muted-foreground">Employee time clock</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-extrabold tabular-nums">
                            {now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            {now.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                    </div>
                </header>

                <main className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    {step === 'pin' && (
                        <form onSubmit={identify} className="space-y-3">
                            <h1 className="text-lg font-bold">Clock in or out</h1>
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-muted-foreground">Employee code</span>
                                <input
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    placeholder="EMP-0001"
                                    autoComplete="username"
                                    autoCapitalize="characters"
                                    className="h-12 w-full rounded-xl border border-input bg-background px-3 font-mono text-lg font-bold tracking-wider outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    required
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-xs font-semibold text-muted-foreground">PIN</span>
                                <input
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="current-password"
                                    placeholder="••••"
                                    className="h-12 w-full rounded-xl border border-input bg-background px-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                    required
                                />
                            </label>
                            {error && <ErrorNote message={error} />}
                            <button
                                type="submit"
                                disabled={!!busy || !code || pin.length < 4}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
                            >
                                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue'}
                            </button>
                            <p className="text-center text-[11px] text-muted-foreground">
                                You'll need to allow location and camera on the next step.
                            </p>
                        </form>
                    )}

                    {step === 'verify' && employee && (
                        <div className="space-y-3">
                            <div className="flex items-start gap-2">
                                <button
                                    onClick={reset}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                                    aria-label="Back"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 flex-1">
                                    <p className="text-lg leading-tight font-bold">Hi, {employee.first_name}!</p>
                                    <p className="text-xs text-muted-foreground">
                                        {employee.code}
                                        {employee.position && ` · ${employee.position}`}
                                        {branch && ` · ${branch.name}`}
                                    </p>
                                </div>
                                <span
                                    className={cn(
                                        'rounded-full px-2.5 py-1 text-xs font-bold',
                                        employee.next === 'in'
                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
                                    )}
                                >
                                    {action}
                                </span>
                            </div>

                            {employee.blocker ? (
                                <ErrorNote message={employee.blocker} />
                            ) : (
                                <>
                                    <CameraFeed videoRef={camera.videoRef} ready={camera.ready} error={camera.error}>
                                        {prompt && <LivenessOverlay {...prompt} />}
                                    </CameraFeed>

                                    <div
                                        className={cn(
                                            'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold',
                                            !position && !locError && 'bg-muted text-muted-foreground',
                                            position && inside && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                            ((position && !inside) || locError) && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                        )}
                                    >
                                        {locating ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <MapPin className="h-4 w-4 shrink-0" />}
                                        <span className="min-w-0 flex-1">
                                            {locating && 'Finding your location…'}
                                            {!locating && locError}
                                            {!locating &&
                                                !locError &&
                                                distance !== null &&
                                                branch &&
                                                (inside
                                                    ? `You're at ${branch.name} (${distance} m, ±${Math.round(position?.accuracy ?? 0)} m)`
                                                    : `You're ${distance} m from ${branch.name}. Move within ${branch.radius_m} m.`)}
                                        </span>
                                        {!locating && (
                                            <button
                                                onClick={locate}
                                                className="shrink-0 rounded-lg p-1 hover:bg-black/5"
                                                aria-label="Check location again"
                                                title="Check again"
                                            >
                                                <LocateFixed className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    {!modelReady && !error && (
                                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing the face scanner (first time takes a few
                                            seconds)…
                                        </p>
                                    )}

                                    {error && <ErrorNote message={error} />}

                                    <button
                                        onClick={punch}
                                        disabled={!canPunch}
                                        className={cn(
                                            'flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-bold text-white disabled:opacity-50',
                                            employee.next === 'in' ? 'bg-emerald-600' : 'bg-sky-600',
                                        )}
                                    >
                                        {busy ? (
                                            <>
                                                <Loader2 className="h-5 w-5 animate-spin" /> {busy}
                                            </>
                                        ) : (
                                            <>
                                                {employee.next === 'in' ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                                                <ScanFace className="h-5 w-5" /> {action}
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {step === 'done' && result && (
                        <div className="space-y-3 py-4 text-center">
                            <CheckCircle2 className={cn('mx-auto h-16 w-16', result.type === 'in' ? 'text-emerald-600' : 'text-sky-600')} />
                            <p className="text-2xl font-extrabold">{result.type === 'in' ? 'Timed in' : 'Timed out'}</p>
                            <p className="text-sm text-muted-foreground">
                                {result.employee.name} · {result.time}
                                <br />
                                {result.type === 'in' ? 'Have a great shift!' : 'Thanks for today. Ingat!'}
                            </p>
                            <button
                                onClick={reset}
                                className="mx-auto h-10 rounded-xl border border-border px-5 text-sm font-semibold hover:bg-muted"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </main>

                <p className="text-center text-[11px] text-muted-foreground">
                    Your location and a photo are saved with every time in and out. The phone you first clock in with becomes your registered phone.
                </p>
            </div>
        </div>
    );
}

function LivenessOverlay({ prompt, step, total }: { prompt: LivenessPrompt; step: number; total: number }) {
    const { label, icon: Icon } = PROMPTS[prompt];

    return (
        <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 bg-linear-to-t from-black/80 to-transparent px-4 pt-10 pb-3 text-white"
            aria-live="assertive"
        >
            <Icon className="h-9 w-9 animate-pulse" />
            <p className="text-center text-base font-bold">{label}</p>
            <div className="flex gap-1" aria-hidden="true">
                {Array.from({ length: total + 1 }, (_, i) => (
                    <span key={i} className={cn('h-1.5 w-6 rounded-full', i <= step ? 'bg-white' : 'bg-white/30')} />
                ))}
            </div>
        </div>
    );
}

function ErrorNote({ message }: { message: string }) {
    return (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
        </p>
    );
}
