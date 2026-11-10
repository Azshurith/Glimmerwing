import * as C from './config';
import { CpuPilot } from './ai';
import { FAIRIES, Fairy, fairyById } from './characters';
import { Field, FieldSnapshot } from './field';
import { Net, PeerMsg } from './net';
import { Sfx, Sound } from './audio';
import { Input } from './input';
import { loadProgress, Progress, resetProgress, saveProgress } from './progress';
import { PALETTE, Renderer, SelectCard } from './render';
import { Controls, Outgoing } from './types';

type Mode = 'cpu' | 'versus' | 'online';
type Phase = 'title' | 'select' | 'countdown' | 'playing' | 'roundOver' | 'matchOver';

/** `ghost` transits are only drawn: online, the real attack is delivered on the rival's screen. */
interface Transit { o: Outgoing; from: 0 | 1; t: number; ghost?: boolean }
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

  // ---- online ----
  // Online, field 0 is always this player's meadow and field 1 mirrors the rival's.
  // Each browser runs only its own meadow and streams snapshots of it; attacks
  // and knockouts travel as messages. The host picks round seeds and calls results.
  private net: Net | null = null;
  /** Counts rounds this session so stale messages from an earlier round are ignored. */
  private roundNo = 0;
  private snapT = 0;
  private sentDead = false;
  private remoteDead = false;
  private endT = -1;
  private notice = '';
  /** Set by the page: open the online lobby. */
  onWantOnline?: () => void;

  constructor(private input: Input, private r: Renderer, private sound: Sound) {}

  /** Play what each meadow asked for. Offline, sounds lean toward their meadow and the CPU's are quieter. */
  private drainSfx(): void {
    this.fields.forEach((f, i) => {
      const pan = this.online ? 0 : i === 0 ? -0.35 : 0.35;
      const vol = this.mode === 'cpu' && i === 1 ? 0.45 : 1;
      for (const e of f.sfx) this.sound.play(e.k, e.p, pan, vol);
      f.sfx = [];
    });
  }

  private ui(k: Sfx): void { this.sound.play(k); }

  /** Called by the page buttons and the title screen. */
  start(mode: Mode): void {
    if (mode !== 'online' && this.net) this.disconnect();
    this.mode = mode;
    this.phase = 'select';
    this.paused = false;
    // Online, the rival's cursor is whatever they last told us.
    const rival = mode === 'online' ? this.pickers[1].done : mode === 'cpu';
    this.pickers = [{ index: this.pickers[0].index, done: false }, { index: this.pickers[1].index, done: rival }];
    if (mode === 'online') this.sendSelection();
  }

  /** Called by the lobby once the server has paired us with a rival. */
  startOnline(net: Net): void {
    this.net = net;
    this.roundNo = 0;
    this.notice = '';
    this.pickers[1] = { index: 1, done: false };
    this.start('online');
  }

  get online(): boolean { return this.mode === 'online' && this.net !== null; }

  private disconnect(notice = ''): void {
    if (this.net) { this.net.leave(); this.net.close(); }
    this.net = null;
    this.notice = notice;
    this.mode = 'cpu';
    this.phase = 'title';
    this.transits = [];
  }

  private sendSelection(): void {
    const pk = this.pickers[0];
    this.net?.peer({ k: 'sel', i: pk.index, done: pk.done, id: FAIRIES[pk.index].id });
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

  private beginMatch(seed?: number): void {
    if (this.mode === 'cpu') {
      // The CPU flies a random fairy from the whole roster, locked ones included,
      // so you can see what you're working toward.
      const others = FAIRIES.filter(f => f !== this.picks[0]);
      this.picks[1] = others[Math.floor(Math.random() * others.length)];
    }
    this.wins = [0, 0];
    this.matchBestChain = 0;
    this.newlyUnlocked = [];
    this.newRound(seed);
  }

  private newRound(seed = (Math.random() * 2 ** 31) | 0): void {
    const roundIndex = this.wins[0] + this.wins[1];
    if (this.online) {
      // The host deals each round; the guest follows when the 'round' message lands.
      if (this.net!.isHost) this.net!.peer({ k: 'round', seed, wins: [this.wins[1], this.wins[0]] });
      this.roundNo++;
      this.snapT = 0;
      this.sentDead = false;
      this.remoteDead = false;
      this.endT = -1;
    }
    // The seed also decides which meadow the Hollow Crow wakes in. Online, field 0 is
    // ours on both screens, so "side A" means the host's meadow.
    const sideA = (seed & 1) === 0;
    const crowHere = this.online ? (this.net!.isHost ? sideA : !sideA) : sideA;
    this.fields = [new Field(seed, this.picks[0], roundIndex, crowHere), new Field(seed, this.picks[1], roundIndex, !crowHere)];
    this.transits = [];
    this.cpu = new CpuPilot();
    this.phase = 'countdown';
    this.phaseT = 0;
  }

  private stepSelect(): void {
    const pr = this.input.pressed;
    const cards = this.cards();
    const before = { ...this.pickers[0] };
    const keys: [string[], string[], string[], string[], string[]][] = this.mode !== 'versus'
      ? [[['ArrowLeft', 'KeyA'], ['ArrowRight', 'KeyD'], ['ArrowUp', 'KeyW'], ['ArrowDown', 'KeyS'], ['Space', 'Enter', 'KeyZ', 'KeyG']]]
      : [
          [['KeyA'], ['KeyD'], ['KeyW'], ['KeyS'], ['KeyG']],
          [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['Enter', 'Slash']],
        ];
    const any = (codes: string[]) => codes.some(c => pr.has(c));
    keys.forEach(([l, r, u, d, ok], i) => {
      const pk = this.pickers[i];
      if (pk.done) { if (any(l) || any(r) || any(u) || any(d)) pk.done = false; return; }
      const was = pk.index;
      if (any(l)) pk.index = (pk.index + FAIRIES.length - 1) % FAIRIES.length;
      if (any(r)) pk.index = (pk.index + 1) % FAIRIES.length;
      if (any(u) || any(d)) pk.index = (pk.index + COLS) % FAIRIES.length;
      if (pk.index !== was) this.ui('tick');
      if (any(ok) && !cards[pk.index].locked) { pk.done = true; this.picks[i] = FAIRIES[pk.index]; this.ui('ok'); }
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
    if (this.mode === 'online' && (before.index !== this.pickers[0].index || before.done !== this.pickers[0].done)) this.sendSelection();
    if (pr.has('Escape')) { if (this.online) this.disconnect(); else this.phase = 'title'; return; }
    if (this.pickers[0].done && this.pickers[1].done) {
      // Online, only the host starts the match; the guest waits for the first round.
      if (!this.online || this.net!.isHost) this.beginMatch();
    }
  }

  // ---- online messages ------------------------------------------------------

  private pollNet(dt: number): void {
    const net = this.net;
    if (!net) return;
    for (const ev of net.poll(dt)) {
      if (ev.t === 'peerLeft') { this.disconnect('Your rival left the meadow'); return; }
      if (ev.t === 'closed') { this.disconnect('Lost the connection to the server'); return; }
      if (ev.t === 'msg') this.onPeer(ev.d);
    }
  }

  private onPeer(m: PeerMsg): void {
    const live = this.phase !== 'title' && this.phase !== 'select';
    switch (m.k) {
      case 'sel':
        this.pickers[1] = { index: m.i, done: m.done };
        if (m.done) this.picks[1] = fairyById(m.id);
        break;
      case 'round':
        if (this.net!.isHost) break;
        // Wins arrive from the host's point of view, already swapped to ours.
        if (this.phase === 'select') { this.pickers[0].done = true; this.beginMatch(m.seed); }
        else { this.wins = m.wins; this.newRound(m.seed); }
        break;
      case 'snap':
        if (live && m.r === this.roundNo) this.fields[1].applySnapshot(m.s as FieldSnapshot);
        break;
      case 'atk':
        if (this.phase === 'playing' && m.r === this.roundNo) {
          // The attack already spent half the round trip getting here; start it that far along.
          const head = Math.min(this.net!.rtt / 2, C.TRANSIT_TIME * 0.6);
          this.transits.push({ o: m.o, from: 1, t: head });
        }
        break;
      case 'dead':
        if (m.r === this.roundNo) this.remoteDead = true;
        break;
      case 'end':
        if (!this.net!.isHost && this.phase === 'playing') this.endRound(m.guestDead, m.hostDead);
        break;
    }
  }

  /** Online upkeep every step once a round exists: mirror the rival, stream our meadow. */
  private tickOnline(dt: number): void {
    this.fields[1].drift(dt);
    if (++this.snapT >= C.SNAP_EVERY) {
      this.snapT = 0;
      this.net!.peer({ k: 'snap', r: this.roundNo, s: this.fields[0].snapshot() });
    }
  }

  /** Online round end: report our own knockout; the host settles the result. */
  private checkOnlineEnd(dt: number): void {
    const net = this.net!;
    const localDead = !this.fields[0].alive;
    if (localDead && !this.sentDead) { this.sentDead = true; net.peer({ k: 'dead', r: this.roundNo }); }
    if (!net.isHost) return;
    if ((localDead || this.remoteDead) && this.endT < 0) this.endT = C.END_GRACE;
    if (this.endT >= 0) {
      this.endT -= dt;
      if (this.endT <= 0) {
        net.peer({ k: 'end', hostDead: localDead, guestDead: this.remoteDead });
        this.endRound(localDead, this.remoteDead);
      }
    }
  }

  step(dt: number): void {
    this.time += dt;
    const pr = this.input.pressed;
    this.drainSfx();
    if (pr.has('KeyM')) this.sound.toggleMute();
    if (this.mode === 'online') {
      this.pollNet(dt);
      if (!this.net) return;
    }
    if ((pr.has('Escape') || pr.has('KeyP')) && this.phase === 'playing' && this.mode !== 'online') this.paused = !this.paused;

    if (this.phase === 'title') {
      if (this.notice) { if (pr.size) this.notice = ''; return; }
      if (pr.has('Digit3')) { this.onWantOnline?.(); return; }
      if (pr.has('Digit1') || pr.has('Space') || pr.has('Enter') || pr.has('KeyG') || pr.has('Pointer')) this.start('cpu');
      else if (pr.has('Digit2')) this.start('versus');
      return;
    }
    if (this.phase === 'select') { this.stepSelect(); return; }
    if (this.paused) return;
    this.phaseT += dt;

    if (this.online) {
      if (this.phase !== 'playing' && pr.has('Escape')) { this.disconnect(); return; }
      this.tickOnline(dt);
    }
    if (this.phase === 'countdown') {
      if (this.phaseT > 2) { this.phase = 'playing'; this.phaseT = 0; this.ui('start'); }
      return;
    }
    if (this.phase === 'roundOver' || this.phase === 'matchOver') {
      const go = this.phaseT > 1.2 && (pr.has('Space') || pr.has('Enter') || pr.has('KeyG') || pr.has('Pointer'));
      if (go || (this.phase === 'roundOver' && this.phaseT > 3.5)) {
        if (this.phase === 'matchOver') { this.start(this.mode); return; }
        // Online, the host deals the next round and the guest follows.
        if (!this.online || this.net!.isHost) this.newRound();
      }
      this.fields[0].update(dt, IDLE);
      if (!this.online) this.fields[1].update(dt, IDLE);
      return;
    }

    if (this.online) { this.stepOnline(dt); return; }

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

  /** One playing step online: only our meadow is simulated here. */
  private stepOnline(dt: number): void {
    const me = this.fields[0];
    // A moonseed break freezes only the meadow it broke in; the rival's keeps going on their screen.
    if (me.hitstop > 0) { me.hitstop = Math.max(0, me.hitstop - dt); return; }
    me.update(dt, this.input.solo());
    for (const o of me.outbox) {
      this.transits.push({ o, from: 0, t: 0, ghost: true });
      this.net!.peer({ k: 'atk', r: this.roundNo, o });
    }
    me.outbox = [];
    for (const tr of this.transits) {
      tr.t += dt;
      if (tr.t >= C.TRANSIT_TIME && !tr.ghost) me.receive(tr.o);
    }
    this.transits = this.transits.filter(tr => tr.t < C.TRANSIT_TIME);
    this.checkOnlineEnd(dt);
  }

  private endRound(dead0: boolean, dead1: boolean): void {
    // The round is decided: the meadows keep drifting behind the banner, but no more hits land.
    for (const f of this.fields) f.settled = true;
    this.roundWinner = dead0 && dead1 ? -1 : dead0 ? 1 : 0;
    // Versus on one screen always has a winner to cheer; otherwise it's about you.
    this.ui(this.mode === 'versus' ? (this.roundWinner < 0 ? 'lose' : 'win') : this.roundWinner === 0 ? 'win' : 'lose');
    if (this.roundWinner >= 0) this.wins[this.roundWinner as 0 | 1]++;

    // Only human players earn progress.
    const humans = this.mode === 'versus' ? this.fields : [this.fields[0]];
    for (const f of humans) {
      this.matchBestChain = Math.max(this.matchBestChain, f.bestChain);
      this.progress.fevers += f.fevers;
    }
    const over = this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN;
    if (over) this.recordMatch();
    this.phase = over ? 'matchOver' : 'roundOver';
    this.phaseT = 0;
    this.transits = [];
    // The rival will pick again too; wait to hear from them.
    if (over && this.mode === 'online') this.pickers[1].done = false;
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
      if (tr.o.kind === 'clash' || tr.o.kind === 'heal') continue;
      const k = tr.t / C.TRANSIT_TIME;
      const sx = FIELD_X[tr.from] + tr.o.fromX, sy = tr.o.fromY;
      const ex = FIELD_X[1 - tr.from] + Math.min(C.FIELD_W - 12, Math.max(12, tr.o.fromX)), ey = -10;
      const x = sx + (ex - sx) * k, y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 40;
      r.transit(x, y, tr.o.kind === 'moth' ? (FAIRIES.find(f => f.id === tr.o.fairy)?.guardian.color ?? PALETTE.moth) : tr.o.kind === 'bramble' ? PALETTE.bramble : tr.o.kind === 'crow' ? '#ff9fb8' : tr.o.kind === 'imp' ? (FAIRIES.find(f => f.id === tr.o.fairy)?.color ?? PALETTE.star) : tr.o.kind === 'comet' ? '#ff6f9c' : PALETTE.star);
    }

    const names = this.mode === 'cpu' ? ['You', `CPU ${this.picks[1].name}`]
      : this.mode === 'online' ? ['You', `Rival ${this.picks[1].name}`]
      : [this.picks[0].name, this.picks[1].name];
    const solo = this.mode !== 'versus';
    switch (this.phase) {
      case 'title':
        r.title(this.time);
        if (this.notice) r.banner(this.notice, 'Press any key to continue', 0.7);
        break;
      case 'select': {
        const cards = this.cards();
        const cursors = [{ index: this.pickers[0].index, color: this.pickers[0].done ? PALETTE.star : '#ffffff', label: solo ? 'You' : 'P1', locked: cards[this.pickers[0].index].locked }];
        // A rival may fly a fairy you haven't unlocked yet, so their cursor is never shown as locked.
        if (this.mode !== 'cpu') cursors.push({ index: this.pickers[1].index, color: this.pickers[1].done ? PALETTE.star : '#ff9db8', label: this.mode === 'online' ? 'Rival' : 'P2', locked: this.mode === 'versus' && cards[this.pickers[1].index].locked });
        const heading = this.mode === 'cpu' ? 'Choose your fairy'
          : this.mode === 'versus' ? 'Choose your fairies'
          : this.pickers[0].done && !this.pickers[1].done ? 'Waiting for your rival to choose…' : 'Choose your fairy';
        r.select(cards, cursors, heading, this.time);
        break;
      }
      case 'countdown':
        r.banner(this.phaseT < 1 ? `${this.picks[0].name} vs ${this.picks[1].name}` : 'Fly', `Round ${this.wins[0] + this.wins[1] + 1}`, 0.35);
        break;
      case 'roundOver':
        r.banner(this.roundWinner < 0 ? 'Draw' : `${names[this.roundWinner]} ${this.roundWinner === 0 && solo ? 'take' : 'takes'} the round`, 'Next round starting', 0.5);
        break;
      case 'matchOver': {
        const w = this.wins[0] > this.wins[1] ? 0 : 1;
        const title = solo ? (w === 0 ? 'You win' : `${names[1]} wins`) : `${names[w]} wins`;
        const unlocked = this.newlyUnlocked.length ? `New fairy unlocked: ${this.newlyUnlocked.map(f => f.name).join(', ')}` : undefined;
        r.banner(title, 'Press Space or tap to choose again', 0.65, unlocked);
        break;
      }
      default:
        if (this.paused) r.banner('Paused', 'Press P to resume', 0.6);
    }
    if (this.online && this.phase !== 'title') r.note(`${Math.round(this.net!.rtt * 1000)}ms`, C.VIEW_W / 2, 10);
  }
}
