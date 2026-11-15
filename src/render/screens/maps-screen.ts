// The Maps screen (main menu): each stage's map with its trophy requirement, how its formations fly, its five
// monsters by role, and a live demo meadow on the map running its real formations (see game/map-preview.ts).
import * as C from '@/core/config';
import { MAPS } from '@/data/maps';
import { monstersFor } from '@/data/monsters';
import { STAGES, stageFor } from '@/data/stages';
import type { Layout, MapTheme, MapsView, MonsterKind, MonsterSheet } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText } from '@/render/draw';
import { drawTrophy } from '@/render/icons';
import { ARCADE, FONT } from '@/render/theme';
import { drawPadlock } from './map-screen';
import { tallMenuFit } from './menu-fit';
import type { DemoDraw } from './roster-screen';
import { drawTopBar } from './top-bar';

/** Where things go in each layout, in its design units. */
const LAYOUT = {
    wide: {
        W: C.VIEW_W,
        info: { x: 14, y: 62, w: 306 },
        demo: { x: 340, y: 43, w: 150 },
        rowY: 278,
        r: 14,
        tile: 58,
    },
    tall: {
        W: C.TALL_W,
        info: { x: 12, y: 66, w: 240 },
        demo: { x: 37, y: 190, w: 190 },
        rowY: 474,
        r: 14,
        tile: 48,
    },
} as const;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each map's medallion sits along the bottom, in a layout's design units. */
function designMedallions(layout: Layout, dy = 0): { x: number; y: number; r: number }[] {
    const L = LAYOUT[layout],
        gap = L.r * 2 + (layout === 'tall' ? 5 : 10);
    const x0 = L.W / 2 - ((MAPS.length - 1) * gap) / 2;
    return MAPS.map((_, i) => ({ x: x0 + i * gap, y: L.rowY + dy, r: L.r }));
}

/** The medallions in view units, for a layout and view height: the tap targets. */
export function mapsMedallions(layout: Layout, h: number = C.TALL_H): { x: number; y: number; r: number }[] {
    if (layout !== 'tall') return designMedallions('wide');
    const f = tallMenuFit(h);
    return designMedallions('tall', tallShift(f.h)).map(m => ({ x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s }));
}

/** Each monster's part in a map's formations, in the order the screen shows them. */
const ROLES: [string, (s: MonsterSheet) => MonsterKind][] = [
    ['PLAIN', s => s.roster[0]],
    ['PLAIN', s => s.roster[1] ?? s.roster[0]],
    ['SHELLED', s => s.shelled],
    ['SPINNER', s => s.spinner],
    ['BIG', s => s.big],
];

