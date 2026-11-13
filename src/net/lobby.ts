import type { Game } from '@/game/game';
import type { NetEvent } from '@/types';
import { Net, serverUrl } from './net';

/**
 * The "Play online" panel over the canvas: Find match (random rival) or
 * Friend versus (create a room code, or join one). Once the server pairs
 * us, it hands the connection to the Game and gets out of the way.
 */
export class Lobby {
    private el = document.getElementById('lobby')!;
    private status = document.getElementById('lobby-status')!;
    private codeOut = document.getElementById('lobby-code')!;
    private codeIn = document.getElementById('lobby-join-code') as HTMLInputElement;
    private net: Net | null = null;
    private timer = 0;

    constructor(private game: Game) {
        document.getElementById('lobby-quick')!.addEventListener(
            'click',
            () =>
                void this.go(n => {
                    n.quick();
                    this.say('Looking for a rival…');
                }),
        );
        document.getElementById('lobby-host')!.addEventListener(
            'click',
            () =>
                void this.go(n => {
                    n.host();
                    this.say('Making a room…');
                }),
        );
        document.getElementById('lobby-join')!.addEventListener('submit', e => {
            e.preventDefault();
            const code = this.codeIn.value.trim().toUpperCase();
            if (code.length !== 4) {
                this.say('Room codes are four letters.');
                this.codeIn.focus();
                return;
            }
            void this.go(n => {
                n.join(code);
                this.say(`Joining ${code}…`);
            });
        });
        this.codeIn.addEventListener('input', () => {
            this.codeIn.value = this.codeIn.value.toUpperCase().replace(/[^A-Z]/g, '');
        });
        document.getElementById('lobby-close')!.addEventListener('click', () => this.close());
        this.el.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.close();
        });
        // Arriving through a shared link (?room=ABCD) drops you straight into that room.
        const room = new URLSearchParams(location.search).get('room');
        if (room) {
            this.open();
            this.codeIn.value = room.toUpperCase();
            this.el.querySelector('form')!.requestSubmit();
        }
    }

    /** Show the Play online panel. */
    open(): void {
        this.el.hidden = false;
        this.codeOut.hidden = true;
        this.say('');
        (document.getElementById('lobby-quick') as HTMLButtonElement).focus();
    }

    /** Hide the panel and leave any queue or room. */
    close(): void {
        this.stop();
        if (this.net) {
            this.net.leave();
            this.net.close();
            this.net = null;
        }
        this.el.hidden = true;
        (document.getElementById('game') as HTMLCanvasElement).focus();
    }

    /** Show a status line in the panel. */
    private say(text: string): void {
        this.status.textContent = text;
    }

    /** Connect if needed, then ask the server for something. */
    private async go(ask: (n: Net) => void): Promise<void> {
        this.codeOut.hidden = true;
        if (!this.net?.connected) {
            this.net?.close();
            this.net = new Net();
            this.say('Connecting…');
            try {
                await this.net.connect();
            } catch {
                this.say(`Couldn't reach the game server (${serverUrl()}). Is it running?`);
                this.net = null;
                return;
            }
        }
        ask(this.net);
        this.stop();
        this.timer = window.setInterval(() => this.pump(), 50);
    }

    /** Stop polling the server. */
    private stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = 0;
        }
    }

    /** Handle server events while in the lobby, and hand the rest to the game once matched. */
    private pump(): void {
        const net = this.net;
        if (!net) return;
        const events = net.poll(0.05);
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (this.handle(ev)) {
                // Paired: whatever arrived after the pairing belongs to the game.
                net.requeue(events.slice(i + 1));
                this.stop();
                this.net = null;
                this.el.hidden = true;
                (document.getElementById('game') as HTMLCanvasElement).focus();
                this.game.startOnline(net);
                return;
            }
        }
    }

    /** Returns true once we're matched. */
    private handle(ev: NetEvent): boolean {
        switch (ev.t) {
            case 'queued':
                this.say('Looking for a rival… (anyone else who presses Find match gets paired with you)');
                break;
            case 'hosted': {
                this.codeOut.hidden = false;
                this.codeOut.textContent = ev.code;
                if (location.protocol.startsWith('http')) {
                    const link = new URL(location.href);
                    link.searchParams.set('room', ev.code);
                    this.say(`Send your friend this code, or the link: ${link.href}`);
                } else this.say('Send your friend this code. They pick Play online, type it in and press Join.');
                break;
            }
            case 'error':
                this.say(ev.msg);
                break;
            case 'closed':
                this.say('Lost the connection to the server.');
                this.stop();
                this.net = null;
                break;
            case 'matched':
                return true;
        }
        return false;
    }
}
