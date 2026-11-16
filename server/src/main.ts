// Glimmerwing server: Express for the page and the API, TypeORM over MariaDB for the saves, and the online
// relay on the same port. Built by build.mjs as dist/server.cjs (with dist/verify-worker.cjs beside it):
//
//   npm run server          # listens on PORT or 8787
//
// It serves dist/index.html at "/", the game's API at "/api" (api.ts) and online matches over a WebSocket at
// "/ws" (relay.ts). With DB_HOST set it connects to MariaDB, runs the migrations (database/migrations) and adds
// the catalog rows the game has; without one the API answers 503 and the game keeps its saves in the browser.
import 'reflect-metadata';
import { createServer } from 'node:http';
import { apiRouter } from './api';
import { createApp } from './app';
import { Catalog } from './catalog';
import { openDatabase } from './database/data-source';
import { Relay } from './relay';
import { Store } from './store';
import { Turns } from './turns';
import { Verifier } from './verifier';

const PORT = Number(process.env.PORT) || 8787;

/** Start everything. */
async function main(): Promise<void> {
    const db = process.env.DB_HOST ? await openDatabase() : null;
    const catalog = new Catalog(db);
    await catalog.refresh();
    const store = db ? new Store(db, catalog) : null;
    catalog.watch();
    const verifier = store ? Verifier.create() : null;
    const turns = new Turns();

    let relay: Relay | null = null;
    const app = createApp(apiRouter({ store, verifier, catalog, turns }), () => relay?.counts ?? {});
    const server = createServer(app);
    relay = new Relay(server, { store, turns, catalog });
    server.listen(PORT, () =>
        console.warn(
            `Glimmerwing server on http://localhost:${PORT}  (WebSocket at /ws, API at /api, ` +
                `${store ? 'saves in MariaDB' : 'no database: saves stay in the browser'})`,
        ),
    );

    // Close the database cleanly when docker stops the container.
    for (const sig of ['SIGINT', 'SIGTERM'] as const)
        process.on(sig, () => {
            relay?.stop();
            catalog.stop();
            server.close();
            void Promise.allSettled([store?.close(), verifier?.close()]).finally(() => process.exit(0));
        });
}

main().catch((e: unknown) => {
    console.error('The server could not start:', e);
    process.exit(1);
});
