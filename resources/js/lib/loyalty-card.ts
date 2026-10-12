/**
 * Draws the digital loyalty card onto a canvas and downloads it as a PNG (no extra libraries).
 * The QR comes from a <QRCodeCanvas> already on the page. The points shown are a snapshot —
 * the cashier's POS always reads the live balance from the server.
 */
export interface LoyaltyCardImage {
    businessName: string;
    rewardsName: string;
    logoUrl: string | null;
    name: string;
    memberId: string;
    maskedContact: string | null;
    points: number;
    tier: string | null;
    qrCanvas: HTMLCanvasElement;
}

const WIDTH = 1012; // CR80 card ratio (85.6 × 54 mm) at ~300 dpi
const HEIGHT = 638;

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
    return cut + '…';
}

export async function renderLoyaltyCard(card: LoyaltyCardImage): Promise<HTMLCanvasElement> {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

    // Card body: deep navy with a warm glow, rounded like a real card.
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 44);
    ctx.save();
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#16224f');
    bg.addColorStop(1, '#0b1233');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(WIDTH * 0.95, -40, 10, WIDTH * 0.95, -40, 520);
    glow.addColorStop(0, 'rgba(255,106,31,0.45)');
    glow.addColorStop(1, 'rgba(255,106,31,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Dotted route line along the bottom (the café's motif).
    ctx.strokeStyle = 'rgba(255,106,31,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([3, 14]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(10, HEIGHT - 50);
    ctx.bezierCurveTo(240, HEIGHT - 50, 260, HEIGHT - 110, 480, HEIGHT - 95);
    ctx.bezierCurveTo(700, HEIGHT - 80, 760, HEIGHT - 20, WIDTH - 10, HEIGHT - 60);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Logo + brand
    const logo = card.logoUrl ? await loadImage(card.logoUrl) : null;
    let brandX = 56;
    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(56 + 40, 56 + 40, 40, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.clip();
        ctx.drawImage(logo, 56 + 6, 56 + 6, 68, 68);
        ctx.restore();
        brandX = 56 + 80 + 20;
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 34px ${sans}`;
    ctx.fillText(fitText(ctx, card.businessName, 480), brandX, 92);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 20px ${sans}`;
    ctx.fillText(fitText(ctx, (card.tier ? `${card.tier} · ` : '') + card.rewardsName.toUpperCase(), 480), brandX, 124);

    // QR on a white tile (right)
    const tile = 300;
    const tileX = WIDTH - tile - 56;
    const tileY = 56;
    roundRect(ctx, tileX, tileY, tile, tile, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(card.qrCanvas, tileX + 22, tileY + 22, tile - 44, tile - 44);
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 18px ${sans}`;
    ctx.textAlign = 'center';
    ctx.fillText('Scan at the counter', tileX + tile / 2, tileY + tile + 34);
    ctx.textAlign = 'left';

    // Member details (left)
    const left = 56;
    const textWidth = tileX - left - 40;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 46px ${sans}`;
    ctx.fillText(fitText(ctx, card.name, textWidth), left, 268);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 24px ui-monospace, "SFMono-Regular", Consolas, monospace`;
    ctx.fillText(card.memberId, left, 308);
    if (card.maskedContact) {
        ctx.font = `500 22px ${sans}`;
        ctx.fillText(card.maskedContact, left, 344);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 72px ${sans}`;
    ctx.fillText(card.points.toLocaleString(), left, 470);
    const pointsWidth = ctx.measureText(card.points.toLocaleString()).width;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 24px ${sans}`;
    ctx.fillText('points', left + pointsWidth + 14, 470);
    ctx.font = `500 18px ${sans}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`Balance as of ${new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`, left, 502);

    return canvas;
}

export async function downloadLoyaltyCard(card: LoyaltyCardImage): Promise<void> {
    const canvas = await renderLoyaltyCard(card);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create the card image.');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${card.memberId}-loyalty-card.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
