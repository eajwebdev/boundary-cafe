import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { jsonRequest } from '@/lib/customer';

/** A delivery as the rider dashboard receives it. */
export interface Delivery {
    id: number;
    order_number: string;
    status: string;
    status_label: string;
    customer_name: string;
    contact_number: string;
    barangay: string | null;
    address: string | null;
    landmark: string | null;
    notes_for_rider: string | null;
    customer_note: string | null;
    lat: number | null;
    lng: number | null;
    payment_method: string;
    total: number;
    collect: number;
    estimated_ready_at: string | null;
    created_at: string;
    items: { name: string; variant: string | null; quantity: number; note: string | null }[];
}

export const STATUS_TONE: Record<string, string> = {
    accepted: 'bg-muted text-muted-foreground',
    preparing: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
    ready: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    out_for_delivery: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
    completed: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    cancelled: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    rejected: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

export type RiderAction = 'claim' | 'picked-up' | 'delivered';

interface QueuedAction {
    key: string;
    url: string;
    orderId: number;
    action: RiderAction;
    label: string;
    at: number;
}

/** A request that failed because the network is down (not because the server said no). */
function isNetworkFailure(e: unknown): boolean {
    const status = (e as { status?: number }).status;
    return status === undefined || status === 0 || status === 408 || status === 429 || status >= 500;
}

/**
 * Rider actions (take, picked up, delivered) that survive a weak signal: if the request cannot reach the
 * server, it is saved on the phone and re-sent automatically when the connection returns. Each action is
 * safe to repeat on the server, so a retry never double-counts. A real refusal (e.g. the order was
 * cancelled) is shown to the rider and dropped.
 */
export function useActionQueue(riderId: number, onSent: () => void) {
    const storageKey = `bc-rider-queue:v1:${riderId}`;
    const read = (): QueuedAction[] => {
        try {
            return JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
        } catch {
            return [];
        }
    };
    const [queue, setQueue] = useState<QueuedAction[]>(read);
    const flushing = useRef(false);
    const sentRef = useRef(onSent);
    sentRef.current = onSent;

    const save = useCallback(
        (next: QueuedAction[]) => {
            setQueue(next);
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                /* storage full or blocked: the queue still lives in memory for this session */
            }
        },
        [storageKey],
    );

    const flush = useCallback(async () => {
        if (flushing.current) return;
        let pending = read();
        if (!pending.length) return;
        flushing.current = true;
        try {
            for (const item of [...pending]) {
                try {
                    const res = await jsonRequest<{ message: string }>(item.url, { method: 'POST' });
                    pending = pending.filter((q) => q.key !== item.key);
                    toast.success(`Sent: ${res.message}`);
                } catch (e) {
                    if (isNetworkFailure(e)) break;
                    pending = pending.filter((q) => q.key !== item.key);
                    toast.error(`${item.label}: ${(e as Error).message}`);
                }
            }
            save(pending);
            sentRef.current();
        } finally {
            flushing.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [save, storageKey]);

    useEffect(() => {
        flush();
        window.addEventListener('online', flush);
        const retry = window.setInterval(flush, 15000);
        return () => {
            window.removeEventListener('online', flush);
            window.clearInterval(retry);
        };
    }, [flush]);

    /** Send now; if the network is down, keep it for later. Resolves true when it reached the server. */
    const run = useCallback(
        async (orderId: number, action: RiderAction, url: string, label: string): Promise<boolean> => {
            const queueIt = () => {
                const key = `${action}:${orderId}`;
                save([...read().filter((q) => q.key !== key), { key, url, orderId, action, label, at: Date.now() }]);
                toast.message('No signal: saved on your phone', { description: `${label} will be sent automatically when you are back online.` });
                navigator.vibrate?.([60, 40, 60]);
            };
            if (!navigator.onLine) {
                queueIt();
                return false;
            }
            try {
                const res = await jsonRequest<{ message: string }>(url, { method: 'POST' });
                toast.success(res.message);
                navigator.vibrate?.(60);
                return true;
            } catch (e) {
                if (isNetworkFailure(e)) {
                    queueIt();
                } else {
                    toast.error((e as Error).message);
                }
                return false;
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [save, storageKey],
    );

    const pendingFor = (orderId: number) => queue.find((q) => q.orderId === orderId) ?? null;

    return { run, flush, queue, pendingFor };
}
