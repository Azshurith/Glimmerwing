import * as C from './core/config';
import { Game } from './game/game';
import { Input } from './input/input';
import { Lobby } from './net/lobby';
import { Sound } from './audio/sound';
import { roundMusic } from './data/music';
import { Renderer } from './render/renderer';
import { AdaptiveResolution } from './render/resolution';
import { initSettingsPanel } from './page/settings-panel';
import { topBarBottom } from './render/screens/top-bar';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
const game = new Game(input, renderer, sound);
input.setBindings(game.settings.keys);
// Meet the game server: a guest account, and progress and settings kept in its database.
void game.connectAccount();
input.viewSize = () => ({ w: renderer.viewW, h: renderer.viewH, ox: renderer.viewX });
// Browsers only start audio after a gesture.
for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const)
    window.addEventListener(ev, () => sound.unlock(), { passive: true });
const lobby = new Lobby(game);
game.onWantOnline = () => lobby.open();
// Links from the guide page open the game straight into a mode: index.html?mode=cpu|versus|online.
const startMode = new URLSearchParams(location.search).get('mode');
// ?debug=paths draws every fireball's path across the screen.
game.debugPaths = new URLSearchParams(location.search).get('debug') === 'paths';
if (startMode === 'cpu' || startMode === 'versus' || startMode === 'endless') game.start(startMode);
else if (startMode === 'online') lobby.open();
// A shared replay link (?replay=CODE) opens straight into it.
const replayCode = new URLSearchParams(location.search).get('replay');
if (replayCode && /^[A-Za-z0-9]{10}$/.test(replayCode)) game.openReplayCode(replayCode.toUpperCase());

// ---- fitting the screen ---------------------------------------------------------
// The view is 504x320 side by side, or the tall view on a portrait screen during a round
// (see Game.draw). Scale it to fit both the width and the height available, so a phone
// either way up, or a short laptop screen, still shows everything.
const stage = document.getElementById('stage')!;
const screenEl = document.getElementById('screen')!;
/** Size the game to fit the window's width and height, keeping the current layout's aspect ratio. */
function fit(): void {
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth,
        vh = vv?.height ?? window.innerHeight;
    renderer.portrait = vh > vw;
    // In portrait the tall view takes the screen's own shape, so it fills the screen edge to edge.
    if (renderer.portrait) {
        const cs = getComputedStyle(stage);
        const immersive = stage.classList.contains('immersive');
        const availW = immersive ? vw - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : stage.clientWidth,
            availH = immersive
                ? vh - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
                : vh - stage.getBoundingClientRect().top - window.scrollY - 10;
        renderer.tallH = Math.max(C.TALL_H_MIN, Math.min(C.TALL_H_MAX, (C.TALL_W * availH) / Math.max(1, availW)));
    }
    // On a wide landscape screen, the meadow width that would fill it (used from the next local round on).
    {
        const cs = getComputedStyle(stage);
        const immersive = stage.classList.contains('immersive');
        const availW = immersive ? vw - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : stage.clientWidth,
            availH = immersive
                ? vh - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
                : vh - stage.getBoundingClientRect().top - window.scrollY - 10;
        const fill = ((C.VIEW_H * availW) / Math.max(1, availH) - C.GAP) / 2;
        renderer.fieldWidthToFill = renderer.portrait ? C.FIELD_W_BASE : Math.floor(fill);
        renderer.viewWidthToFill = Math.floor((C.VIEW_H * availW) / Math.max(1, availH));
        // The menus widen to the same shape, up to WIDE_W_MAX.
        renderer.menuW = renderer.portrait
            ? C.VIEW_W
            : Math.min(C.WIDE_W_MAX, (C.VIEW_H * availW) / Math.max(1, availH));
    }
    const RATIO = renderer.viewW / renderer.viewH;
    let w: number;
    if (stage.classList.contains('immersive')) {
        const cs = getComputedStyle(stage);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
            padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        w = Math.min(vw - padX, (vh - padY) * RATIO);
    } else {
        const top = stage.getBoundingClientRect().top + window.scrollY;
        w = Math.min(stage.clientWidth, Math.max(200, vh - top - 10) * RATIO);
    }
    screenEl.style.width = `${Math.floor(w)}px`;
    screenEl.style.setProperty('--view-ratio', `${renderer.viewW} / ${renderer.viewH}`);
    // On-screen buttons scale with the game, not the window.
    screenEl.style.setProperty('--sw', `${Math.floor(w)}px`);
    // Where the menu screens' heading bar ends, so the Settings panel can start just under it.
    const barPx = topBarBottom(renderer.layout === 'tall', renderer.viewH) * (Math.floor(w) / renderer.viewW);
    screenEl.style.setProperty('--bar-h', `${barPx}px`);
    renderer.resize();
}
for (const ev of ['resize', 'orientationchange'] as const)
    window.addEventListener(ev, () => requestAnimationFrame(fit));
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(fit));
fit();

