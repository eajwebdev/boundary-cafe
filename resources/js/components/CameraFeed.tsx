import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { startCamera, stopCamera } from '@/lib/face-capture';
import { cn } from '@/lib/utils';

/** Runs the front camera while `active` is true and stops it afterwards. */
export function useCamera(active: boolean) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!active || !videoRef.current) return;

        let stream: MediaStream | null = null;
        let cancelled = false;
        setError(null);
        setReady(false);

        startCamera(videoRef.current)
            .then((s) => {
                if (cancelled) {
                    stopCamera(s);
                    return;
                }
                stream = s;
                setReady(true);
            })
            .catch((e: Error) => !cancelled && setError(e.message));

        return () => {
            cancelled = true;
            stopCamera(stream);
            setReady(false);
        };
    }, [active]);

    return { videoRef, ready, error };
}

/** Mirrored selfie preview with a face guide. */
export function CameraFeed({
    videoRef,
    ready,
    error,
    className,
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    ready: boolean;
    error: string | null;
    className?: string;
}) {
    return (
        <div className={cn('relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black', className)}>
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            {ready && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-[70%] w-[45%] rounded-[50%] border-2 border-dashed border-white/70" />
                </div>
            )}
            {!ready && !error && (
                <div className="absolute inset-0 flex items-center justify-center text-white/80">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </div>
            )}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-semibold text-white">{error}</div>
            )}
        </div>
    );
}
