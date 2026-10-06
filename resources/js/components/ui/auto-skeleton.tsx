import { AutoSkeleton as BaseAutoSkeleton } from 'auto-skeleton-react';
import type { ReactNode } from 'react';

interface ShopAutoSkeletonProps {
    loading: boolean;
    children: ReactNode;
    animation?: 'pulse' | 'shimmer' | 'none';
    className?: string;
}

/**
 * Shop-themed wrapper around `auto-skeleton-react`.
 * Zero manual skeleton screens — it measures the rendered DOM and
 * generates placeholders that match layout.
 *
 * Safe to use in parallel with Landing work: this file is new and
 * does not touch `resources/js/pages/Landing/Index.tsx`.
 * Wire into Landing only after Claude finishes to avoid conflicts.
 *
 * @example
 * <ShopAutoSkeleton loading={!products}>
 *   <ProductGrid products={products ?? []} />
 * </ShopAutoSkeleton>
 */
export function ShopAutoSkeleton({ loading, children, animation = 'pulse', className }: ShopAutoSkeletonProps) {
    return (
        <BaseAutoSkeleton
            loading={loading}
            config={{
                animation,
                // Match shop muted/skeleton tokens (light + dark friendly)
                baseColor: 'var(--muted, #e9e2d9)',
                borderRadius: 8,
                minTextHeight: 12,
                maxDepth: 10,
            }}
        >
            <div className={className}>{children}</div>
        </BaseAutoSkeleton>
    );
}

export default ShopAutoSkeleton;
