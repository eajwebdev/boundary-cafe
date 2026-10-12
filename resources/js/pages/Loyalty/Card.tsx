import { Head } from '@inertiajs/react';
import { Download, Printer } from 'lucide-react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useRef, useState } from 'react';
import { useBusinessName, useRewardsName, useTagline } from '@/hooks/use-business-name';
import { useLogoUrl } from '@/hooks/use-logo';
import { downloadLoyaltyCard } from '@/lib/loyalty-card';

interface Props {
    customer: {
        name: string;
        customer_number: string;
        loyalty_token: string;
        card_url: string;
        masked_contact: string | null;
        points: number;
        branch: string | null;
        joined_at: string | null;
    };
}

export default function LoyaltyCard({ customer }: Props) {
    const logoUrl = useLogoUrl();
    const businessName = useBusinessName();
    const rewardsName = useRewardsName();
    const tagline = useTagline();
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);
    const [downloading, setDownloading] = useState(false);

    const downloadCard = async () => {
        if (!qrCanvasRef.current) return;
        setDownloading(true);
        try {
            await downloadLoyaltyCard({
                businessName,
                rewardsName,
                logoUrl,
                name: customer.name,
                memberId: customer.customer_number,
                maskedContact: customer.masked_contact,
                points: customer.points,
                tier: null,
                qrCanvas: qrCanvasRef.current,
            });
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--boundary-cream)] px-4 py-10">
            <Head title={`${customer.name} — ${rewardsName}`} />
            <div className="mx-auto max-w-md">
                <div className="overflow-hidden rounded-[2rem] bg-[var(--boundary-blue)] p-7 text-white shadow-2xl">
                    <div className="flex items-center justify-between">
                        <img src={logoUrl} alt={businessName} className="h-16 w-16 object-contain" />
                        <div className="text-right">
                            <p className="font-black uppercase">{rewardsName}</p>
                            {tagline && <p className="text-xs text-white/65">{tagline}</p>}
                        </div>
                    </div>
                    <div className="mt-8 rounded-3xl bg-white p-6 text-center text-[var(--boundary-ink)]">
                        <QRCodeSVG value={customer.card_url} size={220} level="H" marginSize={2} className="mx-auto h-auto max-w-full" />
                        <p className="mt-4 font-mono text-sm font-bold">{customer.customer_number}</p>
                    </div>
                    <p className="mt-7 text-2xl font-black">{customer.name}</p>
                    {customer.masked_contact && <p className="font-mono text-sm text-white/65">{customer.masked_contact}</p>}
                    <div className="mt-3 flex items-end justify-between">
                        <p className="text-sm text-white/65">{`All ${businessName} branches`}</p>
                        <p className="text-right">
                            <span className="block text-3xl font-black">{customer.points.toLocaleString()}</span>
                            <span className="text-xs text-white/65">available points</span>
                        </p>
                    </div>
                </div>
                <QRCodeCanvas ref={qrCanvasRef} value={customer.card_url} size={512} level="M" marginSize={0} className="hidden" aria-hidden />
                <div className="mt-5 grid grid-cols-2 gap-3 print:hidden">
                    <button
                        onClick={downloadCard}
                        disabled={downloading}
                        className="flex items-center justify-center gap-2 rounded-full bg-[var(--boundary-orange)] px-4 py-3 font-bold text-white disabled:opacity-60"
                    >
                        <Download size={18} /> {downloading ? 'Preparing…' : 'Download card'}
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 font-bold text-[var(--boundary-blue)] ring-1 ring-black/10"
                    >
                        <Printer size={18} /> Print card
                    </button>
                </div>
                <p className="mt-6 text-center text-sm text-black/50">
                    Show this QR at the counter to earn points. It only identifies you — the cashier always sees your live balance, and points are
                    used only through a reward QR from the app.
                </p>
            </div>
        </div>
    );
}
