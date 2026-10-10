import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Category, Product } from '../posTypes';

/** One-tap category filter: a scrollable row of chips with item counts ("All" first). */
export default function CategoryRail({
    categories,
    products,
    activeCat,
    onChange,
    size = 'md',
}: {
    categories: Category[];
    products: Product[];
    activeCat: number | null;
    onChange: (id: number | null) => void;
    size?: 'sm' | 'md';
}) {
    const sellable = useMemo(() => products.filter((p) => p.product_type !== 'ingredient'), [products]);
    const counts = useMemo(() => {
        const map = new Map<number, number>();
        sellable.forEach((p) => p.category && map.set(p.category.id, (map.get(p.category.id) ?? 0) + 1));
        return map;
    }, [sellable]);
    const visible = categories.filter((c) => (counts.get(c.id) ?? 0) > 0);

    const chip = (active: boolean) =>
        cn(
            'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border font-bold whitespace-nowrap transition-colors select-none',
            size === 'sm' ? 'h-7 px-3 text-[11px]' : 'h-9 px-4 text-sm',
            active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5',
        );
    const count = (active: boolean) =>
        cn('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground');

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]" role="tablist" aria-label="Categories">
            <button type="button" role="tab" aria-selected={activeCat === null} onClick={() => onChange(null)} className={chip(activeCat === null)}>
                All <span className={count(activeCat === null)}>{sellable.length}</span>
            </button>
            {visible.map((c) => {
                const active = activeCat === c.id;
                return (
                    <button
                        key={c.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(active ? null : c.id)}
                        className={chip(active)}
                    >
                        {c.name} <span className={count(active)}>{counts.get(c.id)}</span>
                    </button>
                );
            })}
        </div>
    );
}
