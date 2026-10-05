import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface NavSection {
    id: number;
    name: string;
    count: number;
}

/** Desktop: sticky vertical category rail with counts and an active bar. */
export function CategoryRail({ sections, active, onSelect }: { sections: NavSection[]; active: number | null; onSelect: (id: number) => void }) {
    return (
        <nav aria-label="Menu categories">
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.14em] text-shop-muted uppercase">Menu</p>
            <ul className="space-y-0.5" role="tablist" aria-orientation="vertical">
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
                                    'bc-press relative flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl pr-3 pl-4 text-left text-[15px] transition-colors',
                                    isActive ? 'bg-shop-surface font-semibold text-shop-ink shadow-shop-sm' : 'text-shop-muted hover:bg-shop-sunken hover:text-shop-ink',
                                )}
                            >
                                <span
                                    className={cn(
                                        'absolute top-2.5 bottom-2.5 left-1 w-1 rounded-full bg-shop-accent transition-transform duration-300 ease-shop',
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
