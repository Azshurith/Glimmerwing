import * as C from './config';
import { CpuPilot } from './ai';
import { FAIRIES, Fairy } from './characters';
import { Field } from './field';
import { Input } from './input';
import { loadProgress, Progress, resetProgress, saveProgress } from './progress';
import { PALETTE, Renderer, SelectCard } from './render';
import { Controls, Outgoing } from './types';

type Mode = 'cpu' | 'versus';
type Phase = 'title' | 'select' | 'countdown' | 'playing' | 'roundOver' | 'matchOver';

interface Transit { o: Outgoing; from: 0 | 1; t: number }
interface Picker { index: number; done: boolean }

const FIELD_X = [0, C.FIELD_W + C.GAP] as const;
const IDLE: Controls = { left: false, right: false, up: false, down: false, fire: false };

// Select-screen grid: 3 columns by 2 rows.
const COLS = 3;
const CARD_W = 150, CARD_H = 128, CARD_GAP = 12;
const GRID_X = (C.VIEW_W - (COLS * CARD_W + (COLS - 1) * CARD_GAP)) / 2;
const GRID_Y = 46;

export class Game {
  private mode: Mode = 'cpu';
  private phase: Phase = 'title';
  private phaseT = 0;
  private picks: [Fairy, Fairy] = [FAIRIES[0], FAIRIES[1]];
  private pickers: [Picker, Picker] = [{ index: 0, done: false }, { index: 1, done: false }];
  private fields: [Field, Field] = [new Field(1, FAIRIES[0]), new Field(1, FAIRIES[1])];
  private wins: [number, number] = [0, 0];
  private transits: Transit[] = [];
  private cpu = new CpuPilot();
  private roundWinner: 0 | 1 | -1 = -1;
  private paused = false;
  private progress: Progress = loadProgress();
  private matchBestChain = 0;
  private newlyUnlocked: Fairy[] = [];
  time = 0;

  constructor(private input: Input, private r: Renderer) {}

  /** Called by the page buttons and the title screen. */
  start(mode: Mode): void {
    this.mode = mode;
    this.phase = 'select';
    this.pickers = [{ index: this.pickers[0].index, done: false }, { index: this.pickers[1].index, done: mode === 'cpu' }];
  }

  resetProgress(): void {
    this.progress = resetProgress();
    this.phase = 'title';
  }

  isUnlocked(f: Fairy): boolean {
    return !f.unlock || this.progress.unlocked.includes(f.id);
  }

  private cards(): SelectCard[] {
    return FAIRIES.map((fairy, i) => ({
      fairy, locked: !this.isUnlocked(fairy),
      x: GRID_X + (i % COLS) * (CARD_W + CARD_GAP),
      y: GRID_Y + Math.floor(i / COLS) * (CARD_H + CARD_GAP),
      w: CARD_W, h: CARD_H,
    }));
  }

  private beginMatch(): void {
    if (this.mode === 'cpu') {
      // The CPU flies a random fairy from the whole roster, locked ones included,
      // so you can see what you're working toward.
      const others = FAIRIES.filter(f => f !== this.picks[0]);
      this.picks[1] = others[Math.floor(Math.random() * others.length)];
    }
    this.wins = [0, 0];
    this.matchBestChain = 0;
    this.newlyUnlocked = [];
    this.newRound();
  }

