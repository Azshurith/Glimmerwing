import { DataSource } from 'typeorm';
import { seedCatalog } from '@server/catalog-seed';
import { Character, GameMap, ModeType } from './entities/catalog';
import { EndlessRun } from './entities/endless-run';
import { MatchRow } from './entities/match';
import { Player } from './entities/player';
import { ProgressRow } from './entities/progress';
import { ReplayRow } from './entities/replay';
import { SettingsRow } from './entities/settings';
import { Initial1763251200000 } from './migrations/1763251200000-initial';
import { CatalogAndTimestamps1763251200001 } from './migrations/1763251200001-catalog-and-timestamps';
import { IntegerIdsAndPlayerTables1763251200002 } from './migrations/1763251200002-integer-ids-and-player-tables';

/** Every table's entity. */
export const ENTITIES = [
    Player,
    ProgressRow,
    SettingsRow,
    MatchRow,
    EndlessRun,
    ReplayRow,
    Character,
    GameMap,
    ModeType,
];

/**
 * The connection to MariaDB, from the DB_* environment. The schema is the migrations' (in order, each run once and
 * recorded in the migrations table); the entities only read and write it, they never change it.
 */
export function dataSource(env: NodeJS.ProcessEnv = process.env): DataSource {
    return new DataSource({
        type: 'mariadb',
        host: env.DB_HOST,
        port: Number(env.DB_PORT) || 3306,
        username: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        database: env.DB_DATABASE,
        charset: 'utf8mb4',
        poolSize: Number(env.DB_POOL) || 8,
        entities: ENTITIES,
        migrations: [Initial1763251200000, CatalogAndTimestamps1763251200001, IntegerIdsAndPlayerTables1763251200002],
        migrationsTableName: 'migrations',
        synchronize: false,
        logging: ['error', 'migration'],
    });
}

/** Wait for `ms` milliseconds. */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Connect (the database may still be starting when the server does: docker compose starts both, so it's tried
 * for a minute), then run any migrations not yet run and add the catalog rows the game has (a fairy or map added to
 * the game since).
 */
export async function openDatabase(env: NodeJS.ProcessEnv = process.env): Promise<DataSource> {
    let db: DataSource;
    for (let tries = 1; ; tries++) {
        db = dataSource(env);
        try {
            await db.initialize();
            break;
        } catch (e) {
            if (tries >= 30) throw e;
            console.warn(`Database not ready (${(e as Error).message}), retrying…`);
            await sleep(2000);
        }
    }
    const ran = await db.runMigrations({ transaction: 'each' });
    for (const m of ran) console.warn(`Migrated: ${m.name}`);
    await seedCatalog(db);
    return db;
}
