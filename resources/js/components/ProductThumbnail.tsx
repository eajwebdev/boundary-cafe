import { Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
    src?: string | null;
    name?: string;
    categoryName?: string | null;
    unit?: string | null;
    className?: string;
    imgClassName?: string;
    aspect?: string;
    alt?: string;
    padding?: string;
}

export const getDefaultProductIcon = (name = '', categoryName = '', unit = ''): string => {
    const lower = name.toLowerCase();
    const cat = categoryName.toLowerCase();
    const u = unit.toLowerCase();

    // Boundary Cafe categories must resolve before broad retail keywords such as
    // "rice", "coffee", and "snacks".
    if (cat.includes('signature blend')) return '/images/products/boundary/signature-blend.svg';
    if (cat === 'coffee')
        return lower.includes('americano') || lower.includes('hot')
            ? '/images/products/boundary/coffee-hot.svg'
            : '/images/products/boundary/coffee-iced.svg';
    if (cat.includes('non-coffee')) return '/images/products/boundary/non-coffee.svg';
    if (cat.includes('frappe')) return '/images/products/boundary/frappe.svg';
    if (cat.includes('sulit meal')) return '/images/products/boundary/sulit-meal.svg';
    if (cat === 'burgers' || cat === 'burger') return '/images/products/boundary/burger.svg';
    if (cat.includes('snacks and sides')) return '/images/products/boundary/snacks.svg';
    if (cat.includes('shareable plate')) return '/images/products/boundary/shareable-plate.svg';
    if (cat.includes('combo')) return '/images/products/boundary/combo.svg';
    if (cat.includes('dessert')) return '/images/products/boundary/dessert.svg';
    if (cat.includes('add-on') || cat.includes('addon')) return '/images/products/boundary/addon.svg';

    if (lower.includes('rice') || cat.includes('rice')) {
        return u === 'sack' || lower.includes('sack') ? '/images/products/rice-sack.svg' : '/images/products/rice.svg';
    }
    if (lower.includes('feed') || cat.includes('feed')) {
        return u === 'bag' || u === 'sack' || lower.includes('bag') ? '/images/products/feeds-bag.svg' : '/images/products/feeds.svg';
    }
    if (
        cat.includes('beverage') ||
        lower.includes('beer') ||
        lower.includes('coke') ||
        lower.includes('bottle') ||
        lower.includes('juice') ||
        lower.includes('drink')
    ) {
        return lower.includes('bottle') ? '/images/products/beverage-bottle.svg' : '/images/products/beverage-can.svg';
    }
    if (cat.includes('canned') || lower.includes('sardines') || lower.includes('beef') || lower.includes('tuna') || lower.includes('pork')) {
        return '/images/products/canned.svg';
    }
    if (cat.includes('noodle') || lower.includes('canton') || lower.includes('mami') || lower.includes('ramen')) {
        return '/images/products/noodles.svg';
    }
    if (cat.includes('condiment') || lower.includes('sauce') || lower.includes('vinegar') || lower.includes('oil') || lower.includes('patis')) {
        return '/images/products/condiments.svg';
    }
    if (cat.includes('coffee') || lower.includes('nescafe') || lower.includes('kopiko') || lower.includes('creamer')) {
        return '/images/products/coffee.svg';
    }
    if (cat.includes('snack') || lower.includes('chips') || lower.includes('piattos') || lower.includes('biscuit')) {
        return '/images/products/snacks.svg';
    }
    if (
        cat.includes('hygiene') ||
        cat.includes('personal') ||
        cat.includes('care') ||
        lower.includes('soap') ||
        lower.includes('shampoo') ||
        lower.includes('paste')
    ) {
        return '/images/products/hygiene.svg';
    }
    return '/images/products/default-product.svg';
};

export default function ProductThumbnail({
    src,
    name = '',
    categoryName = '',
    unit = '',
    className,
    imgClassName,
    aspect = 'aspect-[4/3]',
    alt = '',
    padding = 'p-3',
}: Props) {
    const [failed, setFailed] = useState(false);
    const [fallbackFailed, setFallbackFailed] = useState(false);

    const fallbackIcon = useMemo(() => getDefaultProductIcon(name, categoryName ?? '', unit ?? ''), [name, categoryName, unit]);

    // If src is provided and hasn't failed, use it. Otherwise use the smart SVG fallback.
    const activeSrc = !failed && src ? src : fallbackIcon;

    useEffect(() => {
        setFailed(false);
        setFallbackFailed(false);
    }, [src, fallbackIcon]);

    if (fallbackFailed) {
        return (
            <div
                className={cn(
                    'relative flex w-full items-center justify-center overflow-hidden bg-slate-100 select-none dark:bg-muted/40',
                    aspect,
                    className,
                )}
            >
                <Package className="h-10 w-10 text-muted-foreground/30" />
            </div>
        );
    }

    return (
        <div
            className={cn(
                'group/thumb relative flex w-full items-center justify-center overflow-hidden bg-slate-50/90 select-none dark:bg-muted/30',
                aspect,
                padding,
                className,
            )}
        >
            <img
                src={activeSrc}
                alt={alt || (name ? `${name} product thumbnail` : 'Product thumbnail')}
                className={cn(
                    'h-full w-full object-contain drop-shadow-xs transition-transform duration-200 group-hover/thumb:scale-105',
                    imgClassName,
                )}
                loading="lazy"
                onError={() => {
                    if (!failed && src) {
                        setFailed(true);
                    } else {
                        setFallbackFailed(true);
                    }
                }}
            />
        </div>
    );
}
