// Art from the server's database: each fairy's spritesheet (the characters table) and each map's monster sheet
// (the maps and monsters tables). A sheet is used once its picture has loaded; until then, and with no server, the
// art bundled into the page is drawn. It's only drawing: nothing here touches a round.
import { FAIRIES } from './characters';
import { useServerMonsters } from './monsters';
import { WITCH } from './sprite-sets';
import type { Anim, AnimName, CatalogArt, MapArt, MonsterKind, MonsterSheet, SpriteAtlas, SpriteSet } from '@/types';

/** The version of each sheet in use (or loading), so the same one isn't loaded twice. */
const inUse = new Map<string, number>();

/** Load a picture; resolves with it once it's in, or null when it can't be had. */
function picture(url: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth ? img : null);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

/** A fairy's sheet from its layout, or null when the layout misses a number or an animation the game plays. */
function spriteSet(a: SpriteAtlas, img: HTMLImageElement): SpriteSet | null {
    const nums = [a.cw, a.ch, a.bodyX, a.bodyY, a.scale];
    if (!nums.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
    for (const name of Object.keys(WITCH.anims)) {
        const an = a.anims?.[name];
        if (!an || !(an.count > 0) || !(an.fps > 0) || !(an.row >= 0)) return null;
    }
    return {
        img,
        cw: a.cw,
        ch: a.ch,
        bodyX: a.bodyX,
        bodyY: a.bodyY,
        scale: a.scale,
        anims: a.anims as Record<AnimName, Anim>,
    };
}

/** A map's monster sheet from its rows, or null unless it has a plain, a big, a shelled and a spinning monster. */
function monsterSheet(m: MapArt, img: HTMLImageElement): MonsterSheet | null {
    const kind = (role: string) => m.monsters.find(x => x.role === role)?.code as MonsterKind | undefined;
    const big = kind('big'),
        shelled = kind('shelled'),
        spinner = kind('spinner');
    const roster = m.monsters.filter(x => x.role === 'plain').map(x => x.code as MonsterKind);
    if (!big || !shelled || !spinner || !roster.length || !(m.cell > 0)) return null;
    const rows: Partial<Record<MonsterKind, number>> = {},
        names: Partial<Record<MonsterKind, string>> = {};
    for (const x of m.monsters) {
        rows[x.code as MonsterKind] = x.row;
        names[x.code as MonsterKind] = x.name;
    }
    return { img, cell: m.cell, rows, overlay: m.overlay, roster, big, shelled, spinner, names };
}

/** Use the art the server holds (`base` is its API, e.g. http://host/api); a sheet takes over once it's loaded. */
export function useServerArt(art: CatalogArt | undefined, base: string | null): void {
    if (!art || !base) return;
    for (const [code, a] of Object.entries(art.characters ?? {})) {
        const fairy = FAIRIES.find(f => f.id === code);
        if (!fairy || inUse.get(`c:${code}`) === a.v) continue;
        inUse.set(`c:${code}`, a.v);
        void picture(`${base}/art/characters/${encodeURIComponent(code)}.png?v=${a.v}`).then(img => {
            const set = img && spriteSet(a.atlas, img);
            if (set) fairy.sprite = set;
        });
    }
    for (const [code, m] of Object.entries(art.maps ?? {})) {
        if (inUse.get(`m:${code}`) === m.v) continue;
        inUse.set(`m:${code}`, m.v);
        void picture(`${base}/art/monsters/${encodeURIComponent(code)}.png?v=${m.v}`).then(img => {
            const sheet = img && monsterSheet(m, img);
            if (sheet) useServerMonsters(code, sheet);
        });
    }
}
