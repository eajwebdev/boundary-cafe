import { Link } from '@inertiajs/react';
import { CheckCircle2, ChevronRight, Clock3, Target } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/** Today's daily mission (DailyMissionService::toFrontend). */
export interface CustomerMission {
    id: number;
    title: string;
    type: 'spend' | 'items' | 'category';
    target: number;
    reward_points: number;
    progress: number;
    percent: number;
    progress_label: string;
    remaining_label: string;
    category: string | null;
    completed: boolean;
    completed_at: string | null;
    ends_at: string;
}

function timeLeft(endsAt: string): string {
    const ms = new Date(endsAt).getTime() - Date.now();
    if (ms <= 0) return 'Ended';
    const minutes = Math.floor(ms / 60000);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

/** Ticks once a minute so the "7h 12m left" label stays honest. */
function useTimeLeft(endsAt: string) {
    const [label, setLabel] = useState(() => timeLeft(endsAt));
    useEffect(() => {
        setLabel(timeLeft(endsAt));
        const id = window.setInterval(() => setLabel(timeLeft(endsAt)), 30_000);
        return () => window.clearInterval(id);
    }, [endsAt]);
    return label;
}

/**
 * A member's mission for today: what to do, how far they are, the bonus, and the time left.
 * `link` turns the whole card into a link (the storefront sends it to the rewards page).
 */
export default function MissionCard({ mission, link, className }: { mission: CustomerMission; link?: string; className?: string }) {
    const left = useTimeLeft(mission.ends_at);
    const done = mission.completed;

    const body = (
        <>
            <div className="flex items-start gap-3">
                <span
                    className={cn(
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        done ? 'bg-shop-success text-white' : 'bg-shop-accent text-shop-on-accent',
                    )}
                    aria-hidden
                >
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className={cn('text-[11px] font-bold tracking-[0.12em] uppercase', done ? 'text-shop-success' : 'text-shop-accent-ink')}>
                        {done ? 'Mission complete' : 'Today’s mission'}
                    </p>
                    <p className="font-display text-[17px] leading-snug font-bold text-balance">{mission.title}</p>
                </div>
                <span
                    className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 font-display text-sm font-extrabold tabular-nums',
                        done ? 'bg-shop-success text-white' : 'bg-shop-navy text-shop-navy-ink',
                    )}
                >
                    +{mission.reward_points} pts
                </span>
                {link && <ChevronRight className="mt-3 -mr-1 h-4 w-4 shrink-0 text-shop-muted" aria-hidden />}
            </div>
            <div
                className="mt-3 h-2.5 overflow-hidden rounded-full bg-shop-surface/80 ring-1 ring-shop-line"
                role="progressbar"
                aria-label="Mission progress"
                aria-valuenow={mission.percent}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className={cn('h-full rounded-full transition-[width] duration-700 ease-shop', done ? 'bg-shop-success' : 'bg-shop-accent')}
                    style={{ width: `${Math.max(mission.percent, done ? 100 : 4)}%` }}
                />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-shop-muted">
                    {done ? `+${mission.reward_points} bonus points added to your wallet.` : `${mission.progress_label} · ${mission.remaining_label}`}
                </span>
                {!done && (
                    <span className="flex shrink-0 items-center gap-1 font-semibold text-shop-ink tabular-nums">
                        <Clock3 className="h-3.5 w-3.5" /> {left}
                    </span>
                )}
            </div>
        </>
    );

    const shell = cn(
        'block rounded-2xl p-4 ring-1',
        done ? 'bg-shop-success-soft ring-shop-success/25' : 'bg-shop-accent-soft ring-shop-accent/25',
        link && 'bc-press',
        className,
    );

    return link ? (
        <Link href={link} className={shell}>
            {body}
        </Link>
    ) : (
        <section className={shell} aria-label="Today’s mission">
            {body}
        </section>
    );
}
