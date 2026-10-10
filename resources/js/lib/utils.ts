import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** The active colour theme's accent (System Settings → Color theme), for canvases like maps that need a real colour value. */
export function themeAccent(fallback = '#ff5a0a'): string {
    if (typeof window === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || fallback;
}
