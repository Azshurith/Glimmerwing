import type { Sound } from '@/audio/sound';
import * as C from '@/core/config';
import { FAIRIES, fairyById } from '@/data/characters';
import type { Input } from '@/input/input';
import { sanitizeKeys } from '@/input/keys';
import type { Net } from '@/net/net';
import type { Renderer } from '@/render/renderer';
import { medallionAt, SELECT_COLS } from '@/render/screens/select-screen';
import {
    inTile,
    LOBBY_NAV,
    LOBBY_QUICK,
    lobbyLayout,
    roadAt,
    roadGeometry,
    roadThumb,
} from '@/render/screens/lobby-screen';
import { tallMenuFit } from '@/render/screens/menu-fit';
import { modeAvailable } from '@/data/availability';
import { rosterMedallions, rosterPreviewButton } from '@/render/screens/roster-screen';
import { mapsMedallions } from '@/render/screens/maps-screen';
import { MAP_CARDS, MAP_COLS, mapCards } from '@/render/screens/map-screen';
import { MAPS, mapById, mapForSeed } from '@/data/maps';
import { fairyAvailable, loadCatalog, mapAvailable, setCatalog } from '@/data/availability';
import { useServerArt } from '@/data/server-art';
import { ANNOUNCER, VOICES } from '@/data/voices';
import { STAGES, stageOpen } from '@/data/stages';
import { titleButtons } from '@/render/screens/title-screen';
import { clock, replayPanelLayout } from '@/render/hud';
import { PALETTE, PLAYER_COLORS } from '@/render/theme';
import type {
    Controls,
    EndlessRank,
    Fairy,
    VoiceEvent,
    HudTag,
    Mode,
    RoundMode,
    Transit,
    MatchOutcome,
    NetEvent,
    Phase,
    ReplayData,
    ReplayHighlight,
    ReplayRound,
    HistoryEntry,
    HistoryRow,
    MatchInfoView,
    MatchStats,
    MatchTab,
    ProfileTab,
    Placement,
    Progress,
    Settings,
    LobbyFocus,
    LobbyMode,
    SelectCard,
    SelectSide,
    Sfx,
    SyncedSettings,
} from '@/types';
import type { Field } from './field';
import { RoundSim, flightTime, riseSpeed } from './match';
import { curveAt, pathAt, curveDir, enterAt, shiftCurve } from './fireball-path';
import { SkillPreview } from './preview';
import { MapPreview } from './map-preview';
import { loadProgress, resetProgress, saveProgress } from './progress';
import { loadSettings, saveSettings } from './settings';
import { Account } from './account';
import { applyOutcome } from './rewards';
import {
    Recorder,
    ReplayPlayer,
    loadLocalReplay,
    packControls,
    quantize,
    saveLocalReplay,
    unpackControls,
} from './replay';
import { HISTORY_ROWS, profileBoxes } from '@/render/screens/profile-screen';
import { GRAPHS, MATCH_TABS, matchBoxes } from '@/render/screens/match-screen';
import { fromSide, matchStats } from './match-stats';

/** The modes on the lobby's picker, in order. */
const LOBBY_MODES: Omit<LobbyMode, 'off' | 'ribbon'>[] = [
    { action: 'story', label: 'STORY MODE', sub: 'Coming soon', color: '#ff9ac8' },
    { action: 'cpu', label: 'VS CPU', sub: 'Battle the computer', color: '#ffd45c' },
    { action: 'endless', label: 'ENDLESS', sub: 'Survive alone as long as you can', color: '#ff8a5c' },
    { action: 'online', label: 'ONLINE PLAY', sub: 'Find a rival or invite a friend', color: '#8fd8ff' },
    { action: 'versus', label: '2 PLAYERS', sub: 'Share a keyboard, pads or a tablet', color: '#8ff0a0' },
];

/** The phases before a match is under way: the title, the menu screens and select. */
const MENU_PHASES: Phase[] = [
    'title',
    'modes',
    'roster',
    'maps',
    'profile',
    'settings',
    'matchinfo',
    'select',
    'mapselect',
];

/** One player's cursor on the select screen, and whether they have locked in their pick. */
interface Picker {
    index: number;
    done: boolean;
}

/**
 * Where the two meadows sit side by side in the wide layout: scaled together with the console between them so they
 * fill the view's height (a replay's meadow can be taller than the view), centred across it.
 */
const wide = (): readonly [Placement, Placement] => {
    const s = C.VIEW_H / C.FIELD_H,
        x = (C.VIEW_W * (1 - s)) / 2;
    return [
        { x, y: 0, s },
        { x: x + (C.FIELD_W + C.GAP) * s, y: 0, s },
    ];
};

/**
 * Where Endless's lone meadow sits on a landscape screen: in the middle, filling the height (its stats are at its
 * sides, so it needs no bar over it).
 */
const endlessWide = (): Placement => {
    const s = C.VIEW_H / C.FIELD_H;
    return { x: (C.VIEW_W - C.FIELD_W * s) / 2, y: 0, s };
};

/** How far up the replay's controls reach from the bottom of the tall view (Hud.replayPanel). */
const REPLAY_PANEL_ROOM = 64;
/** Room kept at the top of the tall view for the replay's Back button, above the band. */
const BACK_ROOM = 30;
/** How long the hint to turn the phone sideways shows when an upright screen opens a wider recording (seconds). */
const ROTATE_HINT_TIME = 8;

/**
 * Where they sit in the tall layout: yours full width against the bottom edge, the rival's small at the top.
 * The band left above your meadow holds the rival's meadow and the console, designed TALL_TOP high: on a
 * shorter screen the band shrinks to fit, on a longer one it stays centred in the spare height.
 */
