import type { Sound } from '@/audio/sound';
import * as C from '@/core/config';
import { FAIRIES, fairyById } from '@/data/characters';
import type { Input } from '@/input/input';
import { sanitizeKeys } from '@/input/keys';
import type { Net } from '@/net/net';
import type { Renderer } from '@/render/renderer';
import { medallionAt, SELECT_COLS } from '@/render/screens/select-screen';
import { modeCards, modeColumns } from '@/render/screens/mode-screen';
import { rosterMedallions, rosterPreviewButton } from '@/render/screens/roster-screen';
import { mapsMedallions } from '@/render/screens/maps-screen';
import { MAP_CARDS, MAP_COLS, mapCards } from '@/render/screens/map-screen';
import { MAPS, mapById, mapForSeed } from '@/data/maps';
import { stageFor, stageOpen } from '@/data/stages';
import { titleButtons } from '@/render/screens/title-screen';
import { clock, replayPanelLayout } from '@/render/hud';
import { PALETTE, PLAYER_COLORS } from '@/render/theme';
import type {
    Controls,
    EndlessRank,
    Fairy,
    FieldSnapshot,
    HudTag,
    Mode,
    Outgoing,
    PeerMsg,
    Phase,
    ReplayData,
    ReplayHighlight,
    ReplayRound,
    ReplayRow,
    ReplaySummary,
    Placement,
    Progress,
    Settings,
    ModeMenu,
    SelectCard,
    SelectSide,
    Sfx,
    SyncedSettings,
} from '@/types';
import { CpuPilot } from './ai';
import { Field } from './field';
import { curveAt, pathAt, pathLength, curveDir, curveLength, enterAt, shiftCurve } from './fireball-path';
import { SkillPreview } from './preview';
import { MapPreview } from './map-preview';
import { loadProgress, resetProgress, saveProgress } from './progress';
import { loadSettings, saveSettings } from './settings';
import { Account } from './account';
import { Recorder, ReplayPlayer, loadLocalReplay, quantize, saveLocalReplay } from './replay';
import { REPLAY_ROWS, replayLinkBox, replayRowBoxes } from '@/render/screens/replays-screen';
import { Rng } from '@/core/rng';

/** Seconds from an attack leaving one meadow to arriving in the other: its `stagger`, then its flight. */
const transitTime = (o: Outgoing) => (o.stagger ?? 0) + flightTime(o);

/**
 * Seconds an attack is in flight between the meadows, once any `stagger` is over: a Reverse crossing the screen
 * takes as long as the stretch of its curve between the meadows needs at its speed; any other fireball flies its
 * route (normalRoute) to the rival's near wall at its transit speed; everything
 * else takes
 * TRANSIT_TIME, an Extra Attack less (SPEED_EXTRA).
 */
const flightTime = (o: Outgoing) => {
    if (o.kind === 'star' && o.curve) {
        const k0 = o.k ?? 0;
        const kIn = enterAt(shiftCurve(o.curve, o.side ?? 1), k0);
        return Math.max(0.05, curveLength(o.curve, k0, kIn) / Math.max(40, o.speed ?? C.FIREBALL_FALL_SPEED));
    }
    if (o.kind === 'star') return pathLength(o.route ?? [{ x: o.fromX, y: o.fromY }]) / riseSpeed(o);
    return C.TRANSIT_TIME / (o.kind === 'imp' ? C.SPEED_EXTRA : C.SPEED_NORMAL);
};

/** How fast a Normal fireball flies its route between the meadows (and then on into the rival's). */
const riseSpeed = (o: Outgoing) =>
    C.fireballTransitSpeed(o.reflects ?? (o.level >= 2 ? 1 : 0), o.boost ?? 1) *
    (o.fever && o.level < 2 ? (o.pace ?? 1) : 1);

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

/** Where the two meadows sit side by side in the wide layout (the meadows' width can change by round). */
const wide = (): readonly [Placement, Placement] => [
    { x: 0, y: 0, s: 1 },
    { x: C.FIELD_W + C.GAP, y: 0, s: 1 },
];
/**
 * Endless has no rival beside you, so its attacks come from above: a fireball drops in straight down from the top
 * of the meadow (over the fairy, a volley spread either side) instead of flying in from a side wall.
 */
function fromAbove(o: Outgoing): Outgoing {
    if (o.kind !== 'star' || o.level >= 2) return o;
    const { enter: _e, route: _r, curve: _c, ...rest } = o;
    return { ...rest, aim: o.aim ?? 0 };
}

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
/** Where the browser remembers whether the replay's controls were minimised. */
const MINI_KEY = 'glimmerwing-replay-mini';

