# Glimmerwing

A split-screen versus shooter in TypeScript. Two fairies, two meadows, one rule:
whatever you chain in your meadow lands in your rival's.

## Run it

    npm install
    npm run build      # typechecks, then bundles to dist/index.html
    open dist/index.html

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

## Layout

- `src/config.ts`  – every tuning number in one place
- `src/characters.ts` – the fairy roster, their stats, and unlock conditions
- `src/progress.ts`   – saved stats and unlocks (localStorage)
- `src/waves.ts`   – wave definitions: path, speed, side, size, count, toughness, bubbles
- `src/field.ts`   – one side's simulation: fairy, puffs, chain bursts, counters, Fever, moth
- `src/game.ts`    – rounds, match flow, and delivering attacks between fields
- `src/ai.ts`      – CPU pilot
- `src/input.ts`   – keyboard and touch
- `src/render.ts`  – canvas drawing
- `src/main.ts`    – fixed 60 Hz step loop
- `src/net.ts`     – WebSocket client and the messages players exchange
- `src/lobby.ts`   – the Play online panel (Find match, friend rooms)
- `server/server.mjs` – zero-dependency matchmaking relay and static server

Fields never reference each other: a field writes to its `outbox`, and `Game`
delivers each item to the other side after a short flight. Both fields share a
wave seed each round, so the swarms are identical on both sides.
