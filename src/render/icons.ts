/* Small icons for the HUD and warning cues. */

/** Draw a heart for the HUD. */
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
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
