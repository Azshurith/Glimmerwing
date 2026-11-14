# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Glimmerwing is a browser split-screen versus shooter in TypeScript (canvas, no framework). Two fairies each fly in their own meadow; chains you set off in your meadow send attacks into your rival's. The gameplay borrows mechanics from Twinkle Star Sprites (charge levels, Extra Attacks, reverse attacks, boss cycles, damage rules); code comments call it "TSS". Everything in the game is original: art, names, characters and sounds.

## Commands

```
npm run build        # typecheck, then esbuild bundles everything into one file, dist/index.html
npm run check        # typecheck + eslint + prettier --check: run before committing
npm run lint:fix     # eslint --fix
npm run format       # prettier --write .
npm run dev          # build, then serve on http://localhost:8787 (relay at /ws)
npm run server       # serve the existing dist/ only
```

There is no test suite. To verify a change, run `npm run check` and play the build. `npm run build` bundles straight to `dist/index.html`, so after a build you can open that file directly.

`GW_SERVER=wss://host/ws npm run build` bakes in the online relay address (it becomes `__GW_SERVER__` through esbuild `define`). The page can also take `?server=…`.

## Workflow

Do each feature on its own branch (`feature/<name>` or `fix/<name>`) and open a pull request against `main` when it's done.

## Architecture

**Build.** [build.mjs](build.mjs) bundles `src/main.ts` as an IIFE and puts it in place of `/*__BUNDLE__*/` in [index.template.html](index.template.html). The game page is only the game, filling the window; how to play, controls, mode links and reset progress are on a second page, [guide.template.html](guide.template.html), copied to `dist/guide.html` (the title screen's `?` button links to it, and `index.html?mode=cpu|versus|online` opens the game in a mode). Images get imported as data URLs, so the game is a single self-contained HTML file. The build also writes a PWA manifest, the icons, and a service worker whose cache name is a hash of the page.

**Loop.** [src/main.ts](src/main.ts) wires up the page (fitting the canvas to the screen, fullscreen, wake lock, mute) and runs the fixed-step loop: `game.step(C.STEP)` at 60 Hz with an accumulator, then `game.draw()`. The view is 504×320 with the meadows side by side, scaled up to fit. On a wide landscape screen a local round plays in wider meadows so the view fills it edge to edge: `main.ts` works out `renderer.fieldWidthToFill` from the screen's shape, and `Game.newRound` sets it with `C.setFieldWidth` (`FIELD_W` and `VIEW_W` are `let`s, up to `FIELD_W_MAX`; read them through `C.` so you see the current width, never copy them into a module-level constant). Online rounds, the menus and the tall layout always use `FIELD_W_BASE`. Likewise `FIELD_H` (`C.setFieldHeight`): a vs-CPU round on an upright phone with the Settings option *Hide the rival's meadow* (`settings.ts`, saved in localStorage; Settings in the main menu opens the panel in `index.template.html`) plays in taller meadows reaching the top of the screen, the rival's meadow and console drawn off screen and a slim `soloBar` across the top instead. The title, menu, Characters, Profile and select screens fill a wide landscape screen another way: their view widens to its shape (`renderer.menuW`, up to `WIDE_W_MAX`) with their content centred (`renderer.viewX`; `Renderer.begin` translates by it and `Input` takes it off touches) and their sky, bars and hero art reaching out to the edges (`bleed`). On a portrait screen, while one player is in a round, `Game.draw` switches the renderer to a tall layout (`TALL_*` in config): your meadow full width against the bottom edge, and the rival's at half size above it beside a compact console. `main.ts` refits the page whenever the layout changes, stretches the tall view to the screen's shape (`renderer.tallH`, up to `TALL_H_MAX`; and down to `TALL_H_MIN` on a squatter screen: in a round the band above your meadow shrinks, and the title and select screens shrink as a whole, see `screens/menu-fit.ts`), and the page always fills the window; real fullscreen (which hides the browser's bars) and sound are switched in Settings (M also toggles sound), never by a tap.

