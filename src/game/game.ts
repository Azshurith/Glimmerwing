import type { Sound } from '@/audio/sound';
import * as C from '@/core/config';
import { FAIRIES, fairyById } from '@/data/characters';
import type { Input } from '@/input/input';
import type { Net } from '@/net/net';
import type { Renderer } from '@/render/renderer';
import { medallionAt, SELECT_COLS } from '@/render/screens/select-screen';
import { titleButtons } from '@/render/screens/title-screen';
import { PALETTE, PLAYER_COLORS } from '@/render/theme';
import type {
    Controls,
    Fairy,
    FieldSnapshot,
    HudTag,
    Mode,
    Outgoing,
    PeerMsg,
    Phase,
    Placement,
    Progress,
    SelectCard,
    SelectSide,
    Sfx,
} from '@/types';
import { CpuPilot } from './ai';
import { Field } from './field';
import { loadProgress, resetProgress, saveProgress } from './progress';

/** `ghost` transits are only drawn: online, the real attack is delivered on the rival's screen. */
interface Transit {
    o: Outgoing;
    from: 0 | 1;
    t: number;
    ghost?: boolean;
}
/** One player's cursor on the select screen, and whether they have locked in their pick. */
interface Picker {
    index: number;
    done: boolean;
}

/** Where the two meadows sit side by side in the wide layout. */
const WIDE: readonly [Placement, Placement] = [
    { x: 0, y: 0, s: 1 },
    { x: C.FIELD_W + C.GAP, y: 0, s: 1 },
];
/**
 * Where they sit in the tall layout: yours full width against the bottom edge, the rival's small at the top.
 * The band left above your meadow holds the rival's meadow and the console, designed TALL_TOP high: on a
 * shorter screen the band shrinks to fit, on a longer one it stays centred in the spare height.
 */
function tallPlacement(h: number): { at: readonly [Placement, Placement]; band: Placement } {
    const s = C.TALL_OWN_S;
    const ownY = h - C.FIELD_H * s;
    const k = Math.min(1, ownY / C.TALL_TOP);
    const band = { x: (C.TALL_W * (1 - k)) / 2, y: Math.max(0, (ownY - C.TALL_TOP * k) / 2), s: k };
    const R = C.TALL_RIVAL;
    return {
        at: [
            { x: 0, y: ownY, s },
            { x: band.x + R.x * k, y: band.y + R.y * k, s: R.s * k },
        ],
        band,
    };
}
const IDLE: Controls = { left: false, right: false, up: false, down: false, fire: false };

// Select screen: roster medallions in rows of SELECT_COLS; arrows move, up/down jump a row.
const COLS = SELECT_COLS;
/** Seconds to choose offline before the highlighted fairy is picked for you. */
const SELECT_TIME = 30;
/** Beat on the READY! stamps before the match starts. */
const READY_HOLD = 0.9;

/**
 * Owns the whole game: the screens, match and round flow, both meadows, the CPU pilot and the online session. Fields
 * never talk to each other; `Game` delivers what each sends.
 */
export class Game {
    private mode: Mode = 'cpu';
    private phase: Phase = 'title';
    private phaseT = 0;
    private picks: [Fairy, Fairy] = [FAIRIES[0], FAIRIES[1]];
    private pickers: [Picker, Picker] = [
        { index: 0, done: false },
        { index: 1, done: false },
    ];
    /** Select-screen clock: seconds since it opened, and when both players were ready (-1: not yet). */
    private selectT = 0;
    /** Highlighted title-menu item. */
    private titleIndex = 0;
    private readyAt = -1;
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

    constructor(
        private input: Input,
        private r: Renderer,
        private sound: Sound,
    ) {}

    /** Play what each meadow asked for. Offline, sounds lean toward their meadow and the CPU's are quieter. */
    private drainSfx(): void {
        this.fields.forEach((f, i) => {
            const pan = this.online ? 0 : i === 0 ? -0.35 : 0.35;
            const vol = this.mode === 'cpu' && i === 1 ? 0.45 : 1;
            for (const e of f.sfx) this.sound.play(e.k, e.p, pan, vol);
            f.sfx = [];
        });
    }

