/**
 * Manila-aware date utilities.
 *
 * All timestamps from the backend are ISO 8601 (UTC or with +08:00 offset).
 * These helpers always display / compare dates in Asia/Manila (UTC+8)
 * regardless of the browser's local timezone.
 */

import { format as dfFormat, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subMonths, startOfDay, endOfDay } from 'date-fns';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 in milliseconds

/**
 * Shift a Date object so that date-fns (which operates in local time)
 * will render the correct Manila wall-clock time.
 *
 * date-fns format() reads the local Date fields (getFullYear, getMonth…),
 * so we compensate for the difference between UTC+8 and the browser's own offset.
 */
function toManilaLocal(d: Date): Date {
    const localOffsetMs = d.getTimezoneOffset() * 60_000; // getTimezoneOffset = minutes west of UTC
    return new Date(d.getTime() + MANILA_OFFSET_MS + localOffsetMs);
}

/**
 * Parse an ISO string or Date to a UTC Date instance.
 */
function parse(d: Date | string): Date {
    return typeof d === 'string' ? new Date(d) : d;
}

// ─── Core formatter ───────────────────────────────────────────────────────────

/**
 * format() replacement that always uses Asia/Manila timezone.
 *
 * @example
 * fmtDate(sale.created_at, "MMM d, yyyy · h:mm a")
 */
export function fmtDate(d: Date | string, pattern: string): string {
    return dfFormat(toManilaLocal(parse(d)), pattern);
}

// ─── "Now" / "Today" in Manila ────────────────────────────────────────────────

/**
 * Returns a Date whose local-time fields (getFullYear, getMonth…) match the
 * current Manila wall-clock time.  Use this wherever you need "now in Manila"
 * for date-fns arithmetic (startOfMonth, subDays, etc.).
 */
export function manilaNow(): Date {
    return toManilaLocal(new Date());
}

/**
 * Current Manila date as "yyyy-MM-dd" string (for backend query params).
 */
export function manilaTodayStr(): string {
    return dfFormat(manilaNow(), 'yyyy-MM-dd');
}

/**
 * Current Manila date formatted with the given pattern.
 * @example manilaFmt("EEEE, MMM d, yyyy")
 */
export function manilaFmt(pattern: string): string {
    return dfFormat(manilaNow(), pattern);
}

// ─── Date-range presets (Manila) ──────────────────────────────────────────────

const wd = { weekStartsOn: 1 as const };

export const manilaRange = {
    today: () => {
        const d = manilaNow();
        return { from: d, to: d };
    },
    yesterday: () => {
        const d = subDays(manilaNow(), 1);
        return { from: d, to: d };
    },
    thisWeek: () => ({ from: startOfWeek(manilaNow(), wd), to: endOfWeek(manilaNow(), wd) }),
    lastWeek: () => {
        const w = subDays(manilaNow(), 7);
        return { from: startOfWeek(w, wd), to: endOfWeek(w, wd) };
    },
    thisMonth: () => ({ from: startOfMonth(manilaNow()), to: endOfMonth(manilaNow()) }),
    lastMonth: () => {
        const m = subMonths(manilaNow(), 1);
        return { from: startOfMonth(m), to: endOfMonth(m) };
    },
    last3Months: () => ({ from: startOfMonth(subMonths(manilaNow(), 2)), to: endOfMonth(manilaNow()) }),
    last90Days: () => ({ from: subDays(manilaNow(), 90), to: manilaNow() }),
    startOfDay: (d: Date) => startOfDay(toManilaLocal(parse(d))),
    endOfDay: (d: Date) => endOfDay(toManilaLocal(parse(d))),
};

/**
 * Format a Date (already in Manila-local form, e.g. from manilaRange) to "yyyy-MM-dd".
 */
export function toDateStr(d: Date): string {
    return dfFormat(d, 'yyyy-MM-dd');
}