// ---- the page is the game ----------------------------------------------------------
// The game always fills the window (the stage starts with .immersive). Real fullscreen, which also hides
// the browser's bars, is only ever asked for from Settings: a tap never turns it on by itself.

// ---- fullscreen -----------------------------------------------------------------
// The real Fullscreen API where there is one; elsewhere (iPhone Safari) a fixed full-window layer.
/** Document with the prefixed fullscreen API older Safari uses. */
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
/** Element with the prefixed fullscreen request older Safari uses. */
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsDoc = document as FsDoc;
/** The element shown fullscreen, if any. */
const fsElement = () => fsDoc.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null;
/** Go fullscreen where the browser allows it (the game already fills the window either way). */
async function enterFull(): Promise<void> {
    try {
        const el = stage as FsEl;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else el.webkitRequestFullscreen?.();
    } catch {
        /* the full-window layer still works */
    }
    // Either way up works (portrait gets the tall layout), so the orientation isn't locked.
    fit();
}
/** Leave fullscreen (the game still fills the window). */
function exitFull(): void {
    if (fsElement()) {
        if (fsDoc.exitFullscreen) fsDoc.exitFullscreen().catch(() => undefined);
        else fsDoc.webkitExitFullscreen?.();
    }
    fit();
}
/** Refit when the browser enters or leaves fullscreen (including on its own, e.g. Esc). */
const onFsChange = () => fit();
const fsSupported = !!(document.fullscreenEnabled || (stage as FsEl).webkitRequestFullscreen);
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

// ---- on-screen touch buttons ------------------------------------------------------
// Each presses a key while held, so they drive the same code as the keyboard.
document.querySelectorAll<HTMLButtonElement>('.touch-ui [data-key]').forEach(b => {
    const key = b.dataset.key!;
    const release = () => {
        if (b.classList.contains('active')) {
            b.classList.remove('active');
            input.virtual(key, false);
        }
    };
    b.addEventListener('pointerdown', e => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        b.classList.add('active');
        input.virtual(key, true);
        sound.unlock();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) b.addEventListener(ev, release);
    b.addEventListener('contextmenu', e => e.preventDefault());
});
const menuBtn = document.getElementById('menu-btn') as HTMLButtonElement;
// ---- settings ------------------------------------------------------------------
// The panel (src/page/settings-panel.ts): volumes, sound, fullscreen, hiding the rival, and the keys.
const settings = initSettingsPanel({
    game,
    sound,
    input,
    canvas,
    back: () => game.closeSettings(),
    fullscreen: { supported: fsSupported, isOn: () => !!fsElement(), enter: () => void enterFull(), exit: exitFull },
});
game.onWantGuide = () => (location.href = 'guide.html');

let shownMode = '',
    shownPhase = '',
    shownLayout = '',
    shownTouch: boolean | null = null,
    shownWatching = false;