    /** Play an interface sound (centred, full volume). */
    private ui(k: Sfx): void {
        this.sound.play(k);
    }

    /** Called by the page buttons and the title screen. */
    start(mode: Mode): void {
        if (mode !== 'online' && this.net) this.disconnect();
        this.mode = mode;
        this.phase = 'select';
        this.paused = false;
        this.selectT = 0;
        this.readyAt = -1;
        // Online, the rival's cursor is whatever they last told us.
        const rival = mode === 'online' ? this.pickers[1].done : mode === 'cpu';
        this.pickers = [
            { index: this.pickers[0].index, done: false },
            { index: this.pickers[1].index, done: rival },
        ];
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

    /** For the page: which on-screen touch buttons make sense right now. */
    get modeName(): Mode {
        return this.mode;
    }
    /** The current phase, for the page to show or hide its buttons. */
    get phaseName(): Phase {
        return this.phase;
    }

    /** The page went to the background (app switch, tab hidden): pause an offline round. */
    pauseForBackground(): void {
        if (this.phase === 'playing' && this.mode !== 'online') this.paused = true;
    }

    /** True while connected to an online rival. */
    get online(): boolean {
        return this.mode === 'online' && this.net !== null;
    }

    /** Leave the online session and show `notice` on the title screen. */
    private disconnect(notice = ''): void {
        if (this.net) {
            this.net.leave();
            this.net.close();
        }
        this.net = null;
        this.notice = notice;
        this.mode = 'cpu';
        this.phase = 'title';
        this.transits = [];
    }

    /** Tell the online rival where this player's cursor is and whether they have picked. */
    private sendSelection(): void {
        const pk = this.pickers[0];
        this.net?.peer({ k: 'sel', i: pk.index, done: pk.done, id: FAIRIES[pk.index].id });
    }

    /** Wipe saved stats and unlocks and go back to the title screen. */
    resetProgress(): void {
        this.progress = resetProgress();
        this.phase = 'title';
    }

    /** True if the fairy needs no unlock or has been unlocked. */
    isUnlocked(f: Fairy): boolean {
        return !f.unlock || this.progress.unlocked.includes(f.id);
    }

    /** The select screen's fairy medallions, with their hit areas for touch. */
    private cards(): SelectCard[] {
        return FAIRIES.map((fairy, i) => {
            const m = medallionAt(i, this.r.layout, this.r.viewH);
            return { fairy, locked: !this.isUnlocked(fairy), x: m.x - m.r, y: m.y - m.r, w: m.r * 2, h: m.r * 2 };
        });
    }

    /** Start a match with the chosen fairies (the CPU picks its own), then its first round. */
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

    /** Set up both meadows for a new round from one shared seed, so their waves match. */
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
        this.fields = [
            new Field(seed, this.picks[0], roundIndex, crowHere),
            new Field(seed, this.picks[1], roundIndex, !crowHere),
        ];
        this.transits = [];
        this.cpu = new CpuPilot();
        this.phase = 'countdown';
        this.phaseT = 0;
    }

