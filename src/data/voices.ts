// Fairies' voices: a few spoken lines for each moment, played by Game.voice through Sound.speak. The moments are
// picked on fairy select, a level-2 charge shot, a level-3 one that summons her guardian, Fever, taking a hit,
// going down, winning a round, and shooting a volley of fireballs back. Clips are inlined as data URLs like the
// music; a fairy without a voice, or a moment without lines, stays silent.
//
// Stella's lines were cut from one recording (assets/source/voices/stella-hana.mp3, in the order below):
//   pick:    Ready? Let's shine! / Stella is here! / Let's make this magical! / You can count on me! /
//            Hehe! Let's play!
//   charge:  STAR BURST! / Take this! / Shining blast! / Meteor shower! / Let it shine!
//   summon:  Guardian of the stars, AWAKEN! / Come forth, celestial guardian! / Answer my call! /
//            Unleash your power! / By the light of the stars, ARISE!
//   fever:   FEVER TIME! / My stars are shining! / This is my moment! / Let's shine brighter! /
//            Nothing can stop me now!
//   hit:     Ah! / Ouch! / Hey! / Whoa! / Not good! / Eek!
//   death:   Oh no...! / My light... is fading... / I... can't... / Not yet...! / The stars... will shine again...
//   win:     We did it! We won! / Hehe! That's how it's done! / The stars have chosen me! /
//            That was wonderful! Thank you! / Better luck next time!
//   reverse: Whoa! Look at them go! / Back at you! ALL OF YOU! / Hehe! Have them back! / REVERSE EVERYTHING! /
//            A STARFALL OF YOUR OWN!
import pick1 from '@/../assets/voices/stella/pick-1.mp3';
import pick2 from '@/../assets/voices/stella/pick-2.mp3';
import pick3 from '@/../assets/voices/stella/pick-3.mp3';
import pick4 from '@/../assets/voices/stella/pick-4.mp3';
import pick5 from '@/../assets/voices/stella/pick-5.mp3';
import charge1 from '@/../assets/voices/stella/charge-1.mp3';
import charge2 from '@/../assets/voices/stella/charge-2.mp3';
import charge3 from '@/../assets/voices/stella/charge-3.mp3';
import charge4 from '@/../assets/voices/stella/charge-4.mp3';
import charge5 from '@/../assets/voices/stella/charge-5.mp3';
import summon1 from '@/../assets/voices/stella/summon-1.mp3';
import summon2 from '@/../assets/voices/stella/summon-2.mp3';
import summon3 from '@/../assets/voices/stella/summon-3.mp3';
import summon4 from '@/../assets/voices/stella/summon-4.mp3';
import summon5 from '@/../assets/voices/stella/summon-5.mp3';
import fever1 from '@/../assets/voices/stella/fever-1.mp3';
import fever2 from '@/../assets/voices/stella/fever-2.mp3';
import fever3 from '@/../assets/voices/stella/fever-3.mp3';
import fever4 from '@/../assets/voices/stella/fever-4.mp3';
import fever5 from '@/../assets/voices/stella/fever-5.mp3';
import hit1 from '@/../assets/voices/stella/hit-1.mp3';
import hit2 from '@/../assets/voices/stella/hit-2.mp3';
import hit3 from '@/../assets/voices/stella/hit-3.mp3';
import hit4 from '@/../assets/voices/stella/hit-4.mp3';
import hit5 from '@/../assets/voices/stella/hit-5.mp3';
import hit6 from '@/../assets/voices/stella/hit-6.mp3';
import death1 from '@/../assets/voices/stella/death-1.mp3';
import death2 from '@/../assets/voices/stella/death-2.mp3';
import death3 from '@/../assets/voices/stella/death-3.mp3';
import death4 from '@/../assets/voices/stella/death-4.mp3';
import death5 from '@/../assets/voices/stella/death-5.mp3';
import win1 from '@/../assets/voices/stella/win-1.mp3';
import win2 from '@/../assets/voices/stella/win-2.mp3';
import win3 from '@/../assets/voices/stella/win-3.mp3';
import win4 from '@/../assets/voices/stella/win-4.mp3';
import win5 from '@/../assets/voices/stella/win-5.mp3';
import reverse1 from '@/../assets/voices/stella/reverse-1.mp3';
import reverse2 from '@/../assets/voices/stella/reverse-2.mp3';
import reverse3 from '@/../assets/voices/stella/reverse-3.mp3';
import reverse4 from '@/../assets/voices/stella/reverse-4.mp3';
import reverse5 from '@/../assets/voices/stella/reverse-5.mp3';
import announceChoose from '@/../assets/voices/announcer/choose.mp3';
import announceFight1 from '@/../assets/voices/announcer/fight-1.mp3';
import announceFight2 from '@/../assets/voices/announcer/fight-2.mp3';
import announceFight3 from '@/../assets/voices/announcer/fight-3.mp3';
import announceFinal from '@/../assets/voices/announcer/final-round.mp3';
import announceReady1 from '@/../assets/voices/announcer/ready-1.mp3';
import announceReady2 from '@/../assets/voices/announcer/ready-2.mp3';
import announceReady3 from '@/../assets/voices/announcer/ready-3.mp3';
import announceRound1 from '@/../assets/voices/announcer/round-1.mp3';
import announceRound2 from '@/../assets/voices/announcer/round-2.mp3';
import type { FairyVoice } from '@/types';

/** Each fairy's lines, by fairy id. */
export const VOICES: Partial<Record<string, FairyVoice>> = {
    pip: {
        pick: [pick1, pick2, pick3, pick4, pick5],
        charge: [charge1, charge2, charge3, charge4, charge5],
        summon: [summon1, summon2, summon3, summon4, summon5],
        fever: [fever1, fever2, fever3, fever4, fever5],
        hit: [hit1, hit2, hit3, hit4, hit5, hit6],
        death: [death1, death2, death3, death4, death5],
        win: [win1, win2, win3, win4, win5],
        reverse: [reverse1, reverse2, reverse3, reverse4, reverse5],
    },
};

/**
 * The announcer (assets/source/voices/announcer-claire.mp3: "Choose your champion", then "Round 1 / Ready /
 * Fight!", "Round 2 / Ready / Fight!" and "Final round / Ready / Fight!"). Each round's call has its own take of
 * Ready and Fight, in the same order (the third pair goes with the final round).
 */
export const ANNOUNCER = {
    choose: announceChoose,
    rounds: [announceRound1, announceRound2],
    final: announceFinal,
    ready: [announceReady1, announceReady2, announceReady3],
    fight: [announceFight1, announceFight2, announceFight3],
    /**
     * When Ready comes in the countdown (s): a beat after the longest round call ("Final round") finishes speaking
     * at 1.53 s. Fight! comes as play starts, at C.COUNTDOWN_TIME. The countdown's banners change at the same
     * moments.
     */
    readyAt: 1.9,
};
