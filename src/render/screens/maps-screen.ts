// The Maps screen (main menu): each stage's map with its trophy requirement, how its formations fly, its five
// monsters by role, and a live demo meadow on the map running its real formations (see game/map-preview.ts).
import * as C from '@/core/config';
import { MAPS } from '@/data/maps';
import { monstersFor } from '@/data/monsters';
import { STAGES, stageFor } from '@/data/stages';
import type { Layout, MapTheme, MapsView, MonsterKind, MonsterSheet } from '@/types';
import { drawTrophy } from '@/render/icons';
import { ARCADE, FONT } from '@/render/theme';
import { drawPadlock } from './map-screen';
import { tallMenuFit } from './menu-fit';
import type { DemoDraw } from './roster-screen';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import { gem, goldFrame, goldGradient, keyHints, ornatePanel, ornateScreen, ornateTitle, pointed } from './ornate';

/** Where things go in each layout, in its design units. */
const LAYOUT = {
    wide: {
        W: C.VIEW_W,
        info: { x: 14, y: 44, w: 306 },
        demo: { x: 340, y: 40, w: 148 },
        rowY: 268,
        r: 14,
        tile: 58,
    },
    tall: {
        W: C.TALL_W,
        info: { x: 12, y: 50, w: 240 },
        demo: { x: 57, y: 238, w: 150 },
        rowY: 480,
        r: 13,
        tile: 46,
    },
} as const;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each map's medallion sits along the bottom, in a layout's design units. */
function designMedallions(layout: Layout, dy = 0, bleed = 0): { x: number; y: number; r: number }[] {
    const L = LAYOUT[layout],
        gap = L.r * 2 + (layout === 'tall' ? 5 : 10 + Math.min(14, bleed / 6));
    const x0 = L.W / 2 - ((MAPS.length - 1) * gap) / 2;
    return MAPS.map((_, i) => ({ x: x0 + i * gap, y: L.rowY + dy, r: L.r }));
}

/** The medallions in view units, for a layout, view height and widened-view bleed: the tap targets. */
export function mapsMedallions(layout: Layout, h: number = C.TALL_H, bleed = 0): { x: number; y: number; r: number }[] {
    if (layout !== 'tall') return designMedallions('wide', 0, bleed);
    const f = tallMenuFit(h);
    return designMedallions('tall', tallShift(f.h)).map(m => ({ x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s }));
}

