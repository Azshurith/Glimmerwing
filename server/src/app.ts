// The Express app: the built game (dist/), the API under /api, and a health check.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import type { Express, Router } from 'express';

/** dist/, where the build puts the page and this server (dist/server.cjs). */
const DIST = __dirname;

/** The files the server hands out from dist/: [content type, cache-control]. */
const FILES: Record<string, [string, string]> = {
    'index.html': ['text/html; charset=utf-8', 'no-cache'],
    'guide.html': ['text/html; charset=utf-8', 'no-cache'],
    'manifest.webmanifest': ['application/manifest+json', 'no-cache'],
    'sw.js': ['text/javascript; charset=utf-8', 'no-cache'],
    'icon-192.png': ['image/png', 'public, max-age=86400'],
    'icon-512.png': ['image/png', 'public, max-age=86400'],
};

/** The app around the API router; `counts` says how busy the relay is, for /health. */
export function createApp(api: Router, counts: () => object): Express {
    const app = express();
    app.disable('x-powered-by');
    app.use('/api', api);
    app.get('/health', (_req, res) => {
        res.json({ ok: true, ...counts() });
    });
    app.get(['/', '/:file'], (req, res, next) => {
        const name = req.params.file ?? 'index.html';
        const kind = FILES[name];
        if (!kind) return next();
        const file = join(DIST, name);
        if (!existsSync(file)) {
            res.status(404).send('Run "npm run build" first.');
            return;
        }
        res.set({ 'content-type': kind[0], 'cache-control': kind[1] });
        res.sendFile(file);
    });
    app.use((_req, res) => {
        res.status(404).send('Not found');
    });
    return app;
}
