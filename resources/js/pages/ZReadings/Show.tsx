import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Banknote, Printer, Receipt, Wallet, XCircle } from 'lucide-react';
import { useRef } from 'react';

import { PageHeader, Panel, Stat, StatStrip, StatusPill, thCls, useFlashToasts } from '@/components/AdminKit';
import { Button } from '@/components/ui/button';
import AdminLayout from '@/layouts/AdminLayout';
import { fmtDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { routes } from '@/routes';

import { CHANNEL_LABELS, PAYMENT_LABELS, overShortLabel, overShortTone, peso, zLabel } from './kit';
import type { ZFigures } from './kit';

interface Reading extends ZFigures {
    id: number;
    z_number: number;
    business_date: string;
    previous_grand_total: number;
    grand_total: number;
    generated_at: string;
    generated_by_name: string | null;
    reprint_count: number;
    notes: string | null;
}

interface PageProps {
    reading: Reading;
    business: { name: string; tin: string; branch: string | null; address: string | null };
    [key: string]: unknown;
}

const PRINT_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; width: 300px; margin: 0 auto; padding: 12px 8px; color: #000; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .big { font-size: 15px; letter-spacing: 2px; }
    .muted { color: #444; }
    .divider { border-top: 1px dashed #888; margin: 6px 0; }
    .heading { font-weight: bold; margin-top: 4px; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
    .row .val { text-align: right; white-space: nowrap; }
    .indent { padding-left: 8px; }
    .total { font-weight: bold; font-size: 12px; }
    @media print { body { width: 100%; } }
`;

export default function ZReadingShow() {
    const { reading, business } = usePage<PageProps>().props;
    useFlashToasts();
    const printRef = useRef<HTMLDivElement>(null);

    const copyLabel = reading.reprint_count === 0 ? 'ORIGINAL' : `REPRINT #${reading.reprint_count}`;

    const print = () => {
        const content = printRef.current?.innerHTML;
        const w = content ? window.open('', '_blank', 'width=380,height=700,scrollbars=yes') : null;
        if (!w || !content) {
            return;
        }
        w.document.write(
            `<!DOCTYPE html><html><head><title>${zLabel(reading.z_number)}</title><style>${PRINT_CSS}</style></head><body>${content}</body></html>`,
        );
        w.document.close();
        setTimeout(() => w.print(), 300);
        router.post(routes.zReadings.reprint(reading.id), {}, { preserveScroll: true });
    };

    return (
        <AdminLayout>
            <Head title={`${zLabel(reading.z_number)} · Z-Reading`} />

            <div className="space-y-4">
                <PageHeader
                    leading={
                        <Link href={routes.zReadings.index()} aria-label="Back to Z-readings">
                            <Button variant="outline" size="icon" className="h-9 w-9">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                    }
                    title={`${zLabel(reading.z_number)} · ${fmtDate(`${reading.business_date}T12:00:00`, 'EEE, MMM d, yyyy')}`}
                    subtitle={`Closed by ${reading.generated_by_name ?? '—'} on ${fmtDate(reading.generated_at, 'MMM d, h:mm a')}${
                        reading.reprint_count > 0 ? ` · printed ${reading.reprint_count}×` : ''
                    }`}
                >
                    <Button className="h-9 gap-1.5" onClick={print}>
                        <Printer className="h-4 w-4" /> {reading.reprint_count === 0 ? 'Print' : 'Reprint'}
                    </Button>
                </PageHeader>

                <StatStrip count={4}>
                    <Stat icon={Wallet} label="Net sales" value={peso(reading.net_sales)} tone="success" />
                    <Stat icon={Receipt} label="Transactions" value={reading.transaction_count.toLocaleString()} />
                    <Stat
                        icon={XCircle}
                        label="Voids"
                        value={reading.void_count > 0 ? `${reading.void_count} · ${peso(reading.void_amount)}` : 'None'}
                        tone={reading.void_count > 0 ? 'warning' : 'muted'}
                    />
                    <Stat
                        icon={Banknote}
                        label="Cash over / short"
                        value={overShortLabel(reading.over_short)}
                        tone={Math.abs(reading.over_short) < 0.005 ? 'success' : 'warning'}
                    />
                </StatStrip>

                <div className="grid items-start gap-4 lg:grid-cols-[360px_1fr]">
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                        <div ref={printRef} className="font-mono text-xs leading-relaxed">
                            <ZReceipt reading={reading} business={business} copyLabel={copyLabel} />
                        </div>
                    </div>

                    <Panel flush icon={Banknote} title="Cash sessions">
                        {reading.sessions.length === 0 ? (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No cash sessions on this day.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-border">
                                        <tr>
                                            <th className={thCls}>Cashier</th>
                                            <th className={cn(thCls, 'hidden text-right sm:table-cell')}>Opening</th>
                                            <th className={cn(thCls, 'text-right')}>Expected</th>
                                            <th className={cn(thCls, 'text-right')}>Counted</th>
                                            <th className={cn(thCls, 'text-right')}>Over / short</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {reading.sessions.map((s) => (
                                            <tr
                                                key={s.id}
                                                className="cursor-pointer hover:bg-muted/30"
                                                onClick={() => router.visit(routes.cashSessions.show(s.id))}
                                            >
                                                <td className="px-4 py-2">
                                                    <p className="font-semibold">{s.cashier}</p>
                                                    <p className="font-mono text-[11px] text-muted-foreground">{s.session_number}</p>
                                                </td>
                                                <td className="hidden px-4 py-2 text-right tabular-nums sm:table-cell">{peso(s.opening_cash)}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{peso(s.expected_cash)}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">{peso(s.counted_cash)}</td>
                                                <td className="px-4 py-2 text-right">
                                                    <StatusPill tone={overShortTone(s.over_short)}>{overShortLabel(s.over_short)}</StatusPill>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {reading.notes && (
                            <div className="border-t border-border px-4 py-3 text-sm">
                                <p className="text-[11px] font-semibold text-muted-foreground">Notes</p>
                                <p className="whitespace-pre-line">{reading.notes}</p>
                            </div>
                        )}
                    </Panel>
                </div>
            </div>
        </AdminLayout>
    );
}

// ─── Printable receipt ────────────────────────────────────────────────────────
// Plain class names (row, val, divider…) style the print window; Tailwind styles the screen.

function Row({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
    return (
        <div className={cn('row flex justify-between gap-2', className)}>
            <span>{label}</span>
            <span className="val text-right whitespace-nowrap tabular-nums">{value}</span>
        </div>
    );
}

const Divider = () => <div className="divider my-1.5 border-t border-dashed border-border" />;

function Heading({ children }: { children: React.ReactNode }) {
    return <p className="heading mt-1 font-bold">{children}</p>;
}

function ZReceipt({ reading, business, copyLabel }: { reading: Reading; business: PageProps['business']; copyLabel: string }) {
    return (
        <>
            <div className="center text-center">
                <p className="bold text-sm font-bold">{business.name}</p>
                {business.branch && <p>{business.branch}</p>}
                {business.address && <p className="muted text-muted-foreground">{business.address}</p>}
                {business.tin && <p>TIN {business.tin}</p>}
                <Divider />
                <p className="bold big text-base font-bold tracking-widest">Z-READING</p>
                <p>{copyLabel}</p>
            </div>
            <Divider />
            <Row label="Z counter" value={zLabel(reading.z_number)} />
            <Row label="Business day" value={fmtDate(`${reading.business_date}T12:00:00`, 'MMM d, yyyy')} />
            <Row label="Generated" value={fmtDate(reading.generated_at, 'MMM d, yyyy h:mm a')} />
            <Row label="Closed by" value={reading.generated_by_name ?? '—'} />
            <Row label="Beg. receipt" value={reading.first_receipt ?? '—'} />
            <Row label="End. receipt" value={reading.last_receipt ?? '—'} />
            <Divider />

            <Heading>SALES</Heading>
            <Row label="Gross sales" value={peso(reading.gross_sales)} />
            <Row label="Less discounts" value={`−${peso(reading.discount_total)}`} />
            {reading.loyalty_discount_total > 0 && <Row label="Less loyalty" value={`−${peso(reading.loyalty_discount_total)}`} />}
            <Row label="NET SALES" value={peso(reading.net_sales)} className="total font-bold" />
            {reading.delivery_fees > 0 && <Row label="Incl. delivery fees" value={peso(reading.delivery_fees)} className="indent pl-2" />}
            <Row label="Transactions" value={reading.transaction_count} />
            <Row label="Items sold" value={reading.items_sold} />
            <Row label={`Voids (${reading.void_count})`} value={peso(reading.void_amount)} />
            {reading.unpaid_total > 0 && <Row label="Unpaid on credit" value={peso(reading.unpaid_total)} />}

            {reading.vat_enabled && (
                <>
                    <Divider />
                    <Heading>VAT ({reading.vat_rate}%)</Heading>
                    <Row label="VATable sales" value={peso(reading.vatable_sales)} />
                    <Row label="VAT amount" value={peso(reading.vat_amount)} />
                    <Row label="VAT-exempt" value={peso(reading.vat_exempt_sales)} />
                </>
            )}

            <Divider />
            <Heading>PAYMENTS</Heading>
            {reading.payments.length === 0 && <p className="muted text-muted-foreground">No sales</p>}
            {reading.payments.map((p) => (
                <Row key={p.method} label={`${PAYMENT_LABELS[p.method] ?? p.method} (${p.count})`} value={peso(p.amount)} />
            ))}
            {reading.collections_count > 0 && <Row label={`Collections (${reading.collections_count})`} value={peso(reading.collections_total)} />}

            {reading.channels.length > 1 && (
                <>
                    <Divider />
                    <Heading>BY CHANNEL</Heading>
                    {reading.channels.map((c) => (
                        <Row key={c.channel} label={`${CHANNEL_LABELS[c.channel] ?? c.channel} (${c.count})`} value={peso(c.amount)} />
                    ))}
                </>
            )}

            <Divider />
            <Heading>CASH DRAWER</Heading>
            <Row label="Opening cash" value={peso(reading.opening_cash)} />
            <Row label="Expected cash" value={peso(reading.expected_cash)} />
            <Row label="Counted cash" value={peso(reading.counted_cash)} />
            <Row label="Over / short" value={overShortLabel(reading.over_short)} className="total font-bold" />
            {reading.sessions.map((s) => (
                <Row key={s.id} label={s.cashier} value={overShortLabel(s.over_short)} className="indent pl-2" />
            ))}

            <Divider />
            <Row label="Previous grand total" value={peso(reading.previous_grand_total)} />
            <Row label="New grand total" value={peso(reading.grand_total)} className="total font-bold" />
            <Divider />
            <p className="center muted text-center text-muted-foreground">*** END OF Z-READING ***</p>
        </>
    );
}