/** A yes/no kept in localStorage (false where there's none or storage is unavailable). */
function readFlag(key: string): boolean {
    try {
        return localStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

/** Keep a yes/no in localStorage (skipped where storage is unavailable). */
function writeFlag(key: string, on: boolean): void {
    try {
        localStorage.setItem(key, on ? '1' : '0');
    } catch {
        /* ignore */
    }
}
/** No keys pressed: what a step reads while a replay runs ahead. */
const NO_KEYS: Set<string> = new Set();

/** True if point `p` lies inside box `b`. */
const inBox = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

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
    /** The highlighted choice on the title screen, and the highlighted card on the mode menu. */
    private titleIndex = 1;
    private modeIndex = 0;
    /** Which menu of cards is showing: the main menu, or Play's choice of modes. */
    private menu: ModeMenu = 'main';
    /** The fairy in view on the Characters screen. */
    private rosterIndex = 0;
    /** The Characters screen's live demo of the fairy in view. */
    private preview = new SkillPreview();
    /** The Maps screen's map in view, and its live preview. */
    private mapsIndex = 0;
    private mapPreview = new MapPreview();
    /** On a phone, whether the demo's pop-up is open. */
    private demoOpen = false;
    /** Set by the page: open the How to play page. */
    onWantGuide?: () => void;
    private readyAt = -1;
    /** Draw every fireball's path across the screen (`?debug=paths`). */
    debugPaths = false;
    /** The map card chosen on the map select screen: 0 is Random, then each map in order. Kept between matches. */
    private mapIndex = 0;
    /** The map this match plays on (empty online, where each round's seed picks it). */
    private matchMap = '';
    /** Endless: how long this run has lasted, guardians sent so far, when the next comes, and a new best. */
    private endlessT = 0;
    private endlessBosses = 0;
    private endlessNextBoss = 0;
    private endlessNew = false;
    /** Where the run just ended ranks among every player's best (null until the server answers, or offline). */
    private endlessRank: EndlessRank | null = null;
    /** When the match began (performance.now(), ms), for its length in the player's history. */
    private matchStart = 0;
    /** The player's account on the game server: progress and settings are copied there, results reported. */
    readonly account = new Account();
    /** Records the match being played (VS CPU, 2 Players, Endless) so it can be watched again. */
    private recorder: Recorder | null = null;
    /** The replay being watched, if any: its seeds and controls drive the rounds in place of the players. */
    private replay: ReplayPlayer | null = null;
    /** Watching a replay: how many steps run each step's time (1, 2 or 4), and the next round to deal. */
    private replaySpeed = 1;
    private replayRound = 0;
    /** Watching a replay: shown on its last banner when the recording ended before the match did. */
    private replayCut = false;
    /** The replay's highlights (found by playing it through once, silently, when it opens). */
    private highlights: ReplayHighlight[] = [];
    /** Running the replay ahead silently: to seek, or (scanning) to find its highlights. */
    private seeking = false;
    private scanning = false;
    /** While the timeline's knob is being dragged: where it is (0 to 1). */
    private scrub: number | null = null;
    /** The replay's controls minimised to a small tab (remembered in this browser). */
    private replayMini = readFlag(MINI_KEY);
    /** The last match's recording, and its code on the server once saved there (null until then, or offline). */
    lastReplay: ReplayData | null = null;
    lastReplayCode: string | null = null;
    /** The Replays screen: its list (a server code, or 'local' for this browser's own copy), cursor and lines. */
    private replayList: { code: string; s: ReplaySummary }[] = [];
    private replaysIndex = 0;
    private replaysMessage = '';
    private replaysNote = '';
    private replaysNoteT = 0;
    /** Endless: picks which of the hidden meadow's attacks get through, from the round's seed so a replay agrees. */
    private endlessRng = new Rng(1);
    /** A map forced by the page's address (`?map=<id>`), for trying a map out. */
    private forcedMap =
        typeof location === 'undefined' ? null : mapById(new URLSearchParams(location.search).get('map'));
    private fields: [Field, Field] = [new Field(1, FAIRIES[0]), new Field(1, FAIRIES[1])];
    private wins: [number, number] = [0, 0];
    private transits: Transit[] = [];
    private cpu = new CpuPilot();
    private roundWinner: 0 | 1 | -1 = -1;
    private paused = false;
    private progress: Progress = loadProgress();
    /** The player's settings (the page's Settings panel changes them through setSettings). */
    settings: Settings = loadSettings();
    private matchBestChain = 0;
    private newlyUnlocked: Fairy[] = [];
    /** Stages the last match's trophies opened, and how many trophies it won or lost. */
    private newStages: string[] = [];
    private trophyDelta = 0;
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
        // Running a replay ahead: nothing is heard, but its big moments are noted as highlights.
        if (this.seeking) {
            this.fields.forEach((f, i) => {
                if (this.scanning) for (const e of f.sfx) this.noteHighlight(e.k, e.p, i as 0 | 1);
                f.sfx = [];
            });
            return;
        }
        this.fields.forEach((f, i) => {
            const pan = this.online ? 0 : i === 0 ? -0.35 : 0.35;
            // Endless's hidden meadow makes no sound at all.
            const vol = i === 1 ? (this.mode === 'endless' ? 0 : this.mode === 'cpu' ? 0.45 : 1) : 1;
            if (vol > 0) for (const e of f.sfx) this.sound.play(e.k, e.p, pan, vol);
            f.sfx = [];
        });
    }

    /** Play an interface sound (centred, full volume). */
    private ui(k: Sfx): void {
        if (this.seeking) return;
        this.sound.play(k);
    }

    /** Called by the page buttons and the title screen. */
    start(mode: Mode): void {
        // A match ends back on Play's menu.
        this.menu = 'play';
        if (mode !== 'online' && this.net) this.disconnect();
        this.mode = mode;
        this.phase = 'select';
        this.paused = false;
        this.selectT = 0;
        this.readyAt = -1;
        // Online, the rival's cursor is whatever they last told us.
        const rival = mode === 'online' ? this.pickers[1].done : mode === 'cpu' || mode === 'endless';
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

    /** Whether the other meadow is flown by the computer: VS CPU, and Endless's hidden meadow. */
    private get vsCpu(): boolean {
        return this.mode === 'cpu' || this.mode === 'endless';
    }

    /** For the page: which on-screen touch buttons make sense right now. */
    get modeName(): Mode {
        return this.mode;
    }
    /** The current phase, for the page to show or hide its buttons. */
    get phaseName(): Phase {
        return this.phase;
    }
    /** The map shown on the Maps screen, for the page to play its music. */
    get browsedMap(): string {
        return MAPS[this.mapsIndex].id;
    }
    /** The map the round is on, for the page to pick its music. */
    get roundMap(): string {
        return this.fields[0].mapId;
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
        this.phase = 'modes';
        this.menu = 'play';
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
        this.account.saveProgress(this.progress);
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
        if (this.vsCpu) {
            // The CPU flies a random fairy from the whole roster, locked ones included,
            // so you can see what you're working toward.
            const others = FAIRIES.filter(f => f !== this.picks[0]);
            this.picks[1] = others[Math.floor(Math.random() * others.length)];
        }
        // Random picks a map for the whole match; online, each round's seed picks one instead (both sides agree).
        this.matchMap = this.online ? '' : this.mapIndex === 0 ? this.randomOpenMap() : MAPS[this.mapIndex - 1].id;
        this.wins = [0, 0];
        this.matchBestChain = 0;
        this.newlyUnlocked = [];
        this.newStages = [];
        this.trophyDelta = 0;
        this.endlessNew = false;
        this.endlessRank = null;
        this.matchStart = performance.now();
        const m = this.mode;
        this.recorder =
            !this.replay && (m === 'cpu' || m === 'versus' || m === 'endless')
                ? new Recorder(m, [this.picks[0].id, this.picks[1].id], this.matchMap)
                : null;
        this.newRound(seed);
    }

    /** Whether map `i` (in MAPS order) is open on the trophy road. */
    private mapOpen(i: number): boolean {
        return stageOpen(this.progress, MAPS[i].id);
    }

    /** Random's pick: any map whose stage is open. */
    private randomOpenMap(): string {
        const open = MAPS.filter((_, i) => this.mapOpen(i));
        return open[Math.floor(Math.random() * open.length)].id;
    }

    /** Change the player's settings and save them; they apply from the next round. */
    setSettings(next: Partial<Settings>): void {
        this.settings = { ...this.settings, ...next };
        saveSettings(this.settings);
        this.account.saveSettings(this.synced());
    }

    /** How many simulation steps the page should run each step's time: more while fast-forwarding a replay. */
    get speed(): number {
        return this.replay && this.phase === 'playing' ? this.replaySpeed : 1;
    }

    /** Whether a replay is being watched. */
    get watching(): boolean {
        return this.replay !== null;
    }

    /**
     * Watch a recorded match: its fairies, map and rounds play out as they did, the recording flying both meadows.
     * Nothing it does counts toward progress. Esc (or ◀ Back) leaves it for the Replays screen.
     */
    watchReplay(data: ReplayData): void {
        if (this.net) this.disconnect();
        // Play it through once, silently, to find its highlights; then from the start.
        this.highlights = [];
        this.resetReplay(data);
        this.scanning = true;
        this.runReplayTo(Infinity);
        this.scanning = false;
        this.resetReplay(data);
        this.replaySpeed = 1;
        this.paused = false;
    }

    /** Set a replay up from its start: its fairies, map and first round. */
    private resetReplay(data: ReplayData): void {
        this.replay = new ReplayPlayer(data);
        this.scrub = null;
        this.recorder = null;
        this.replayRound = 0;
        this.replaySpeed = 1;
        this.replayCut = false;
        this.mode = data.mode;
        this.picks = [fairyById(data.fairies[0]) ?? FAIRIES[0], fairyById(data.fairies[1]) ?? FAIRIES[1]];
        this.matchMap = data.map;
        this.wins = [0, 0];
        this.matchBestChain = 0;
        this.newlyUnlocked = [];
        this.newStages = [];
        this.trophyDelta = 0;
        this.endlessNew = false;
        this.endlessRank = null;
        this.paused = false;
        this.newRound();
    }

    /**
     * Run the replay ahead silently until its timeline reaches `target` (in playing steps), skipping the
     * countdowns and round banners, and never stopping between rounds; or to its end.
     */
    private runReplayTo(target: number): void {
        const wasPaused = this.paused;
        this.paused = false;
        this.seeking = true;
        for (let guard = 0; this.replay && guard < 2_000_000; guard++) {
            if (this.phase === 'matchOver') break;
            if (this.phase === 'countdown') {
                if (this.replay.played >= target) break;
                this.phaseT = 3;
            } else if (this.phase === 'roundOver') this.phaseT = 4;
            else if (this.replay.played >= target) break;
            this.step(C.STEP);
        }
        this.seeking = false;
        this.paused = wasPaused;
    }

    /** Jump the replay to `target` playing steps in, keeping its speed and pause (going back starts it over). */
    seekReplay(target: number): void {
        const rp = this.replay;
        if (!rp) return;
        target = Math.max(0, Math.min(rp.length, Math.round(target)));
        const speed = this.replaySpeed,
            paused = this.paused;
        if (target < rp.played || this.phase === 'matchOver') this.resetReplay(rp.data);
        this.runReplayTo(target);
        this.replaySpeed = speed;
        this.paused = paused;
    }

    /** Note a sound from a replay being scanned as a highlight, if it marks a big moment. */
    private noteHighlight(k: Sfx, p: number, side: 0 | 1): void {
        const kind =
            k === 'fever'
                ? 'fever'
                : k === 'extra' && p === 0
                  ? 'extra'
                  : k === 'bossIn'
                    ? 'guardian'
                    : k === 'bomb'
                      ? 'bomb'
                      : k === 'death'
                        ? 'ko'
                        : k === 'send' && p >= 7
                          ? 'chain'
                          : null;
        if (!kind || !this.replay) return;
        const at = this.replay.played;
        // One marker for a burst of the same thing.
        if (this.highlights.some(h => h.kind === kind && h.side === side && at - h.at < 120)) return;
        this.highlights.push({ at, kind, side });
    }

    /** A short label for a highlight, e.g. "FEVER · PIP". */
    private highlightLabel(h: ReplayHighlight): string {
        const what = {
            chain: 'BIG CHAIN',
            fever: 'FEVER',
            extra: 'EXTRA ATTACK',
            guardian: 'GUARDIAN',
            bomb: 'BOMB',
            ko: 'KNOCKOUT',
        }[h.kind];
        return `${what} · ${this.picks[h.side].name.toUpperCase()}`;
    }

    /** The highlight within a small reach of a point on the timeline (0 to 1), if any. */
    private highlightNear(x: number): ReplayHighlight | null {
        const len = this.replay?.length ?? 0;
        if (!len) return null;
        let best: ReplayHighlight | null = null,
            d = 0.012;
        for (const h of this.highlights) {
            const dh = Math.abs(h.at / len - x);
            if (dh < d) {
                d = dh;
                best = h;
            }
        }
        return best;
    }

    /**
     * The replay's controls, read each step while watching: dragging on the timeline moves its knob and lets go
     * to seek there (landing just before a highlight it's on); a round chip jumps to that round; ← → skip five
     * seconds; [ and ] jump to the previous or next highlight; 1–9 to a round; Space or a tap steps the speed.
     * Returns true if it seeked, so the step that read it stops there.
     */
    private replayControls(pr: Set<string>): boolean {
        const rp = this.replay!;
        const L = replayPanelLayout(this.r.viewW - 2 * this.r.viewX, this.r.viewH, rp.data.rounds.length);
        const at = (x: number) => Math.max(0, Math.min(1, (x - L.bar.x) / L.bar.w));
        const tap = this.input.tap;
        // H, the panel's minimise button or the minimised tab shrink it to the tab and back.
        // (Their tap targets reach a little past them, so a finger finds them easily.)
        const target = this.replayMini ? L.tab : L.hide;
        const reach = { x: target.x - 6, y: target.y - 6, w: target.w + 12, h: target.h + 12 };
        const toggle = pr.has('KeyH') || (!!tap && inBox(tap, reach));
        if (toggle) {
            pr.delete('Pointer');
            this.replayMini = !this.replayMini;
            writeFlag(MINI_KEY, this.replayMini);
            this.scrub = null;
            this.ui('tick');
        }
        if (tap && !toggle && !this.replayMini) {
            const chip = L.chips.findIndex(c => inBox(tap, c));
            if (chip >= 0) {
                pr.delete('Pointer');
                this.seekReplay(chip === 0 ? 0 : rp.roundStarts[chip - 1]);
                return true;
            }
            if (inBox(tap, L.barHit)) {
                pr.delete('Pointer');
                this.scrub = at(tap.x);
            }
        }
        if (this.scrub !== null) {
            const p = this.input.pointer;
            if (p) {
                this.scrub = at(p.x);
                return false;
            }
            const h = this.highlightNear(this.scrub);
            const to = h ? Math.max(0, h.at - 90) : this.scrub * rp.length;
            this.scrub = null;
            this.seekReplay(to);
            return true;
        }
        const pos = rp.played;
        if (pr.has('ArrowLeft') || pr.has('ArrowRight')) {
            this.seekReplay(pos + (pr.has('ArrowLeft') ? -300 : 300));
            return true;
        }
        if (pr.has('BracketLeft') || pr.has('BracketRight')) {
            const next = pr.has('BracketRight');
            // From a little way back, so jumping twice to the same highlight moves on.
            const list = this.highlights.map(h => Math.max(0, h.at - 90));
            const t = next ? list.find(t => t > pos + 30) : [...list].reverse().find(t => t < pos - 30);
            if (t !== undefined) {
                this.seekReplay(t);
                return true;
            }
        }
        for (let i = 0; i < Math.min(9, rp.data.rounds.length); i++)
            if (pr.has(`Digit${i + 1}`)) {
                this.seekReplay(i === 0 ? 0 : rp.roundStarts[i - 1]);
                return true;
            }
        return false;
    }

    /** Stop watching and go to the Replays screen. */
    exitReplay(): void {
        this.replay = null;
        this.paused = false;
        this.transits = [];
        this.openReplays(false);
        this.ui('tick');
    }

    /** Open the Replays screen and fetch the list (keeping the cursor where it was, unless `fresh`). */
    openReplays(fresh = true): void {
        this.phase = 'replays';
        if (fresh) this.replaysIndex = 0;
        this.replaysNote = '';
        if (!this.replayList.length) this.replaysMessage = 'Loading replays…';
        void this.loadReplays();
    }

    /**
     * Fill the Replays list: the player's replays on the server, and this browser's own last replay if the server
     * doesn't have it (it was played offline, or before there was a server).
     */
    private async loadReplays(): Promise<void> {
        let list: ReplaySummary[] = [];
        let failed = false;
        try {
            list = await this.account.listReplays();
        } catch {
            failed = true;
        }
        const rows = list.map(s => ({ code: s.code, s }));
        const local = loadLocalReplay();
        if (local && !list.some(s => s.recorded === local.at))
            rows.unshift({
                code: 'local',
                s: {
                    code: 'local',
                    mode: local.mode,
                    map: local.map,
                    seconds: local.seconds,
                    at: new Date(local.at).toISOString(),
                    fairies: local.fairies,
                    wins: local.wins,
                    recorded: local.at,
                },
            });
        this.replayList = rows;
        this.replaysIndex = Math.min(this.replaysIndex, Math.max(0, rows.length - 1));
        this.replaysMessage = rows.length
            ? ''
            : failed || !this.account.hasServer
              ? 'No replays here yet.\nPlay a match: it is recorded as you play,\nand saved here when the game server is reached.'
              : 'No replays yet.\nEvery VS CPU, 2 Players and Endless game you play is recorded here.';
    }

    /** Open a replay by its share code (a `?replay=` link): fetch it from the server and watch it. */
    openReplayCode(code: string): void {
        this.openReplays();
        this.watchCode(code);
    }

    /** Fetch the replay with this code (or this browser's own, for 'local') and watch it. */
    private watchCode(code: string): void {
        if (code === 'local') {
            const d = loadLocalReplay();
            if (d) this.watchReplay(d);
            return;
        }
        this.replaysNote = 'Loading replay…';
        this.replaysNoteT = this.time;
        this.account
            .fetchReplay(code)
            .then(d => {
                if (this.phase === 'replays') this.watchReplay(d);
            })
            .catch(() => {
                this.replaysNote = "Couldn't load that replay";
                this.replaysNoteT = this.time;
            });
    }

    /** The share link for a replay saved on the server (empty for one kept only here, or a page from a file). */
    private replayLink(code: string): string {
        if (code === 'local' || typeof location === 'undefined' || !location.protocol.startsWith('http')) return '';
        return `${location.origin}${location.pathname}?replay=${code}`;
    }

    /** The first row in view on the Replays screen, keeping the cursor in sight. */
    private get replaysStart(): number {
        const n = this.replayList.length;
        return Math.max(0, Math.min(this.replaysIndex - Math.floor(REPLAY_ROWS / 2), n - REPLAY_ROWS));
    }

    /** The Replays screen: arrows choose, Enter (or a tap) watches, C (or a tap on the link) copies its link. */
    private stepReplays(pr: Set<string>): void {
        if (this.replaysNote && this.time - this.replaysNoteT > 2.5) this.replaysNote = '';
        if (pr.has('Escape')) {
            this.backToMenu();
            return;
        }
        const n = this.replayList.length;
        if (!n) return;
        const was = this.replaysIndex;
        if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.replaysIndex = (this.replaysIndex + n - 1) % n;
        if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.replaysIndex = (this.replaysIndex + 1) % n;
        if (this.replaysIndex !== was) this.ui('tick');
        const start = this.replaysStart;
        const tap = this.input.tap;
        let pick = -1;
        if (tap) {
            const boxes = replayRowBoxes(this.r.layout, Math.min(REPLAY_ROWS, n - start), this.r.viewH);
            const k = boxes.findIndex(b => inBox(tap, b));
            if (k >= 0) pick = start + k;
            else if (inBox(tap, replayLinkBox(this.r.layout, this.r.viewH))) this.copyReplayLink();
        }
        if (pick < 0 && ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k)))
            pick = this.replaysIndex;
        if (pr.has('KeyC')) this.copyReplayLink();
        if (pick < 0) return;
        this.replaysIndex = pick;
        this.ui('ok');
        this.watchCode(this.replayList[pick].code);
    }

    /** Copy the chosen replay's share link to the clipboard. */
    private copyReplayLink(): void {
        const row = this.replayList[this.replaysIndex];
        const link = row ? this.replayLink(row.code) : '';
        if (!link) return;
        const done = (ok: boolean) => {
            this.replaysNote = ok ? 'Link copied' : 'Copy the link above to share it';
            this.replaysNoteT = this.time;
        };
        if (navigator.clipboard)
            navigator.clipboard.writeText(link).then(
                () => done(true),
                () => done(false),
            );
        else done(false);
    }

    /** One line of the Replays list. */
    private replayRow(r: { code: string; s: ReplaySummary }): ReplayRow {
        const s = r.s;
        const name = (id: string | undefined) => (id ? (fairyById(id)?.name ?? id) : '?');
        const map = mapById(s.map)?.name ?? s.map;
        const endless = s.mode === 'endless';
        const tag = endless ? 'ENDLESS' : s.mode === 'versus' ? '2 PLAYERS' : s.mode === 'online' ? 'ONLINE' : 'VS CPU';
        const color = endless ? '#ff8a5c' : s.mode === 'versus' ? '#8ff0a0' : '#ffd45c';
        const f = s.fairies;
        const title = endless ? `${name(f?.[0])} alone` : `${name(f?.[0])}  vs  ${name(f?.[1])}`;
        const w = s.wins;
        const result = endless ? `survived ${clock(s.seconds)}` : w ? `${w[0]}-${w[1]}` : '';
        const detail = [map, result, endless ? '' : clock(s.seconds)].filter(Boolean).join('  ·  ');
        const when = new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
        return { tag, color, title, detail, when, local: r.code === 'local' };
    }

    /** The recording ran out before its round ended (it was cut short, or plays differently on this build). */
    private replayRanOut(): void {
        for (const f of this.fields) f.settled = true;
        this.replayCut = true;
        this.phase = 'matchOver';
        this.phaseT = 0;
        this.transits = [];
    }

    /** The match just ended: keep its recording here, and save it to the server for the Replays screen. */
    private keepReplay(): void {
        const rec = this.recorder;
        if (!rec) return;
        this.recorder = null;
        const endless = this.mode === 'endless';
        const data = rec.finish({
            wins: endless ? [0, 0] : [this.wins[0], this.wins[1]],
            guardians: endless ? this.endlessBosses : 0,
            map: this.roundMap,
        });
        this.lastReplay = data;
        this.lastReplayCode = null;
        saveLocalReplay(data);
        void this.account.saveReplay(data).then(code => {
            if (this.lastReplay === data) this.lastReplayCode = code;
        });
    }

    /** The settings that follow the player's account: the game's own and the sound's. */
    private synced(): SyncedSettings {
        return { settings: this.settings, audio: this.sound.prefs() };
    }

    /**
     * Meet the game server (called once by the page at start-up): make a guest account if this browser has none,
     * take on any progress or settings saved there later than here, and from then on send changes up. The game
     * plays on from this browser's saves the whole time; with no server it never hears back.
     */
    async connectAccount(): Promise<void> {
        this.sound.onChange = () => this.account.saveSettings(this.synced());
        const got = await this.account.start(this.progress, this.synced());
        if (got.progress) {
            this.progress = { ...this.progress, ...got.progress };
            saveProgress(this.progress);
        }
        if (got.settings) {
            const s = got.settings.settings;
            this.settings = { ...this.settings, ...s, keys: sanitizeKeys(s.keys) };
            saveSettings(this.settings);
            this.input.setBindings(this.settings.keys);
            this.sound.applyPrefs(got.settings.audio ?? {});
        }
    }

    /**
     * Whether a round played now would hide the rival's meadow: an upright phone, against the CPU, with the
     * setting on. Such a round plays in taller meadows that reach the top of the screen.
     */
    private get soloView(): boolean {
        // Endless always plays alone; against the CPU it's the setting's choice.
        return (this.mode === 'endless' || (this.settings.hideRival && this.mode === 'cpu')) && this.r.portrait;
    }

    /** Set up both meadows for a new round from one shared seed, so their waves match. */
    private newRound(seed = (Math.random() * 2 ** 31) | 0): void {
        const roundIndex = this.wins[0] + this.wins[1];
        // A replay deals its own rounds, at the meadow size they were played at.
        let recorded: ReplayRound | null = null;
        if (this.replay) {
            const s = this.replay.startRound(this.replayRound++);
            if (s === null) {
                this.replayRanOut();
                return;
            }
            seed = s;
            recorded = this.replay.data.rounds[this.replayRound - 1];
        }
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
        // On a wide landscape screen a local match plays in wider meadows, so the view fills the screen; online
        // both players must share one width, so it stays the usual one there.
        // Endless shows one meadow: on a landscape screen it's the whole width (on a phone, the solo tall layout).
        if (recorded) {
            C.setFieldWidth(recorded.field.w, recorded.field.single);
            C.setFieldHeight(recorded.field.h);
        } else {
            if (this.mode === 'endless' && !this.r.portrait) C.setFieldWidth(this.r.viewWidthToFill, true);
            else C.setFieldWidth(this.online || this.mode === 'endless' ? C.FIELD_W_BASE : this.r.fieldWidthToFill);
            // With the rival's meadow hidden on an upright phone, the meadows grow to reach the top of the screen
            // (both, so the round stays fair), leaving a slim bar for the round and the rival's hearts.
            C.setFieldHeight(this.soloView ? (this.r.tallH - C.TALL_SOLO_BAR) / C.TALL_OWN_S : C.FIELD_H_BASE);
        }
        const sideA = (seed & 1) === 0;
        const crowHere = this.online ? (this.net!.isHost ? sideA : !sideA) : sideA;
        this.fields = [
            new Field(seed, this.picks[0], roundIndex, crowHere),
            new Field(seed, this.picks[1], roundIndex, !crowHere),
        ];
        // The second meadow's rival is to its left, so its countered fireballs arc off that way.
        this.fields[1].rivalSide = -1;
        const map = this.replay ? this.replay.data.map : (this.forcedMap?.id ?? (this.matchMap || mapForSeed(seed).id));
        for (const f of this.fields) f.mapId = map;
        this.recorder?.startRound(seed, { w: C.FIELD_W, h: C.FIELD_H, single: C.VIEW_W === C.FIELD_W });
        this.endlessRng = new Rng(seed ^ 0x5bd1e995);
        this.transits = [];
        // The CPU is sharper further along the trophy road.
        this.cpu = new CpuPilot(stageFor(map).cpuReaction);
        this.endlessT = 0;
        this.endlessBosses = 0;
        this.endlessNextBoss = C.ENDLESS_FIRST_BOSS;
        this.phase = 'countdown';
        this.phaseT = 0;
    }

    /** True once a match is under way (not on the title, the menus, the Characters or Profile screens, or select). */
    private get inGame(): boolean {
        return !['title', 'modes', 'roster', 'maps', 'profile', 'settings', 'replays', 'select', 'mapselect'].includes(
            this.phase,
        );
    }

    /** Leave the Settings screen (its page panel's Esc). */
    closeSettings(): void {
        if (this.phase === 'settings') this.backToMenu();
    }

    /** Back to the main menu, with the card for where you came from highlighted. */
    private backToMenu(): void {
        const from = { roster: 1, maps: 2, profile: 3, replays: 4, settings: 5 }[this.phase as string] ?? 0;
        this.phase = 'modes';
        this.menu = 'main';
        this.modeIndex = from;
        this.demoOpen = false;
        this.ui('tick');
    }

    /** The Characters screen: left/right (or a tap on a medallion) browses the fairies; Esc goes back. */
    private stepRoster(pr: Set<string>): void {
        const n = FAIRIES.length,
            was = this.rosterIndex;
        const tall = this.r.layout === 'tall';
        if (!tall) this.demoOpen = false;
        // The demo's pop-up (phones): any tap or Esc/Enter/Space closes it, and nothing else happens meanwhile.
        if (this.demoOpen) {
            if (this.input.tap || ['Escape', 'Enter', 'Space'].some(k => pr.has(k))) {
                this.demoOpen = false;
                this.ui('tick');
            }
            return;
        }
        const tap0 = this.input.tap;
        const canDemo = tall && this.isUnlocked(FAIRIES[this.rosterIndex]);
        if (
            canDemo &&
            (pr.has('Enter') || pr.has('Space') || (tap0 && inBox(tap0, rosterPreviewButton(this.r.viewH))))
        ) {
            this.demoOpen = true;
            this.preview.replay();
            this.ui('ok');
            return;
        }
        if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].some(k => pr.has(k)))
            this.rosterIndex = (this.rosterIndex + n - 1) % n;
        if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].some(k => pr.has(k)))
            this.rosterIndex = (this.rosterIndex + 1) % n;
        const tap = this.input.tap;
        if (tap) {
            const hit = rosterMedallions(this.r.layout, this.r.viewH).findIndex(
                m => Math.hypot(tap.x - m.x, tap.y - m.y) <= m.r + 6,
            );
            if (hit >= 0) this.rosterIndex = hit;
        }
        if (this.rosterIndex !== was) this.ui('tick');
        if (pr.has('Escape')) this.backToMenu();
    }

    /** The Maps screen: left/right (or a tap on a medallion) browses the maps; Esc goes back. */
    private stepMaps(pr: Set<string>): void {
        const n = MAPS.length,
            was = this.mapsIndex;
        if (['ArrowLeft', 'KeyA', 'ArrowUp', 'KeyW'].some(k => pr.has(k)))
            this.mapsIndex = (this.mapsIndex + n - 1) % n;
        if (['ArrowRight', 'KeyD', 'ArrowDown', 'KeyS'].some(k => pr.has(k))) this.mapsIndex = (this.mapsIndex + 1) % n;
        const tap = this.input.tap;
        if (tap) {
            const hit = mapsMedallions(this.r.layout, this.r.viewH, this.r.viewX).findIndex(
                m => Math.hypot(tap.x - m.x, tap.y - m.y) <= m.r + 6,
            );
            if (hit >= 0) this.mapsIndex = hit;
        }
        if (this.mapsIndex !== was) this.ui('tick');
        if (pr.has('Escape')) this.backToMenu();
    }

    /**
     * The mode menu: arrows move round the grid of cards, any fire button or Start picks one, number keys pick by
     * position, a tap on a card picks it, and Esc goes back to the title. Greyed-out cards do nothing yet.
     */
    private stepModes(pr: Set<string>): void {
        const cards = modeCards(this.menu, this.r.layout, this.r.viewH, this.r.viewX);
        const n = cards.length,
            cols = modeColumns(this.r.layout, this.menu);
        const was = this.modeIndex;
        if (['ArrowLeft', 'KeyA'].some(k => pr.has(k))) this.modeIndex = (this.modeIndex + n - 1) % n;
        if (['ArrowRight', 'KeyD'].some(k => pr.has(k))) this.modeIndex = (this.modeIndex + 1) % n;
        if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.modeIndex = (this.modeIndex + n - cols) % n;
        if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.modeIndex = (this.modeIndex + cols) % n;
        if (this.modeIndex !== was) this.ui('tick');
        if (pr.has('Escape')) {
            // Play's modes back to the main menu; the main menu back to the title.
            if (this.menu === 'play') this.backToMenu();
            else this.phase = 'title';
            this.ui('tick');
            return;
        }
        let pick = -1;
        const tap = this.input.tap;
        if (tap) pick = cards.findIndex(c => tap.x >= c.x && tap.x <= c.x + c.w && tap.y >= c.y && tap.y <= c.y + c.h);
        cards.forEach((_, i) => {
            if (pr.has(`Digit${i + 1}`)) pick = i;
        });
        if (pick < 0 && ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k))) pick = this.modeIndex;
        if (pick < 0) return;
        this.modeIndex = pick;
        const c = cards[pick];
        if (c.disabled) {
            this.ui('tick');
            return;
        }
        this.ui('ok');
        switch (c.action) {
            case 'play':
                this.menu = 'play';
                this.modeIndex = 1;
                break;
            case 'characters':
                this.phase = 'roster';
                break;
            case 'maps':
                this.phase = 'maps';
                break;
            case 'profile':
                this.phase = 'profile';
                void this.account.refreshLeaders();
                break;
            case 'online':
                this.onWantOnline?.();
                break;
            case 'settings':
                this.phase = 'settings';
                break;
            case 'replays':
                this.openReplays();
                break;
            case 'guide':
                this.onWantGuide?.();
                break;
            case 'cpu':
            case 'versus':
            case 'endless':
                this.start(c.action);
                break;
        }
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
            else {
                this.phase = 'modes';
                this.menu = 'play';
            }
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
            // Then the map: chosen on its own screen in a local match; online, the round seeds pick it.
            if (this.selectT - this.readyAt >= READY_HOLD) {
                if (!this.online) {
                    this.phase = 'mapselect';
                    // A card for a stage that's still locked can't stay chosen.
                    if (this.mapIndex > 0 && !this.mapOpen(this.mapIndex - 1)) this.mapIndex = 0;
                } else if (this.net!.isHost) this.beginMatch();
            }
        } else this.readyAt = -1;
    }

    /** The map select screen: arrows choose a card, Enter/Z/Space (or a tap) plays it, Esc goes back to the fairies. */
    private stepMapSelect(): void {
        const pr = this.input.pressed;
        /** True if any of `keys` was pressed this frame. */
        const any = (keys: string[]) => keys.some(k => pr.has(k));
        if (pr.has('Escape')) {
            this.ui('tick');
            this.start(this.mode);
            return;
        }
        const n = MAP_CARDS,
            was = this.mapIndex;
        const tall = this.r.layout === 'tall';
        if (any(['ArrowLeft', 'KeyA'])) this.mapIndex = (this.mapIndex + n - 1) % n;
        if (any(['ArrowRight', 'KeyD'])) this.mapIndex = (this.mapIndex + 1) % n;
        // Up and down jump a row: rows of four on a wide screen; on a phone the maps sit two by two under Random.
        if (tall && any(['ArrowDown', 'KeyS']))
            this.mapIndex = this.mapIndex === 0 ? 1 : Math.min(n - 1, this.mapIndex + MAP_COLS.tall);
        if (tall && any(['ArrowUp', 'KeyW']))
            this.mapIndex = this.mapIndex <= MAP_COLS.tall ? 0 : this.mapIndex - MAP_COLS.tall;
        if (!tall && any(['ArrowDown', 'KeyS'])) this.mapIndex = Math.min(n - 1, this.mapIndex + MAP_COLS.wide);
        if (!tall && any(['ArrowUp', 'KeyW'])) this.mapIndex = Math.max(0, this.mapIndex - MAP_COLS.wide);
        if (this.mapIndex !== was) this.ui('tick');
        const tap = this.input.tap;
        if (tap) {
            const hit = mapCards(this.r.layout, this.r.viewH).findIndex(
                c => tap.x >= c.x && tap.x <= c.x + c.w && tap.y >= c.y && tap.y <= c.y + c.h,
            );
            if (hit >= 0) {
                this.mapIndex = hit;
                this.playMap();
                return;
            }
        }
        if (any(['Enter', 'Space', 'KeyZ'])) this.playMap();
    }

    /** Play the chosen map card, unless its stage is still locked (then just a tick). */
    private playMap(): void {
        if (this.mapIndex > 0 && !this.mapOpen(this.mapIndex - 1)) {
            this.ui('tick');
            return;
        }
        this.ui('ok');
        this.beginMatch();
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
        const live = this.inGame;
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
                    const head = Math.min(this.net!.rtt / 2, transitTime(m.o) * 0.6);
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
        // Running a replay ahead reads no input at all.
        const pr = this.seeking ? NO_KEYS : this.input.pressed;
        this.drainSfx();
        if (pr.has('KeyM')) this.sound.toggleMute();
        if (this.mode === 'online') {
            this.pollNet(dt);
            if (!this.net) return;
        }
        // Watching a replay: Esc leaves it; the timeline, rounds and highlights seek; fire, Space or a tap
        // elsewhere steps the speed through 1×, 2× and 4×.
        if (this.replay && this.inGame && !this.seeking) {
            if (pr.has('Escape')) {
                this.exitReplay();
                return;
            }
            if (this.replayControls(pr)) return;
            const tap = ['Space', 'Enter', 'KeyZ', 'KeyF', 'Pointer'].some(k => pr.has(k));
            if (tap && (this.phase === 'playing' || this.phase === 'countdown')) {
                this.replaySpeed = this.replaySpeed >= 4 ? 1 : this.replaySpeed * 2;
                this.ui('tick');
            }
        }
        if ((pr.has('Escape') || pr.has('KeyP')) && this.phase === 'playing' && this.mode !== 'online')
            this.paused = !this.paused;

        if (this.phase === 'title') {
            // The opening screen: sign in (not ready yet) or play as a guest. Up/down moves the cursor, any fire
            // button or Start picks it, a tap on a bar picks that one and a tap anywhere else plays as a guest.
            const buttons = titleButtons(this.r.layout, this.r.viewH);
            const n = buttons.length;
            const was = this.titleIndex;
            if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.titleIndex = (this.titleIndex + n - 1) % n;
            if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.titleIndex = (this.titleIndex + 1) % n;
            if (this.titleIndex !== was) this.ui('tick');
            let pick = -1;
            const tap = this.input.tap;
            if (tap) {
                pick = buttons.findIndex(
                    b => tap.x >= b.x - 10 && tap.x <= b.x + b.w && tap.y >= b.y && tap.y <= b.y + b.h,
                );
                if (pick < 0) pick = buttons.findIndex(b => b.action === 'guest');
            }
            buttons.forEach((_, i) => {
                if (pr.has(`Digit${i + 1}`)) pick = i;
            });
            if (pick < 0 && ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k)))
                pick = this.titleIndex;
            if (pick >= 0) {
                this.titleIndex = pick;
                // Not ready yet (greyed out): the cursor goes there, but nothing happens.
                if (buttons[pick].disabled) {
                    this.ui('tick');
                    return;
                }
                this.ui('ok');
                this.phase = 'modes';
                this.menu = 'main';
                this.modeIndex = 0;
            }
            return;
        }
        if (this.phase === 'roster') {
            this.stepRoster(pr);
            const fy = FAIRIES[this.rosterIndex];
            this.preview.show(this.phase === 'roster' && this.isUnlocked(fy) ? fy : null);
            this.preview.update(dt);
            return;
        }
        if (this.phase === 'maps') {
            this.stepMaps(pr);
            this.mapPreview.show(MAPS[this.mapsIndex].id);
            this.mapPreview.update();
            return;
        }
        if (this.phase === 'profile') {
            if (pr.has('Escape') || pr.has('Enter') || pr.has('Space')) this.backToMenu();
            return;
        }
        if (this.phase === 'replays') {
            this.stepReplays(pr);
            return;
        }
        // Settings is the page's own panel under the heading bar; here only Esc (or ◀ Back) leaves it.
        if (this.phase === 'settings') {
            if (pr.has('Escape')) this.backToMenu();
            return;
        }
        if (this.phase === 'modes') {
            if (this.notice) {
                if (pr.size) this.notice = '';
                return;
            }
            this.stepModes(pr);
            return;
        }
        if (this.phase === 'select') {
            this.stepSelect(dt);
            return;
        }
        if (this.phase === 'mapselect') {
            this.stepMapSelect();
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
                    if (this.replay) this.exitReplay();
                    else this.start(this.mode);
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

        this.shareFairies();
        let c0: Controls, c1: Controls;
        if (this.replay) {
            // Watching: the recording flies both meadows. One that runs out before its round ends is cut short.
            [c0, c1] = this.replay.next();
            if (this.replay.roundSpent) {
                this.replayRanOut();
                return;
            }
        } else {
            // Touch targets are snapped to the recording's grid, so a replay gives the meadows exactly this.
            c0 = quantize(this.vsCpu ? this.input.solo(this.fields[0].player) : this.input.p1(this.fields[0].player));
            c1 = quantize(this.vsCpu ? this.cpu.think(this.fields[1], dt) : this.input.p2(this.fields[1].player));
            this.recorder?.step(c0, c1);
        }
        this.fields[0].update(dt, c0);
        this.fields[1].update(dt, c1);
        if (this.mode === 'endless') this.directEndless(dt);

        this.fields.forEach((f, i) => {
            for (const o of f.outbox) {
                // Fireballs wear their sender's colour: orange for player 1, purple for player 2.
                o.tint ??= i === 0 ? 'p1' : 'p2';
                this.transits.push({ o, from: i as 0 | 1, t: 0 });
            }
            f.outbox = [];
        });
        for (const tr of this.transits) {
            // A fireball flies on the tempo (and sudden death) between the meadows too, as it does in them.
            tr.t += tr.o.kind === 'star' ? dt * this.fields[tr.from].attackPace : dt;
            if (tr.t >= transitTime(tr.o))
                this.fields[1 - tr.from].receive(this.mode === 'endless' ? fromAbove(tr.o) : tr.o);
        }
        this.transits = this.transits.filter(tr => tr.t < transitTime(tr.o));

        const dead0 = !this.fields[0].alive,
            dead1 = !this.fields[1].alive;
        if (this.mode === 'endless') {
            if (dead0) this.endEndless();
        } else if (dead0 || dead1) this.endRound(dead0, dead1);
    }

    /**
     * Endless mode's director. The hidden meadow is flown by the CPU and can't be beaten (its hearts refill), so
     * its chains keep raining attacks on you; your own attacks go nowhere. On top of that it sends guardians on a
     * schedule that tightens as the run goes on, and the waves and tempo build as in any round.
     */
    private directEndless(dt: number): void {
        this.endlessT += dt;
        const ghost = this.fields[1];
        ghost.player.hull = C.MAX_HULL;
        // Nothing of yours reaches it: a run is about surviving, not knocking anyone out.
        this.fields[0].outbox = [];
        // A short grace at the start while you find your feet, then its attacks get through more and more often:
        // a share at first, all of them a few minutes in. Its guardians always come.
        const share =
            this.endlessT < C.ENDLESS_GRACE
                ? 0
                : Math.min(1, C.ENDLESS_SHARE_START + (this.endlessT - C.ENDLESS_GRACE) / C.ENDLESS_SHARE_RAMP);
        ghost.outbox = ghost.outbox.filter(o => o.kind === 'moth' || this.endlessRng.next() < share);
        if (this.endlessT >= this.endlessNextBoss) {
            ghost.summonGuardian();
            this.endlessBosses++;
            this.endlessNextBoss += Math.max(C.ENDLESS_BOSS_MIN, C.ENDLESS_BOSS_EVERY - this.endlessBosses * 3);
        }
    }

    /** Your fairy went down in Endless: the run is over. Save a new best, then show the result. */
    private endEndless(): void {
        for (const f of this.fields) f.settled = true;
        if (this.replay) {
            this.phase = 'matchOver';
            this.phaseT = 0;
            this.transits = [];
            return;
        }
        this.keepReplay();
        const p = this.progress;
        this.endlessNew = this.endlessT > p.endlessBest;
        p.endlessBest = Math.max(p.endlessBest, this.endlessT);
        p.endlessBosses = Math.max(p.endlessBosses, this.endlessBosses);
        p.bestChain = Math.max(p.bestChain, this.fields[0].bestChain);
        p.fevers += this.fields[0].fevers;
        saveProgress(p);
        this.account.saveProgress(p);
        const run = this.endlessT;
        void this.account
            .reportEndless({
                seconds: Math.round(run * 100) / 100,
                guardians: this.endlessBosses,
                fairy: this.picks[0].id,
                map: this.roundMap,
                bestChain: this.fields[0].bestChain,
            })
            .then(rank => {
                // Only if this run's result is still on screen.
                if (this.mode === 'endless' && this.endlessT === run) this.endlessRank = rank;
            });
        this.ui(this.endlessNew ? 'win' : 'lose');
        this.phase = 'matchOver';
        this.phaseT = 0;
        this.transits = [];
    }

    /** One playing step online: only our meadow is simulated here. */
    /**
     * Debug overlay (`?debug=paths`): every fireball's path from where it is to where it leaves, drawn across
     * the screen, so its route can be checked against the play area.
     */
    private drawFireballPaths(at: readonly [Placement, Placement]): void {
        const view = (i: number, x: number, y: number) => ({ x: at[i].x + x * at[i].s, y: at[i].y + y * at[i].s });
        this.fields.forEach((f, i) => {
            for (const a of f.attacks) {
                if (a.kind !== 'star' || a.dead) continue;
                const pts: { x: number; y: number }[] = [];
                if (a.curve) {
                    for (let k = a.k ?? 0; k <= 1.0001; k += 0.04) {
                        const p = curveAt(a.curve, Math.min(1, k));
                        pts.push(view(i, p.x, p.y));
                    }
                } else {
                    // A falling fireball: straight down to the bottom of the meadow.
                    pts.push(view(i, a.x, a.y), view(i, a.x, C.FIELD_H + 10));
                }
                this.r.debugPath(pts, a.level >= 2 ? '#ffffff' : '#ffb347');
            }
        });
        for (const tr of this.transits) {
            const c = tr.o.curve;
            if (tr.o.kind !== 'star' || !c) continue;
            const pts: { x: number; y: number }[] = [];
            for (let k = tr.o.k ?? 0; k <= 1.0001; k += 0.04) {
                const p = curveAt(c, Math.min(1, k));
                pts.push(view(tr.from, p.x, p.y));
            }
            this.r.debugPath(pts, '#ffffff');
        }
    }

    /** Tell each meadow where the rival's fairy is, so a Reverse can lock on to her when it's broken. */
    private shareFairies(): void {
        const [a, b] = this.fields;
        a.rivalFairy = { x: b.player.x, y: b.player.y };
        b.rivalFairy = { x: a.player.x, y: a.player.y };
    }

    private stepOnline(dt: number): void {
        const me = this.fields[0];
        // A moonseed break freezes only the meadow it broke in; the rival's keeps going on their screen.
        if (me.hitstop > 0) {
            me.hitstop = Math.max(0, me.hitstop - dt);
            return;
        }
        this.shareFairies();
        me.update(dt, this.input.solo(me.player));
        for (const o of me.outbox) {
            // Player 1 is the host, on both screens.
            o.tint ??= this.net!.isHost ? 'p1' : 'p2';
            this.transits.push({ o, from: 0, t: 0, ghost: true });
            this.net!.peer({ k: 'atk', r: this.roundNo, o });
        }
        me.outbox = [];
        for (const tr of this.transits) {
            // Both meadows share the tempo and sudden death, so mine stands in for my rival's.
            tr.t += tr.o.kind === 'star' ? dt * me.attackPace : dt;
            if (tr.t >= transitTime(tr.o) && !tr.ghost) me.receive(tr.o);
        }
        this.transits = this.transits.filter(tr => tr.t < transitTime(tr.o));
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

        // Only human players earn progress (and a replay being watched earns nothing).
        const humans = this.replay ? [] : this.mode === 'versus' ? this.fields : [this.fields[0]];
        for (const f of humans) {
            this.matchBestChain = Math.max(this.matchBestChain, f.bestChain);
            this.progress.fevers += f.fevers;
        }
        const over = this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN;
        if (over && !this.replay) {
            this.keepReplay();
            this.recordMatch();
        }
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
        // Trophies on the road: VS CPU and Online only (two players on one screen just play).
        if (this.mode === 'cpu' || this.mode === 'online') {
            const won = this.wins[0] > this.wins[1];
            const before = p.trophies;
            p.trophies = Math.max(0, p.trophies + (won ? C.TROPHY_WIN : -C.TROPHY_LOSS));
            this.trophyDelta = p.trophies - before;
            const was = p.bestTrophies;
            p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
            for (const m of MAPS) if (stageFor(m.id).trophies > was && stageOpen(p, m.id)) this.newStages.push(m.name);
        }
        for (const f of FAIRIES) {
            if (f.unlock && !p.unlocked.includes(f.id) && f.unlock.met(p)) {
                p.unlocked.push(f.id);
                this.newlyUnlocked.push(f);
            }
        }
        saveProgress(p);
        this.account.saveProgress(p);
        if (this.mode === 'cpu' || this.mode === 'online' || this.mode === 'versus')
            this.account.reportMatch({
                mode: this.mode,
                map: this.roundMap,
                fairy: this.picks[0].id,
                rivalFairy: this.picks[1].id,
                roundsWon: this.wins[0],
                roundsLost: this.wins[1],
                bestChain: this.matchBestChain,
                trophyDelta: this.trophyDelta,
                seconds: Math.round((performance.now() - this.matchStart) / 100) / 10,
            });
    }

    /** Draw the current screen. */
    draw(): void {
        const r = this.r;
        // Prompts follow whatever the player last used: a touchscreen or keys/pad.
        const touch = this.input.touchActive;
        // A portrait screen gets the tall layout: the menus are redrawn for it, and so is a
        // round with one player on the device. Two players sharing it keep the meadows side by side.
        const inRound = this.inGame;
        // The menus are laid out for the usual meadow width; only a round plays in wider ones.
        if (!inRound && C.FIELD_W !== C.FIELD_W_BASE) C.setFieldWidth(C.FIELD_W_BASE);
        if (!inRound && C.FIELD_H !== C.FIELD_H_BASE) C.setFieldHeight(C.FIELD_H_BASE);
        r.inMenu = !inRound;
        // A round in wider meadows stays side by side even if the screen turns upright mid-round.
        // A round in taller meadows (rival hidden) stays tall even if the screen turns sideways.
        const soloTall = inRound && C.FIELD_H !== C.FIELD_H_BASE;
        r.layout =
            soloTall || (r.portrait && !(inRound && this.mode === 'versus') && C.FIELD_W === C.FIELD_W_BASE)
                ? 'tall'
                : 'wide';
        const tall = r.layout === 'tall' ? tallPlacement(r.viewH) : null;
        // Endless side by side: one meadow in the middle, between its panels.
        const endless = inRound && this.mode === 'endless';
        // With the rival's meadow hidden it's placed far off screen, so nothing of it (or flying to it) shows.
        const offscreen: Placement = { x: 0, y: -10000, s: tall ? tall.at[0].s : 1 };
        const at: readonly [Placement, Placement] = !tall
            ? endless
                ? [{ x: 0, y: 0, s: 1 }, offscreen]
                : wide()
            : soloTall
              ? [tall.at[0], offscreen]
              : tall.at;
        if (tall) r.tallBand = tall.band;
        r.begin();
        const solo = this.mode !== 'versus';
        const tags: [HudTag, HudTag] = [
            { label: solo ? 'YOU' : '1P', color: PLAYER_COLORS.p1 },
            this.vsCpu
                ? { label: 'CPU', color: PLAYER_COLORS.cpu }
                : { label: this.mode === 'online' ? 'RIVAL' : '2P', color: PLAYER_COLORS.p2 },
        ];
        r.field(this.fields[0], at[0].x, this.wins[0], this.time, tags[0], at[0].y, at[0].s);
        if (!soloTall && !endless) r.field(this.fields[1], at[1].x, this.wins[1], this.time, tags[1], at[1].y, at[1].s);
        // Between rounds the console still shows the round just played.
        const played = this.wins[0] + this.wins[1];
        const between = this.phase === 'roundOver' || this.phase === 'matchOver';
        const consoleView = {
            round: Math.max(1, between ? played : played + 1),
            tempo: this.fields[0].tempo,
            ping: this.online ? Math.round(this.net!.rtt * 1000) : undefined,
        };
        if (endless)
            r.endless(
                {
                    time: this.endlessT,
                    // A replay shows the run's own length as the mark to reach.
                    best: this.replay ? this.replay.data.seconds : this.progress.endlessBest,
                    bosses: this.endlessBosses,
                    nextBoss: Math.max(0, this.endlessNextBoss - this.endlessT),
                    tempo: this.fields[0].tempo,
                },
                this.time,
            );
        else if (soloTall) r.soloBar(consoleView, this.fields[1], tags[1], this.time);
        else r.console(consoleView, this.time);

        for (const tr of this.transits) {
            if (tr.o.kind === 'clash' || tr.o.kind === 'heal') continue;
            // A fireball still waiting its turn in a volley isn't on its way yet.
            const wait = tr.o.stagger ?? 0;
            if (tr.t < wait) continue;
            const k = (tr.t - wait) / flightTime(tr.o);
            const from = at[tr.from],
                to = at[1 - tr.from];
            if (tr.o.kind === 'star' && tr.o.curve && r.layout === 'wide') {
                // A Reverse crossing between the meadows stays on its curve (in the sender's units).
                const c = tr.o.curve;
                const kIn = enterAt(shiftCurve(c, tr.o.side ?? 1), tr.o.k ?? 0);
                const p = curveAt(c, (tr.o.k ?? 0) + (kIn - (tr.o.k ?? 0)) * k);
                const d = curveDir(c, (tr.o.k ?? 0) + (kIn - (tr.o.k ?? 0)) * k);
                r.transitFireball(from.x + p.x * from.s, from.y + p.y * from.s, from.s, this.time, d.x, d.y, tr.o);
                continue;
            }
            if (tr.o.kind === 'star' && !tr.o.curve) {
                // Along its route (a slide across the top, or a climb and a bounce) to the rival's near wall; the
                // rival's meadow takes it from there.
                const v = riseSpeed(tr.o);
                const p = pathAt(tr.o.route ?? [{ x: tr.o.fromX, y: tr.o.fromY }], (tr.t - wait) * v);
                // Side by side it crosses the gap in view; in the tall layout it stays inside the sender's meadow.
                const clip =
                    r.layout === 'wide'
                        ? undefined
                        : { x: from.x, y: from.y, w: C.FIELD_W * from.s, h: C.FIELD_H * from.s };
                r.transitFireball(
                    from.x + p.x * from.s,
                    from.y + p.y * from.s,
                    from.s,
                    this.time,
                    p.dx * v,
                    p.dy * v,
                    tr.o,
                    clip,
                );
                continue;
            }
            const sx = from.x + tr.o.fromX * from.s,
                sy = from.y + tr.o.fromY * from.s;
            // Anything else flies a low arc between the meadows, landing where it was sent from.
            const ex = to.x + Math.min(C.FIELD_W - 12, Math.max(12, tr.o.fromX)) * to.s,
                ey = to.y - 10 * to.s;
            // Kept on screen so it can be followed.
            const x = sx + (ex - sx) * k,
                y = Math.max(10 * to.s, sy + (ey - sy) * k - Math.sin(k * Math.PI) * 40);
            if (tr.o.kind === 'star') {
                // A Reverse in the tall layout, where its curve isn't drawn between the meadows.
                const s = from.s + (to.s - from.s) * k;
                const dur = flightTime(tr.o);
                r.transitFireball(x, y, s, this.time, (ex - sx) / dur, (ey - sy) / dur, tr.o);
                continue;
            }
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

        if (this.debugPaths && r.layout === 'wide') this.drawFireballPaths(at);

        const names = this.vsCpu
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
                break;
            case 'roster':
                r.roster(
                    {
                        index: this.rosterIndex,
                        locked: FAIRIES.map(f => !this.isUnlocked(f)),
                        touch,
                        caption: this.preview.caption,
                        demoOpen: this.demoOpen,
                    },
                    this.time,
                    this.preview.field,
                );
                break;
            case 'settings':
                r.settings(this.time);
                break;
            case 'maps':
                r.maps(
                    {
                        index: this.mapsIndex,
                        locked: MAPS.map((_, i) => !this.mapOpen(i)),
                        trophies: this.progress.trophies,
                        touch,
                        caption: this.mapPreview.caption,
                    },
                    this.time,
                    this.mapPreview.field,
                );
                break;
            case 'mapselect':
                r.mapSelect(
                    {
                        index: this.mapIndex,
                        touch,
                        trophies: this.progress.trophies,
                        locked: MAPS.map((_, i) => !this.mapOpen(i)),
                    },
                    this.time,
                );
                break;
            case 'replays': {
                const row = this.replayList[this.replaysIndex];
                r.replays(
                    {
                        touch,
                        rows: this.replayList.map(x => this.replayRow(x)),
                        index: this.replaysIndex,
                        start: this.replaysStart,
                        message: this.replaysMessage,
                        link: row ? this.replayLink(row.code) : '',
                        note: this.replaysNote,
                    },
                    this.time,
                );
                break;
            }
            case 'profile':
                r.profile(
                    {
                        touch,
                        wins: this.progress.wins,
                        bestChain: this.progress.bestChain,
                        fevers: this.progress.fevers,
                        flawless: this.progress.flawless,
                        locked: FAIRIES.map(f => !this.isUnlocked(f)),
                        trophies: this.progress.trophies,
                        bestTrophies: this.progress.bestTrophies,
                        endlessBest: this.progress.endlessBest,
                        name: this.account.name,
                        synced: this.account.online,
                        rank: this.account.rank,
                        leaders: this.account.leaders,
                        me: this.account.id,
                    },
                    this.time,
                );
                break;
            case 'modes':
                r.modes({ menu: this.menu, index: this.modeIndex, touch }, this.time);
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
                    this.vsCpu
                        ? {
                              fairy: FAIRIES[0],
                              locked: false,
                              done: true,
                              tag: this.mode === 'endless' ? 'WAVES' : 'CPU',
                              color: CPU,
                              cpu: true,
                          }
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
                if (!this.vsCpu)
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
                const soloRun =
                    this.mode === 'endless'
                        ? {
                              title: 'ENDLESS',
                              line:
                                  this.progress.endlessBest > 0
                                      ? `BEST ${clock(this.progress.endlessBest)}`
                                      : 'SURVIVE ALONE',
                          }
                        : undefined;
                r.select({ cards, sides, cursors, heading, timer, hints, solo: soloRun }, this.time);
                break;
            }
            case 'countdown': {
                if (this.mode === 'endless') {
                    if (this.phaseT < 1)
                        r.banner({
                            title: 'Endless',
                            sub:
                                this.progress.endlessBest > 0
                                    ? `Best ${clock(this.progress.endlessBest)}`
                                    : 'Survive as long as you can',
                            age: this.phaseT,
                            dim: 0.35,
                            tone: 'gold',
                        });
                    else r.banner({ title: 'Fly!', age: this.phaseT - 1, dim: 0.15, size: 40, tone: 'pink' });
                    break;
                }
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
                if (this.replay) {
                    const g = this.endlessBosses;
                    const d = this.replay.data;
                    const w = this.wins[0] > this.wins[1] ? 0 : 1;
                    const result =
                        this.mode === 'endless'
                            ? `Survived ${clock(this.endlessT)}  ·  ${g} guardian${g === 1 ? '' : 's'}`
                            : `${names[w]} won ${Math.max(...this.wins)}-${Math.min(...this.wins)}`;
                    r.banner({
                        title: this.replayCut ? 'Replay ends here' : 'Replay over',
                        sub: touch ? 'Tap to go back' : 'Press Space or tap to go back',
                        extra: this.replayCut
                            ? this.replay.sameSim
                                ? 'The recording stops before the match ended'
                                : 'Recorded on another version of the game'
                            : `${result}  ·  ${new Date(d.at).toLocaleDateString()}`,
                        age: this.phaseT,
                        dim: 0.6,
                        size: 30,
                        tone: 'blue',
                        blinkSub: true,
                    });
                    break;
                }
                if (this.mode === 'endless') {
                    const g = this.endlessBosses;
                    // Where the player's best stands among everyone's, once the server has answered.
                    const rk = this.endlessRank;
                    const rank = rk ? `  ·  Rank ${rk.rank} of ${rk.players}` : '';
                    r.banner({
                        title: this.endlessNew ? 'New record!' : 'Run over',
                        sub: touch ? 'Tap to fly again' : 'Press Space or tap to fly again',
                        extra: `Survived ${clock(this.endlessT)}  ·  ${g} guardian${g === 1 ? '' : 's'}  ·  Best ${clock(this.progress.endlessBest)}${rank}`,
                        age: this.phaseT,
                        dim: 0.6,
                        size: 34,
                        tone: this.endlessNew ? 'gold' : 'pink',
                        blinkSub: true,
                    });
                    break;
                }
                const w = this.wins[0] > this.wins[1] ? 0 : 1;
                const title = solo ? (w === 0 ? 'You win!' : `${names[1]} wins`) : `${names[w]} wins!`;
                // Under the result: trophies won or lost, and anything the match opened up.
                const notes: string[] = [];
                if (this.mode === 'cpu' || this.mode === 'online')
                    notes.push(`${this.trophyDelta >= 0 ? '+' : ''}${this.trophyDelta} trophies`);
                if (this.newStages.length) notes.push(`New stage: ${this.newStages.join(', ')}`);
                if (this.newlyUnlocked.length)
                    notes.push(`New fairy: ${this.newlyUnlocked.map(f => f.name).join(', ')}`);
                if (this.lastReplayCode) notes.push('Replay saved');
                const unlocked = notes.length ? notes.join('  ·  ') : undefined;
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
        if (this.replay) {
            const rp = this.replay,
                len = rp.length || 1;
            const near = this.scrub !== null ? this.highlightNear(this.scrub) : null;
            r.replayPanel(
                {
                    speed: this.replaySpeed,
                    paused: this.paused,
                    pos: rp.played * C.STEP,
                    len: rp.length * C.STEP,
                    rounds: [0, ...rp.roundStarts.map(s => s / len)],
                    round: Math.max(0, this.replayRound - 1),
                    highlights: this.highlights.map(h => ({ x: h.at / len, kind: h.kind, side: h.side })),
                    scrub: this.scrub,
                    label: near ? this.highlightLabel(near) : '',
                    hint: touch
                        ? 'DRAG TO SEEK  ·  TAP FOR SPEED'
                        : 'SPACE SPEED · ←→ 5S · [ ] HIGHLIGHTS · 1-9 ROUND · H HIDE · P PAUSE · ESC LEAVE',
                    mini: this.replayMini,
                },
                this.time,
            );
        }
    }
}
