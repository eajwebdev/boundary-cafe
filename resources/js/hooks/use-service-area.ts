import { usePage } from '@inertiajs/react';

export interface ServiceArea {
    town: string;
    province: string;
}

/** The town and province online orders are delivered in (Delivery Zone settings), e.g. Mabinay, Negros Oriental. */
export function useServiceArea(): ServiceArea {
    const area = usePage<{ service_area?: ServiceArea | null }>().props.service_area;

    return { town: area?.town || 'Mabinay', province: area?.province || 'Negros Oriental' };
}
