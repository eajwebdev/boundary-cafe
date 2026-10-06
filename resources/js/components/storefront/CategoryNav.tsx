import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

import ScrollRail from './ScrollRail';
import { ProductImage } from './ui';

export interface NavSection {
    id: number;
    name: string;
    count: number;
    /** A photo from the category, shown on its tile. */
    image: string | null;
}

/** Photo tiles for jumping straight to a category. */
export function CategoryTiles({ sections, onSelect, className }: { sections: NavSection[]; onSelect: (id: number) => void; className?: string }) {
    if (!sections.length) return null;

    return (
        <section aria-labelledby="categories-title" className={className}>
            <h2 id="categories-title" className="font-display px-4 text-2xl font-semibold tracking-tight lg:px-0 lg:text-[28px]">
                Browse by category
            </h2>
            <ScrollRail className="mt-4 items-start gap-3 lg:gap-4" arrowClassName="top-15">
                {sections.map((s) => (
                    <button key={s.id} type="button" onClick={() => onSelect(s.id)} className="bc-press group flex w-22 shrink-0 cursor-pointer snap-start flex-col items-center text-center">
                        <ProductImage src={s.image} alt="" className="h-22 w-22 rounded-xl [&_img]:group-hover:scale-105" />
                        <span className="mt-2 block text-sm leading-tight font-medium text-shop-accent-ink">{s.name}</span>
                    </button>
                ))}
            </ScrollRail>
        </section>
    );
}

/** Desktop: vertical category list with counts and an active bar, inside the filters card. */
export function CategoryRail({ sections, active, onSelect }: { sections: NavSection[]; active: number | null; onSelect: (id: number) => void }) {
    return (
        <nav aria-label="Menu categories">
            <p className="text-sm font-medium text-shop-muted">Categories</p>
            <ul className="-mx-2 mt-2 space-y-0.5" role="tablist" aria-orientation="vertical">
                {sections.map((s) => {
                    const isActive = active === s.id;
                    return (
                        <li key={s.id}>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onSelect(s.id)}
                                className={cn(
                                    'bc-press relative flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-lg pr-3 pl-4 text-left text-[15px] transition-colors',
                                    isActive ? 'bg-shop-sunken font-semibold text-shop-ink' : 'text-shop-ink hover:bg-shop-sunken',
                                )}
                            >
                                <span
                                    className={cn(
                                        'absolute top-2 bottom-2 left-1 w-1 rounded-full bg-shop-accent transition-transform duration-300 ease-shop',
                                        isActive ? 'scale-y-100' : 'scale-y-0',
                                    )}
                                    aria-hidden
                                />
                                <span className="truncate">{s.name}</span>
                                <span className="text-xs text-shop-muted tabular-nums">{s.count}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

/** Phones/tablets: sticky horizontal chips that follow the scroll position. */
export function CategoryChips({ sections, active, onSelect }: { sections: NavSection[]; active: number | null; onSelect: (id: number) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const chip = ref.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
        const bar = ref.current;
        if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
    }, [active]);

    return (
        <div ref={ref} role="tablist" aria-label="Menu categories" className="bc-rail flex gap-2 overflow-x-auto px-4 py-2.5">
            {sections.map((s) => {
                const isActive = active === s.id;
                return (
                    <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        data-chip={s.id}
                        onClick={() => onSelect(s.id)}
                        className={cn(
                            'bc-press h-10 shrink-0 cursor-pointer rounded-full px-4 text-sm font-semibold whitespace-nowrap',
                            isActive ? 'bg-shop-ink text-shop-bg' : 'bg-shop-surface text-shop-ink ring-1 ring-shop-line hover:bg-shop-sunken',
                        )}
                    >
                        {s.name}
                    </button>
                );
            })}
        </div>
    );
}
