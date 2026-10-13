import { CheckCircle2, Target } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { DailyMission } from './posTypes';

/**
 * The member's daily mission at the register, so the cashier can mention it
 * ("₱120 more and you get +10 points") — the sale completes it automatically.
 */
export default function MissionNote({ mission, compact = false }: { mission: DailyMission; compact?: boolean }) {
    if (compact) {
        return (
            <div className="flex items-center gap-2 border-t border-amber-500/20 bg-amber-500/[0.07] px-4 py-1.5 text-[11px]">
                {mission.completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                    <Target className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
                    {mission.completed ? 'Mission done today' : `Mission: ${mission.title}`}
                </span>
                <span className="shrink-0 font-bold text-amber-700 tabular-nums dark:text-amber-300">
                    {mission.completed ? `+${mission.reward_points} pts` : `${mission.remaining_label} · +${mission.reward_points}`}
                </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                'rounded-xl border p-3',
                mission.completed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5',
            )}
        >
            <div className="flex items-center gap-2">
                {mission.completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                    <Target className="h-4 w-4 shrink-0 text-amber-600" />
                )}
                <p className="min-w-0 flex-1 truncate text-sm font-black text-foreground">Today’s mission: {mission.title}</p>
                <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-black text-amber-700 dark:text-amber-300">
                    +{mission.reward_points} pts
                </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className={cn('h-full rounded-full', mission.completed ? 'bg-emerald-500' : 'bg-amber-500')}
                    style={{ width: `${mission.percent}%` }}
                />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
                {mission.completed
                    ? 'Already completed today — bonus points added.'
                    : `${mission.progress_label} · ${mission.remaining_label}. This sale counts towards it.`}
            </p>
        </div>
    );
}