    /** Move the select-screen cursors and lock in picks from keys, pads and taps. */
    private stepSelect(dt: number): void {
        const pr = this.input.pressed;
        const cards = this.cards();
        const before = { ...this.pickers[0] };
        const keys: [string[], string[], string[], string[], string[]][] =
            this.mode !== 'versus'
                ? [
                      [
                          ['ArrowLeft', 'KeyA'],
                          ['ArrowRight', 'KeyD'],
                          ['ArrowUp', 'KeyW'],
                          ['ArrowDown', 'KeyS'],
                          ['Space', 'Enter', 'KeyZ', 'KeyG'],
                      ],
                  ]
                : [
                      [['KeyA'], ['KeyD'], ['KeyW'], ['KeyS'], ['KeyG']],
                      [['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['Enter', 'Slash']],
                  ];
        const any = (codes: string[]) => codes.some(c => pr.has(c));
        keys.forEach(([l, r, u, d, ok], i) => {
            const pk = this.pickers[i];
            if (pk.done) {
                if (any(l) || any(r) || any(u) || any(d)) pk.done = false;
                return;
            }
            const was = pk.index;
            if (any(l)) pk.index = (pk.index + FAIRIES.length - 1) % FAIRIES.length;
            if (any(r)) pk.index = (pk.index + 1) % FAIRIES.length;
            if (any(u) || any(d)) pk.index = (pk.index + COLS) % FAIRIES.length;
            if (pk.index !== was) this.ui('tick');
            if (any(ok) && !cards[pk.index].locked) {
                pk.done = true;
                this.picks[i] = FAIRIES[pk.index];
                this.ui('ok');
            }
        });
        // Tap a medallion to pick it: for player one, then (two players on one device) player two.
        const tap = this.input.tap;
        if (tap) {
            const hit = cards.findIndex(c => tap.x >= c.x && tap.x <= c.x + c.w && tap.y >= c.y && tap.y <= c.y + c.h);
            const who = this.mode === 'versus' && this.pickers[0].done ? 1 : 0;
            const pk = this.pickers[who];
            if (hit >= 0 && !pk.done) {
                if (pk.index !== hit) this.ui('tick');
                pk.index = hit;
                if (!cards[hit].locked) {
                    pk.done = true;
                    this.picks[who] = FAIRIES[hit];
                    this.ui('ok');
                }
            }
        }
        if (this.mode === 'online' && (before.index !== this.pickers[0].index || before.done !== this.pickers[0].done))
            this.sendSelection();
        if (pr.has('Escape')) {
            if (this.online) this.disconnect();
            else this.phase = 'title';
            return;
        }
        // Offline, time running out picks whatever is highlighted (or the first open fairy if that's locked).
        this.selectT += dt;
        if (!this.online && this.selectT >= SELECT_TIME) {
            this.pickers.forEach((pk, i) => {
                if (pk.done) return;
                if (cards[pk.index].locked) pk.index = cards.findIndex(c => !c.locked);
                pk.done = true;
                this.picks[i] = FAIRIES[pk.index];
            });
            this.ui('ok');
        }
        if (this.pickers[0].done && this.pickers[1].done) {
            // Hold on the READY! stamps a moment, then go.
            if (this.readyAt < 0) this.readyAt = this.selectT;
            // Online, only the host starts the match; the guest waits for the first round.
            if (this.selectT - this.readyAt >= READY_HOLD && (!this.online || this.net!.isHost)) this.beginMatch();
        } else this.readyAt = -1;
    }

    // ---- online messages ------------------------------------------------------

    /** Handle everything the server and the rival sent since the last step. */
    private pollNet(dt: number): void {
        const net = this.net;
        if (!net) return;
        for (const ev of net.poll(dt)) {
            if (ev.t === 'peerLeft') {
                this.disconnect('Your rival left the meadow');
                return;
            }
            if (ev.t === 'closed') {
                this.disconnect('Lost the connection to the server');
                return;
            }
            if (ev.t === 'msg') this.onPeer(ev.d);
        }
    }

    /** Act on one message from the online rival: picks, round seeds, snapshots, attacks and results. */
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
                if (this.phase === 'select') {
                    this.pickers[0].done = true;
                    this.beginMatch(m.seed);
                } else {
                    this.wins = m.wins;
                    this.newRound(m.seed);
                }
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
        if (localDead && !this.sentDead) {
            this.sentDead = true;
            net.peer({ k: 'dead', r: this.roundNo });
        }
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

    /** Advance the game by one fixed step. */
    step(dt: number): void {
        this.time += dt;
        const pr = this.input.pressed;
        this.drainSfx();
        if (pr.has('KeyM')) this.sound.toggleMute();
        if (this.mode === 'online') {
            this.pollNet(dt);
            if (!this.net) return;
        }
        if ((pr.has('Escape') || pr.has('KeyP')) && this.phase === 'playing' && this.mode !== 'online')
            this.paused = !this.paused;

        if (this.phase === 'title') {
            if (this.notice) {
                if (pr.size) this.notice = '';
                return;
            }
            // Arcade menu: up/down (keys, either player's stick) moves the cursor; any fire button
            // or Start plays it. 1/2/3 jump straight in, and tapping a bar plays that one.
            const buttons = titleButtons(this.r.layout, this.r.viewH);
            const n = buttons.length;
            const was = this.titleIndex;
            if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.titleIndex = (this.titleIndex + n - 1) % n;
            if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.titleIndex = (this.titleIndex + 1) % n;
            if (this.titleIndex !== was) this.ui('tick');
            let pick = -1;
            const tap = this.input.tap;
            if (tap)
                pick = buttons.findIndex(
                    b => tap.x >= b.x - 10 && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h,
                );
            ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => {
                if (pr.has(k)) pick = i;
            });
            if (pick < 0 && ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k)))
                pick = this.titleIndex;
            if (pick >= 0) {
                this.titleIndex = pick;
                this.ui('ok');
                const mode = buttons[pick].mode;
                if (mode === 'online') this.onWantOnline?.();
                else this.start(mode);
            }
            return;
        }
        if (this.phase === 'select') {
            this.stepSelect(dt);
            return;
        }
        if (this.paused) return;
        this.phaseT += dt;