/** The Maps screen. */
export class MapsScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: MapsView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0, demo?: DemoDraw): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
            const f = tallMenuFit(h);
            this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            H = f.h;
            dy = tallShift(f.h);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
        }
        const L = LAYOUT[layout];
        drawTopBar(ctx, 'MAPS', L.W, bleed, tall, 16);
        const map = MAPS[v.index],
            locked = v.locked[v.index];
        ctx.save();
        ctx.translate(0, dy);
        // On a widened screen the demo keeps to the right edge and the details sit centred in the room left.
        const win = tall ? L.demo : { ...L.demo, x: L.demo.x + bleed };
        let info: { x: number; y: number; w: number } = L.info;
        if (!tall) {
            const x = L.info.x - bleed,
                room = win.x - 14 - x;
            info = { ...L.info, x: x + Math.max(0, (room - L.info.w) / 2) };
        }
        this.info(map, v.index, locked, info, L.tile, tall, t);
        this.demo(map, win, v.caption, demo);
        ctx.restore();
        designMedallions(layout, dy).forEach((m, i) => this.medallion(MAPS[i], v.locked[i], m, i === v.index, t));
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP A MAP  ·  ◀ BACK' : 'LEFT / RIGHT BROWSE  ·  ESC BACK';
        ctx.fillText(hint, L.W / 2, tall ? H - 14 : H - 10, L.W - 16);
        ctx.restore();
    }

    /** The map's name, where it sits on the trophy road, how its formations fly, and its monsters by role. */
    private info(
        map: MapTheme,
        index: number,
        locked: boolean,
        b: { x: number; y: number; w: number },
        tile: number,
        tall: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const stage = stageFor(map.id);
        const cx = tall ? b.x + b.w / 2 : b.x;
        const align = tall ? 'center' : 'left';
        arcadeText(ctx, map.name.toUpperCase(), cx, b.y, tall ? 20 : 24, ['#ffffff', '#fff0c8', '#ffd27a'], align);
        // Stage number, and open or what opens it.
        ctx.textAlign = align;
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = locked ? '#ffb0b0' : '#8ff0a0';
        const status = locked
            ? `STAGE ${index + 1} OF ${STAGES.length}  ·  LOCKED: ${stage.trophies}`
            : `STAGE ${index + 1} OF ${STAGES.length}  ·  OPEN`;
        ctx.fillText(status, cx, b.y + 16, b.w);
        if (locked) {
            const sw = ctx.measureText(status).width;
            drawTrophy(ctx, tall ? cx + sw / 2 + 8 : cx + sw + 8, b.y + 13, 8);
        }
        ctx.font = `italic 600 ${tall ? 9 : 10}px ${FONT}`;
        ctx.fillStyle = '#e4dcff';
        ctx.fillText(stage.blurb, cx, b.y + 32, b.w);
        // How hard: a pip per stage along the road.
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        const py = b.y + 46;
        const pips = STAGES.length,
            pw = 9;
        const px0 = tall ? cx - (pips * pw + 42) / 2 : cx;
        ctx.textAlign = 'left';
        ctx.fillText('DIFFICULTY', px0, py + 3);
        for (let i = 0; i < pips; i++) {
            ctx.fillStyle =
                i <= index ? (i >= 5 ? '#ff7a6a' : i >= 3 ? '#ffd45c' : '#8ff0a0') : 'rgba(255,255,255,0.14)';
            ctx.fillRect(px0 + 46 + i * pw, py - 3, pw - 3, 6);
        }
        // The monsters, each with its part in the formations.
        const sheet = monstersFor(map.id);
        if (!sheet) return;
        const ty = b.y + 58;
        ctx.textAlign = align;
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        if (!tall) ctx.fillText('MONSTERS', cx, ty + 4);
        const top = ty + (tall ? 0 : 10);
        const gap = tall ? 0 : 2;
        const x0 = tall ? b.x + (b.w - ROLES.length * tile) / 2 : b.x;
        ROLES.forEach(([role, kindOf], i) => {
            const kind = kindOf(sheet);
            this.monsterTile(sheet, kind, role, x0 + i * (tile + gap), top, tile, t + i * 0.7);
        });
    }

    /** One monster in a tile: its idle frame (talking now and then), its part, and its name. */
    private monsterTile(
        s: MonsterSheet,
        kind: MonsterKind,
        role: string,
        x: number,
        y: number,
        w: number,
        t: number,
    ): void {
        const ctx = this.ctx;
        const h = w + 16;
        ctx.fillStyle = 'rgba(20,12,48,0.85)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(201,162,74,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (s.img.complete && s.img.naturalWidth) {
            const c = (t * 0.5) % 4;
            const frame = c < 0.4 ? 6 : c > 3.6 ? 7 : 5;
            const d = w * 1.05,
                bob = Math.sin(t * 3) * 1;
            ctx.drawImage(
                s.img,
                frame * s.cell,
                (s.rows[kind] ?? 0) * s.cell,
                s.cell,
                s.cell,
                x + (w - d) / 2,
                y + (w - d) / 2 + 4 + bob,
                d,
                d,
            );
        }
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(role, x + w / 2, y + 9, w - 4);
        ctx.font = `600 ${w > 50 ? 7.5 : 6.5}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.names[kind] ?? kind, x + w / 2, y + h - 5, w - 4);
    }

    /** The live demo window: the map's meadow running its formations, with a caption for the one in view. */
    private demo(map: MapTheme, d: { x: number; y: number; w: number }, caption: string, draw?: DemoDraw): void {
        const ctx = this.ctx;
        const s = d.w / C.FIELD_W_BASE,
            h = C.FIELD_H_BASE * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x, d.y, d.w, h);
        ctx.clip();
        if (draw) draw(d.x, d.y, s);
        else {
            ctx.fillStyle = map.sky[0];
            ctx.fillRect(d.x, d.y, d.w, h);
        }
        if (caption) {
            const g = ctx.createLinearGradient(0, d.y + h - 30, 0, d.y + h);
            g.addColorStop(0, 'rgba(8,5,24,0)');
            g.addColorStop(1, 'rgba(8,5,24,0.9)');
            ctx.fillStyle = g;
            ctx.fillRect(d.x, d.y + h - 30, d.w, 30);
            ctx.textAlign = 'center';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(caption.toUpperCase(), d.x + d.w / 2, d.y + h - 8, d.w - 10);
        }
        ctx.restore();
        ctx.strokeStyle = map.cone[0];
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x, d.y, d.w, h);
    }

    /** A map's medallion: its colours and its slime, padlocked while the stage is locked, gold-ringed when chosen. */
    private medallion(
        map: MapTheme,
        locked: boolean,
        m: { x: number; y: number; r: number },
        on: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const r = on ? m.r + 2 : m.r;
        ctx.save();
        const g = ctx.createLinearGradient(0, m.y - r, 0, m.y + r);
        g.addColorStop(0, map.sky[1]);
        g.addColorStop(1, map.top[2]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        const s = monstersFor(map.id);
        if (s && s.img.complete && s.img.naturalWidth) {
            const d = r * 2.3;
            const kind = s.roster[0];
            ctx.drawImage(
                s.img,
                5 * s.cell,
                (s.rows[kind] ?? 0) * s.cell,
                s.cell,
                s.cell,
                m.x - d / 2,
                m.y - d / 2 + 1,
                d,
                d,
            );
        }
        if (locked) {
            ctx.fillStyle = 'rgba(8,5,22,0.6)';
            ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
        }
        ctx.restore();
        if (locked) drawPadlock(ctx, m.x, m.y - r * 0.3, r * 0.9);
        ctx.strokeStyle = on ? '#ffd86b' : locked ? '#5a4f7a' : '#a8894a';
        ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.4 : 1.2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}
