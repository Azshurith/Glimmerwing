// What the server does to a chat message before keeping it: control characters out, spaces tidied, the length
// capped, and a short list of slurs and swear words (English and Filipino) masked with stars.

/** The longest message kept, in characters. */
export const CHAT_MAX = 140;

/** Words masked wherever they appear inside a word, case aside. */
const MASKED = [
    'fuck',
    'shit',
    'bitch',
    'cunt',
    'nigger',
    'nigga',
    'faggot',
    'retard',
    'putangina',
    'tangina',
    'puta',
    'gago',
    'ulol',
    'pakyu',
    'kupal',
    'tarantado',
];
const PATTERN = new RegExp(MASKED.join('|'), 'gi');

/** A message as it's kept: cleaned, capped and masked; empty when nothing's left of it. */
export function cleanChat(v: unknown): string {
    const s = String(v ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return [...s]
        .slice(0, CHAT_MAX)
        .join('')
        .replace(PATTERN, w => '*'.repeat(w.length));
}
