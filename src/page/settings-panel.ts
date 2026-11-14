// The Settings panel (#settings in index.template.html): Audio (music and effects volume, sound on/off),
// Display (fullscreen, hiding the rival's meadow) and Controls (the keyboard keys, rebindable per scheme).
import type { Sound } from '@/audio/sound';
import type { Game } from '@/game/game';
import type { Input } from '@/input/input';
import { KEY_ACTIONS, KEYS_PER_ACTION, RESERVED_KEYS, defaultKeys, keyLabel } from '@/input/keys';
import type { KeyAction, KeyBindings, KeyScheme } from '@/types';

/** What the panel needs from the page. */
interface SettingsPanelDeps {
    game: Game;
    sound: Sound;
    input: Input;
    /** Where focus goes back to when the panel closes. */
    canvas: HTMLCanvasElement;
    /** Real fullscreen: whether the browser has it, whether it's on, and switching it. */
    fullscreen: { supported: boolean; isOn: () => boolean; enter: () => void; exit: () => void };
}

/** The panel's controls, looked up once. */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Wire up the Settings panel; returns `open` (for the main menu's Settings card) and `sync` (called each frame). */
export function initSettingsPanel(d: SettingsPanelDeps): { open: () => void; sync: () => void } {
    const el = $<HTMLElement>('settings');
    const music = $<HTMLInputElement>('set-music'),
        musicVal = $<HTMLOutputElement>('set-music-val'),
        sfx = $<HTMLInputElement>('set-sfx'),
        sfxVal = $<HTMLOutputElement>('set-sfx-val'),
        soundBox = $<HTMLInputElement>('set-sound'),
        fullBox = $<HTMLInputElement>('set-full'),
        fullRow = $<HTMLElement>('set-full-row'),
        hideRival = $<HTMLInputElement>('set-hide-rival'),
        keysEl = $<HTMLElement>('set-keys');
    let scheme: KeyScheme = 'solo';
    /** The key button waiting for a key press, if any. */
    let listening: { btn: HTMLButtonElement; action: KeyAction; slot: number } | null = null;

    // ---- tabs ----
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('#settings .set-tab')];
    /** Show the tab named `name`. */
    const showTab = (name: string) => {
        stopListening();
        for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
        for (const p of document.querySelectorAll<HTMLElement>('#settings .set-pane'))
            p.hidden = p.dataset.pane !== name;
    };
    for (const t of tabs) t.addEventListener('click', () => showTab(t.dataset.tab ?? 'audio'));

    // ---- audio ----
    /** Show a slider's value: its fill and the percentage beside it. */
    const showVol = (r: HTMLInputElement | null, out: HTMLOutputElement | null) => {
        if (!r) return;
        r.style.setProperty('--p', `${r.value}%`);
        if (out) out.textContent = `${r.value}%`;
    };
    let lastBlip = 0;
    music?.addEventListener('input', () => {
        d.sound.unlock();
        d.sound.setMusicVolume(Number(music.value) / 100);
        showVol(music, musicVal);
    });
    sfx?.addEventListener('input', () => {
        d.sound.unlock();
        d.sound.setVolume(Number(sfx.value) / 100);
        showVol(sfx, sfxVal);
        // A sample of the new level, not too often while dragging.
        const now = performance.now();
        if (now - lastBlip > 120) {
            lastBlip = now;
            d.sound.play('pop', 5);
        }
    });
    soundBox?.addEventListener('change', () => {
        d.sound.unlock();
        if (soundBox.checked === d.sound.muted) d.sound.toggleMute();
    });

    // ---- display ----
    if (fullRow && !d.fullscreen.supported) fullRow.hidden = true;
    fullBox?.addEventListener('change', () => (fullBox.checked ? d.fullscreen.enter() : d.fullscreen.exit()));
    hideRival?.addEventListener('change', () => d.game.setSettings({ hideRival: hideRival.checked }));

    // ---- controls ----
    const schemeBtns = [...document.querySelectorAll<HTMLButtonElement>('#settings .set-scheme')];
    for (const b of schemeBtns)
        b.addEventListener('click', () => {
            scheme = (b.dataset.scheme as KeyScheme) ?? 'solo';
            for (const o of schemeBtns) o.setAttribute('aria-pressed', String(o === b));
            drawKeys();
        });

    /** Save new bindings and hand them to the input. */
    const commit = (keys: KeyBindings) => {
        d.game.setSettings({ keys });
        d.input.setBindings(keys);
        drawKeys();
    };

    /** Rebuild the key table for the current scheme. */
    function drawKeys(): void {
        if (!keysEl) return;
        listening = null;
        keysEl.textContent = '';
        const b = d.game.settings.keys[scheme];
        for (const { action, label } of KEY_ACTIONS) {
            const name = document.createElement('span');
            name.className = 'set-name';
            name.textContent = label;
            keysEl.append(name);
            for (let slot = 0; slot < KEYS_PER_ACTION; slot++) {
                const code = b[action][slot];
                const btn = document.createElement('button');
                btn.className = 'set-key' + (code ? '' : ' empty');
                btn.textContent = code ? keyLabel(code) : '—';
                btn.setAttribute('aria-label', `${label}, key ${slot + 1}: ${code ? keyLabel(code) : 'none'}`);
                btn.addEventListener('click', () => listen(btn, action, slot));
                keysEl.append(btn);
            }
        }
    }

    /** Wait for the next key press to bind to `action`'s `slot`. */
    function listen(btn: HTMLButtonElement, action: KeyAction, slot: number): void {
        stopListening();
        listening = { btn, action, slot };
        btn.classList.add('listening');
        btn.textContent = 'Press…';
    }

    /** Stop waiting for a key, putting the button back as it was. */
    function stopListening(): void {
        if (!listening) return;
        listening = null;
        drawKeys();
    }

    /** Bind `code` to the waiting slot (null clears it), taking it off anything else that used it. */
    function bind(code: string | null): void {
        if (!listening) return;
        const { action, slot } = listening;
        const keys = structuredClone(d.game.settings.keys);
        if (code) {
            // A key does one thing: off any other action here, and off the other player's keys when two share
            // the keyboard.
            const clash: KeyScheme[] = scheme === 'solo' ? ['solo'] : ['p1', 'p2'];
            for (const s of clash)
                for (const { action: a } of KEY_ACTIONS) keys[s][a] = keys[s][a].filter(k => k !== code);
        }
        const list = keys[scheme][action].slice();
        if (code) list[Math.min(slot, list.length)] = code;
        else list.splice(slot, 1);
        keys[scheme][action] = list.filter(Boolean).slice(0, KEYS_PER_ACTION);
        listening = null;
        commit(keys);
    }

    $<HTMLButtonElement>('set-keys-reset')?.addEventListener('click', () => {
        const keys = structuredClone(d.game.settings.keys);
        keys[scheme] = defaultKeys()[scheme];
        commit(keys);
    });

    // While a key button waits, the next key press is the new key (caught before anything else sees it).
    window.addEventListener(
        'keydown',
        e => {
            if (!el || el.hidden) return;
            if (listening) {
                e.preventDefault();
                e.stopPropagation();
                if (e.code === 'Escape') stopListening();
                else if (e.code === 'Backspace' || e.code === 'Delete') bind(null);
                else if (!RESERVED_KEYS.has(e.code)) bind(e.code);
                return;
            }
            if (e.code === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        },
        true,
    );

    /** Close the panel and give the game the keyboard back. */
    function close(): void {
        if (!el) return;
        stopListening();
        el.hidden = true;
        d.canvas.focus();
    }
    $<HTMLButtonElement>('settings-close')?.addEventListener('click', close);

    let shownMuted: boolean | null = null;
    return {
        open() {
            if (!el) return;
            if (music) music.value = String(Math.round(d.sound.musicVolume * 100));
            if (sfx) sfx.value = String(Math.round(d.sound.volume * 100));
            showVol(music, musicVal);
            showVol(sfx, sfxVal);
            if (soundBox) soundBox.checked = !d.sound.muted;
            if (fullBox) fullBox.checked = d.fullscreen.isOn();
            if (hideRival) hideRival.checked = d.game.settings.hideRival;
            drawKeys();
            showTab('audio');
            el.hidden = false;
            tabs[0]?.focus();
        },
        sync() {
            // M (or anything else) can change mute while the panel is open; and fullscreen can end on its own.
            if (soundBox && d.sound.muted !== shownMuted) {
                shownMuted = d.sound.muted;
                soundBox.checked = !shownMuted;
            }
            if (fullBox && el && !el.hidden) fullBox.checked = d.fullscreen.isOn();
        },
    };
}
