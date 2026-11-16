# Glimmerwing

A split-screen versus shooter in TypeScript. Two fairies, two meadows, one rule:
whatever you chain in your meadow lands in your rival's.

## Run it

    npm install
    npm run build      # typechecks, then bundles to dist/index.html
    open dist/index.html

## Run it in Docker (with the database)

    make project_setup   # copies .env.sample to .env: change the passwords in it
    make project_start   # docker compose up -d

- http://localhost:8787 is the game (the `node` container builds it and runs the server, `dist/server.cjs`).
- http://localhost:9091 is phpMyAdmin, on the MariaDB the game saves to (host port 3307).

`make help` lists the rest (logs, rebuild, a MariaDB prompt, a dump). The layout follows the usual one:
`.docker/<Service>/Dockerfile`, `.env` for ports and passwords, `docker-compose.yml`.

Every VS CPU, 2 Players and Endless game is recorded (each round's seed and the controls step by step, a few
tens of KB) and can be watched again from **Replays** in the main menu, or shared as a `?replay=CODE` link.

The server decides progress: a finished game is sent as its replay, and the server plays it through again with
the game's own simulation to work out what it earned (trophies, unlocks, the Endless best, the leaderboard). Games
finished while it can't be reached wait in the browser and count once sent and checked.

Each browser gets a guest account the first time it reaches the server. Progress, settings (keys, display,
sound), every match, every Endless run (the leaderboard) and saved replays go to the database; the browser
keeps its own copy too, so the game still plays offline or from a file (the server's progress replaces it when
they meet; for settings the copy saved last wins). Without a database (`npm run dev`) the API answers 503 and saves stay in the browser.

The server is Express and TypeORM (TypeScript in `server/src/`). The tables are made by its migrations, run at
start-up; every table ends with `created_at`, `updated_at` and `deleted_at` (soft deletes). The `characters`,
`maps` and `types_modes` tables list the game's fairies, maps and modes: set `is_enabled` to 0 (in phpMyAdmin,
say) to switch one off. Within 15 seconds the server stops accepting games with it, and the game shows it as
unavailable from the next time it opens Play (or is reloaded).

The art is in the database too: each fairy's spritesheet and its layout (`characters.sprite_sheet` and
`sprite_atlas`), each map's monster sheet (`maps.monster_sheet`, `monster_cell`, `monster_overlay_row`) and the
monsters on it (`monsters`: name, role and row). The server fills them from `assets/` where they're empty; change
them in the database and the game uses the new art the next time it opens Play, keeping its own copy offline. All three are numbered by the database, with the game's own id (`pip`, `forest`)
as `code`. A player's tables are `players_progress`, `players_settings`, `players_matches`, `players_runs`
(Endless) and `players_replays`; they point at the catalog by foreign key (`mode_id`, `map_id`, `fairy_id`,
`rival_fairy_id`).

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
    server/src/          the server (Express, TypeORM migrations and entities, the
                         online relay), bundled to dist/server.cjs
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
  host it somewhere other than the game's own server.

## Play online

    npm run build
    npm run server     # http://localhost:8787 serves the game; the relay is at /ws

Open the page in two browsers (or on two devices on your network, using your
computer's IP instead of localhost) and pick **Play online**:

- **Find match** pairs you with the next player who also presses Find match.
- **Create friend room** gives a four-letter code; your friend types it in and
  presses Join, or opens the link `?room=CODE`.

To put it on the internet, run `npm run server` (after `npm install` and
`npm run build`) on any host that runs Node 20+ and allows WebSockets (Render, Fly.io, Railway, a VPS). It reads
`PORT` from the environment and serves the built game itself, so one deploy
is the whole thing. If you host the page somewhere else (itch.io, GitHub
Pages), bake the relay address in when you build:

    GW_SERVER=wss://your-server.example.com/ws npm run build

or add `?server=wss://…/ws` to the page URL. Bump `NET_VERSION` in
`src/config.ts` when you change what the game sends, so old and new builds
are never paired.

### How the netcode works

The server runs every online match. Each browser sends only its player's controls; the server steps the round
60 times a second with each player's latest controls and sends both players the controls it used. The round is
fully decided by its seed and those controls (and plays out the same in every browser), so each browser plays
the very same round from them and shows exactly what the server decided, a network round trip behind. The
server deals the rounds, decides knockouts and the result, and counts the match for both players (their
trophies, unlocks and history, and a replay). A player who leaves forfeits.

