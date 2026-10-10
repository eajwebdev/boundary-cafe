'use client';

import { createInertiaApp, router } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
// ── Theme support ───────────────────────────────────────────────────────────────
import { ThemeProvider } from 'next-themes';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../css/app.css';

// ── App-wide confirm modal + Sonner toast (global toaster) ─────────────────────
import { ConfirmDialogHost } from '@/components/ConfirmDialog';
import { Toaster } from '@/components/ui/sonner';

// ── Optional: StrictMode only in development ───────────────────────────────────
const StrictModeWrapper = import.meta.env.DEV ? React.StrictMode : React.Fragment;

function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="psis-theme">
            {children}
            <ConfirmDialogHost />
            <Toaster
                position="bottom-right"
                richColors
                closeButton
                duration={4500}
                toastOptions={{
                    className: 'border shadow-lg',
                    style: { borderRadius: '8px' },
                }}
            />
        </ThemeProvider>
    );
}

type SharedApp = {
    name?: string;
    logo_url?: string | null;
    icon_url?: string | null;
    color_theme?: string;
};

/** The slice of the shared Inertia props that carries the branding. */
type BrandProps = { app?: SharedApp };

const fallbackAppName = import.meta.env.VITE_APP_NAME || 'POS';
let currentAppName = document.documentElement.dataset.appName || fallbackAppName;

function setIconHref(selector: string, href: string) {
    const link = document.querySelector<HTMLLinkElement>(selector);
    if (link) link.href = href;
}

function syncBrand(app?: SharedApp) {
    const previousAppName = currentAppName;

    if (app?.name) {
        currentAppName = app.name;
        document.documentElement.dataset.appName = app.name;
    }

    document.documentElement.dataset.theme = app?.color_theme ?? 'ea';

    const iconUrl = app?.icon_url || app?.logo_url || '/uploads/logo.png';
    setIconHref('link[rel="icon"]', iconUrl);
    setIconHref('link[rel="apple-touch-icon"]', iconUrl);

    if (previousAppName !== currentAppName) {
        if (document.title === previousAppName) {
            document.title = currentAppName;
        } else if (document.title.endsWith(` - ${previousAppName}`)) {
            document.title = document.title.slice(0, -previousAppName.length) + currentAppName;
        }
    }
}

createInertiaApp({
    title: (title) => (title ? `${title} - ${currentAppName}` : currentAppName),

    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),

    setup({ el, App, props }) {
        syncBrand((props.initialPage.props as BrandProps).app);

        // Sync data-theme on every Inertia navigation (after blade sets it on first load)
        router.on('navigate', (event) => {
            syncBrand((event.detail.page.props as BrandProps).app);
        });
        router.on('success', (event) => {
            syncBrand((event.detail.page.props as BrandProps).app);
        });

        createRoot(el).render(
            <StrictModeWrapper>
                <Providers>
                    <App {...props} />
                </Providers>
            </StrictModeWrapper>,
        );
    },

    progress: {
        color: '#FF5A0A',
        delay: 250,
    },
});
