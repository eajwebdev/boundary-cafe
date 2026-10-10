import { Head } from '@inertiajs/react';
import { Download, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';
import { useBusinessName, useRewardsName, useTagline } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';

interface Props {
    customer: { name: string; customer_number: string; loyalty_token: string; points: number; branch: string | null; joined_at: string | null };
}

export default function LoyaltyCard({ customer }: Props) {
    const logoUrl = useLogoUrl();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    const tagline = useTagline();
    const cardRef = useRef<HTMLDivElement>(null);
    const downloadQr = () => {
        const svg = cardRef.current?.querySelector('svg');
        if (!svg) return;
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${customer.customer_number}-qr.svg`;
        link.click();
        URL.revokeObjectURL(link.href);
    };
    return (
        <div className="min-h-screen bg-[var(--boundary-cream)] px-4 py-10">
            <Head title={`${customer.name} — ${rewardsName}`} />
            <div className="mx-auto max-w-md">
                <div ref={cardRef} className="overflow-hidden rounded-[2rem] bg-[var(--boundary-blue)] p-7 text-white shadow-2xl">
                    <div className="flex items-center justify-between">
                        <img src={logoUrl} alt={businessName} className="h-16 w-16 object-contain" />
                        <div className="text-right">
                            <p className="font-black uppercase">{rewardsName}</p>
                            {tagline && <p className="text-xs text-white/65">{tagline}</p>}
                        </div>
                    </div>
                    <div className="mt-8 rounded-3xl bg-white p-6 text-center text-[var(--boundary-ink)]">
                        <QRCodeSVG value={customer.loyalty_token} size={220} level="H" includeMargin className="mx-auto max-w-full" />
                        <p className="mt-4 font-mono text-sm font-bold">{customer.customer_number}</p>
                    </div>
                    <p className="mt-7 text-2xl font-black">{customer.name}</p>
                    <div className="mt-3 flex items-end justify-between">
                        <p className="text-sm text-white/65">{customer.branch ?? `All ${businessName} branches`}</p>
                        <p className="text-right">
                            <span className="block text-3xl font-black">{customer.points}</span>
                            <span className="text-xs text-white/65">available points</span>
                        </p>
                    </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                        onClick={downloadQr}
                        className="flex items-center justify-center gap-2 rounded-full bg-[var(--boundary-orange)] px-4 py-3 font-bold text-white"
                    >
                        <Download size={18} /> Download QR
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 font-bold text-[var(--boundary-blue)] ring-1 ring-black/10"
                    >
                        <Printer size={18} /> Print card
                    </button>
                </div>
                <p className="mt-6 text-center text-sm text-black/50">
                    Present this QR before payment. It contains only your secure loyalty identifier.
                </p>
            </div>
        </div>
    );
}
