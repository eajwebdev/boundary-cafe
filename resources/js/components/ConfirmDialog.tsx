import { AlertTriangle, CircleHelp, Info } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── App-wide confirm / notice modal ──────────────────────────────────────────
//
// The replacement for the browser's `confirm()` and `alert()`:
//
//     if (!(await confirmDialog({ title: 'Delete this table?', tone: 'danger' }))) return;
//     await noticeDialog({ title: 'Configure this bundle first' });
//
// <ConfirmDialogHost /> is mounted once in app.tsx, so any page can call these.

export interface ConfirmOptions {
    title: string;
    description?: string;
    /** Defaults to "Confirm". */
    confirmLabel?: string;
    /** Defaults to "Cancel". */
    cancelLabel?: string;
    /** "danger" for anything that deletes or discards — red button, and Cancel takes focus. */
    tone?: 'default' | 'danger';
}

interface Request extends ConfirmOptions {
    /** A notice has a single button and nothing to decide. */
    notice: boolean;
    /** Opened from the customer / waiter app, which has its own palette. */
    shop: boolean;
    resolve: (confirmed: boolean) => void;
}

let current: Request | null = null;
const listeners = new Set<() => void>();

function publish(next: Request | null) {
    current = next;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function open(options: ConfirmOptions, notice: boolean): Promise<boolean> {
    return new Promise((resolve) => {
        // A newer question replaces one that was never answered.
        current?.resolve(false);
        publish({ ...options, notice, shop: document.querySelector('.bc-shop') !== null, resolve });
    });
}

function answer(confirmed: boolean) {
    const request = current;
    if (!request) return;
    publish(null);
    request.resolve(confirmed);
}

/** Ask a yes/no question. Resolves true when confirmed; false on Cancel, Escape or a click outside. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return open(options, false);
}

/** Tell the user something they must acknowledge. Resolves once dismissed. */
export function noticeDialog(options: Omit<ConfirmOptions, 'cancelLabel' | 'tone'>): Promise<void> {
    return open(options, true).then(() => undefined);
}

/** Lets page-level keyboard shortcuts stand down while a question is on screen. */
export function isConfirmDialogOpen(): boolean {
    return current !== null;
}

export function ConfirmDialogHost() {
    const request = useSyncExternalStore(
        subscribe,
        () => current,
        () => null,
    );
    // Keep the last question on screen while the dialog animates out.
    const [shown, setShown] = useState<Request | null>(null);
    if (request && request !== shown) setShown(request);

    const confirmRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    const danger = shown?.tone === 'danger';
    const Icon = shown?.notice ? Info : danger ? AlertTriangle : CircleHelp;

    return (
        <DialogPrimitive.Root open={request !== null} onOpenChange={(isOpen) => !isOpen && answer(false)}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    {...(shown?.description ? {} : { 'aria-describedby': undefined })}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        (danger ? cancelRef : confirmRef).current?.focus();
                    }}
                    className={cn(
                        'fixed top-1/2 left-1/2 z-[1000] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl outline-none duration-200 sm:max-w-md',
                        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                        shown?.shop && 'bc-shop',
                    )}
                >
                    <div className="flex gap-4 p-6">
                        <span
                            className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                                danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                            )}
                            aria-hidden
                        >
                            <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 pt-0.5">
                            <DialogPrimitive.Title className="text-lg leading-snug font-semibold text-balance">{shown?.title}</DialogPrimitive.Title>
                            {shown?.description && (
                                <DialogPrimitive.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                                    {shown.description}
                                </DialogPrimitive.Description>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
                        {!shown?.notice && (
                            <Button ref={cancelRef} type="button" variant="outline" className="h-10 sm:min-w-24" onClick={() => answer(false)}>
                                {shown?.cancelLabel ?? 'Cancel'}
                            </Button>
                        )}
                        <Button
                            ref={confirmRef}
                            type="button"
                            variant={danger ? 'destructive' : 'default'}
                            className="h-10 sm:min-w-24"
                            onClick={() => answer(true)}
                        >
                            {shown?.confirmLabel ?? (shown?.notice ? 'OK' : 'Confirm')}
                        </Button>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
