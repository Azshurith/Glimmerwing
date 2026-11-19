// The lobby's chat panel (#chat in index.template.html): World chat for now, with tabs for the channels coming
// next (Friends, Lobby, Guild). Each message shows its writer's avatar in their frame, and sits in their bubble;
// Style opens a picker for the player's own (any fairy they've unlocked; frames and bubbles open on the trophy road,
// see data/looks.ts). It asks the server for new messages every few seconds while the lobby shows (more often while
// the panel's open), so the lobby's ticker has the latest lines too, and sends what the player types.
import { FAIRIES } from '@/data/characters';
import { BUBBLES, FRAMES } from '@/data/looks';
import type { LookStyle } from '@/data/looks';
import type { Account } from '@/game/account';
import type { Game } from '@/game/game';
import { ApiError, apiCall } from '@/net/api';
import { avatarUrl } from '@/render/avatars';
import type { ChatMessage, PlayerLook } from '@/types';

/** How often new messages are asked for (ms): with the panel open, and with it closed (for the ticker). */
const POLL_OPEN = 2500;
const POLL_CLOSED = 8000;
/** The most messages kept and shown. */
const KEEP = 100;

/** What the panel needs from the page. */
interface ChatPanelDeps {
    game: Game;
    account: Account;
    /** Where focus goes back to when the panel closes. */
    canvas: HTMLCanvasElement;
}

/** What the channels still to come say when their tab is picked. */
const SOON: Record<string, string> = {
    friends: 'Messages with your friends are coming with friends.',
    lobby: 'Lobby chat is coming for online rooms.',
    guild: 'Guild chat is coming with guilds.',
};

/**
 * The frame and bubble styles, made from their colours in data/looks.ts: a frame is a ring (one that's earned on
 * the trophy road turns, in a gradient of its colours, and glows); a bubble is a gradient in its colour with an
 * edge of its second colour (the later ones glow).
 */
function lookStyles(): string {
    const frames = FRAMES.map(f => {
        const [a, b] = f.colors;
        const ring = f.trophies
            ? `conic-gradient(from var(--spin, 0deg), ${a}, ${b}, ${a}, ${b}, ${a})`
            : `linear-gradient(160deg, ${a}, ${b})`;
        const glow = f.trophies >= 600 ? `box-shadow: 0 0 0.45em ${a};` : '';
        const spin = f.trophies ? 'animation: ava-spin 4s linear infinite;' : '';
        return `.ava.frame-${f.id} { background: ${ring}; ${glow} ${spin} }`;
    });
    const bubbles = BUBBLES.map(bb => {
        const [a, b] = bb.colors;
        const glow = bb.trophies >= 600 ? `box-shadow: 0 0 0.5em ${b}66;` : '';
        return `.bubble.bubble-${bb.id} { background: linear-gradient(135deg, ${a}, ${a}cc 60%, ${b}55); border: 1px solid ${b}; ${glow} }`;
    });
    return [
        '@property --spin { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
        '@keyframes ava-spin { to { --spin: 360deg; } }',
        ...frames,
        ...bubbles,
    ].join('\n');
}

/** An avatar in a frame, as the page shows it. */
function avatar(fairy: string, frame: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = `ava frame-${frame}`;
    const img = document.createElement('img');
    img.src = avatarUrl(fairy);
    img.alt = '';
    span.append(img);
    return span;
}

/** A message as the page shows it: the avatar in its frame, the name and time, and the bubble. */
function messageItem(name: string, body: string, look: PlayerLook, at: string | null, mine: boolean): HTMLElement {
    const li = document.createElement('li');
    if (mine) li.className = 'mine';
    const main = document.createElement('div');
    main.className = 'msg-main';
    const head = document.createElement('div');
    head.className = 'msg-head';
    const who = document.createElement('b');
    who.textContent = name;
    head.append(who);
    if (at) {
        const when = document.createElement('time');
        when.dateTime = at;
        when.textContent = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        head.append(when);
    }
    const bubble = document.createElement('p');
    bubble.className = `bubble bubble-${look.bubble}`;
    bubble.textContent = body;
    main.append(head, bubble);
    li.append(avatar(look.avatar, look.frame), main);
    return li;
}

/**
 * Wire up the chat panel; returns `sync`, which the page calls every frame: it shows or hides the panel as the
 * game's lobby and its `chatOpen` say, and keeps the polling going while the lobby is up.
 */
