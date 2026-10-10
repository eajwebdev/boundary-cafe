import { useRef, useState } from 'react';

/** Keys closer together than this are a barcode scanner, not a person. */
const SCANNER_GAP_MS = 30;

/**
 * Quantity box for an order line. A blank or half-typed value is never committed (so clearing the
 * box to retype does not drop the line), and a barcode-scanner burst that lands here is undone and
 * handed to the search box instead of turning into a huge quantity.
 */
export default function QtyInput({
    value,
    onCommit,
    onScannerBurst,
    className,
    ariaLabel,
}: {
    value: number;
    onCommit: (qty: number) => void;
    /** Receives the characters the scanner already typed; the rest of the burst follows into the search box. */
    onScannerBurst: (typed: string) => void;
    className?: string;
    ariaLabel: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const lastKey = useRef<{ time: number; key: string; qtyBefore: number } | null>(null);

    return (
        <input
            type="text"
            inputMode="decimal"
            value={draft ?? String(value)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
                const text = e.target.value;
                setDraft(text);
                const qty = parseFloat(text);
                if (/^\d*\.?\d+$/.test(text.trim()) && qty > 0) {
                    onCommit(qty);
                }
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.currentTarget.blur();
                    return;
                }
                if (e.key.length !== 1) return;

                const now = performance.now();
                const previous = lastKey.current;
                if (previous && now - previous.time < SCANNER_GAP_MS) {
                    e.preventDefault();
                    lastKey.current = null;
                    setDraft(null);
                    onCommit(previous.qtyBefore);
                    onScannerBurst(previous.key + e.key);
                    return;
                }
                lastKey.current = { time: now, key: e.key, qtyBefore: value };
            }}
            className={className}
            aria-label={ariaLabel}
            autoComplete="off"
        />
    );
}
