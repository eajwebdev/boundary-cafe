import { usePage } from '@inertiajs/react';

/** The business name set in System Settings (shared on every page as app.name). */
export function useBusinessName(): string {
    const app = usePage<{ app?: { name?: string | null } }>().props.app;

    return app?.name || 'Our Cafe';
}

/** The tagline set in System Settings, e.g. "Taste of Negros" (may be blank). */
export function useTagline(): string {
    return usePage<{ app?: { tagline?: string | null } }>().props.app?.tagline ?? '';
}

/** "Business – Location", e.g. "EAJ Cafe – Mabinay"; just the business name when there is no branch location. */
export function useBranchLabel(location?: string | null): string {
    const businessName = useBusinessName();

    return location ? `${businessName} – ${location}` : businessName;
}

/** The loyalty programme's name, e.g. "EAJ Cafe Rewards" (matches SystemSetting::rewardsName()). */
export function useRewardsName(): string {
    return `${useBusinessName()} Rewards`;
}