**Game ↔ Field.** [src/game/game.ts](src/game/game.ts) (`Game`) owns the phases (title → modes → select → countdown → playing …: the title screen offers *Sign in with Google*, greyed out until it exists, and *Play as guest*; `modes` shows a screen of cards ([src/render/screens/mode-screen.ts](src/render/screens/mode-screen.ts)), either the main menu (Play, Characters, Profile, Settings) or Play's choice of modes (Story Mode, greyed out for now, VS CPU, Online Play, 2 Players), `Game.menu` says which; Characters is the `roster` phase ([roster-screen.ts](src/render/screens/roster-screen.ts): each fairy's portrait, stats, skills and unlock, and a live demo meadow; in landscape the portrait sits against the left edge, the demo against the right and the stats between, spread over the widened view by `spread(bleed)`, while on a phone held upright the demo opens full size in a pop-up from a PREVIEW button on the portrait (`Game.demoOpen`): [src/game/preview.ts](src/game/preview.ts) (`SkillPreview`) runs a real `Field` with a scripted pilot showing her plain shot, charge shot and bomb on a loop, its outbox and sounds dropped) and Profile the `profile` phase ([profile-screen.ts](src/render/screens/profile-screen.ts): the record and unlocks)), rounds, match flow, the CPU pilot and the online session. Each meadow is its own `Field` ([src/game/field.ts](src/game/field.ts), the largest file), and the two fields never reference each other:
- A field pushes outgoing attacks to `field.outbox`. `Game` moves them into `transits`, then hands each one to the other side's `field.receive()` after its flight time.
- A field pushes sound requests to `field.sfx`. `Game.drainSfx()` plays them with stereo pan and volume chosen by side and mode.
- Fireballs (TSS Normal Attacks, attack kind `'star'`): `Field.resolveChain` sends `fireballsFor(hits)` of them (`feverFireballsFor` in Fever), each sized by the combo hit that sent it. Fireballs look the same on both sides (`fireLook`): orange as sent, purple once shot back, flashing every colour once shot back a second time; shot back `FIREBALL_MAX_REFLECTS` times and broken again, it becomes an Extra Attack. A Normal flies the route `normalRoute` ([src/game/fireball-path.ts](src/game/fireball-path.ts)) works out when it's sent, from where the chain ended (never above `FIREBALL_TOP_Y`, under the HUD bar) toward the rival's fairy (`Field.rivalFairy`, plus `aim`, a volley spread `FIREBALL_AIM_SPREAD` apart): it takes one of two at random (`FIREBALL_STRAIGHT_CHANCE`), wherever it's sent from: straight up to the top line (or along at its own height if it's already near the top), straight across into the rival's meadow and straight down once over the fairy; or a diagonal climb, a bounce off the top border near the middle of the screen and a diagonal descent into the rival's meadow at the fairy. `Game` flies the part up to the rival's near wall (`Outgoing.route`); `Field.receiveFireball` takes it in as a `'drop'` from `Outgoing.enter` on a line it keeps to (it never follows her once in), at `FIREBALL_TRANSIT_SPEED` times a speed of its own picked when it's sent (`FIREBALL_NORMAL_SPEED_MIN`–`_MAX`, carried in `boost`) all the way (slower in Fever, by its `pace`) and on the tempo between the meadows as in them (`Field.attackPace`), never set by size; each reflection gives it a set speed, `FIREBALL_FALL_SPEED` times `SPEED_REVERSE` per reflection, boosted by the Perfects of whoever shot it back (capped by `FIREBALL_MAX_SPEED`); shot down it flashes, turns into a Reverse where it broke and crosses the screen on its `reverseCurve` ([src/game/fireball-path.ts](src/game/fireball-path.ts): the same two routes at random, onto where the rival's fairy was, locked from `Field.rivalFairy`), flown as `'back'` in the breaker's meadow, drawn on the same path between the meadows, and finished as `'cross'` in the sender's meadow, where it's a Reverse (level 2+) and then falls on out; `?debug=paths` draws every fireball's path; breaking one that's been shot back `FIREBALL_MAX_REFLECTS` times sends the breaker's Extra Attack (`'imp'`). Tuning is under `FIREBALL_*` in config.
- Both fields are built from the same round seed (seeded RNG in [src/core/rng.ts](src/core/rng.ts)), so both get identical waves. The seed also decides which meadow the Hollow Crow appears in.

**Online netcode** ([src/net/](src/net/), [server/server.mjs](server/server.mjs)):
- Field 0 is always the local player.
- Each browser simulates only its own meadow and streams `field.snapshot()` 20×/s. The rival's field is a mirror updated with `applySnapshot()`, and `drift()` extrapolates between snapshots.
- Attacks and knockouts travel as messages. The host (whoever created the room, or was first in the queue) deals round seeds and decides results.
- The server has no game logic: it only matches players and relays messages, and it also serves `dist/`.
- **Bump `NET_VERSION` in [src/core/config.ts](src/core/config.ts) whenever the wire format or snapshot shape changes**, so builds that don't match never get paired.

**Rendering.** Rendering reads `Game`/`Field` state and never changes it; the simulation never draws.
- [src/render/renderer.ts](src/render/renderer.ts) (`Renderer`) sets up each frame and composes a meadow layer by layer.
- The drawing itself is plain functions that take the canvas context first, e.g. `drawStar(ctx, …)`. They're grouped by what they draw in `src/render/entities/`: `fairy`, `critters`, `attacks`, `bosses` and `bombs`. HUD icons are in `icons.ts`.
- To draw something new, add a function to the matching entities module and call it from `Renderer.field()`.
- The menu screens share their heading bar, `drawTopBar` in `screens/top-bar.ts` (taller on a phone, where the page's Back tab sits in it).
- The HUD, the title and select screens (`screens/`), the backdrop and sprite animation each have their own module. Colours and fonts are in `theme.ts`.

**Data and tuning.**
- Every tuning number is in [src/core/config.ts](src/core/config.ts), imported as `* as C`.
- The fairy roster, stats, unlocks and per-fairy attacks/bombs are in [src/data/characters.ts](src/data/characters.ts).
- Critter formations are in [src/game/waves.ts](src/game/waves.ts) (members glide in from above, behind the HUD strip, but a formation always sits below `CRITTER_TOP` once it's in; fireballs never start above `FIREBALL_TOP_Y`): each wave is a seeded `FormationSpec` (shape, entry, group movement, optional re-form, exit) that flies in from off-screen with staggered members, holds its shape while moving as a group, then flies out together. Positions are in meadow units, so formations look the same at every screen size.
- Saved progress uses localStorage, in [src/game/progress.ts](src/game/progress.ts).

**Audio.** [src/audio/sound.ts](src/audio/sound.ts) synthesizes every effect with WebAudio; there are no audio files. Audio starts only after the first user gesture (`sound.unlock()`). Effects and music go through their own gains (`volume`, `musicVolume`, saved with mute under `glimmerwing.sound`). The background music is [src/audio/music.ts](src/audio/music.ts): two original synthesized loops (`'menu'`, `'battle'`) on a look-ahead step sequencer; `main.ts` picks one by phase with `sound.playMusic`.

**Settings.** The Settings page (`#settings` in `index.template.html`, a full-screen page over the game with its own ◀ Back tab and heading bar, wired by [src/page/settings-panel.ts](src/page/settings-panel.ts)) has Audio (music and effects volume, sound on/off), Display (fullscreen, hide the rival's meadow) and Controls (rebind keys per scheme: one player, or player 1 and 2 sharing a keyboard). Key bindings live in `Settings.keys` (`settings.ts`); [src/input/keys.ts](src/input/keys.ts) has the defaults, labels and `keyMap`, and `Input.setBindings` takes them. Menus always use the fixed keys (arrows, Enter, Z, Esc), and gamepads map to actions directly, so rebinding never strands either.

**Input.** [src/input/input.ts](src/input/input.ts) merges keyboard (the player's own keys, see Settings), gamepad (polled each frame) and touch. The page's prompts switch to whichever device was used last. The page's on-screen buttons (`.touch-ui`) show only on a touchscreen, except the ◀ Back button on the menu screens (modes, select, Characters, Profile), which shows on every device so a mouse can leave them.

## Conventions

- **Imports:** use `./x` within a folder and `@/folder/x` everywhere else, never `../` (ESLint enforces this). The `@/` alias is set in `tsconfig.json` `paths`, and esbuild reads it from there.
- **Types:** `src/types/` holds interfaces and type aliases only, and ESLint enforces it: no runtime exports, and no imports from outside `types/`. Import with `import type { … } from '@/types'`. A type stays private to its module until a second module needs to name it (for example through a public method's signature); then it moves into `types/`.
- Indent with 4 spaces (Prettier and `.editorconfig`); lines are up to 120 characters.
- Every function, class, method, interface, type alias and module-level arrow helper needs a `/** … */` docblock that says what it's for (enforced by `eslint-plugin-jsdoc`). Small lambdas inside a function body and constructors are exempt. Write prose only, with no `{type}` annotations, since TypeScript already has the types.
- Use type-only imports (`consistent-type-imports`), `===`, and an `_` prefix for intentionally unused variables. `console.log` gives a warning; `warn`/`error` are fine.
- The TypeScript config is strict and also turns on `noUnusedLocals/Parameters`, `noImplicitReturns` and `noImplicitOverride`.
- The sprite atlas `assets/witch.png` and `witch.json` are generated from `assets/source/` by [tools/extract-witch.py](tools/extract-witch.py) (Python, using PIL, numpy and scipy). Don't hand-edit them.
- ESLint ignores `Claude outputs/`, which holds scratch output, not source.