import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface Props {
    children: React.ReactNode;
    /** Classes for the row of items (gap, alignment). The page gutter is built in. */
    className?: string;
    /** Vertical placement of the arrows; defaults to the middle of the rail. */
    arrowClassName?: string;
}

/** Horizontal rail: swipe on touch, round arrow buttons on desktop when there is more to see. */
export default function ScrollRail({ children, className, arrowClassName = 'top-1/2' }: Props) {
    const scroller = useRef<HTMLDivElement>(null);
    const track = useRef<HTMLDivElement>(null);
    const [canBack, setCanBack] = useState(false);
    const [canForward, setCanForward] = useState(false);

    useEffect(() => {
        const el = scroller.current;
        if (!el) return;
        const update = () => {
            setCanBack(el.scrollLeft > 4);
            setCanForward(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
        };
        update();
        el.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(el);
        if (track.current) observer.observe(track.current);
        return () => {
            el.removeEventListener('scroll', update);
            observer.disconnect();
        };
    }, []);

    const page = (direction: 1 | -1) => {
        const el = scroller.current;
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
    };

    const arrow = 'bc-press absolute z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-shop-surface text-shop-ink shadow-shop-md ring-1 ring-shop-line hover:bg-shop-sunken lg:flex';

    return (
        <div className="relative">
            <div ref={scroller} className="bc-rail snap-x snap-mandatory scroll-px-4 overflow-x-auto lg:scroll-px-0">
                <div ref={track} className={cn('flex w-max px-4 lg:px-0', className)}>
                    {children}
                </div>
            </div>
            {canBack && (
                <button type="button" onClick={() => page(-1)} className={cn(arrow, '-left-4', arrowClassName)} aria-label="Scroll back">
                    <ArrowLeft className="h-5 w-5" />
                </button>
            )}
            {canForward && (
                <button type="button" onClick={() => page(1)} className={cn(arrow, '-right-4', arrowClassName)} aria-label="Scroll forward">
                    <ArrowRight className="h-5 w-5" />
                </button>
            )}
        </div>
    );
}