export function initChatPanel(d: ChatPanelDeps): { sync: () => void } {
    const root = document.getElementById('chat')!;
    const log = root.querySelector<HTMLOListElement>('.chat-log')!;
    const note = root.querySelector<HTMLParagraphElement>('.chat-note')!;
    const form = root.querySelector<HTMLFormElement>('.chat-form')!;
    const input = form.querySelector<HTMLInputElement>('input')!;
    const send = form.querySelector<HTMLButtonElement>('button')!;
    const styleBtn = root.querySelector<HTMLButtonElement>('.chat-style-btn')!;
    const stylePane = root.querySelector<HTMLDivElement>('.chat-style')!;
    const preview = stylePane.querySelector<HTMLDivElement>('.chat-preview')!;
    const css = document.createElement('style');
    css.textContent = lookStyles();
    document.head.append(css);
    let messages: ChatMessage[] = [];
    let last = 0,
        timer = 0,
        busy = false,
        shown = false,
        polling = false,
        noteTimer = 0;

    /** Say something under the log for a few seconds. */
    const say = (text: string) => {
        note.textContent = text;
        clearTimeout(noteTimer);
        noteTimer = window.setTimeout(() => (note.textContent = ''), 4000);
    };

    /** Add messages to the log (and the lobby's ticker), scrolling to the newest if the log was at the bottom. */
    const add = (got: ChatMessage[]) => {
        const fresh = got.filter(m => m.id > last);
        if (!fresh.length) return;
        last = fresh[fresh.length - 1].id;
        messages = [...messages, ...fresh].slice(-KEEP);
        d.game.chatLines = messages.slice(-4).map(m => ({ name: m.name, body: m.body }));
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        for (const m of fresh) log.append(messageItem(m.name, m.body, m.look, m.at, m.playerId === d.account.id));
        while (log.children.length > KEEP) log.firstElementChild?.remove();
        if (atBottom || fresh.some(m => m.playerId === d.account.id)) log.scrollTop = log.scrollHeight;
    };

    /** Ask the server for World chat's messages newer than the last one here. */
    const poll = async () => {
        const base = d.account.apiBase;
        if (!base || busy) return;
        busy = true;
        try {
            add(await apiCall<ChatMessage[]>(base, 'GET', `/chat/world?after=${last}&limit=50`));
        } catch {
            /* try again next time */
        } finally {
            busy = false;
        }
    };

    /** Keep asking while the lobby shows: every POLL_OPEN with the panel open, POLL_CLOSED without. */
    const schedule = () => {
        clearTimeout(timer);
        if (!polling) return;
        timer = window.setTimeout(
            async () => {
                await poll();
                schedule();
            },
            shown ? POLL_OPEN : POLL_CLOSED,
        );
    };

    /** Fill the Style picker: a preview of the player's own message, then the avatars, frames and bubbles. */
    const drawStyle = () => {
        const look = d.account.look;
        preview.replaceChildren(...messageItem(d.account.name, 'Hello, meadow!', look, null, false).childNodes);
        const best = d.game.bestTrophies;
        /** A choice button: its picture, its name (or what it needs), and whether it's open and worn. */
        const pick = (picture: HTMLElement, label: string, open: boolean, worn: boolean, wear: () => void) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pick';
            b.disabled = !open;
            b.setAttribute('aria-pressed', String(worn));
            const small = document.createElement('small');
            small.textContent = label;
            b.append(picture, small);
            b.addEventListener('click', wear);
            return b;
        };
        /** Wear a changed look: shown at once, then the server's word (which can turn it down). */
        const wear = async (change: Partial<PlayerLook>) => {
            const why = await d.account.saveLook({ ...d.account.look, ...change });
            if (why) say(why);
            drawStyle();
        };
        /** What a style says under it: its name, or the trophies it needs. */
        const label = (st: LookStyle) => (best >= st.trophies ? st.name : `${st.trophies} trophies`);
        const panes = stylePane.querySelectorAll<HTMLDivElement>('.chat-picks');
        panes[0].replaceChildren(
            ...FAIRIES.map(f => {
                const open = d.game.isUnlocked(f);
                return pick(
                    avatar(f.id, look.frame),
                    open ? f.name : 'Locked',
                    open,
                    look.avatar === f.id,
                    () => void wear({ avatar: f.id }),
                );
            }),
        );
        panes[1].replaceChildren(
            ...FRAMES.map(f =>
                pick(
                    avatar(look.avatar, f.id),
                    label(f),
                    best >= f.trophies,
                    look.frame === f.id,
                    () => void wear({ frame: f.id }),
                ),
            ),
        );
        panes[2].replaceChildren(
            ...BUBBLES.map(bb => {
                const bubble = document.createElement('p');
                bubble.className = `bubble bubble-${bb.id}`;
                bubble.textContent = 'Hi!';
                return pick(
                    bubble,
                    label(bb),
                    best >= bb.trophies,
                    look.bubble === bb.id,
                    () => void wear({ bubble: bb.id }),
                );
            }),
        );
    };

    /** Show the Style picker in place of the log, or the log again. */
    const showStyle = (on: boolean) => {
        styleBtn.setAttribute('aria-pressed', String(on));
        stylePane.hidden = !on;
        log.hidden = on;
        if (on) drawStyle();
    };

    /** A pending slide-out hide, if any. */
    let closeTimer = 0;
    /** Finish hiding once the slide-out ends (the timeout covers a missed event). */
    const finishClose = (e?: AnimationEvent) => {
        if (e && e.target !== root) return;
        root.removeEventListener('animationend', finishClose);
        clearTimeout(closeTimer);
        if (root.classList.contains('closing')) root.hidden = true;
        root.classList.remove('closing');
    };
    /** Stop a slide-out in progress (for when the panel reopens mid-close). */
    const cancelClose = () => {
        root.removeEventListener('animationend', finishClose);
        clearTimeout(closeTimer);
        root.classList.remove('closing');
    };
    /** Hide the panel, sliding it back out first (at once for reduced motion). */
    const requestClose = () => {
        if (root.hidden || root.classList.contains('closing')) return;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            root.hidden = true;
            return;
        }
        root.classList.add('closing');
        root.addEventListener('animationend', finishClose);
        clearTimeout(closeTimer);
        closeTimer = window.setTimeout(finishClose, 350);
    };

    /** Send what the player typed. */
    const submit = async (e: SubmitEvent) => {
        e.preventDefault();
        const text = input.value.trim();
        const base = d.account.apiBase,
            token = d.account.token;
        if (!text) return;
        if (!base || !token) {
            say('Chat needs the game server.');
            return;
        }
        showStyle(false);
        send.disabled = true;
        try {
            const m = await apiCall<ChatMessage>(base, 'POST', '/chat/world', { body: text }, token);
            input.value = '';
            await poll();
            add([m]);
        } catch (err) {
            say(err instanceof ApiError ? err.message : "Couldn't reach the game server.");
        } finally {
            send.disabled = false;
            input.focus();
        }
    };
    form.addEventListener('submit', e => void submit(e));

    for (const tab of root.querySelectorAll<HTMLButtonElement>('.chat-tab')) {
        tab.addEventListener('click', () => {
            const soon = SOON[tab.dataset.ch ?? ''];
            if (soon) say(soon);
            else showStyle(false);
        });
    }
    styleBtn.addEventListener('click', () => showStyle(!!stylePane.hidden));
    root.querySelector('.chat-close')!.addEventListener('click', () => d.game.setChatOpen(false));
    // Esc in the panel closes the picker, then the panel; other keys stay with the panel (the game ignores them).
    root.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        if (!stylePane.hidden) showStyle(false);
        else d.game.setChatOpen(false);
    });

    return {
        sync() {
            const inLobby = d.game.phaseName === 'modes';
            const open = inLobby && d.game.chatOpen;
            if (inLobby !== polling) {
                polling = inLobby;
                if (polling) void poll();
                schedule();
            }
            if (open === shown) return;
            shown = open;
            if (open) {
                cancelClose();
                root.hidden = false;
                const can = !!d.account.apiBase;
                input.disabled = send.disabled = !can;
                input.placeholder = can ? 'Say something to everyone…' : 'Chat needs the game server';
                showStyle(false);
                log.scrollTop = log.scrollHeight;
                void poll();
                // Straight into typing on a keyboard; a phone waits for a tap, so its keyboard doesn't jump up.
                if (!matchMedia('(pointer: coarse)').matches) input.focus();
            } else {
                requestClose();
                d.canvas.focus();
            }
            schedule();
        },
    };
}
