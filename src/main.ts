import * as C from './config';
import { Game } from './game';
import { Input } from './input';
import { Lobby } from './lobby';
import { Sound } from './audio';
import { Renderer } from './render';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
const game = new Game(input, renderer, sound);
// Browsers only start audio after a gesture.
for (const ev of ['keydown', 'pointerdown', 'touchstart'] as const) window.addEventListener(ev, () => sound.unlock(), { passive: true });
const muteBtn = document.getElementById('mute') as HTMLButtonElement | null;
const showMute = () => { if (muteBtn) { muteBtn.textContent = sound.muted ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(!sound.muted)); } };
muteBtn?.addEventListener('click', () => { sound.unlock(); sound.toggleMute(); showMute(); muteBtn.blur(); });
window.addEventListener('keydown', e => { if (e.code === 'KeyM') setTimeout(showMute); });
showMute();
const lobby = new Lobby(game);
game.onWantOnline = () => lobby.open();
document.querySelector<HTMLButtonElement>('[data-online]')?.addEventListener('click', e => { lobby.open(); (e.currentTarget as HTMLButtonElement).blur(); });

const fit = () => renderer.resize();
window.addEventListener('resize', fit);
fit();

document.getElementById('reset')?.addEventListener('click', () => {
  if (confirm('Reset unlocked fairies and stats?')) game.resetProgress();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b =>
  b.addEventListener('click', () => { lobby.close(); game.start(b.dataset.mode as 'cpu' | 'versus'); b.blur(); }));

// Fixed-step simulation, decoupled from display refresh rate.
let last = performance.now();
let acc = 0;
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
  requestAnimationFrame(frame);
}
(document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(frame));
