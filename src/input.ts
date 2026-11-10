import * as C from './config';
import { Controls } from './types';

const KEYMAP_SOLO: Record<string, keyof Controls> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Space: 'fire', KeyZ: 'fire', KeyJ: 'fire', KeyX: 'bloom', KeyK: 'bloom', ShiftLeft: 'bloom',
};
const KEYMAP_P1: Record<string, keyof Controls> = {
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'fire', KeyG: 'bloom',
};
const KEYMAP_P2: Record<string, keyof Controls> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'fire', Slash: 'fire', ShiftRight: 'bloom', Period: 'bloom',
};

const blank = (): Controls => ({ left: false, right: false, up: false, down: false, fire: false, target: null });

export class Input {
  readonly held = new Set<string>();
  pressed = new Set<string>();
  private pointer: { x: number; y: number; down: boolean } | null = null;
  private pointers = 0;
  private secondTap = false;
  /** Where the most recent tap landed this frame, in view coordinates. */
  tap: { x: number; y: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      // Typing a room code in the online lobby shouldn't steer a fairy.
      if ((e.target as HTMLElement | null)?.closest?.('#lobby')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', e => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());

    const toView = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * C.VIEW_W, y: ((e.clientY - r.top) / r.height) * C.VIEW_H };
    };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers++;
      // A second finger on the screen while steering sets off a bloom.
      if (this.pointers >= 2) { this.secondTap = true; return; }
      this.pointer = { ...toView(e), down: true };
      this.pressed.add('Pointer');
      this.tap = toView(e);
    });
    canvas.addEventListener('pointermove', e => { if (this.pointer) Object.assign(this.pointer, toView(e)); });
    const up = () => { this.pointers = Math.max(0, this.pointers - 1); if (this.pointers === 0) this.pointer = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  endFrame(): void { this.pressed.clear(); this.tap = null; this.secondTap = false; }

  private read(map: Record<string, keyof Controls>): Controls {
    const c = blank();
    for (const [code, action] of Object.entries(map)) {
      // A very quick tap can start and end between frames; still count it.
      if (this.held.has(code) || this.pressed.has(code)) (c as unknown as Record<string, boolean>)[action] = true;
    }
    return c;
  }

  solo(): Controls {
    const c = this.read(KEYMAP_SOLO);
    if (this.pointer?.down) {
      // Touch: the sub follows your finger (offset upward so it stays visible) and fires while held.
      c.target = { x: Math.min(C.FIELD_W, this.pointer.x), y: this.pointer.y - 40 };
      c.fire = true;
    }
    if (this.secondTap) c.bloom = true;
    return c;
  }
  p1(): Controls { return this.read(KEYMAP_P1); }
  p2(): Controls { return this.read(KEYMAP_P2); }
}