/** Space between the monster tiles on a wide screen. */
const TILE_GAP = 6;

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
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: MapsView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0, demo?: DemoDraw): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            H = f.h;
            dy = tallShift(f.h);
        }
        const L = LAYOUT[layout];
        enter(ctx, 'bg', () => ornateScreen(ctx, t, L.W, H, bleed, '', tall));
        enter(ctx, 'bar', () => ornateTitle(ctx, 'MAPS', L.W, t, tall));
        const map = MAPS[v.index],
            locked = v.locked[v.index];
        ctx.save();
        ctx.translate(0, dy);
        // On a widened screen the demo keeps to the right edge and the details sit centred in the room left.
        const win = tall ? L.demo : { ...L.demo, x: L.demo.x + bleed };
        let info: { x: number; y: number; w: number } = L.info;
        let tile: number = L.tile;
        if (!tall) {
            // The details take all the room from the left edge to the demo; the monster tiles grow to fill it.
            const x = L.info.x - bleed,
                room = win.x - 16 - x;
            info = { ...L.info, x, w: room };
            tile = Math.max(L.tile, Math.min(96, (room - 4 * TILE_GAP) / ROLES.length));
        }
        enter(ctx, 'panels', () => this.info(map, v.index, locked, info, tile, tall, t), { dx: -22 });
        enter(ctx, 'panels', () => this.demo(map, win, v.caption, demo), { dx: 22 });
        ctx.restore();
        const meds = designMedallions(layout, dy, bleed);
        enter(ctx, 'buttons', () => this.tray(meds, t));
        meds.forEach((m, i) =>
            enter(
                ctx,
                'buttons',
                () => {
                    this.medallion(MAPS[i], v.locked[i], m, i === v.index, t);
                    this.nameTag(MAPS[i], m, i === v.index, tall);
                },
                { i },
            ),
        );
        enter(ctx, 'hint', () =>
            keyHints(
                ctx,
                [
                    [['◀', '▶'], 'BROWSE'],
                    [['ESC'], 'BACK'],
                ],
                L.W / 2,
                tall ? H - 12 : H - 9,
                v.touch ? 'TAP A MAP  ·  ◀ BACK' : null,
            ),
        );
        ctx.restore();
    }

    /**
     * The map's header (its medallion as an emblem, its name large in gold, a plaque with its place on the trophy road
     * and whether it's open), how hard it is on a gold-edged plate, what its formations do, and its monsters by role,
     * each on a gold-framed card.
     */
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
        const er = tall ? 17 : 20;
        const ex = b.x + er + 2,
            ey = b.y + er + 2;
        // The emblem, then the name plaque behind the name.
        const px = ex + er - 4,
            pw = tall ? b.w - (px - b.x) : Math.min(170, b.w * 0.55);
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, px, ey - er + 2, pw, er * 2 - 4, 10);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, ey - er, ey + er);
        ctx.lineWidth = 1.4;
        pointed(ctx, px, ey - er + 2, pw, er * 2 - 4, 10);
        ctx.stroke();
        this.medallion(map, locked, { x: ex, y: ey, r: er }, true, t);
        ctx.font = `italic 700 ${tall ? 18 : 22}px ${FONT}`;
        const name = map.name.toUpperCase();
        const ng = ctx.createLinearGradient(0, ey - 14, 0, ey + 4);
        ng.addColorStop(0, '#fff7d8');
        ng.addColorStop(1, '#e0a040');
        ctx.fillStyle = ng;
        ctx.textAlign = 'left';
        ctx.fillText(name, ex + er + 10, ey + (tall ? 1 : 2), pw - er - 10);
        ctx.font = `${tall ? 5.5 : 6}px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        const st = `STAGE ${index + 1} OF ${STAGES.length}  ·  `;
        ctx.fillText(st, ex + er + 10, ey + er - 6);
        ctx.fillStyle = locked ? '#ffb0b0' : '#8ff0a0';
        const sw = ctx.measureText(st).width;
        if (locked) {
            ctx.fillText(String(stage.trophies), ex + er + 10 + sw + 10, ey + er - 6);
            drawTrophy(ctx, ex + er + 10 + sw + 4, ey + er - 8, 4.5);
        } else ctx.fillText('OPEN', ex + er + 10 + sw, ey + er - 6);
        // How hard, on its own plate: beside the header in landscape, under it on a phone.
        const dw = tall ? b.w : Math.min(130, b.w - pw - er * 2 - 14);
        const dx = tall ? b.x : b.x + b.w - dw,
            dyy = tall ? ey + er + 22 : ey - 8;
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, dx, dyy, dw, 16, 7);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, dyy, dyy + 16);
        ctx.lineWidth = 1.1;
        pointed(ctx, dx, dyy, dw, 16, 7);
        ctx.stroke();
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText('DIFFICULTY', dx + 11, dyy + 10.5);
        const pips = STAGES.length,
            pip = Math.min(8, (dw - 64) / pips);
        for (let i = 0; i < pips; i++) {
            ctx.fillStyle =
                i <= index ? (i >= 5 ? '#ff7a6a' : i >= 3 ? '#ffd45c' : '#6af07a') : 'rgba(255,255,255,0.12)';
            ctx.fillRect(dx + 56 + i * pip, dyy + 4.5, pip - 2, 7);
        }
        // The blurb, then the monsters' heading on a small plaque with a gold line running on from it.
        const by = tall ? dyy - 8 : ey + er + 14;
        ctx.textAlign = tall ? 'center' : 'left';
        ctx.font = `italic 600 ${tall ? 9 : 10}px ${FONT}`;
        ctx.fillStyle = '#f0e8ff';
        ctx.fillText(`${stage.blurb}.`, tall ? b.x + b.w / 2 : b.x + 4, by, b.w);
        ctx.textAlign = 'left';
        // The monsters, each with its part in the formations.
        const sheet = monstersFor(map.id);
        if (!sheet) return;
        const ty = tall ? dyy + 24 : by + 9;
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, b.x, ty, 64, 13, 6);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, ty, ty + 13);
        ctx.lineWidth = 1;
        pointed(ctx, b.x, ty, 64, 13, 6);
        ctx.stroke();
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#ffd45c';
        ctx.fillText('MONSTERS', b.x + 12, ty + 9);
        ctx.fillStyle = goldGradient(ctx, ty, ty + 13);
        ctx.fillRect(b.x + 66, ty + 6, b.w - 70, 0.8);
        gem(ctx, b.x + b.w - 2, ty + 6.4, 2.2);
        const top = ty + 18;
        const gap = tall ? 2 : TILE_GAP;
        const x0 = tall ? b.x + (b.w - ROLES.length * tile - (ROLES.length - 1) * gap) / 2 : b.x;
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
        const h = w + 20;
        ornatePanel(ctx, { x, y, w, h }, 8);
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
        // The name on a dark strip along the card's foot.
        ctx.fillStyle = 'rgba(12,6,30,0.85)';
        roundRect(ctx, x + 3, y + h - 15, w - 6, 12, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,185,73,0.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.font = `600 ${w > 50 ? 7.5 : 6}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.names[kind] ?? kind, x + w / 2, y + h - 6, w - 8);
    }

    /** The live demo window: the map's meadow running its formations in a glowing gold frame, captioned. */
    private demo(map: MapTheme, d: { x: number; y: number; w: number }, caption: string, draw?: DemoDraw): void {
        const ctx = this.ctx;
        const s = d.w / C.FIELD_W_BASE,
            h = C.FIELD_H_BASE * s;
        ornatePanel(ctx, { x: d.x - 6, y: d.y - 6, w: d.w + 12, h: h + 12 }, 12, true);
        ctx.save();
        roundRect(ctx, d.x, d.y, d.w, h, 7);
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
            ctx.textAlign = 'right';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(caption.toUpperCase(), d.x + d.w - 7, d.y + h - 8, d.w - 14);
        }
        ctx.restore();
        goldFrame(ctx, () => roundRect(ctx, d.x - 6, d.y - 6, d.w + 12, h + 12, 12), d.y, d.y + h);
    }

    /** The tray the stage medallions sit in: a long gold-framed capsule with gold arrows at its ends. */
    private tray(meds: { x: number; y: number; r: number }[], t: number): void {
        const ctx = this.ctx;
        const first = meds[0],
            last = meds[meds.length - 1];
        const x = first.x - first.r - 14,
            w = last.x + last.r + 14 - x,
            h = first.r * 2 + 22,
            y = first.y - first.r - 6;
        ornatePanel(ctx, { x, y, w, h }, h / 2);
        for (const dir of [-1, 1]) {
            const ax = dir < 0 ? x - 4 : x + w + 4,
                ay = first.y + 4,
                k = Math.max(0, Math.sin(t * 4)) * 1.2 * dir;
            ctx.fillStyle = goldGradient(ctx, ay - 9, ay + 9);
            ctx.beginPath();
            ctx.moveTo(ax + dir * 10 + k, ay);
            ctx.lineTo(ax + k, ay - 9);
            ctx.lineTo(ax + k, ay + 9);
            ctx.closePath();
            ctx.fill();
        }
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
        ctx.strokeStyle = on ? '#ffe9a0' : goldGradient(ctx, m.y - r, m.y + r);
        ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.4 : 1.2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    /** A map's name on a small plate under its medallion, gold-edged and lit when it's the one in view. */
    private nameTag(map: MapTheme, m: { x: number; y: number; r: number }, on: boolean, tall: boolean): void {
        const ctx = this.ctx;
        const w = m.r * 2 + (tall ? 4 : 10),
            h = tall ? 9 : 10,
            x = m.x - w / 2,
            y = m.y + m.r - 3;
        ctx.fillStyle = on ? 'rgba(80,40,10,0.95)' : 'rgba(22,10,50,0.95)';
        pointed(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = on ? '#ffe9a0' : goldGradient(ctx, y, y + h);
        ctx.lineWidth = on ? 1.2 : 0.8;
        pointed(ctx, x, y, w, h, 4);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${tall ? 4 : 4.8}px ${ARCADE}`;
        ctx.fillStyle = on ? '#ffe08a' : '#f0e6ff';
        ctx.fillText(map.name.toUpperCase(), m.x, y + h / 2 + 2, w - 6);
    }
}
