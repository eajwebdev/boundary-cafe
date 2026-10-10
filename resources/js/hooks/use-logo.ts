import { usePage } from '@inertiajs/react';

/** The business logo uploaded in System Settings (shared on every page as app.logo_url). */
export function useLogoUrl(): string {
    const app = usePage<{ app?: { logo_url?: string | null } }>().props.app;

    return app?.logo_url || '/uploads/logo.png';
}
