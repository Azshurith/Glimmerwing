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

**Build.** [build.mjs](build.mjs) bundles `src/main.ts` as an IIFE and puts it in place of `/*__BUNDLE__*/` in [index.template.html](index.template.html). Images get imported as data URLs, so the game is a single self-contained HTML file. The build also writes a PWA manifest, the icons, and a service worker whose cache name is a hash of the page.

**Loop.** [src/main.ts](src/main.ts) wires up the page (fitting the canvas to the screen, fullscreen, wake lock, mute) and runs the fixed-step loop: `game.step(C.STEP)` at 60 Hz with an accumulator, then `game.draw()`. The view is a fixed 504×320 that gets scaled up.

**Game ↔ Field.** [src/game/game.ts](src/game/game.ts) (`Game`) owns the phases (title → select → countdown → playing …), rounds, match flow, the CPU pilot and the online session. Each meadow is its own `Field` ([src/game/field.ts](src/game/field.ts), the largest file), and the two fields never reference each other:
- A field pushes outgoing attacks to `field.outbox`. `Game` moves them into `transits`, then hands each one to the other side's `field.receive()` after its flight time.
- A field pushes sound requests to `field.sfx`. `Game.drainSfx()` plays them with stereo pan and volume chosen by side and mode.
- Both fields are built from the same round seed (seeded RNG in [src/core/rng.ts](src/core/rng.ts)), so both get identical waves. The seed also decides which meadow the Hollow Crow appears in.

**Online netcode** ([src/net/](src/net/), [server/server.mjs](server/server.mjs)):
- Field 0 is always the local player.
- Each browser simulates only its own meadow and streams `field.snapshot()` 20×/s. The rival's field is a mirror updated with `applySnapshot()`, and `drift()` extrapolates between snapshots.
- Attacks and knockouts travel as messages. The host (whoever created the room, or was first in the queue) deals round seeds and decides results.
- The server has no game logic: it only matches players and relays messages, and it also serves `dist/`.
- **Bump `NET_VERSION` in [src/core/config.ts](src/core/config.ts) whenever the wire format or snapshot shape changes**, so builds that don't match never get paired.

**Rendering.** [src/render/renderer.ts](src/render/renderer.ts) draws everything from read-only state on `Game`/`Field`; the simulation never draws. HUD, the title and select screens, the backdrop and sprite animation each live in their own module under `src/render/`. Colours and fonts are in `theme.ts`.

**Data and tuning.**
- Every tuning number is in [src/core/config.ts](src/core/config.ts), imported as `* as C`.
- The fairy roster, stats, unlocks and per-fairy attacks/bombs are in [src/data/characters.ts](src/data/characters.ts).
- Wave definitions are in [src/game/waves.ts](src/game/waves.ts).
- Saved progress uses localStorage, in [src/game/progress.ts](src/game/progress.ts).

**Audio.** [src/audio/sound.ts](src/audio/sound.ts) synthesizes every effect with WebAudio; there are no audio files. Audio starts only after the first user gesture (`sound.unlock()`).

**Input.** [src/input/input.ts](src/input/input.ts) merges keyboard, gamepad (polled each frame) and touch. The page's prompts switch to whichever device was used last.

## Conventions

- `src/types/` holds interfaces and type aliases only, and ESLint enforces it: no runtime exports, and no imports from outside `types/`. Import with `import type { … } from '../types'`. A type used by only one module stays private to that module.
- Indent with 4 spaces (Prettier and `.editorconfig`); lines are up to 120 characters.
- Every function, class, method, interface, type alias and module-level arrow helper needs a `/** … */` docblock that says what it's for (enforced by `eslint-plugin-jsdoc`). Small lambdas inside a function body and constructors are exempt. Write prose only, with no `{type}` annotations, since TypeScript already has the types.
- Use type-only imports (`consistent-type-imports`), `===`, and an `_` prefix for intentionally unused variables. `console.log` gives a warning; `warn`/`error` are fine.
- The TypeScript config is strict and also turns on `noUnusedLocals/Parameters`, `noImplicitReturns` and `noImplicitOverride`.
- The sprite atlas `assets/witch.png` and `witch.json` are generated from `assets/source/` by [tools/extract-witch.py](tools/extract-witch.py) (Python, using PIL, numpy and scipy). Don't hand-edit them.
- ESLint ignores `Claude outputs/`, which holds scratch output, not source.
- The "Layout" section at the bottom of README.md still lists the old flat `src/*.ts` paths. The "Project structure" section in the README is the current one.