        if (this.online) {
            if (this.phase !== 'playing' && pr.has('Escape')) {
                this.disconnect();
                return;
            }
            this.tickOnline(dt);
        }
        if (this.phase === 'countdown') {
            if (this.phaseT > 2) {
                this.phase = 'playing';
                this.phaseT = 0;
                this.ui('start');
            }
            return;
        }
        if (this.phase === 'roundOver' || this.phase === 'matchOver') {
            const go = this.phaseT > 1.2 && (pr.has('Space') || pr.has('Enter') || pr.has('KeyG') || pr.has('Pointer'));
            if (go || (this.phase === 'roundOver' && this.phaseT > 3.5)) {
                if (this.phase === 'matchOver') {
                    this.start(this.mode);
                    return;
                }
                // Online, the host deals the next round and the guest follows.
                if (!this.online || this.net!.isHost) this.newRound();
            }
            this.fields[0].update(dt, IDLE);
            if (!this.online) this.fields[1].update(dt, IDLE);
            return;
        }

        if (this.online) {
            this.stepOnline(dt);
            return;
        }

        // A moonseed break freezes both meadows for a beat.
        const hs = Math.max(this.fields[0].hitstop, this.fields[1].hitstop);
        if (hs > 0) {
            for (const f of this.fields) f.hitstop = Math.max(0, f.hitstop - dt);
            return;
        }

        const c0 = this.mode === 'cpu' ? this.input.solo(this.fields[0].player) : this.input.p1(this.fields[0].player);
        const c1 = this.mode === 'cpu' ? this.cpu.think(this.fields[1], dt) : this.input.p2(this.fields[1].player);
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

