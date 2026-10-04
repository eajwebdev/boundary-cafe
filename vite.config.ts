import { wayfinder } from '@laravel/vite-plugin-wayfinder';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig, type Plugin } from 'vite';

/**
 * Wrap any plugin so that errors during buildStart are degraded to warnings
 * instead of crashing the dev server. This prevents file-lock or permission
 * issues from stopping `npm run dev`.
 */
function resilient(plugin: Plugin): Plugin {
    const orig = plugin.buildStart;
    if (!orig) return plugin;
    return {
        ...plugin,
        buildStart(this: any, ...args: any[]) {
            const originalError = this.error.bind(this);
            this.error = (msg: any) => this.warn(`[resilient] ${msg}`);
            const result = (orig as Function).apply(this, args);
            if (result instanceof Promise) {
                return result.finally(() => { this.error = originalError; });
            }
            this.error = originalError;
            return result;
        },
    };
}

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.tsx',
            refresh: true,
        }),
        react({
            babel: {
                plugins: ['babel-plugin-react-compiler'],
            },
        }),
        tailwindcss(),
        resilient(wayfinder({
            formVariants: true,
        })),
    ],
    esbuild: {
        jsx: 'automatic',
    },
});
