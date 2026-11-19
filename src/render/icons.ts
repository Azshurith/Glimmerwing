/* Small icons for the HUD and warning cues. */

/** Draw a heart for the HUD. */
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string | CanvasGradient): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + 3.5);
    ctx.bezierCurveTo(x - 6, y - 0.5, x - 3, y - 5, x, y - 2);
    ctx.bezierCurveTo(x + 3, y - 5, x + 6, y - 0.5, x, y + 3.5);
    ctx.fill();
}
/** Little five-petal flower used for the bloom stock. */
export function drawBlossom(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}
/** The little crescent moon on the moonseed warning. */
export function drawCrescentIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#cfe9ff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#140a26';
    ctx.beginPath();
    ctx.arc(x + 2.5, y - 1.5, 4.2, 0, Math.PI * 2);
    ctx.fill();
}

/** A small gold trophy cup centred on (x, y), about `s` units tall. */
export function drawTrophy(ctx: CanvasRenderingContext2D, x: number, y: number, s = 9): void {
    const k = s / 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.fillStyle = '#ffd45c';
    ctx.strokeStyle = '#7a4a10';
    ctx.lineWidth = 0.8;
    // Handles, then the cup, the stem and the foot.
    ctx.beginPath();
    ctx.arc(-3.6, -2, 1.8, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(3.6, -2, 1.8, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3.6, -4.5);
    ctx.lineTo(3.6, -4.5);
    ctx.quadraticCurveTo(3.4, 0.8, 0, 1.2);
    ctx.quadraticCurveTo(-3.4, 0.8, -3.6, -4.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-0.8, 1, 1.6, 2);
    ctx.beginPath();
    ctx.rect(-2.6, 3, 5.2, 1.6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-2.4, -3.8, 1, 2.6);
    ctx.restore();
}