function tallPlacement(
    h: number,
    fit = false,
    solo = false,
    followX = 0,
): {
    at: readonly [Placement, Placement];
    band: Placement;
    rise: number;
    sink: number;
    console: Placement | null;
} {
    // An older replay played side by side in wider meadows (on a landscape screen, before every VS round used the
    // standard meadow) shows just as it was played: both meadows side by side with the console between, scaled to
    // the screen's width and centred between the Back button and the replay's controls, each meadow's scenery
    // filling the room above and below it.
    if (fit && !solo && C.FIELD_W > C.FIELD_W_STD) {
        const s = C.TALL_W / C.VIEW_W,
            top = BACK_ROOM,
            room = h - REPLAY_PANEL_ROOM - top,
            y = top + Math.max(0, (room - C.FIELD_H * s) / 2);
        return {
            at: [
                { x: 0, y, s },
                { x: (C.FIELD_W + C.GAP) * s, y, s },
            ],
            band: { x: 0, y: 0, s: 1 },
            rise: y,
            sink: Math.max(0, h - y - C.FIELD_H * s),
            console: { x: 0, y, s },
        };
    }
    // Your meadow fills the screen's width at a live round's scale (a standard meadow a touch smaller, so it fits),
    // against the bottom edge; it shrinks further only to keep the band at least TALL_TOP_MIN high (a taller one, or
    // a short screen). A lone meadow (Endless) fills the whole height under its bar.
    const s = solo
        ? fit
            ? (h - C.TALL_SOLO_BAR) / C.FIELD_H
            : Math.min(C.TALL_OWN_S, C.TALL_W / C.FIELD_W)
        : Math.min(C.TALL_OWN_S, (h - C.TALL_TOP_MIN) / C.FIELD_H, C.TALL_W / C.FIELD_W);
    const over = C.FIELD_W * s - C.TALL_W;
    // A replay's meadow wider than the screen (an Endless one shown full height) follows its fairy across
    // (`followX`, her x in the meadow); a narrower one is centred.
    const ownX = over <= 0 ? -over / 2 : Math.max(-over, Math.min(0, C.TALL_W / 2 - followX * s));
    const ownY = h - C.FIELD_H * s;
    const k = Math.min(1, ownY / C.TALL_TOP);
    const band = { x: (C.TALL_W * (1 - k)) / 2, y: Math.max(0, (ownY - C.TALL_TOP * k) / 2), s: k };
    const R = C.TALL_RIVAL;
    // The rival's meadow keeps to its usual size in the band, however wide or tall its meadow is.
    const rs = R.s * k * Math.min(C.FIELD_W_BASE / C.FIELD_W, C.FIELD_H_BASE / C.FIELD_H);
    return {
        at: [
            { x: ownX, y: ownY, s },
            { x: band.x + R.x * k, y: band.y + R.y * k, s: rs },
        ],
        band,
        rise: 0,
        sink: 0,
        console: null,
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
/** The least time between two of a fairy's hit lines (ms), so a flurry of hits isn't a flurry of yelps. */
const HIT_LINE_GAP = 2500;
/** A volley shot back: this many fireballs reversed within REVERSE_WINDOW (ms) says a line, at most every REVERSE_LINE_GAP. */
const REVERSE_VOLLEY = 2;
const REVERSE_WINDOW = 700;
const REVERSE_LINE_GAP = 6000;
/** How long after a round ends its winner speaks (s), once the loser's last words have begun. */
const WIN_LINE_DELAY = 1.1;
/** How long the Fight! banner stays as play starts (s). */
const FIGHT_BANNER_TIME = 1;

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
    /** The highlighted choice on the title screen. */
    private titleIndex = 1;
    /**
     * The lobby: the mode on its picker (an index into LOBBY_MODES, VS CPU to begin with), where the keyboard
     * cursor is, the screen chosen in the menu, and whether the friends panel is out.
     */
    private lobbyMode = 1;
    private lobbyFocus: LobbyFocus = 'mode';
    private lobbyNav = 0;
    private friendsOpen = false;
    /** Which of the open stages the lobby's island shows (null: the furthest). */
    private lobbyStage: number | null = null;
    /** Whether the mode picker is open over the lobby (the PLAY button opens it). */
    private picking = false;
    /**
     * Whether the trophy road is open over the lobby (a tap on the island opens it), how far up it's scrolled
     * (design units), how fast it's still gliding after a drag, and where a dragging pointer last was (view units).
     */
    private roadOpen = false;
    private roadScroll = 0;
    private roadVel = 0;
    private roadDrag: number | null = null;
    /** Whether the held pointer took hold of the trophy road's scroll bar (it then sets the scroll, not drags). */
    private roadBarHeld = false;
    /** Whether the chat panel (the page's #chat) is open, and World chat's latest lines for the lobby's ticker. */
    chatOpen = false;
    chatLines: { name: string; body: string }[] = [];
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
    /** The round being played (or the last one): both meadows, the attacks between them, the CPU, Endless. */
    private round = new RoundSim('cpu', 1, [FAIRIES[0], FAIRIES[1]], 0, MAPS[0].id, true);
    /** The round's meadows and the attacks flying between them. */
    private get fields(): [Field, Field] {
        return this.round.fields;
    }
    private get transits(): Transit[] {
        return this.round.transits;
    }
    private set transits(t: Transit[]) {
        this.round.transits = t;
    }
    /** Endless: how long the run has lasted, the guardians sent and when the next comes. */
    private get endlessT(): number {
        return this.round.endlessT;
    }
    private get endlessBosses(): number {
        return this.round.endlessBosses;
    }
    private get endlessNextBoss(): number {
        return this.round.endlessNextBoss;
    }
    private endlessNew = false;
    /** Where the run just ended ranks among every player's best (null until the server answers, or offline). */
    private endlessRank: EndlessRank | null = null;
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
    /**
     * Profile's tab, and its match history: the games (a replay is a server code, or 'local' for this browser's own
     * copy not yet on the server), the cursor, a line in the list's place, and a short note on the details screen.
     */
    private profileTab: ProfileTab = 'record';
    private history: HistoryEntry[] = [];
    private historyIndex = 0;
    /**
     * The history's first row in view once the wheel or the scroll bar has moved it (null: follow the cursor), the
     * wheel turned toward the next row, and whether the scroll bar is being dragged.
     */
    private historyTop: number | null = null;
    private historyWheel = 0;
    private historyDrag = false;
    private historyMessage = '';
    private historyNote = '';
    private historyNoteT = 0;
    /** The match details screen's tab and graph, and each game's numbers from its replay (by replay code). */
    private matchTab: MatchTab = 'overview';
    private matchGraph = 0;
    private statsFor = new Map<string, MatchStats | 'loading' | 'failed'>();
    /** Replays fetched for the details screen (by code), so watching one doesn't fetch it again. */
    private replayCache = new Map<string, ReplayData>();
    /** Where leaving a replay goes: the game's details, or (a shared link's replay) the history. */
    private replayFrom: 'matchinfo' | 'profile' = 'matchinfo';
    /** A map forced by the page's address (`?map=<id>`), for trying a map out. */
    private forcedMap =
        typeof location === 'undefined' ? null : mapById(new URLSearchParams(location.search).get('map'));
    private wins: [number, number] = [0, 0];
    private roundWinner: 0 | 1 | -1 = -1;
    private paused = false;
    private progress: Progress = loadProgress();
    /** The player's settings (the page's Settings panel changes them through setSettings). */
    settings: Settings = loadSettings();
    private matchBestChain = 0;
    /** Fevers the human player(s) have had this match. */
    private matchFevers = 0;
    private newlyUnlocked: Fairy[] = [];
    /** Voices: whether each side has said her going-down line this round, when she last said a hit line, and the
     * line each fairy said last for each moment (so the same one doesn't come twice running). */
    private voiceDown: [boolean, boolean] = [false, false];
    private hitLineAt: [number, number] = [0, 0];
    /** When each side last reversed fireballs (recent ones, for spotting a volley) and last said a reverse line. */
    private reversedAt: [number[], number[]] = [[], []];
    private reverseLineAt: [number, number] = [0, 0];
    /** Which take of Ready and Fight goes with this round's call, when its Ready comes, and whether it has. */
    private announceTake = 0;
    private callReadyAt = 1;
    private readyCalled = false;
    /** Whether the winner has had her say at this round's end. */
    private winVoiced = false;
    private lastLine = new Map<string, string>();
    /** Stages the last match's trophies opened, and how many trophies it won or lost. */
    private newStages: string[] = [];
    private trophyDelta = 0;
    time = 0;

    // ---- online ----
    // The server runs online matches: this browser sends its player's controls, and plays each round from the
    // steps the server sends (both players' controls as it used them), so it's the server's round, step for step.
    // The meadows keep the server's order: seat 0 (who made the room or queued first) is field 0, on the left.
    private net: Net | null = null;
    /** This player's seat online (0 offline): which meadow is theirs. */
    private me: 0 | 1 = 0;
    /** The round the server is on, its steps waiting to be played here, and how many have been played. */
    private roundNo = 0;
    private frames: (number[][] | null)[] = [];
    private roundSteps = 0;
    /** The server's word that the round ended (after how many steps, who won, the wins so far). */
    private roundEnd: { steps: number; winner: number; wins: [number, number] } | null = null;
    /** The controls last sent to the server, and steps since, so they're sent when they change (or now and then). */
    private sentControls = '';
    private sentAgo = 0;
    /** The rival has left; shown once the result is. */
    private rivalLeft = false;
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
            // Endless's hidden meadow makes no sound at all; the CPU's and an online rival's are quieter.
            const vol = this.online
                ? i === this.me
                    ? 1
                    : 0.45
                : i === 1
                  ? this.mode === 'endless'
                      ? 0
                      : this.mode === 'cpu'
                        ? 0.45
                        : 1
                  : 1;
            if (vol > 0) {
                for (const e of f.sfx) this.sound.play(e.k, e.p, pan, vol);
                this.voicesFor(f, i as 0 | 1, pan, vol);
            }
            f.sfx = [];
        });
        this.roundEndVoice();
    }

    /**
     * A round has been won: a moment after (so the knocked-out fairy's last words come first), its winner says a
     * line, from her side and at her meadow's volume. Endless has no winner, and a drawn round no one to cheer.
     */
    private roundEndVoice(): void {
        if ((this.phase !== 'roundOver' && this.phase !== 'matchOver') || this.mode === 'endless') {
            this.winVoiced = false;
            return;
        }
        if (this.winVoiced || this.phaseT < WIN_LINE_DELAY) return;
        this.winVoiced = true;
        if (this.roundWinner < 0) return;
        const side = this.roundWinner as 0 | 1;
        const pan = this.online ? 0 : side === 0 ? -0.35 : 0.35;
        const vol = this.online ? (side === this.me ? 1 : 0.45) : side === 1 && this.mode === 'cpu' ? 0.45 : 1;
        this.voice(side, this.fields[side].fairy, 'win', pan, vol, true);
    }

    /**
     * What a meadow's fairy says this step, from its sounds: a line for a level-2 charge shot, a level-3 one (her
     * guardian), Fever, a hit (not more often than HIT_LINE_GAP), a volley of fireballs shot back, or going down
     * (cutting off whatever she's saying).
     */
    private voicesFor(f: Field, side: 0 | 1, pan: number, vol: number): void {
        let ev: VoiceEvent | null = null;
        const now = performance.now();
        for (const e of f.sfx) {
            if (e.k === 'reverse') this.reversedAt[side].push(now);
            if (e.k === 'release' && (e.p ?? 0) >= 3) ev = 'summon';
            else if (e.k === 'release' && e.p === 2) ev ??= 'charge';
            else if (e.k === 'fever') ev = ev === 'summon' ? ev : 'fever';
            else if (e.k === 'hurt' || e.k === 'stun') ev ??= 'hit';
        }
        const down = !f.alive || f.sfx.some(e => e.k === 'death');
        if (down && !this.voiceDown[side]) {
            this.voiceDown[side] = true;
            this.voice(side, f.fairy, 'death', pan, vol, true);
            return;
        }
        if (down) return;
        // A volley shot back: a few reversed close together (and no bigger moment this step).
        const recent = (this.reversedAt[side] = this.reversedAt[side].filter(t => now - t < REVERSE_WINDOW));
        if (!ev && recent.length >= REVERSE_VOLLEY && now - this.reverseLineAt[side] >= REVERSE_LINE_GAP) {
            this.reverseLineAt[side] = now;
            this.reversedAt[side] = [];
            ev = 'reverse';
        }
        if (!ev) return;
        if (ev === 'hit') {
            if (now - this.hitLineAt[side] < HIT_LINE_GAP) return;
            this.hitLineAt[side] = now;
        }
        this.voice(side, f.fairy, ev, pan, vol);
    }

    /** Say one of `fairy`'s lines for `ev` (a different one from last time, where she has more than one). */
    private voice(side: 0 | 1, fairy: Fairy, ev: VoiceEvent, pan = 0, vol = 1, interrupt = false): void {
        const lines = VOICES[fairy.id]?.[ev];
        if (!lines?.length || this.seeking) return;
        const key = `${fairy.id}:${ev}`;
        const last = this.lastLine.get(key);
        const pool = lines.length > 1 ? lines.filter(l => l !== last) : lines;
        const line = pool[Math.floor(Math.random() * pool.length)];
        this.lastLine.set(key, line);
        this.sound.speak(line, `side${side}`, pan, vol, interrupt ? 'cut' : 'drop');
    }

    /** Get a fairy's lines ready, so the first of each comes at once. */
    private readyVoice(fairy: Fairy): void {
        const v = VOICES[fairy.id];
        if (v) this.sound.preloadVoice(Object.values(v).flat());
    }

    /** Play an interface sound (centred, full volume). */
    private ui(k: Sfx): void {
        if (this.seeking) return;
        this.sound.play(k);
    }

    /** Called by the page buttons and the title screen. */
    start(mode: Mode): void {
        // Fresh onto fairy select (not back from map select): the announcer asks for a champion.
        if (this.phase !== 'mapselect' && !this.seeking) {
            this.sound.preloadVoice([ANNOUNCER.choose, ...ANNOUNCER.rounds, ANNOUNCER.final, ...ANNOUNCER.ready]);
            this.sound.preloadVoice(ANNOUNCER.fight);
            this.sound.speak(ANNOUNCER.choose, 'announcer', 0, 1, 'cut');
        }
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
        this.me = net.seat;
        this.roundNo = 0;
        this.rivalLeft = false;
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
    /**
     * Which tab a menu screen with tabs is showing, as a number that grows from left to right (Profile's two tabs;
     * the match details' tabs, and on Graphs which graph), or -1 on a screen without them: the page plays a short
     * entrance for the new tab's content when it changes.
     */
    get screenTab(): number {
        if (this.phase === 'profile') return this.profileTab === 'history' ? 1 : 0;
        if (this.phase === 'matchinfo')
            return MATCH_TABS.indexOf(this.matchTab) * 10 + (this.matchTab === 'graphs' ? this.matchGraph : 0);
        return -1;
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
        this.me = 0;
        this.rivalLeft = false;
        this.notice = notice;
        this.mode = 'cpu';
        this.phase = 'modes';
        this.lobbyFocus = 'mode';
        this.transits = [];
    }

    /** Tell the online rival where this player's cursor is and whether they have picked. */
    private sendSelection(): void {
        const pk = this.pickers[0];
        this.net?.select(pk.index, pk.done, FAIRIES[pk.index].id);
    }

    /** Wipe saved stats and unlocks (here and on the server) and go back to the title screen. */
    resetProgress(): void {
        this.progress = resetProgress();
        void this.account.reset().then(p => p && this.adoptProgress(p));
        this.phase = 'title';
    }

    /** The best trophies the player has ever had, which open frames and bubbles to wear (see data/looks.ts). */
    get bestTrophies(): number {
        return this.progress.bestTrophies;
    }

    /** Take on progress the server decided (it counts; this browser's copy only shows it in the meantime). */
    private adoptProgress(p: Progress): void {
        this.progress = { ...this.progress, ...p };
        saveProgress(this.progress);
    }

    /** Ask the server what's switched off and what art it keeps, and take both on. */
    private refreshCatalog(): void {
        void this.account.catalog().then(c => {
            if (!c) return;
            setCatalog(c);
            useServerArt(c.art, this.account.apiBase);
        });
    }

    /** True if the fairy needs no unlock or has been unlocked, and the server hasn't switched her off. */
    isUnlocked(f: Fairy): boolean {
        return (!f.unlock || this.progress.unlocked.includes(f.id)) && fairyAvailable(f.id);
    }

    /** The select screen's fairy medallions, with their hit areas for touch. */
    private cards(): SelectCard[] {
        return FAIRIES.map((fairy, i) => {
            const m = medallionAt(i, this.r.layout, this.r.viewH, this.r.viewX);
            return { fairy, locked: !this.isUnlocked(fairy), x: m.x - m.r, y: m.y - m.r, w: m.r * 2, h: m.r * 2 };
        });
    }

    /** Start a match with the chosen fairies (the CPU picks its own), then its first round. */
    private beginMatch(seed?: number): void {
        if (this.vsCpu) {
            // The CPU flies a random fairy from the whole roster, locked ones included,
            // so you can see what you're working toward.
            // (none the server has switched off, unless that leaves no one).
            const on = FAIRIES.filter(f => f !== this.picks[0] && fairyAvailable(f.id));
            const others = on.length ? on : FAIRIES.filter(f => f !== this.picks[0]);
            this.picks[1] = others[Math.floor(Math.random() * others.length)];
        }
        // Random picks a map for the whole match; online, each round's seed picks one instead (both sides agree).
        this.matchMap = this.online ? '' : this.mapIndex === 0 ? this.randomOpenMap() : MAPS[this.mapIndex - 1].id;
        this.wins = [0, 0];
        this.matchBestChain = 0;
        this.matchFevers = 0;
        this.newlyUnlocked = [];
        this.newStages = [];
        this.trophyDelta = 0;
        this.endlessNew = false;
        this.endlessRank = null;
        const m = this.mode;
        this.recorder =
            !this.replay && (m === 'cpu' || m === 'versus' || m === 'endless')
                ? new Recorder(m, [this.picks[0].id, this.picks[1].id], this.matchMap)
                : null;
        this.newRound(seed);
    }

    /** Whether map `i` (in MAPS order) is open on the trophy road and not switched off by the server. */
    private mapOpen(i: number): boolean {
        return stageOpen(this.progress, MAPS[i].id) && mapAvailable(MAPS[i].id);
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

    /** Whether the trophy road is open over the lobby (the page shows its Back tab for it). */
    get roadShowing(): boolean {
        return this.phase === 'modes' && this.roadOpen;
    }

    /** Whether a replay is being watched. */
    get watching(): boolean {
        return this.replay !== null;
    }

    /**
     * Watch a recorded match: its fairies, map and rounds play out as they did, the recording flying both meadows.
     * Nothing it does counts toward progress. Esc (or ◀ Back) leaves it for the match's details.
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
        // After the silent run-through, which moves the clock on.
        this.watchStarted = this.time;
    }

    /** Set a replay up from its start: its fairies, map and first round. */
    private resetReplay(data: ReplayData): void {
        this.replay = new ReplayPlayer(data);
        this.scrub = null;
        this.recorder = null;
        this.replayRound = 0;
        this.replaySpeed = 1;
        this.replayCut = false;
        // An online match plays back like two players on one screen: both meadows from the recording.
        this.mode = data.mode === 'online' ? 'versus' : data.mode;
        this.picks = [fairyById(data.fairies[0]) ?? FAIRIES[0], fairyById(data.fairies[1]) ?? FAIRIES[1]];
        this.matchMap = data.map;
        this.wins = [0, 0];
        this.matchBestChain = 0;
        this.matchFevers = 0;
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

    /** A short label for a highlight, e.g. "FEVER · STELLA". */
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
     * The replay's controls, read each step while watching, each a button on the panel (so a touchscreen can do
     * everything) and a key: pause (P), back and forward five seconds (← →), the previous and next highlight
     * ([ ]), the speed through 1×, 2× and 4× (Space). Dragging on the timeline moves its knob and lets go to seek
     * there (landing just before a highlight it's on); a round chip (or 1–9) jumps to that round; the ⌄ button
     * (or H) minimises the panel.
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
        // The buttons: each does what a key does (see below), so a touchscreen can do it all.
        let button: string | null = null;
        if (tap && !toggle && !this.replayMini) {
            const b = L.buttons.find(b => inBox(tap, { x: b.x - 2, y: b.y - 4, w: b.w + 4, h: b.h + 8 }));
            if (b) {
                pr.delete('Pointer');
                button = b.action;
                this.ui('tick');
            }
        }
        if (button === 'pause' || pr.has('KeyP')) {
            if (this.phase === 'playing' || this.phase === 'countdown') this.paused = !this.paused;
            pr.delete('KeyP');
            return true;
        }
        if (button === 'speed' || ['Space', 'Enter', 'KeyZ', 'KeyF'].some(k => pr.has(k))) {
            if (this.phase === 'playing' || this.phase === 'countdown') {
                this.replaySpeed = this.replaySpeed >= 4 ? 1 : this.replaySpeed * 2;
                if (!button) this.ui('tick');
                return true;
            }
        }
        if (tap && !toggle && !button && !this.replayMini) {
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
        if (pr.has('ArrowLeft') || pr.has('ArrowRight') || button === 'back' || button === 'forward') {
            this.seekReplay(pos + (pr.has('ArrowLeft') || button === 'back' ? -300 : 300));
            return true;
        }
        if (pr.has('BracketLeft') || pr.has('BracketRight') || button === 'prev' || button === 'next') {
            const next = pr.has('BracketRight') || button === 'next';
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

    /** Stop watching and go back to the game's details (or Profile's history, for a shared link's replay). */
    exitReplay(): void {
        this.replay = null;
        this.paused = false;
        this.transits = [];
        if (this.replayFrom === 'matchinfo' && this.history[this.historyIndex]) this.phase = 'matchinfo';
        else this.openProfile('history', false);
        this.historyNote = '';
        this.ui('tick');
    }

    /** Open the Profile screen on a tab and fetch the match history (the cursor stays put, unless `fresh`). */
    openProfile(tab: ProfileTab = this.profileTab, fresh = true): void {
        this.phase = 'profile';
        this.profileTab = tab;
        if (fresh) this.historyIndex = 0;
        this.historyTop = null;
        this.historyDrag = false;
        if (!this.history.length) this.historyMessage = 'Loading your games…';
        void this.account.refreshLeaders();
        void this.loadHistory();
    }

    /**
     * Fill the match history: the player's games on the server, and this browser's own last game if the server
     * doesn't have it (it was played offline, or before there was a server).
     */
    private async loadHistory(): Promise<void> {
        let list: HistoryEntry[] = [];
        let failed = false;
        try {
            list = await this.account.history();
        } catch {
            failed = true;
        }
        const local = loadLocalReplay();
        if (local && !list.some(e => e.recorded === local.at)) {
            const endless = local.mode === 'endless';
            const [won, lost] = local.wins ?? [0, 0];
            list.unshift({
                mode: local.mode,
                map: local.map,
                fairy: local.fairies[0],
                rivalFairy: endless ? null : local.fairies[1],
                roundsWon: won,
                roundsLost: lost,
                won: !endless && won > lost,
                bestChain: -1,
                trophyDelta: 0,
                seconds: local.seconds,
                guardians: local.guardians ?? 0,
                at: new Date(local.at).toISOString(),
                replay: 'local',
                recorded: local.at,
            });
        }
        this.history = list;
        this.historyIndex = Math.min(this.historyIndex, Math.max(0, list.length - 1));
        this.historyMessage = list.length
            ? ''
            : failed || !this.account.hasServer
              ? 'No games here yet.\nPlay a match: it is recorded as you play,\nand kept here when the game server is reached.'
              : 'No games yet.\nEvery match and Endless run you play is kept here,\nwith its replay to watch again.';
    }

    /** Open a replay by its share code (a `?replay=` link): fetch it from the server and watch it. */
    openReplayCode(code: string): void {
        this.openProfile('history');
        this.replayFrom = 'profile';
        this.watchCode(code);
    }

    /** Fetch the replay with this code (or this browser's own, for 'local') and watch it. */
    private watchCode(code: string): void {
        if (code === 'local') {
            const d = loadLocalReplay();
            if (d) this.watchReplay(d);
            return;
        }
        const cached = this.replayCache.get(code);
        if (cached) {
            this.watchReplay(cached);
            return;
        }
        this.historyNote = 'Loading replay…';
        this.historyNoteT = this.time;
        const from = this.phase;
        this.account
            .fetchReplay(code)
            .then(d => {
                this.replayCache.set(code, d);
                if (this.phase === from && !this.replay) this.watchReplay(d);
            })
            .catch(() => {
                this.historyNote = "Couldn't load that replay";
                this.historyNoteT = this.time;
            });
    }

    /** The share link for a replay saved on the server (empty for one kept only here, or a page from a file). */
    private replayLink(code: string | null): string {
        if (!code || code === 'local' || typeof location === 'undefined' || !location.protocol.startsWith('http'))
            return '';
        return `${location.origin}${location.pathname}?replay=${code}`;
    }

    /** The first history row in view, keeping the cursor in sight. */
    private get historyStart(): number {
        const n = this.history.length,
            rows = HISTORY_ROWS[this.r.layout];
        const top = this.historyTop ?? this.historyIndex - Math.floor(rows / 2);
        return Math.max(0, Math.min(top, n - rows));
    }

    /**
     * Scroll the match history by the mouse wheel, or by a press on its scroll bar (`track`) and a drag along it,
     * keeping the cursor on a game in view. Whether a press went to the scroll bar (so it isn't also a tap on a row).
     */
    private scrollHistory(
        track: { x: number; y: number; w: number; h: number },
        tap: { x: number; y: number } | null,
    ): boolean {
        const n = this.history.length,
            rows = HISTORY_ROWS[this.r.layout];
        if (n <= rows) return false;
        const max = n - rows;
        let top = this.historyStart;
        // The wheel: a row for each notch (about 60 of its pixels), however finely a trackpad sends it.
        this.historyWheel += this.input.wheel;
        while (Math.abs(this.historyWheel) >= 60) {
            const d = Math.sign(this.historyWheel);
            top += d;
            this.historyWheel -= d * 60;
        }
        // The scroll bar, a little wider than drawn so it's easy to catch: a press on it starts a drag, and the
        // rows in view centre on where the pointer is along it until it's let go.
        const pad = Math.max(6, track.w);
        const onBar =
            !!tap &&
            tap.x >= track.x - pad &&
            tap.x <= track.x + track.w + pad &&
            tap.y >= track.y - 4 &&
            tap.y <= track.y + track.h + 4;
        if (onBar) this.historyDrag = true;
        const p = this.input.pointer;
        if (!p) this.historyDrag = false;
        else if (this.historyDrag) {
            const k = Math.max(0, Math.min(1, (p.y - track.y) / track.h));
            top = Math.round(k * n - rows / 2);
        }
        top = Math.max(0, Math.min(top, max));
        if (top !== this.historyStart) {
            this.historyTop = top;
            // Keep the cursor on a game in view, so Enter opens one you can see.
            this.historyIndex = Math.max(top, Math.min(this.historyIndex, top + rows - 1));
        }
        return onBar;
    }

    /**
     * The Profile screen: left/right (or a tap on a tab) switches between the record and the match history; on the
     * history, up/down choose a game and Enter (or a tap) opens its details. Esc goes back to the menu.
     */
    private stepProfile(pr: Set<string>): void {
        if (pr.has('Escape')) {
            this.backToMenu();
            return;
        }
        const boxes = profileBoxes(this.r.layout, this.r.viewH, this.r.viewX);
        const tap = this.input.tap;
        let tab = this.profileTab;
        if (['ArrowLeft', 'KeyA', 'KeyQ'].some(k => pr.has(k))) tab = 'record';
        if (['ArrowRight', 'KeyD', 'KeyE'].some(k => pr.has(k))) tab = 'history';
        if (pr.has('Tab')) tab = tab === 'record' ? 'history' : 'record';
        const onTab = tap ? boxes.tabs.findIndex(b => inBox(tap, b)) : -1;
        if (onTab >= 0) tab = onTab ? 'history' : 'record';
        if (tab !== this.profileTab) {
            this.profileTab = tab;
            this.ui('tick');
            return;
        }
        if (tab !== 'history') return;
        const n = this.history.length;
        if (!n) return;
        const was = this.historyIndex;
        if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.historyIndex = (this.historyIndex + n - 1) % n;
        if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.historyIndex = (this.historyIndex + 1) % n;
        if (this.historyIndex !== was) {
            this.historyTop = null;
            this.ui('tick');
        }
        if (this.scrollHistory(boxes.scroll, tap)) return;
        let pick = -1;
        if (tap) {
            const start = this.historyStart;
            const k = boxes.rows.slice(0, n - start).findIndex(b => inBox(tap, b));
            if (k >= 0) pick = start + k;
        }
        if (pick < 0 && ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k)))
            pick = this.historyIndex;
        if (pick < 0) return;
        this.historyIndex = pick;
        this.historyNote = '';
        this.matchTab = 'overview';
        this.phase = 'matchinfo';
        this.ui('ok');
    }

    /** The match details screen: Enter (or Watch Replay) watches it, C (or Copy Link) copies its link; Esc leaves. */
    private stepMatchInfo(pr: Set<string>): void {
        if (this.historyNote && this.time - this.historyNoteT > 2.5) this.historyNote = '';
        const e = this.history[this.historyIndex];
        if (pr.has('Escape') || !e) {
            this.openProfile('history', false);
            this.ui('tick');
            return;
        }
        const b = matchBoxes(this.r.layout, this.r.viewH, this.r.viewX);
        const tap = this.input.tap;
        // Left and right (or a tap on one) change tab; up and down (or a tap) the graph.
        let tab = MATCH_TABS.indexOf(this.matchTab);
        if (['ArrowLeft', 'KeyA', 'KeyQ'].some(k => pr.has(k))) tab = (tab + MATCH_TABS.length - 1) % MATCH_TABS.length;
        if (['ArrowRight', 'KeyD', 'KeyE', 'Tab'].some(k => pr.has(k))) tab = (tab + 1) % MATCH_TABS.length;
        const onTab = tap ? b.tabs.findIndex(x => inBox(tap, x)) : -1;
        if (onTab >= 0) tab = onTab;
        if (MATCH_TABS[tab] !== this.matchTab) {
            this.matchTab = MATCH_TABS[tab];
            this.ui('tick');
            if (this.matchTab !== 'overview') this.loadStats(e);
            return;
        }
        if (this.matchTab === 'graphs') {
            const was = this.matchGraph,
                n = GRAPHS.length;
            if (['ArrowUp', 'KeyW'].some(k => pr.has(k))) this.matchGraph = (this.matchGraph + n - 1) % n;
            if (['ArrowDown', 'KeyS'].some(k => pr.has(k))) this.matchGraph = (this.matchGraph + 1) % n;
            const onGraph = tap ? b.graphs.findIndex(x => inBox(tap, x)) : -1;
            if (onGraph >= 0) this.matchGraph = onGraph;
            if (this.matchGraph !== was) {
                this.ui('tick');
                return;
            }
        }
        const overview = this.matchTab === 'overview';
        if (pr.has('KeyC') || (overview && tap && inBox(tap, b.copy))) this.copyReplayLink();
        const watch =
            ['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k)) ||
            (overview && !!tap && inBox(tap, b.watch));
        if (!watch) return;
        if (!e.replay) {
            this.historyNote = 'No replay for this game';
            this.historyNoteT = this.time;
            return;
        }
        this.ui('ok');
        this.replayFrom = 'matchinfo';
        this.watchCode(e.replay);
    }

    /**
     * Work out a game's numbers for its Scoreboard and Graphs: fetch its replay (or take this browser's own) and play
     * it through. Done once a game; the screen shows a line meanwhile.
     */
    private loadStats(e: HistoryEntry): void {
        const code = e.replay;
        if (!code || this.statsFor.has(code)) return;
        this.statsFor.set(code, 'loading');
        const got =
            code === 'local'
                ? Promise.resolve(loadLocalReplay())
                : this.replayCache.get(code)
                  ? Promise.resolve(this.replayCache.get(code)!)
                  : this.account.fetchReplay(code);
        got.then(
            d => {
                if (!d) throw new Error('No replay');
                if (code !== 'local') this.replayCache.set(code, d);
                // A beat later, so the screen has drawn its loading line before the match is played through.
                setTimeout(() => {
                    try {
                        this.statsFor.set(code, fromSide(matchStats(d), this.mySide(e, d)));
                    } catch (err) {
                        console.warn('Match stats failed', err);
                        this.statsFor.set(code, 'failed');
                    }
                }, 30);
            },
            () => this.statsFor.set(code, 'failed'),
        ).catch(() => this.statsFor.set(code, 'failed'));
    }

    /**
     * Which side of a replay is this player's: the first, except in an online match, which the server records in
     * seat order for both players; there it's the side flying this player's fairy (by the score, if both flew her).
     */
    private mySide(e: HistoryEntry, d: ReplayData): 0 | 1 {
        if (d.mode !== 'online') return 0;
        const [a, b] = d.fairies;
        if (a !== b) return b === e.fairy ? 1 : 0;
        return d.wins[1] === e.roundsWon && d.wins[0] !== e.roundsWon ? 1 : 0;
    }

    /** Copy the chosen game's replay link to the clipboard. */
    private copyReplayLink(): void {
        const link = this.replayLink(this.history[this.historyIndex]?.replay ?? null);
        if (!link) return;
        const done = (ok: boolean) => {
            this.historyNote = ok ? 'Link copied' : "Couldn't copy the link";
            this.historyNoteT = this.time;
        };
        if (navigator.clipboard)
            navigator.clipboard.writeText(link).then(
                () => done(true),
                () => done(false),
            );
        else done(false);
    }

    /** A game's mode, as its tag and colour. */
    private modeTag(mode: string): { tag: string; color: string } {
        if (mode === 'endless') return { tag: 'ENDLESS', color: '#ff8a5c' };
        if (mode === 'versus') return { tag: '2 PLAYERS', color: '#8ff0a0' };
        if (mode === 'online') return { tag: 'ONLINE', color: '#8fd8ff' };
        return { tag: 'VS CPU', color: '#ffd45c' };
    }

    /** One line of the match history. */
    private historyRow(e: HistoryEntry): HistoryRow {
        const name = (id: string | null) => (id ? (fairyById(id)?.name ?? id) : '?');
        const map = mapById(e.map)?.name ?? e.map;
        const endless = e.mode === 'endless';
        const title = endless ? `${name(e.fairy)} alone` : `${name(e.fairy)}  vs  ${name(e.rivalFairy)}`;
        const result = endless ? clock(e.seconds) : `${e.won ? 'WIN' : 'LOSS'} ${e.roundsWon}-${e.roundsLost}`;
        const resultColor = endless ? '#ffb27a' : e.won ? '#ffe27a' : '#a9b4ff';
        const trophies = e.trophyDelta ? `${e.trophyDelta > 0 ? '+' : ''}${e.trophyDelta} trophies` : '';
        const detail = [
            map,
            endless ? `${e.guardians} guardian${e.guardians === 1 ? '' : 's'}` : clock(e.seconds),
            trophies,
        ]
            .filter(Boolean)
            .join('  ·  ');
        const when = new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
        return {
            ...this.modeTag(e.mode),
            title,
            result,
            resultColor,
            detail,
            when,
            local: e.replay === 'local',
            map: e.map,
        };
    }

    /** The match details screen's view of the chosen game. */
    private matchInfo(e: HistoryEntry, touch: boolean): MatchInfoView {
        const endless = e.mode === 'endless';
        const map = mapById(e.map)?.name ?? e.map;
        const when = new Date(e.at).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
        const tiles: [string, string][] = [['MAP', map.toUpperCase()]];
        if (endless) tiles.push(['GUARDIANS', String(e.guardians)]);
        else tiles.push(['LENGTH', clock(e.seconds)]);
        tiles.push(['BEST CHAIN', e.bestChain >= 0 ? String(e.bestChain) : '—']);
        if (!endless && e.mode !== 'versus')
            tiles.push(['TROPHIES', e.trophyDelta ? `${e.trophyDelta > 0 ? '+' : ''}${e.trophyDelta}` : '0']);
        const got = e.replay ? this.statsFor.get(e.replay) : undefined;
        const statsNote = !e.replay
            ? 'No replay was saved for this game,\nso there are no numbers to show.'
            : got === 'failed'
              ? "Couldn't load this game's replay.\nTry again when the game server is reached."
              : 'Playing the match through…';
        const fairyName = (id: string | null) => (id ? (fairyById(id)?.name ?? id) : '?');
        const rivalLabel = endless
            ? 'THE STORM'
            : e.mode === 'cpu'
              ? 'CPU'
              : e.mode === 'versus'
                ? 'PLAYER 2'
                : 'RIVAL';
        return {
            touch,
            ...this.modeTag(e.mode),
            banner: endless ? 'RUN OVER' : e.won ? 'VICTORY' : 'DEFEAT',
            won: endless || e.won,
            when: e.replay === 'local' ? `${when}  ·  kept on this device` : when,
            fairy: e.fairy,
            rival: endless ? null : e.rivalFairy,
            score: endless ? clock(e.seconds) : `${e.roundsWon} - ${e.roundsLost}`,
            scoreLabel: endless ? 'SURVIVED' : 'ROUNDS',
            tiles,
            tab: this.matchTab,
            graph: this.matchGraph,
            stats: got && typeof got === 'object' ? got : null,
            statsNote,
            names: [fairyName(e.fairy), endless ? 'Hidden meadow' : fairyName(e.rivalFairy)],
            labels: [e.mode === 'versus' ? 'PLAYER 1' : 'YOU', rivalLabel],
            hasReplay: !!e.replay,
            link: this.replayLink(e.replay),
            note: this.historyNote,
            card: {
                name: this.account.name,
                synced: this.account.online,
                leaders: this.account.leaders,
                me: this.account.id,
            },
        };
    }

    /** The recording ran out before its round ended (it was cut short, or plays differently on this build). */
    private replayRanOut(): void {
        for (const f of this.fields) f.settled = true;
        this.replayCut = true;
        this.phase = 'matchOver';
        this.phaseT = 0;
        this.transits = [];
    }

    /**
     * The match just ended: keep its recording here, and send it to the server, which plays it through again to
     * count it (and keeps it for Profile's match history). What the server makes of it replaces what the game showed.
     */
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
        void this.account.submit(data).then(r => {
            if (!r || this.lastReplay !== data) return;
            this.lastReplayCode = r.code;
            if (r.rank) this.endlessRank = r.rank;
        });
    }

    /** The settings that follow the player's account: the game's own and the sound's. */
    private synced(): SyncedSettings {
        return { settings: this.settings, audio: this.sound.prefs() };
    }

    /**
     * Meet the game server (called once by the page at start-up): make a guest account if this browser has none,
     * take on the server's progress (it decides that) and settings if saved there later than here, and from then
     * on send settings changes and finished games up. The game plays on from this browser's copies the whole time;
     * with no server it never hears back.
     */
    async connectAccount(): Promise<void> {
        this.sound.onChange = () => this.account.saveSettings(this.synced());
        this.account.onProgress = p => this.adoptProgress(p);
        // What's switched off and the art the server keeps: as last heard at once, then the server's word.
        const kept = loadCatalog();
        if (kept) useServerArt(kept.art, this.account.apiBase);
        this.refreshCatalog();
        const got = await this.account.start(this.synced());
        if (got.progress) this.adoptProgress(got.progress);
        if (got.settings) {
            const s = got.settings.settings;
            this.settings = { ...this.settings, ...s, keys: sanitizeKeys(s.keys) };
            saveSettings(this.settings);
            this.input.setBindings(this.settings.keys);
            this.sound.applyPrefs(got.settings.audio ?? {});
        }
    }

    /** When the replay being watched was opened (Game.time), for the hint to turn the phone. */
    private watchStarted = -Infinity;
    /** Whether this round plays with the rival's meadow hidden (Settings, on an upright phone), in taller meadows. */
    private rivalHidden = false;

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
        this.voiceDown = [false, false];
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
            // The server dealt this round; its steps arrive from now on.
            this.frames = [];
            this.roundSteps = 0;
            this.roundEnd = null;
        }
        // The seed also decides which meadow the Hollow Crow wakes in.
        // A replay keeps the size it was recorded at (older ones played on landscape screens in wider meadows).
        // A replay shows the rival's meadow even if it was played with it hidden.
        this.rivalHidden = !recorded && this.soloView && this.mode !== 'endless';
        if (recorded) {
            C.setFieldWidth(recorded.field.w, recorded.field.single);
            C.setFieldHeight(recorded.field.h);
        } else {
            const endless = this.mode === 'endless';
            // Every VS round, local or online, landscape or upright, plays in the standard meadow, so a game and its
            // replay look the same on every screen (only the zoom differs); Endless keeps its upright one.
            C.setFieldWidth(endless ? C.FIELD_W_BASE : C.FIELD_W_STD, endless);
            // With the rival's meadow hidden on an upright phone, the meadows grow to reach the top of the screen
            // (both, so the round stays fair), leaving a slim bar for the round and the rival's hearts. Endless on a
            // landscape screen plays in an upright meadow shaped like a phone's.
            C.setFieldHeight(
                this.soloView
                    ? (this.r.tallH - C.TALL_SOLO_BAR) /
                          Math.min(C.TALL_OWN_S, C.TALL_W / (endless ? C.FIELD_W_BASE : C.FIELD_W_STD))
                    : endless
                      ? C.ENDLESS_DESK_H
                      : C.FIELD_H_BASE,
            );
        }
        const crowHere = (seed & 1) === 0;
        const map = this.replay ? this.replay.data.map : (this.forcedMap?.id ?? (this.matchMap || mapForSeed(seed).id));
        this.round = new RoundSim(this.mode as RoundMode, seed, this.picks, roundIndex, map, crowHere);
        this.recorder?.startRound(seed, { w: C.FIELD_W, h: C.FIELD_H, single: C.VIEW_W === C.FIELD_W });
        this.phase = 'countdown';
        this.phaseT = 0;
        this.announceRound(roundIndex);
    }

    /**
     * The countdown's call: the round (or the final round) at once; Ready at `callReadyAt`, as the call finishes
     * (`announceReady`); Fight! as play starts (`announceFight`). The countdown's banners follow the same moments.
     * Endless has no rounds: its banner, then Ready.
     */
    private announceRound(roundIndex: number): void {
        const final = this.wins[0] === C.ROUNDS_TO_WIN - 1 && this.wins[1] === C.ROUNDS_TO_WIN - 1;
        const take = final ? 2 : Math.min(roundIndex, 1);
        this.announceTake = take;
        this.callReadyAt = ANNOUNCER.readyAt;
        this.readyCalled = false;
        const call = this.mode === 'endless' ? null : final ? ANNOUNCER.final : ANNOUNCER.rounds[roundIndex];
        if (call && !this.seeking) this.sound.speak(call, 'announcer', 0, 1, 'cut');
    }

    /** The countdown has reached Ready (once a round). */
    private announceReady(): void {
        if (this.readyCalled || this.phaseT < this.callReadyAt) return;
        this.readyCalled = true;
        if (!this.seeking) this.sound.speak(ANNOUNCER.ready[this.announceTake], 'announcer', 0, 1, 'cut');
    }

    /** Play begins: Fight! (after Ready, if she's still saying it). */
    private announceFight(): void {
        if (!this.seeking) this.sound.speak(ANNOUNCER.fight[this.announceTake], 'announcer', 0, 1, 'after');
    }

    /** True once a match is under way (not on the title, the menus, the Characters or Profile screens, or select). */
    private get inGame(): boolean {
        return !MENU_PHASES.includes(this.phase);
    }

    /** Leave the Settings screen (its page panel's Esc). */
    closeSettings(): void {
        if (this.phase === 'settings') this.backToMenu();
    }

    /** Back to the lobby, with the screen you came from lit on its bar (or the mode picker, from a match). */
    private backToMenu(): void {
        const from = { roster: 0, maps: 1, profile: 2, settings: 3 }[this.phase as string];
        this.phase = 'modes';
        if (from !== undefined) {
            this.lobbyNav = from;
            this.lobbyFocus = 'nav';
        } else this.lobbyFocus = 'mode';
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
            const hit = rosterMedallions(this.r.layout, this.r.viewH, this.r.viewX).findIndex(
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

    /** The lobby's modes on its picker, as they are now (one the server has switched off shows as such). */
    private get lobbyModes(): LobbyMode[] {
        return LOBBY_MODES.map(m => {
            const off = m.action === 'story' || !modeAvailable(m.action);
            return { ...m, off, ribbon: m.action === 'story' ? 'Coming soon' : 'Not available right now' };
        });
    }

    /**
     * The lobby: left/right (or a tap on an arrow) change the mode on the picker and Enter (or a tap on it) plays
     * it; down moves to the bar of other screens along the bottom and up back; T (or a tap on the ticker) opens the
     * chat panel; on a phone a tap on the edge tab pulls out the friends panel. Esc closes what's open, then goes
     * back to the title.
     */
    private stepLobby(pr: Set<string>): void {
        const lay = lobbyLayout(this.r.layout, this.r.viewH, this.r.viewX);
        const tap = this.input.tap;
        const nav = LOBBY_NAV.length;
        if (this.picking) {
            this.stepPicker(pr, lay, tap);
            return;
        }
        if (this.roadOpen) {
            this.stepRoad(pr, lay, tap);
            return;
        }
        // The stage plate's arrows show the other open stages on the island.
        if (tap && !this.chatOpen && (inBox(tap, lay.prev) || inBox(tap, lay.next))) {
            this.shiftStage(inBox(tap, lay.prev) ? -1 : 1);
            return;
        }
        // A tap on the island or the stage plate under it (or R, or Enter on the plate) opens the trophy road,
        // scrolled to the player.
        const atStage = this.lobbyFocus === 'stage' && ['Enter', 'NumpadEnter', 'Space', 'KeyZ'].some(k => pr.has(k));
        if (atStage || pr.has('KeyR') || (tap && !this.chatOpen && (inBox(tap, lay.isle) || inBox(tap, lay.road)))) {
            const g = roadGeometry(this.r.layout, this.lobbyH);
            this.roadScroll = Math.max(0, Math.min(g.max, roadAt(this.progress.trophies) - g.anchor * 0.45));
            this.roadVel = 0;
            this.roadDrag = null;
            this.roadOpen = true;
            this.setChatOpen(false);
            this.ui('ok');
            return;
        }
        if (pr.has('Escape')) {
            if (this.friendsOpen) this.friendsOpen = false;
            else this.phase = 'title';
            this.ui('tick');
            return;
        }
        if (pr.has('KeyT') || (tap && !this.chatOpen && inBox(tap, lay.ticker))) {
            this.setChatOpen(!this.chatOpen);
            return;
        }
        if (tap && lay.friendsTab) {
            if (!this.friendsOpen && inBox(tap, lay.friendsTab)) {
                this.friendsOpen = true;
                this.ui('tick');
                return;
            }
            if (this.friendsOpen && !inBox(tap, lay.friends)) {
                this.friendsOpen = false;
                this.ui('tick');
                return;
            }
        }
        const was = [this.lobbyMode, this.lobbyNav, this.lobbyFocus].join();
        const left = ['ArrowLeft', 'KeyA'].some(k => pr.has(k)),
            right = ['ArrowRight', 'KeyD'].some(k => pr.has(k)),
            up = ['ArrowUp', 'KeyW'].some(k => pr.has(k)),
            down = ['ArrowDown', 'KeyS'].some(k => pr.has(k));
        // Along the bottom bar ◀ ▶ walk Characters, Maps, PLAY, Profile, Settings; ▲ goes up to the stage plate,
        // where ◀ ▶ show the other open stages, and ▼ comes back down to PLAY.
        const slot = this.lobbyFocus === 'mode' ? 2 : this.lobbyNav < 2 ? this.lobbyNav : this.lobbyNav + 1;
        if (this.lobbyFocus === 'stage') {
            if (left) this.shiftStage(-1);
            if (right) this.shiftStage(1);
            if (down) this.lobbyFocus = 'mode';
        } else {
            let to = slot;
            if (left) to = Math.max(0, slot - 1);
            if (right) to = Math.min(nav, slot + 1);
            if (to !== slot) {
                if (to === 2) this.lobbyFocus = 'mode';
                else {
                    this.lobbyFocus = 'nav';
                    this.lobbyNav = to < 2 ? to : to - 1;
                }
            }
            if (up) this.lobbyFocus = 'stage';
        }
        if ([this.lobbyMode, this.lobbyNav, this.lobbyFocus].join() !== was) this.ui('tick');
        // What's picked: the mode (Enter on the picker, or a tap on it), or a screen on the bar.
        let screen = -1,
            play = false;
        LOBBY_NAV.forEach((_, i) => {
            if (pr.has(`Digit${i + 1}`)) screen = i;
        });
        if (tap) {
            const k = lay.nav.findIndex(b => inBox(tap, b));
            if (k >= 0) screen = k;
            if (inBox(tap, lay.play)) play = true;
        }
        if (['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k))) {
            if (this.lobbyFocus === 'nav') screen = this.lobbyNav;
            else if (this.lobbyFocus === 'mode') play = true;
        }
        const quick = tap ? lay.quick.findIndex(b => inBox(tap, b)) : -1;
        if (quick >= 0) {
            this.ui('ok');
            this.setChatOpen(false);
            const id = LOBBY_QUICK[quick].id;
            if (id === 'guide') this.onWantGuide?.();
            else this.openProfile(id === 'history' ? 'history' : 'record');
            return;
        }
        if (screen >= 0) {
            this.lobbyNav = screen;
            this.lobbyFocus = 'nav';
            this.ui('ok');
            this.setChatOpen(false);
            switch (LOBBY_NAV[screen].action) {
                case 'characters':
                    this.phase = 'roster';
                    break;
                case 'maps':
                    this.phase = 'maps';
                    break;
                case 'profile':
                    this.openProfile();
                    break;
                case 'settings':
                    this.phase = 'settings';
                    break;
            }
            return;
        }
        if (!play) return;
        // PLAY opens the mode picker.
        this.lobbyFocus = 'mode';
        this.picking = true;
        this.ui('ok');
        this.setChatOpen(false);
    }

    /** The lobby's height in its design units (the tall view's own height on a phone). */
    private get lobbyH(): number {
        return this.r.layout === 'tall' ? tallMenuFit(this.r.viewH).h : C.VIEW_H;
    }

    /**
     * The trophy road over the lobby: a drag scrolls it (and it glides on a little after), as do the wheel and the
     * arrows; OK, Enter or Esc closes it.
     */
    private stepRoad(pr: Set<string>, lay: ReturnType<typeof lobbyLayout>, tap: { x: number; y: number } | null): void {
        if (
            ['Escape', 'Enter', 'NumpadEnter', 'Space', 'KeyZ', 'KeyR'].some(k => pr.has(k)) ||
            (tap && inBox(tap, lay.roadOk))
        ) {
            this.roadOpen = false;
            this.ui('tick');
            return;
        }
        const g = roadGeometry(this.r.layout, this.lobbyH);
        const scale = this.r.layout === 'tall' ? tallMenuFit(this.r.viewH).s : 1;
        const p = this.input.pointer;
        // A press on the scroll bar (or just beside it) takes hold of it: the thumb follows the pointer.
        const bar = lay.roadBar;
        if (p && this.roadDrag === null && !this.roadBarHeld)
            this.roadBarHeld = inBox(p, { x: bar.x - 10 * scale, y: bar.y, w: bar.w + 20 * scale, h: bar.h });
        if (p && this.roadBarHeld) {
            const th = roadThumb(bar, scale);
            const k = (th.track1 - th.thumb / 2 - p.y) / Math.max(1, th.span - th.thumb);
            this.roadScroll = Math.max(0, Math.min(1, k)) * g.max;
            this.roadVel = 0;
            this.roadDrag = p.y;
        } else if (p) {
            // Dragging down shows what's further up the road.
            if (this.roadDrag !== null) {
                const d = (p.y - this.roadDrag) / scale;
                this.roadScroll += d;
                this.roadVel = d;
            }
            this.roadDrag = p.y;
        } else {
            this.roadDrag = null;
            this.roadBarHeld = false;
            this.roadScroll += this.roadVel;
            this.roadVel *= 0.9;
            if (Math.abs(this.roadVel) < 0.05) this.roadVel = 0;
        }
        this.roadScroll -= this.input.wheel * 0.4;
        if (this.input.held.has('ArrowUp') || this.input.held.has('KeyW')) this.roadScroll += 5;
        if (this.input.held.has('ArrowDown') || this.input.held.has('KeyS')) this.roadScroll -= 5;
        this.roadScroll = Math.max(0, Math.min(g.max, this.roadScroll));
    }

    /**
     * The mode picker over the lobby: the arrows move to the nearest tile that way, Enter or a tap on a tile plays its
     * mode, and Esc, the close button or a tap off the tiles closes it.
     */
    private stepPicker(
        pr: Set<string>,
        lay: ReturnType<typeof lobbyLayout>,
        tap: { x: number; y: number } | null,
    ): void {
        const modes = this.lobbyModes;
        if (pr.has('Escape') || (tap && inBox(tap, lay.close))) {
            this.picking = false;
            this.ui('tick');
            return;
        }
        const dirs: [string[], number, number][] = [
            [['ArrowLeft', 'KeyA'], -1, 0],
            [['ArrowRight', 'KeyD'], 1, 0],
            [['ArrowUp', 'KeyW'], 0, -1],
            [['ArrowDown', 'KeyS'], 0, 1],
        ];
        for (const [keys, dx, dy] of dirs) {
            if (!keys.some(k => pr.has(k))) continue;
            // The nearest tile whose direction from this one is within 60° of the arrow's.
            const here = lay.tiles[this.lobbyMode];
            let best = -1,
                bestD = Infinity;
            lay.tiles.forEach((t, i) => {
                if (i === this.lobbyMode) return;
                const vx = t.x - here.x,
                    vy = t.y - here.y,
                    len = Math.hypot(vx, vy);
                if ((vx * dx + vy * dy) / len < 0.5) return;
                if (len < bestD) {
                    bestD = len;
                    best = i;
                }
            });
            if (best >= 0) {
                this.lobbyMode = best;
                this.ui('tick');
            }
        }
        let chosen = -1;
        if (['Space', 'Enter', 'KeyZ', 'KeyG', 'NumpadEnter'].some(k => pr.has(k))) chosen = this.lobbyMode;
        if (tap) {
            chosen = lay.tiles.findIndex(t => inTile(tap, t));
            if (chosen < 0) {
                this.picking = false;
                this.ui('tick');
                return;
            }
            this.lobbyMode = chosen;
        }
        if (chosen < 0) return;
        const m = modes[chosen];
        if (m.off) {
            this.ui('tick');
            return;
        }
        this.ui('ok');
        this.picking = false;
        if (m.action === 'online') this.onWantOnline?.();
        else if (m.action === 'cpu' || m.action === 'versus' || m.action === 'endless') this.start(m.action);
    }

    /** Open or close the chat panel (the page shows it; see main.ts). */
    setChatOpen(open: boolean): void {
        if (this.chatOpen === open) return;
        this.chatOpen = open;
        this.ui('tick');
    }

    /** The next stage on the trophy road, with the trophies toward it, or null once they're all open. */
    private get nextStage(): { map: string; name: string; have: number; need: number } | null {
        const st = STAGES.find(x => x.trophies > this.progress.bestTrophies);
        if (!st) return null;
        return {
            map: st.mapId,
            name: mapById(st.mapId)?.name ?? st.mapId,
            have: this.progress.bestTrophies,
            need: st.trophies,
        };
    }

    /** The stages open on the trophy road, as indices into MAPS. */
    private get openStages(): number[] {
        return MAPS.map((_, i) => i).filter(i => this.mapOpen(i));
    }

    /** Which of the open stages the lobby's island shows: the one picked with the plate's arrows, else the furthest. */
    private get lobbyStageAt(): number {
        const n = this.openStages.length;
        return this.lobbyStage === null ? n - 1 : Math.min(this.lobbyStage, n - 1);
    }

    /** The stage on the lobby's island (a map id). */
    private get lobbyMap(): string {
        return MAPS[this.openStages[this.lobbyStageAt] ?? 0].id;
    }

    /** Show the next (1) or previous (−1) open stage on the lobby's island, going round. */
    private shiftStage(d: number): void {
        const n = this.openStages.length;
        if (n < 2) return;
        this.lobbyStage = (this.lobbyStageAt + d + n) % n;
        this.ui('tick');
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
                this.pickedLine(i as 0 | 1);
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
                    this.pickedLine(who);
                }
            }
        }
        if (this.mode === 'online' && (before.index !== this.pickers[0].index || before.done !== this.pickers[0].done))
            this.sendSelection();
        if (pr.has('Escape')) {
            if (this.online) this.disconnect();
            else {
                this.phase = 'modes';
                this.lobbyFocus = 'mode';
                // Ask again, so a mode, fairy or map just switched on or off (or new art) shows as such.
                this.refreshCatalog();
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
            // Then the map: chosen on its own screen in a local match; online, the server starts the match and its
            // round seeds pick the map.
            if (this.selectT - this.readyAt >= READY_HOLD && !this.online) {
                this.phase = 'mapselect';
                // A card for a stage that's still locked can't stay chosen.
                if (this.mapIndex > 0 && !this.mapOpen(this.mapIndex - 1)) this.mapIndex = 0;
            }
        } else this.readyAt = -1;
    }

    /** A player picked their fairy: she says so (from her side, two players on one screen), and readies her lines. */
    private pickedLine(i: 0 | 1): void {
        const fairy = this.picks[i];
        this.readyVoice(fairy);
        this.voice(i, fairy, 'pick', this.mode === 'versus' ? (i === 0 ? -0.35 : 0.35) : 0);
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
            const hit = mapCards(this.r.layout, this.r.viewH, this.r.viewX).findIndex(
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

    // ---- online ---------------------------------------------------------------

    /** Handle everything the server sent since the last step. */
    private pollNet(dt: number): void {
        const net = this.net;
        if (!net) return;
        for (const ev of net.poll(dt)) {
            switch (ev.t) {
                case 'peerLeft':
                    // A match the rival walked out of is over: its result shows first.
                    if (this.phase === 'matchOver' || this.inGame) this.rivalLeft = true;
                    else {
                        this.disconnect('Your rival left the meadow');
                        return;
                    }
                    break;
                case 'closed':
                    this.disconnect('Lost the connection to the server');
                    return;
                case 'error':
                    this.disconnect(ev.msg);
                    return;
                case 'sel':
                    // The rival's cursor and pick (their picker is always our second).
                    this.pickers[1] = { index: ev.i, done: ev.done };
                    break;
                case 'round':
                    this.onlineRound(ev.n, ev.seed, ev.map, ev.fairies, ev.wins);
                    break;
                case 'f':
                    if (ev.n === this.roundNo) this.frames.push(...ev.fr);
                    break;
                case 'end':
                    if (ev.n === this.roundNo) this.roundEnd = { steps: ev.steps, winner: ev.winner, wins: ev.wins };
                    break;
                case 'result':
                    this.onlineResult(ev);
                    break;
            }
        }
    }

    /** The server dealt a round: the match's first (from fairy select) or the next. */
    private onlineRound(n: number, seed: number, map: string, fairies: [string, string], wins: [number, number]): void {
        this.roundNo = n;
        this.matchMap = map;
        if (!this.inGame || this.phase === 'matchOver') {
            // A new match: both picks, in the server's seat order.
            this.picks = [fairyById(fairies[0]) ?? FAIRIES[0], fairyById(fairies[1]) ?? FAIRIES[1]];
            this.beginMatch(seed);
            return;
        }
        this.wins = [wins[0], wins[1]];
        this.newRound(seed);
    }

    /**
     * What the server made of the match, for this player: their progress (it counts), the trophies, unlocks and
     * stages it earned, and the replay it kept. A rival who left forfeits; then the match ends here too.
     */
    private onlineResult(r: Extract<NetEvent, { t: 'result' }>): void {
        if (r.progress) this.adoptProgress(r.progress);
        this.trophyDelta = r.trophyDelta;
        this.newlyUnlocked = r.unlocked.map(id => fairyById(id)).filter((f): f is Fairy => !!f);
        this.newStages = r.newStages.map(id => mapById(id)?.name ?? id);
        this.lastReplayCode = r.code;
        if (this.phase !== 'matchOver') {
            for (const f of this.fields) f.settled = true;
            this.wins = [r.wins[0], r.wins[1]];
            this.phase = 'matchOver';
            this.phaseT = 0;
            this.transits = [];
            this.ui(this.wins[this.me] > this.wins[1 - this.me] ? 'win' : 'lose');
        }
        this.pickers[1].done = false;
    }

    /**
     * Send this player's controls to the server when they change (and now and then anyway): it plays every step
     * with each player's latest.
     */
    private sendControls(): void {
        const c = quantize(this.input.solo(this.fields[this.me].player));
        const packed = packControls(c);
        const key = packed.join(',');
        if (key !== this.sentControls || ++this.sentAgo >= 30) {
            this.net!.input(packed);
            this.sentControls = key;
            this.sentAgo = 0;
        }
    }

    /**
     * One step's time online: play the server's steps that have arrived (one a step, more to catch up when they've
     * piled up, none while waiting for them), then the round ends where the server says it did.
     */
    private stepOnline(dt: number): void {
        this.sendControls();
        const n = this.frames.length;
        const take = n === 0 ? 0 : n <= 3 ? 1 : n <= 8 ? 2 : n - 3;
        const round = this.round;
        for (let i = 0; i < take; i++) {
            const fr = this.frames.shift()!;
            if (!round.frozen(dt)) {
                round.share();
                round.advance(dt, unpackControls(fr?.[0]), unpackControls(fr?.[1]));
            }
            this.roundSteps++;
        }
        const end = this.roundEnd;
        if (end && this.roundSteps >= end.steps) {
            this.roundEnd = null;
            for (const f of this.fields) f.settled = true;
            this.roundWinner = end.winner < 0 ? -1 : (end.winner as 0 | 1);
            this.wins = [end.wins[0], end.wins[1]];
            this.ui(this.roundWinner === this.me ? 'win' : 'lose');
            const over = this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN;
            this.phase = over ? 'matchOver' : 'roundOver';
            this.phaseT = 0;
            this.transits = [];
            if (over) this.pickers[1].done = false;
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
        // Watching a replay: Esc leaves it; the panel's buttons and timeline, or their keys, do the rest.
        if (this.replay && this.inGame && !this.seeking) {
            if (pr.has('Escape')) {
                this.exitReplay();
                return;
            }
            if (this.replayControls(pr)) return;
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
                this.lobbyFocus = 'mode';
                // Ask again, so a mode, fairy or map just switched on or off (or new art) shows as such.
                this.refreshCatalog();
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
            this.stepProfile(pr);
            return;
        }
        if (this.phase === 'matchinfo') {
            this.stepMatchInfo(pr);
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
            this.stepLobby(pr);
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
        if (this.paused) {
            // A touchscreen has no P: a tap anywhere resumes.
            if (this.input.tap && (this.phase === 'playing' || this.phase === 'countdown')) this.paused = false;
            return;
        }
        this.phaseT += dt;

        if (this.online && this.phase !== 'playing' && pr.has('Escape')) {
            this.disconnect();
            return;
        }
        if (this.phase === 'countdown') {
            // Online, the server already has this player's controls when the round begins.
            if (this.online) this.sendControls();
            this.announceReady();
            if (this.phaseT > C.COUNTDOWN_TIME) {
                this.phase = 'playing';
                this.phaseT = 0;
                this.ui('start');
                this.announceFight();
            }
            return;
        }
        if (this.phase === 'roundOver' || this.phase === 'matchOver') {
            const go = this.phaseT > 1.2 && (pr.has('Space') || pr.has('Enter') || pr.has('KeyG') || pr.has('Pointer'));
            if (go || (this.phase === 'roundOver' && this.phaseT > 3.5)) {
                if (this.phase === 'matchOver') {
                    if (this.replay) this.exitReplay();
                    else if (this.online && this.rivalLeft) this.disconnect('Your rival left the meadow');
                    else this.start(this.mode);
                    return;
                }
                // Online, the server deals the next round. A new round starts untouched: its meadows first move with
                // the countdown over (a replay, checked by the server, plays them so too).
                if (!this.online) {
                    this.newRound();
                    return;
                }
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
        const round = this.round;
        if (round.frozen(dt)) return;
        round.share();
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
            c1 = quantize(this.vsCpu ? round.cpuControls(dt) : this.input.p2(this.fields[1].player));
            this.recorder?.step(c0, c1);
        }
        round.advance(dt, c0, c1);
        const [dead0, dead1] = round.dead;
        if (this.mode === 'endless') {
            if (dead0) this.endEndless();
        } else if (dead0 || dead1) this.endRound(dead0, dead1);
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
        // Shown at once by the game's own reckoning; the server's, from the replay, replaces it when it answers.
        const r = applyOutcome(this.progress, {
            mode: 'endless',
            wins: [0, 0],
            bestChain: this.fields[0].bestChain,
            fevers: this.fields[0].fevers,
            endless: { seconds: this.endlessT, guardians: this.endlessBosses },
        });
        this.endlessNew = r.endlessNew;
        this.newlyUnlocked = r.unlocked;
        saveProgress(this.progress);
        this.keepReplay();
        this.ui(this.endlessNew ? 'win' : 'lose');
        this.phase = 'matchOver';
        this.phaseT = 0;
        this.transits = [];
    }

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
            this.matchFevers += f.fevers;
        }
        const over = this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN;
        if (over && !this.replay) {
            this.recordMatch();
            this.keepReplay();
        }
        this.phase = over ? 'matchOver' : 'roundOver';
        this.phaseT = 0;
        this.transits = [];
        // The rival will pick again too; wait to hear from them.
        if (over && this.mode === 'online') this.pickers[1].done = false;
    }

    /** Save the finished match into progress and unlock any fairies it earned. */
    private recordMatch(): void {
        // Online matches are run and counted by the server, which sends what they earned (onlineResult).
        if (this.mode === 'online') return;
        // Shown at once by the game's own reckoning; the server's, from the replay, replaces it when it answers.
        const r = applyOutcome(this.progress, {
            mode: this.mode as MatchOutcome['mode'],
            wins: [this.wins[0], this.wins[1]],
            bestChain: this.matchBestChain,
            fevers: this.matchFevers,
        });
        this.trophyDelta = r.trophyDelta;
        this.newlyUnlocked = r.unlocked;
        this.newStages = r.newStages;
        saveProgress(this.progress);
    }

    /** Where the page's Back button goes in view units (a replay on an upright screen), or null where it's usual. */
    backAt: { x: number; y: number } | null = null;

    /** The Paused banner, telling the player how to carry on (a tap on the pause button, or P). */
    private pauseBanner(touch: boolean): void {
        this.r.banner({
            title: 'Paused',
            sub: touch ? 'Tap anywhere to resume' : 'Press P to resume',
            dim: 0.6,
            tone: 'blue',
            blinkSub: true,
        });
    }

    /** Draw the current screen. */
    draw(): void {
        const r = this.r;
        this.backAt = null;
        // Prompts follow whatever the player last used: a touchscreen or keys/pad.
        const touch = this.input.touchActive;
        // A portrait screen gets the tall layout: the menus are redrawn for it, and so is a
        // round with one player on the device. Two players sharing it keep the meadows side by side.
        const inRound = this.inGame;
        // The menus are laid out for the usual meadow width; only a round plays in wider ones.
        if (!inRound && C.FIELD_W !== C.FIELD_W_BASE) C.setFieldWidth(C.FIELD_W_BASE);
        if (!inRound && C.FIELD_H !== C.FIELD_H_BASE) C.setFieldHeight(C.FIELD_H_BASE);
        r.inMenu = !inRound;
        if (!inRound) {
            r.fillRound = false;
            r.meadowBleed = 0;
        }
        // A replay recorded in wider meadows stays side by side even if the screen turns upright mid-round.
        // A round in taller meadows (rival hidden) stays tall even if the screen turns sideways.
        const soloTall = inRound && this.rivalHidden;
        // A replay on an upright screen always takes the tall layout, its meadows scaled to fit whatever size
        // they were recorded at.
        const watching = inRound && this.replay !== null;
        r.layout =
            soloTall ||
            (r.portrait && (watching || (!(inRound && this.mode === 'versus') && C.FIELD_W <= C.FIELD_W_STD)))
                ? 'tall'
                : 'wide';
        // Endless side by side: one meadow in the middle, between its panels.
        const endless = inRound && this.mode === 'endless';
        // A replay wider than the screen follows this player's fairy (the second seat's, watching an online match
        // from it).
        const own = this.online && this.me === 1 ? 1 : 0;
        const tall =
            r.layout === 'tall'
                ? tallPlacement(r.viewH, watching, soloTall || endless, this.fields[own].player.x)
                : null;
        // With the rival's meadow hidden it's placed far off screen, so nothing of it (or flying to it) shows.
        const offscreen: Placement = { x: 0, y: -10000, s: tall ? tall.at[0].s : 1 };
        const ew = !tall && endless ? endlessWide() : null;
        let at: readonly [Placement, Placement] = !tall
            ? ew
                ? [ew, offscreen]
                : wide()
            : soloTall || endless
              ? [tall.at[0], offscreen]
              : // Online in the second seat, your meadow is the second: it takes the big place at the bottom.
                this.me === 1
                ? [tall.at[1], tall.at[0]]
                : tall.at;
        if (tall) r.tallBand = tall.band;
        // A replay recorded in meadows narrower than this screen, or an online round (always the usual width), keeps
        // them centred, the view filling the screen.
        r.fillRound = r.layout === 'wide';
        r.roundW = r.fillRound && endless ? C.FIELD_W * at[0].s : 0;
        r.begin();
        // On a screen wider than the meadows they zoom in to fill its width (up to WIDE_ZOOM_MAX), standing on its
        // foot with the top of the meadow (where critters glide in) running off the top; their top plates stay
        // pinned at the top of the screen. Past that zoom they reach out to its edges: their scenery and bars, not
        // their play. Endless's sides hold its stats instead.
        r.hudLift = 0;
        if (r.fillRound && !endless) {
            const s = at[0].s * Math.max(1, Math.min(C.WIDE_ZOOM_MAX, r.viewW / C.VIEW_W)),
                x = (C.VIEW_W - (2 * C.FIELD_W + C.GAP) * s) / 2,
                y = Math.min(0, C.VIEW_H - C.FIELD_H * s);
            at = [
                { x, y, s },
                { x: x + (C.FIELD_W + C.GAP) * s, y, s },
            ];
            r.hudLift = -y;
        }
        r.wideAt = r.fillRound && !endless ? at : null;
        r.meadowBleed = r.fillRound && !endless ? Math.max(0, r.viewX + at[0].x) : 0;
        const solo = this.mode !== 'versus';
        // Online the meadows keep the server's seat order (and colours); YOU is whichever is this player's.
        const tags: [HudTag, HudTag] = this.online
            ? [
                  { label: this.me === 0 ? 'YOU' : 'RIVAL', color: PLAYER_COLORS.p1 },
                  { label: this.me === 1 ? 'YOU' : 'RIVAL', color: PLAYER_COLORS.p2 },
              ]
            : [
                  { label: solo ? 'YOU' : '1P', color: PLAYER_COLORS.p1 },
                  this.vsCpu ? { label: 'CPU', color: PLAYER_COLORS.cpu } : { label: '2P', color: PLAYER_COLORS.p2 },
              ];
        // Watching a replay on an upright screen, the page's Back button sits at the top left, above the rival's
        // meadow, clear of the round banners; a lone meadow's (Endless) sits just under its top plate, below her face.
        const mine = at[own];
        const hs = Math.min(mine.s, C.TALL_OWN_S);
        // Side by side, the left meadow's plate starts at the screen's left edge (it reaches out there when the
        // meadows are narrower than the screen), so Back goes under the face there.
        this.backAt = !watching
            ? null
            : tall
              ? soloTall || endless
                  ? { x: Math.max(0, mine.x) + 3 * hs, y: mine.y + 23 * hs }
                  : { x: 4, y: 4 }
              : { x: (endless ? r.viewX + mine.x : 0) + 3 * mine.s, y: mine.y + r.hudLift + 23 * mine.s };
        // A wider recording shrunk to fit an upright screen has its scenery reach up to the band and down to the foot
        // (both meadows' when it's shown side by side).
        r.consoleAt = tall?.console ?? null;
        for (const i of [0, 1] as const) {
            if (i === 1 && (soloTall || endless)) continue;
            if (tall && (i === own || tall.console)) {
                r.riseTop = tall.rise;
                r.riseBottom = tall.sink;
            }
            r.field(this.fields[i], at[i].x, this.wins[i], this.time, tags[i], at[i].y, at[i].s);
            r.riseTop = r.riseBottom = 0;
        }
        // Watching a wider recording upright, a hint for a moment that turning the phone shows it full size.
        if (tall && tall.rise > 0 && watching && this.time - this.watchStarted < ROTATE_HINT_TIME)
            r.rotateHint(at[own].y - 14, Math.min(1, (ROTATE_HINT_TIME - (this.time - this.watchStarted)) / 0.6));
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
                ew,
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

        const you = this.me,
            them = (1 - this.me) as 0 | 1;
        const names = this.vsCpu
            ? ['You', `CPU ${this.picks[1].name}`]
            : this.mode === 'online'
              ? you === 0
                  ? ['You', `Rival ${this.picks[1].name}`]
                  : [`Rival ${this.picks[0].name}`, 'You']
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
            case 'matchinfo': {
                const e = this.history[this.historyIndex];
                if (e) r.matchInfo(this.matchInfo(e, touch), this.time);
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
                        tab: this.profileTab,
                        history: this.history.map(e => this.historyRow(e)),
                        index: this.historyIndex,
                        start: this.historyStart,
                        message: this.historyMessage,
                    },
                    this.time,
                );
                break;
            case 'modes':
                r.lobby(
                    {
                        touch,
                        name: this.account.name,
                        fairy: this.account.look.avatar,
                        frame: this.account.look.frame,
                        wins: this.progress.wins,
                        trophies: this.progress.trophies,
                        online: this.account.online,
                        stages: [MAPS.filter((_, i) => this.mapOpen(i)).length, MAPS.length],
                        next: this.nextStage,
                        modes: this.lobbyModes,
                        picking: this.picking,
                        pick: this.lobbyMode,
                        roadOpen: this.roadOpen,
                        roadScroll: this.roadScroll,
                        best: this.bestTrophies,
                        focus: this.lobbyFocus,
                        nav: this.lobbyNav,
                        stageNo: (this.openStages[this.lobbyStageAt] ?? 0) + 1,
                        stageAt: this.lobbyStageAt,
                        map: this.lobbyMap,
                        mapName: mapById(this.lobbyMap)?.name ?? '',
                        chat: this.chatLines,
                        chatOpen: this.chatOpen,
                        friendsOpen: this.friendsOpen,
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
                        ? 'CHOOSE YOUR CHAMPIONS'
                        : this.mode === 'online' && p1.done && !p2.done
                          ? 'WAITING FOR YOUR RIVAL…'
                          : 'CHOOSE YOUR CHAMPION';
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
                // Each banner while the announcer says it: the round's call, then Ready (Fight! comes with play).
                const ready = () =>
                    r.banner({
                        title: 'Ready',
                        age: this.phaseT - this.callReadyAt,
                        dim: 0.2,
                        size: 36,
                        tone: 'gold',
                    });
                if (this.mode === 'endless') {
                    if (this.phaseT < this.callReadyAt)
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
                    else ready();
                    break;
                }
                const final = this.wins[0] === C.ROUNDS_TO_WIN - 1 && this.wins[1] === C.ROUNDS_TO_WIN - 1;
                if (this.phaseT < this.callReadyAt)
                    r.banner({
                        title: final ? 'Final round' : `Round ${played + 1}`,
                        sub: `${this.picks[0].name}  vs  ${this.picks[1].name}`,
                        age: this.phaseT,
                        dim: 0.35,
                        tone: final ? 'pink' : 'gold',
                    });
                else ready();
                break;
            }
            case 'playing':
                // Paused: the pause banner over everything. Otherwise Fight!: as play starts, with the announcer,
                // fading off the meadows.
                if (this.paused) this.pauseBanner(touch);
                else if (this.phaseT < FIGHT_BANNER_TIME)
                    r.banner({ title: 'Fight!', age: this.phaseT, dim: 0.1, size: 40, tone: 'pink' });
                break;
            case 'roundOver': {
                const w = this.roundWinner;
                const title = w < 0 ? 'Draw' : solo && w === you ? 'You take the round' : `${names[w]} takes the round`;
                r.banner({
                    title,
                    sub: 'Next round starting',
                    age: this.phaseT,
                    dim: 0.5,
                    size: 24,
                    tone: solo && w === them ? 'pink' : 'gold',
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
                const title = solo ? (w === you ? 'You win!' : `${names[w]} wins`) : `${names[w]} wins!`;
                // Under the result: trophies won or lost, and anything the match opened up.
                const notes: string[] = [];
                if (this.rivalLeft) notes.push('Your rival left');
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
                    tone: solo && w === them ? 'pink' : 'gold',
                    blinkSub: true,
                });
                break;
            }
            default:
                if (this.paused) this.pauseBanner(touch);
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
                    mini: this.replayMini,
                },
                this.time,
            );
        }
    }
}
