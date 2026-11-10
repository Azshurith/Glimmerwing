# Glimmerwing

A split-screen versus shooter in TypeScript. Two fairies, two meadows, one rule:
whatever you chain in your meadow lands in your rival's.

## Run it

    npm install
    npm run build      # typechecks, then bundles to dist/index.html
    open dist/index.html

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

Fields never reference each other: a field writes to its `outbox`, and `Game`
delivers each item to the other side after a short flight. Both fields share a
wave seed each round, so the swarms are identical on both sides.
