# Glimmerwing

A split-screen versus shooter in TypeScript. Two fairies, two meadows, one rule:
whatever you chain in your meadow lands in your rival's.

## Run it

    npm install
    npm run build      # typechecks, then bundles to dist/index.html
    open dist/index.html

## Develop

    npm run check      # typecheck + lint + formatting check (run before committing)
    npm run lint:fix   # auto-fix lint issues
    npm run format     # format everything with Prettier
    npm run dev        # build, then serve on http://localhost:8787

Tooling: TypeScript (strict, plus unused/fallthrough checks), ESLint 9 with
type-aware `typescript-eslint` rules, Prettier for formatting, and an
`.editorconfig` for editors.

## Project structure

    src/
      main.ts            entry point: wires the page, input, game loop and renderer
      types/             shared interfaces and type aliases only (no runtime code;
                         lint-enforced). Import with `import type { … } from '@/types'`.
      core/              config constants, seeded RNG, image loading
      data/              the fairy roster and sprite-sheet definitions
      game/              simulation: game flow (game.ts), a meadow (field.ts),
                         CPU pilot, wave formations, saved progress
      render/            the renderer (frame and meadow composition), HUD, HUD icons,
                         theme (colours, fonts), drawing helpers, backdrop, sprites
        entities/        drawing for each kind of thing in a meadow: the fairy,
                         critters, attacks, bosses, bombs
        screens/         title screen and character select
      input/             keyboard, gamepad and touch
      audio/             synthesized sound effects
      net/               online relay client and lobby
    server/              Node relay + static server for online play
    assets/              sprite atlas, portrait, app icons (source art in assets/source)
    tools/               asset scripts (frame extraction for the sprite sheet)

Imports use `./x` within a folder and `@/folder/x` across folders (never
`../`; lint-enforced). Types used by just one module stay private to it; once a
second module needs one, it moves to `src/types`.

Fields never reference each other: a field writes to its `outbox`, and `Game`
delivers each item to the other side after a short flight. Both fields share a
wave seed each round, so the swarms are identical on both sides.

## Phones, tablets and desktop

The page fits the game to any screen (both width and height), and switches
its prompts and buttons to whatever the player last used: keyboard, gamepad
or touch.

- **Touch:** drag anywhere to fly (relative to the fairy, so your finger
  never covers her), hold to charge, lift to fire. On-screen **Bomb** and
  **Auto** buttons, and a pause/back button at the top. Two players can
  share a tablet: each drags on their own meadow with their own buttons.
- **Fullscreen** uses the browser's fullscreen (and locks landscape where
  allowed); on iPhone, which has no fullscreen for pages, it fills the
  window instead.
- **Install:** the build writes `manifest.webmanifest`, icons and a
  service worker (`sw.js`) next to `index.html`, so served over https (or
  localhost) the game can be added to a home screen or installed as a
  desktop app, and opens offline. Upload the whole `dist/` folder when you
  host it somewhere other than `server/server.mjs`.

## Play online

    npm run build
    npm run server     # http://localhost:8787 serves the game; the relay is at /ws

Open the page in two browsers (or on two devices on your network, using your
computer's IP instead of localhost) and pick **Play online**:

- **Find match** pairs you with the next player who also presses Find match.
- **Create friend room** gives a four-letter code; your friend types it in and
  presses Join, or opens the link `?room=CODE`.

To put it on the internet, run `node server/server.mjs` on any host that runs
Node 18+ and allows WebSockets (Render, Fly.io, Railway, a VPS). It reads
`PORT` from the environment and serves the built game itself, so one deploy
is the whole thing. If you host the page somewhere else (itch.io, GitHub
Pages), bake the relay address in when you build:

    GW_SERVER=wss://your-server.example.com/ws npm run build

or add `?server=wss://…/ws` to the page URL. Bump `NET_VERSION` in
`src/config.ts` when you change what the game sends, so old and new builds
are never paired.

### How the netcode works

Each browser simulates only its own meadow, at full rate, with no input
delay. Twenty times a second it sends a snapshot of that meadow, and the
rival's screen draws it (moving things are extrapolated between snapshots).
Attacks travel as messages: the sender sees the star fly off, and it lands
on the rival's side after the usual flight time, shortened by half the ping.
The host (the player who made the room, or was first in the queue) deals
each round's wave seed and settles who won when a fairy goes down, waiting
a quarter second for a simultaneous knockout. A browser tab in the
background stops simulating, so your meadow freezes for your rival while
you're away. The server has no game logic; it only pairs players and
forwards messages.

