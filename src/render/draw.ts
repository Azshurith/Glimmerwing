import { ARCADE } from './theme';

/* Small canvas drawing helpers shared by the renderer and the menu screens. */

/** A parallelogram path builder: the top edge leans right by `slant` (negative leans left). */
export function slanted(
  x: number,
  y: number,
  w: number,
  h: number,
  slant: number,
): (ctx: CanvasRenderingContext2D) => void {
  return ctx => {
    ctx.beginPath();
    if (slant >= 0) {
      ctx.moveTo(x + slant, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - slant, y + h);
      ctx.lineTo(x, y + h);
    } else {
      const s = -slant;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - s, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + s, y + h);
    }
    ctx.closePath();
  };
}

export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Outlined, gradient-filled heading text with a drop shadow, arcade style. */
export function arcadeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  stops: [string, string, string],
  align: CanvasTextAlign,
  maxWidth?: number,
): void {
  ctx.save();
  ctx.font = `${size}px ${ARCADE}`;
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#12081f';
  ctx.fillText(text, x + size * 0.08, y + size * 0.1, maxWidth);
  ctx.strokeStyle = '#2a0f2e';
  ctx.lineWidth = Math.max(2, size * 0.18);
  ctx.strokeText(text, x, y, maxWidth);
  const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.5, stops[1]);
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillText(text, x, y, maxWidth);
  ctx.restore();
}

/** Darkens a #rrggbb colour toward black. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (s: number) => Math.round(((n >> s) & 255) * k);
  return `rgb(${f(16)},${f(8)},${f(0)})`;
}
