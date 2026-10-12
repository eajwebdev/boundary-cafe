import { AlertTriangle, Camera, CameraOff, CheckCircle2, Gift, Loader2, ScanLine, Star, User, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { jsonRequest } from '@/lib/customer';
import { cn } from '@/lib/utils';
import type { LinkedMember, RewardClaimInCart } from './posTypes';
import { fmtMoney } from './ReceiptTemplate';

/** Prefix of a reward QR (LoyaltyRewardClaim::QR_PREFIX). */
export const REWARD_QR_PREFIX = 'BCRWD-';

/** Something a scanner or the search box picked up that belongs to the loyalty programme, not the menu. */
export function isLoyaltyCode(value: string): boolean {
    const v = value.trim();
    return v.startsWith(REWARD_QR_PREFIX) || v.includes('/loyalty/card/');
}

/** The 8-character code printed under a reward QR (optionally typed as ABCD-EFGH). */
const isClaimCode = (value: string) => /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i.test(value.trim());

type Result = { kind: 'reward'; claim: RewardClaimInCart } | { kind: 'member'; member: LinkedMember };

interface BarcodeDetectorLike {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/**
 * One scanner for both loyalty QRs:
 *  - reward QR (BCRWD-…) or its 8-character code → the reward items, ready to add to the order;
 *  - member card QR, member number or mobile number → the member, linked to the sale for earning points.
 * Works with USB/Bluetooth scanners (they type into the box and press Enter) and, where the browser
 * supports it, the tablet's camera.
 */
export default function LoyaltyScanner({
    open,
    initialCode,
    currency,
    onClose,
    onAddReward,
    onLinkMember,
}: {
    open: boolean;
    /** A code already captured by the register's global scanner listener — looked up right away. */
    initialCode?: string | null;
    currency: string;
    onClose: () => void;
    onAddReward: (claim: RewardClaimInCart) => void;
    onLinkMember: (member: LinkedMember) => void;
}) {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Result | null>(null);
    const [cameraOn, setCameraOn] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const lookingUp = useRef(false);

    const detectorCtor = typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector : undefined;
    const cameraSupported = !!detectorCtor && !!navigator.mediaDevices?.getUserMedia;

    const lookup = useCallback(async (raw: string) => {
        const value = raw.trim();
        if (!value || lookingUp.current) return;
        lookingUp.current = true;
        setLoading(true);
        setError(null);
        setResult(null);
        try {
            if (value.startsWith(REWARD_QR_PREFIX) || isClaimCode(value)) {
                const res = await jsonRequest<{ claim: RewardClaimInCart }>('/pos/rewards/scan', { method: 'POST', body: { code: value } });
                setResult({ kind: 'reward', claim: res.claim });
            } else {
                const res = await jsonRequest<{
                    id: number;
                    name: string;
                    customer_number: string;
                    contact_number: string | null;
                    points: number;
                    reserved_points: number;
                }>('/loyalty/lookup', { method: 'POST', body: { code: value } });
                setResult({ kind: 'member', member: res });
            }
            setCameraOn(false);
        } catch (e) {
            const status = (e as { status?: number }).status;
            setError(status === 404 ? 'No member found for that card, member number or mobile number.' : (e as Error).message);
        } finally {
            lookingUp.current = false;
            setLoading(false);
            setCode('');
        }
    }, []);

    // Reset each time the dialog opens; look up a code handed over by the global scanner.
    useEffect(() => {
        if (!open) {
            setCameraOn(false);
            return;
        }
        setResult(null);
        setError(null);
        setCode('');
        setTimeout(() => inputRef.current?.focus(), 50);
        if (initialCode) lookup(initialCode);
    }, [open, initialCode, lookup]);

    // Rear camera + BarcodeDetector, polled a few times a second.
    useEffect(() => {
        if (!cameraOn || !detectorCtor) return;
        let stream: MediaStream | null = null;
        let timer: number | undefined;
        let cancelled = false;
        setCameraError(null);

        const detector = new detectorCtor({ formats: ['qr_code'] });
        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
            .then(async (s) => {
                if (cancelled) {
                    s.getTracks().forEach((t) => t.stop());
                    return;
                }
                stream = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    await videoRef.current.play().catch(() => undefined);
                }
                timer = window.setInterval(async () => {
                    if (!videoRef.current || videoRef.current.readyState < 2 || lookingUp.current) return;
                    try {
                        const codes = await detector.detect(videoRef.current);
                        if (codes[0]?.rawValue) lookup(codes[0].rawValue);
                    } catch {
                        /* frame not ready */
                    }
                }, 300);
            })
            .catch(() => !cancelled && setCameraError('The camera could not be opened. Allow camera access, or use a scanner or type the code.'));

        return () => {
            cancelled = true;
            window.clearInterval(timer);
            stream?.getTracks().forEach((t) => t.stop());
        };
    }, [cameraOn, detectorCtor, lookup]);

    if (!open) return null;

    const expiresIn = result?.kind === 'reward' ? Math.max(0, Math.round((new Date(result.claim.expires_at).getTime() - Date.now()) / 60000)) : 0;
    const rewardValue = result?.kind === 'reward' ? result.claim.items.reduce((s, i) => s + i.retail_price * i.quantity, 0) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Scan loyalty QR">
            <div className="flex max-h-[94dvh] w-full animate-in flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl duration-150 zoom-in-95 fade-in sm:max-w-lg sm:rounded-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                        <Gift className="h-5 w-5 text-primary" />
                        <div>
                            <p className="text-base font-black tracking-tight text-foreground">Rewards &amp; members</p>
                            <p className="text-[11px] text-muted-foreground">Scan a reward QR or member card, or type a code / mobile number</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4 lg:p-5">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            lookup(code);
                        }}
                        className="flex gap-2"
                    >
                        <div className="relative min-w-0 flex-1">
                            <ScanLine className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                ref={inputRef}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Scan now, or type code / 09XX mobile"
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="characters"
                                spellCheck={false}
                                className="h-12 w-full rounded-xl border border-border bg-background pr-3 pl-9 font-mono text-base focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none"
                            />
                        </div>
                        <Button type="submit" className="h-12 px-4 font-black" disabled={loading || !code.trim()}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}
                        </Button>
                        {cameraSupported && (
                            <Button
                                type="button"
                                variant={cameraOn ? 'secondary' : 'outline'}
                                className="h-12 w-12 shrink-0 p-0"
                                onClick={() => setCameraOn((v) => !v)}
                                aria-label={cameraOn ? 'Stop camera' : 'Scan with camera'}
                                title={cameraOn ? 'Stop camera' : 'Scan with camera'}
                            >
                                {cameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                            </Button>
                        )}
                    </form>

                    {cameraOn && (
                        <div className="relative overflow-hidden rounded-2xl bg-black">
                            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="h-48 w-48 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                            </div>
                            {cameraError && <p className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-center text-xs text-white">{cameraError}</p>}
                        </div>
                    )}
                    {!cameraSupported && (
                        <p className="text-[11px] text-muted-foreground">
                            Camera scanning isn&apos;t available in this browser — use a USB/Bluetooth scanner or type the code under the QR.
                        </p>
                    )}

                    {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {result?.kind === 'reward' && (
                        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="flex items-center gap-1.5 text-sm font-black text-emerald-700 dark:text-emerald-400">
                                        <CheckCircle2 className="h-4 w-4" /> Valid reward · {result.claim.code}
                                    </p>
                                    <p className="mt-0.5 text-sm font-semibold text-foreground">{result.claim.customer.name}</p>
                                    <p className="font-mono text-[11px] text-muted-foreground">{result.claim.customer.customer_number}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                    expires in {expiresIn} min
                                </span>
                            </div>
                            <ul className="divide-y divide-border/60 rounded-xl border border-border bg-background">
                                {result.claim.items.map((item) => (
                                    <li key={`${item.product_id}-${item.variant_id ?? 'base'}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                                        <span className="min-w-0 truncate font-bold">
                                            {item.quantity}× {item.name}
                                        </span>
                                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                                            {item.points} pts · <span className="line-through">{fmtMoney(item.retail_price * item.quantity, currency)}</span>{' '}
                                            <span className="font-black text-emerald-600">{fmtMoney(0, currency)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[11px] text-muted-foreground">
                                {result.claim.points} points were already set aside by the customer · menu value {fmtMoney(rewardValue, currency)}. The
                                points are used up only when this sale is completed.
                            </p>
                            <Button className="h-12 w-full gap-2 text-base font-black" onClick={() => onAddReward(result.claim)}>
                                <Gift className="h-5 w-5" /> Add reward to order
                            </Button>
                        </div>
                    )}

                    {result?.kind === 'member' && (
                        <div className="space-y-3 rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
                            <div className="flex items-start gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-700 dark:text-blue-300">
                                    <User className="h-5 w-5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-black text-foreground">{result.member.name}</p>
                                    <p className="font-mono text-[11px] text-muted-foreground">{result.member.customer_number}</p>
                                </div>
                                <span className="shrink-0 text-right">
                                    <span className="block font-mono text-xl font-black text-foreground tabular-nums">{result.member.points.toLocaleString()}</span>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">live points</span>
                                </span>
                            </div>
                            {result.member.reserved_points > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                    {result.member.reserved_points} more points are held for a reward — ask the customer to show its QR.
                                </p>
                            )}
                            <Button
                                variant="secondary"
                                className={cn('h-12 w-full gap-2 text-base font-black')}
                                onClick={() => onLinkMember(result.member)}
                            >
                                <Star className="h-5 w-5" /> Earn points on this sale
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
