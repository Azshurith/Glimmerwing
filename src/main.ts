import * as C from './config';
import { Game } from './game';
import { Input } from './input';
import { Renderer } from './render';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const game = new Game(input, renderer);

const fit = () => renderer.resize();
window.addEventListener('resize', fit);
fit();

document.getElementById('reset')?.addEventListener('click', () => {
  if (confirm('Reset unlocked fairies and stats?')) game.resetProgress();
});
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b =>
  b.addEventListener('click', () => { game.start(b.dataset.mode as 'cpu' | 'versus'); b.blur(); }));

// Fixed-step simulation, decoupled from display refresh rate.
let last = performance.now();
let acc = 0;
function frame(now: number) {
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