  private newRound(): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    const roundIndex = this.wins[0] + this.wins[1];
    this.fields = [new Field(seed, this.picks[0], roundIndex), new Field(seed, this.picks[1], roundIndex)];
    this.transits = [];
    this.cpu = new CpuPilot();
    this.phase = 'countdown';
    this.phaseT = 0;
  }

  private stepSelect(): void {
    const pr = this.input.pressed;
    const cards = this.cards();
    const keys: [string[], string[], string[], string[], string[]][] = this.mode === 'cpu'
      ? [[['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS'], ['Space', 'Enter', 'KeyZ', 'KeyF']]]
      : [
          [['KeyA'], ['KeyD'], ['KeyW'], ['KeyS'], ['KeyF']],
          [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['Enter', 'Slash']],
        ];
    const any = (codes: string[]) => codes.some(c => pr.has(c));
    keys.forEach(([l, r, u, d, ok], i) => {
      const pk = this.pickers[i];
      if (pk.done) { if (any(l) || any(r) || any(u) || any(d)) pk.done = false; return; }
      if (any(l)) pk.index = (pk.index + FAIRIES.length - 1) % FAIRIES.length;
      if (any(r)) pk.index = (pk.index + 1) % FAIRIES.length;
      if (any(u) || any(d)) pk.index = (pk.index + COLS) % FAIRIES.length;
      if (any(ok) && !cards[pk.index].locked) { pk.done = true; this.picks[i] = FAIRIES[pk.index]; }
    });
    // Tap a card to pick it for player one.
    const tap = this.input.tap;
    if (tap) {
      const hit = cards.findIndex(c => tap.x >= c.x && tap.x <= c.x + c.w && tap.y >= c.y && tap.y <= c.y + c.h);
      if (hit >= 0) {
        this.pickers[0].index = hit;
        if (!cards[hit].locked) { this.pickers[0].done = true; this.picks[0] = FAIRIES[hit]; }
      }
    }
    if (pr.has('Escape')) { this.phase = 'title'; return; }
    if (this.pickers[0].done && this.pickers[1].done) this.beginMatch();
  }

  step(dt: number): void {
    this.time += dt;
    const pr = this.input.pressed;
    if ((pr.has('Escape') || pr.has('KeyP')) && this.phase === 'playing') this.paused = !this.paused;

    if (this.phase === 'title') {
      if (pr.has('Digit1') || pr.has('Space') || pr.has('Enter') || pr.has('Pointer')) this.start('cpu');
      else if (pr.has('Digit2')) this.start('versus');
      return;
    }
    if (this.phase === 'select') { this.stepSelect(); return; }
    if (this.paused) return;
    this.phaseT += dt;

    if (this.phase === 'countdown') {
      if (this.phaseT > 2) { this.phase = 'playing'; this.phaseT = 0; }
      return;
    }
    if (this.phase === 'roundOver' || this.phase === 'matchOver') {
      const go = this.phaseT > 1.2 && (pr.has('Space') || pr.has('Enter') || pr.has('KeyF') || pr.has('Pointer'));
      if (go || (this.phase === 'roundOver' && this.phaseT > 3.5)) {
        if (this.phase === 'matchOver') { this.start(this.mode); return; }
        this.newRound();
      }
      this.fields[0].update(dt, IDLE); this.fields[1].update(dt, IDLE);
      return;
    }

    // A moonseed break freezes both meadows for a beat.
    const hs = Math.max(this.fields[0].hitstop, this.fields[1].hitstop);
    if (hs > 0) {
      for (const f of this.fields) f.hitstop = Math.max(0, f.hitstop - dt);
      return;
    }

    const c0 = this.mode === 'cpu' ? this.input.solo() : this.input.p1();
    const c1 = this.mode === 'cpu' ? this.cpu.think(this.fields[1], dt) : this.input.p2();
    this.fields[0].update(dt, c0);
    this.fields[1].update(dt, c1);

    this.fields.forEach((f, i) => {
      for (const o of f.outbox) this.transits.push({ o, from: i as 0 | 1, t: 0 });
      f.outbox = [];
    });
    for (const tr of this.transits) {
      tr.t += dt;
      if (tr.t >= C.TRANSIT_TIME) this.fields[1 - tr.from].receive(tr.o);
    }
    this.transits = this.transits.filter(tr => tr.t < C.TRANSIT_TIME);

    const dead0 = !this.fields[0].alive, dead1 = !this.fields[1].alive;
    if (dead0 || dead1) this.endRound(dead0, dead1);
  }

  private endRound(dead0: boolean, dead1: boolean): void {
    this.roundWinner = dead0 && dead1 ? -1 : dead0 ? 1 : 0;
    if (this.roundWinner >= 0) this.wins[this.roundWinner as 0 | 1]++;

    // Only human players earn progress.
    const humans = this.mode === 'cpu' ? [this.fields[0]] : this.fields;
    for (const f of humans) {
      this.matchBestChain = Math.max(this.matchBestChain, f.bestChain);
      this.progress.fevers += f.fevers;
    }
    const over = this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN;
    if (over) this.recordMatch();
    this.phase = over ? 'matchOver' : 'roundOver';
    this.phaseT = 0;
  }

  private recordMatch(): void {
    const p = this.progress;
    const humanWon = this.mode === 'versus' || this.wins[0] > this.wins[1];
    if (humanWon) p.wins++;
    if (this.mode === 'cpu' && this.wins[0] > this.wins[1] && this.wins[1] === 0) p.flawless++;
    p.bestChain = Math.max(p.bestChain, this.matchBestChain);
    for (const f of FAIRIES) {
      if (f.unlock && !p.unlocked.includes(f.id) && f.unlock.met(p)) {
        p.unlocked.push(f.id);
        this.newlyUnlocked.push(f);
      }
    }
    saveProgress(p);
  }

  draw(): void {
    const r = this.r;
    r.begin();
    r.field(this.fields[0], FIELD_X[0], this.wins[0], this.time);
    r.field(this.fields[1], FIELD_X[1], this.wins[1], this.time);

    for (const tr of this.transits) {
      const k = tr.t / C.TRANSIT_TIME;
      const sx = FIELD_X[tr.from] + tr.o.fromX, sy = tr.o.fromY;
      const ex = FIELD_X[1 - tr.from] + Math.min(C.FIELD_W - 12, Math.max(12, tr.o.fromX)), ey = -10;
      const x = sx + (ex - sx) * k, y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 40;
      r.transit(x, y, tr.o.kind === 'moth' ? (FAIRIES.find(f => f.id === tr.o.fairy)?.guardian.color ?? PALETTE.moth) : tr.o.kind === 'bramble' ? PALETTE.bramble : tr.o.kind === 'comet' ? '#ff6f9c' : PALETTE.star);
    }

    const names = this.mode === 'cpu'
      ? ['You', `CPU ${this.picks[1].name}`]
      : [this.picks[0].name, this.picks[1].name];
    switch (this.phase) {
      case 'title':
        r.title(this.time);
        break;
      case 'select': {
        const cards = this.cards();
        const cursors = [{ index: this.pickers[0].index, color: this.pickers[0].done ? PALETTE.star : '#ffffff', label: this.mode === 'cpu' ? 'You' : 'P1', locked: cards[this.pickers[0].index].locked }];
        if (this.mode === 'versus') cursors.push({ index: this.pickers[1].index, color: this.pickers[1].done ? PALETTE.star : '#ff9db8', label: 'P2', locked: cards[this.pickers[1].index].locked });
        r.select(cards, cursors, this.mode === 'cpu' ? 'Choose your fairy' : 'Choose your fairies', this.time);
        break;
      }
      case 'countdown':
        r.banner(this.phaseT < 1 ? `${this.picks[0].name} vs ${this.picks[1].name}` : 'Fly', `Round ${this.wins[0] + this.wins[1] + 1}`, 0.35);
        break;
      case 'roundOver':
        r.banner(this.roundWinner < 0 ? 'Draw' : `${names[this.roundWinner]} ${this.roundWinner === 0 && this.mode === 'cpu' ? 'take' : 'takes'} the round`, 'Next round starting', 0.5);
        break;
      case 'matchOver': {
        const w = this.wins[0] > this.wins[1] ? 0 : 1;
        const title = this.mode === 'cpu' ? (w === 0 ? 'You win' : `${names[1]} wins`) : `${names[w]} wins`;
        const unlocked = this.newlyUnlocked.length ? `New fairy unlocked: ${this.newlyUnlocked.map(f => f.name).join(', ')}` : undefined;
        r.banner(title, 'Press Space or tap to choose again', 0.65, unlocked);
        break;
      }
      default:
        if (this.paused) r.banner('Paused', 'Press P to resume', 0.6);
    }
  }
}