        const dead0 = !this.fields[0].alive,
            dead1 = !this.fields[1].alive;
        if (dead0 || dead1) this.endRound(dead0, dead1);
    }

    /** One playing step online: only our meadow is simulated here. */
    private stepOnline(dt: number): void {
        const me = this.fields[0];
        // A moonseed break freezes only the meadow it broke in; the rival's keeps going on their screen.
        if (me.hitstop > 0) {
            me.hitstop = Math.max(0, me.hitstop - dt);
            return;
        }
        me.update(dt, this.input.solo(me.player));
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

    /** A fairy went down: settle the round, award it, and move on to the next round or the end of the match. */
    private endRound(dead0: boolean, dead1: boolean): void {
        // The round is decided: the meadows keep drifting behind the banner, but no more hits land.
        for (const f of this.fields) f.settled = true;
        this.roundWinner = dead0 && dead1 ? -1 : dead0 ? 1 : 0;
        // Versus on one screen always has a winner to cheer; otherwise it's about you.
        this.ui(
            this.mode === 'versus' ? (this.roundWinner < 0 ? 'lose' : 'win') : this.roundWinner === 0 ? 'win' : 'lose',
        );
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

    /** Save the finished match into progress and unlock any fairies it earned. */
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

    /** Draw the current screen. */
    draw(): void {
        const r = this.r;
        // Prompts follow whatever the player last used: a touchscreen or keys/pad.
        const touch = this.input.touchActive;
        // A portrait screen gets the tall layout: the menus are redrawn for it, and so is a
        // round with one player on the device. Two players sharing it keep the meadows side by side.
        const inRound = this.phase !== 'title' && this.phase !== 'select';
        r.layout = r.portrait && !(inRound && this.mode === 'versus') ? 'tall' : 'wide';
        // A round may squeeze the tall view shorter than the menus can (main.ts refits when this changes).
        r.tallMin = inRound ? C.TALL_H_PLAY : C.TALL_H;
        const tall = r.layout === 'tall' ? tallPlacement(r.viewH) : null;
        const at = tall ? tall.at : WIDE;
        if (tall) r.tallBand = tall.band;
        r.begin();
        const solo = this.mode !== 'versus';
        const tags: [HudTag, HudTag] = [
            { label: solo ? 'YOU' : '1P', color: PLAYER_COLORS.p1 },
            this.mode === 'cpu'
                ? { label: 'CPU', color: PLAYER_COLORS.cpu }
                : { label: this.mode === 'online' ? 'RIVAL' : '2P', color: PLAYER_COLORS.p2 },
        ];
        r.field(this.fields[0], at[0].x, this.wins[0], this.time, tags[0], at[0].y, at[0].s);
        r.field(this.fields[1], at[1].x, this.wins[1], this.time, tags[1], at[1].y, at[1].s);
        // Between rounds the console still shows the round just played.
        const played = this.wins[0] + this.wins[1];
        const between = this.phase === 'roundOver' || this.phase === 'matchOver';
        r.console(
            {
                round: Math.max(1, between ? played : played + 1),
                tempo: this.fields[0].tempo,
                ping: this.online ? Math.round(this.net!.rtt * 1000) : undefined,
            },
            this.time,
        );

        for (const tr of this.transits) {
            if (tr.o.kind === 'clash' || tr.o.kind === 'heal') continue;
            const k = tr.t / C.TRANSIT_TIME;
            const from = at[tr.from],
                to = at[1 - tr.from];
            const sx = from.x + tr.o.fromX * from.s,
                sy = from.y + tr.o.fromY * from.s;
            const ex = to.x + Math.min(C.FIELD_W - 12, Math.max(12, tr.o.fromX)) * to.s,
                ey = to.y - 10 * to.s;
            const x = sx + (ex - sx) * k,
                y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 40;
            r.transit(
                x,
                y,
                tr.o.kind === 'moth'
                    ? (FAIRIES.find(f => f.id === tr.o.fairy)?.guardian.color ?? PALETTE.moth)
                    : tr.o.kind === 'bramble'
                      ? PALETTE.bramble
                      : tr.o.kind === 'crow'
                        ? '#ff9fb8'
                        : tr.o.kind === 'imp'
                          ? (FAIRIES.find(f => f.id === tr.o.fairy)?.color ?? PALETTE.star)
                          : tr.o.kind === 'comet'
                            ? '#ff6f9c'
                            : PALETTE.star,
            );
        }

        const names =
            this.mode === 'cpu'
                ? ['You', `CPU ${this.picks[1].name}`]
                : this.mode === 'online'
                  ? ['You', `Rival ${this.picks[1].name}`]
                  : [this.picks[0].name, this.picks[1].name];
        switch (this.phase) {
            case 'title':
                r.title(
                    {
                        index: this.titleIndex,
                        touch,
                        unlocked: FAIRIES.filter(f => this.isUnlocked(f)).length,
                        total: FAIRIES.length,
                        wins: this.progress.wins,
                        bestChain: this.progress.bestChain,
                    },
                    this.time,
                );
                if (this.notice)
                    r.banner({
                        title: this.notice,
                        sub: touch ? 'Tap to continue' : 'Press any key to continue',
                        size: 16,
                        dim: 0.7,
                        tone: 'blue',
                        blinkSub: true,
                    });
                break;
            case 'select': {
                const cards = this.cards();
                const [p1, p2] = this.pickers;
                const { p1: P1, p2: P2, cpu: CPU } = PLAYER_COLORS;
                const sides: [SelectSide, SelectSide] = [
                    {
                        fairy: FAIRIES[p1.index],
                        locked: cards[p1.index].locked,
                        done: p1.done,
                        tag: solo ? 'YOU' : '1P',
                        color: P1,
                    },
                    this.mode === 'cpu'
                        ? { fairy: FAIRIES[0], locked: false, done: true, tag: 'CPU', color: CPU, cpu: true }
                        : // A rival may fly a fairy you haven't unlocked yet, so only a local 2P sees locks.
                          {
                              fairy: FAIRIES[p2.index],
                              locked: this.mode === 'versus' && cards[p2.index].locked,
                              done: p2.done,
                              tag: this.mode === 'online' ? 'RIVAL' : '2P',
                              color: P2,
                          },
                ];
                const cursors = [{ index: p1.index, color: P1, tag: solo ? 'YOU' : '1P', done: p1.done }];
                if (this.mode !== 'cpu')
                    cursors.push({
                        index: p2.index,
                        color: P2,
                        tag: this.mode === 'online' ? 'RIVAL' : '2P',
                        done: p2.done,
                    });
                const heading =
                    this.mode === 'versus'
                        ? 'CHOOSE YOUR FAIRIES'
                        : this.mode === 'online' && p1.done && !p2.done
                          ? 'WAITING FOR YOUR RIVAL…'
                          : 'CHOOSE YOUR FAIRY';
                const hints = touch
                    ? [
                          this.mode === 'versus'
                              ? p1.done
                                  ? '2P  TAP A FAIRY'
                                  : '1P  TAP A FAIRY'
                              : 'TAP A FAIRY TO CHOOSE',
                          'BACK BUTTON RETURNS',
                      ]
                    : this.mode === 'versus'
                      ? ['1P  WASD + G     2P  ARROWS + ENTER', 'ESC  BACK']
                      : ['PRESS Z OR ENTER TO CHOOSE', 'ARROWS MOVE  ·  ESC BACK'];
                const timer = this.online ? null : Math.ceil(SELECT_TIME - this.selectT);
                r.select({ cards, sides, cursors, heading, timer, hints }, this.time);
                break;
            }
            case 'countdown': {
                const final = this.wins[0] === C.ROUNDS_TO_WIN - 1 && this.wins[1] === C.ROUNDS_TO_WIN - 1;
                if (this.phaseT < 1)
                    r.banner({
                        title: final ? 'Final round' : `Round ${played + 1}`,
                        sub: `${this.picks[0].name}  vs  ${this.picks[1].name}`,
                        age: this.phaseT,
                        dim: 0.35,
                        tone: final ? 'pink' : 'gold',
                    });
                else r.banner({ title: 'Fly!', age: this.phaseT - 1, dim: 0.15, size: 40, tone: 'pink' });
                break;
            }
            case 'roundOver': {
                const w = this.roundWinner;
                const title = w < 0 ? 'Draw' : solo && w === 0 ? 'You take the round' : `${names[w]} takes the round`;
                r.banner({
                    title,
                    sub: 'Next round starting',
                    age: this.phaseT,
                    dim: 0.5,
                    size: 24,
                    tone: solo && w === 1 ? 'pink' : 'gold',
                });
                break;
            }
            case 'matchOver': {
                const w = this.wins[0] > this.wins[1] ? 0 : 1;
                const title = solo ? (w === 0 ? 'You win!' : `${names[1]} wins`) : `${names[w]} wins!`;
                const unlocked = this.newlyUnlocked.length
                    ? `New fairy unlocked: ${this.newlyUnlocked.map(f => f.name).join(', ')}`
                    : undefined;
                r.banner({
                    title,
                    sub: touch ? 'Tap to choose again' : 'Press Space or tap to choose again',
                    extra: unlocked,
                    age: this.phaseT,
                    dim: 0.6,
                    size: 34,
                    tone: solo && w === 1 ? 'pink' : 'gold',
                    blinkSub: true,
                });
                break;
            }
            default:
                if (this.paused)
                    r.banner({
                        title: 'Paused',
                        sub: touch ? 'Tap the pause button to resume' : 'Press P to resume',
                        dim: 0.6,
                        tone: 'blue',
                        blinkSub: true,
                    });
        }
    }
}