/** The view width the page was last fitted to (it changes when a round plays in wider meadows). */
let shownViewW = 0;
/** Keeps the page's touch layer in step with the game: which buttons show, and what the top one does. */
function syncPage(): void {
    settings.sync();
    // The layout changes with the phase and the orientation: refit to its shape.
    if (renderer.layout !== shownLayout || renderer.viewW !== shownViewW) {
        shownLayout = screenEl.dataset.layout = renderer.layout;
        shownViewW = renderer.viewW;
        fit();
    }
    if (input.touchActive !== shownTouch) {
        shownTouch = input.touchActive;
        document.documentElement.classList.toggle('touch', shownTouch);
    }
    if (game.modeName !== shownMode || game.phaseName !== shownPhase || game.watching !== shownWatching) {
        shownMode = screenEl.dataset.mode = game.modeName;
        shownPhase = screenEl.dataset.phase = game.phaseName;
        shownWatching = game.watching;
        // While a replay plays, the button (Esc) leaves it.
        const back =
            game.watching ||
            ['select', 'mapselect', 'modes', 'roster', 'maps', 'profile', 'settings', 'replays'].includes(shownPhase);
        menuBtn.textContent = back ? '◀ BACK' : '❚❚';
        menuBtn.setAttribute('aria-label', back ? 'Back' : 'Pause');
        void keepAwake(shownPhase === 'playing' || shownPhase === 'countdown');
        // Settings is the page's panel, shown while the game is on its Settings screen.
        if (shownPhase === 'settings') settings.open();
        else settings.hide();
    }
    pickMusic();
}

/** When the Maps screen last moved to another map, and which: its music waits until you stop on one. */
let mapsBrowsed = '';
let mapsBrowsedAt = 0;
/** How long the Maps screen must rest on a map before its music takes over (ms), so scrolling past doesn't. */
const MAPS_MUSIC_DELAY = 450;

/**
 * Play the music for where the game is: nothing on the title screen, the select track while picking fairies and a
 * map, the map you're looking at on the Maps screen, the menu track on the other menus, and a round its map's.
 * Asking for the music already playing changes nothing, so this runs every frame.
 */
function pickMusic(): void {
    const phase = game.phaseName;
    if (phase === 'maps') {
        const id = game.browsedMap;
        if (id !== mapsBrowsed) {
            mapsBrowsed = id;
            mapsBrowsedAt = performance.now();
        }
        // Keep what's playing until the choice settles.
        if (performance.now() - mapsBrowsedAt >= MAPS_MUSIC_DELAY) sound.playMusic(roundMusic(id));
        return;
    }
    mapsBrowsed = '';
    // The menus have their own loop; everything from the countdown on plays the round's.
    const menus = ['modes', 'roster', 'profile', 'settings', 'replays'].includes(phase);
    const picking = phase === 'select' || phase === 'mapselect';
    sound.playMusic(phase === 'title' ? null : picking ? 'select' : menus ? 'menu' : roundMusic(game.roundMap));
}

// ---- background and sleep -------------------------------------------------------
// Switching apps or tabs pauses an offline round; while playing, ask the screen not to dim.
let wake: { release(): Promise<void> } | null = null;
/** Ask the screen not to dim while playing, and let it go otherwise. */
async function keepAwake(on: boolean): Promise<void> {
    const nav = navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    try {
        if (on && !wake && nav.wakeLock && document.visibilityState === 'visible')
            wake = await nav.wakeLock.request('screen');
        else if (!on && wake) {
            await wake.release();
            wake = null;
        }
    } catch {
        wake = null;
    }
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        game.pauseForBackground();
        wake = null;
        input.held.clear();
    } else void keepAwake(shownPhase === 'playing');
});

// Installable app: cache the game for offline play where it's served over http(s).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}

// Fixed-step simulation, decoupled from display refresh rate.
const resolution = new AdaptiveResolution();
let last = performance.now();
let acc = 0;
/** One animation frame: run as many fixed simulation steps as time has passed, then draw. */
function frame(now: number) {
    input.pollPads();
    acc += Math.min(0.25, (now - last) / 1000);
    // Draw fewer pixels while frames run late, and full resolution again once they keep up.
    if (resolution.frame((now - last) / 1000)) {
        renderer.resolution = resolution.scale;
        renderer.resize();
    }
    last = now;
    while (acc >= C.STEP) {
        // A replay can be fast-forwarded: several steps in each step's time.
        for (let i = game.speed; i > 0; i--) {
            game.step(C.STEP);
            input.endFrame();
        }
        acc -= C.STEP;
    }
    game.draw();
    syncPage();
    requestAnimationFrame(frame);
}
void (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(frame));
