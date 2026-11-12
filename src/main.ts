import * as C from './core/config';
import { Game } from './game/game';
import { Input } from './input/input';
import { Lobby } from './net/lobby';
import { Sound } from './audio/sound';
import { Renderer } from './render/renderer';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
const game = new Game(input, renderer, sound);
// Browsers only start audio after a gesture.
for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const)
    window.addEventListener(ev, () => sound.unlock(), { passive: true });
const muteBtn = document.getElementById('mute') as HTMLButtonElement | null;
/** Show the mute button's current state. */
const showMute = () => {
    if (muteBtn) {
        muteBtn.textContent = sound.muted ? 'Sound off' : 'Sound on';
        muteBtn.setAttribute('aria-pressed', String(!sound.muted));
    }
};
muteBtn?.addEventListener('click', () => {
    sound.unlock();
    sound.toggleMute();
    showMute();
    muteBtn.blur();
});
window.addEventListener('keydown', e => {
    if (e.code === 'KeyM') setTimeout(showMute);
});
showMute();
const lobby = new Lobby(game);
game.onWantOnline = () => lobby.open();
document.querySelector<HTMLButtonElement>('[data-online]')?.addEventListener('click', e => {
    lobby.open();
    (e.currentTarget as HTMLButtonElement).blur();
});

// ---- fitting the screen ---------------------------------------------------------
// The view is a fixed 504x320; scale it to fit both the width and the height available,
// so a phone held sideways or a short laptop screen still shows all of both meadows.
const stage = document.getElementById('stage')!;
const screenEl = document.getElementById('screen')!;
const RATIO = C.VIEW_W / C.VIEW_H;
/** Size the game to fit the window's width and height, keeping its aspect ratio. */
function fit(): void {
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth,
        vh = vv?.height ?? window.innerHeight;
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
    // On-screen buttons scale with the game, not the window.
    screenEl.style.setProperty('--sw', `${Math.floor(w)}px`);
    renderer.resize();
}
for (const ev of ['resize', 'orientationchange'] as const)
    window.addEventListener(ev, () => requestAnimationFrame(fit));
window.visualViewport?.addEventListener('resize', () => requestAnimationFrame(fit));
fit();

// ---- fullscreen -----------------------------------------------------------------
// The real Fullscreen API where there is one; elsewhere (iPhone Safari) a fixed full-window layer.
/** Document with the prefixed fullscreen API older Safari uses. */
type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
/** Element with the prefixed fullscreen request older Safari uses. */
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsDoc = document as FsDoc;
/** The element shown fullscreen, if any. */
const fsElement = () => fsDoc.fullscreenElement ?? fsDoc.webkitFullscreenElement ?? null;
/** Go fullscreen (and lock landscape where allowed), or fill the window where there is no fullscreen. */
async function enterFull(): Promise<void> {
    stage.classList.add('immersive');
    fit();
    try {
        const el = stage as FsEl;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else el.webkitRequestFullscreen?.();
    } catch {
        /* the full-window layer still works */
    }
    // Phones: try to hold landscape while playing (Android Chrome allows it in fullscreen).
    try {
        await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
        /* not supported */
    }
    fit();
}
/** Leave fullscreen or the full-window layer. */
function exitFull(): void {
    stage.classList.remove('immersive');
    if (fsElement()) {
        if (fsDoc.exitFullscreen) fsDoc.exitFullscreen().catch(() => undefined);
        else fsDoc.webkitExitFullscreen?.();
    }
    fit();
}
/** Drop the full-window layer when the browser leaves fullscreen on its own (e.g. Esc). */
const onFsChange = () => {
    if (!fsElement() && stage.classList.contains('immersive') && fsSupported) stage.classList.remove('immersive');
    fit();
};
const fsSupported = !!(document.fullscreenEnabled || (stage as FsEl).webkitRequestFullscreen);
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
document.getElementById('fullscreen')?.addEventListener('click', e => {
    (e.currentTarget as HTMLElement).blur();
    void enterFull();
});
document.getElementById('exit-full')?.addEventListener('click', exitFull);

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
let shownMode = '',
    shownPhase = '',
    shownTouch: boolean | null = null;
/** Keeps the page's touch layer in step with the game: which buttons show, and what the top one does. */
function syncPage(): void {
    if (input.touchActive !== shownTouch) {
        shownTouch = input.touchActive;
        document.documentElement.classList.toggle('touch', shownTouch);
    }
    if (game.modeName !== shownMode || game.phaseName !== shownPhase) {
        shownMode = screenEl.dataset.mode = game.modeName;
        shownPhase = screenEl.dataset.phase = game.phaseName;
        const back = shownPhase === 'select';
        menuBtn.textContent = back ? '◀' : '❚❚';
        menuBtn.setAttribute('aria-label', back ? 'Back' : 'Pause');
        void keepAwake(shownPhase === 'playing' || shownPhase === 'countdown');
    }
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

// The full help is open on desktop, folded away on touchscreens where space is short.
const help = document.getElementById('help') as HTMLDetailsElement | null;
if (help && !matchMedia('(pointer: coarse)').matches) help.open = true;

// Installable app: cache the game for offline play where it's served over http(s).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
}

document.getElementById('reset')?.addEventListener('click', () => {
    if (confirm('Reset unlocked fairies and stats?')) game.resetProgress();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b =>
    b.addEventListener('click', () => {
        lobby.close();
        game.start(b.dataset.mode as 'cpu' | 'versus');
        b.blur();
    }),
);

// Fixed-step simulation, decoupled from display refresh rate.
let last = performance.now();
let acc = 0;
/** One animation frame: run as many fixed simulation steps as time has passed, then draw. */
function frame(now: number) {
    input.pollPads();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= C.STEP) {
        game.step(C.STEP);
        input.endFrame();
        acc -= C.STEP;
    }
    game.draw();
    syncPage();
    requestAnimationFrame(frame);
}
void (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(frame));
