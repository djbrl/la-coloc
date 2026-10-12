// Connecting to coloc.dev's database, and bringing its schema up to date.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Pool } from "pg";
import * as schema from "./schema";

export * from "./schema";
export { schema };
export { isConnectionError, whyUnreachable } from "./errors";

// Any Postgres driver Drizzle supports: node-postgres in the API, PGlite (Postgres in memory) in tests.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");

/** A connection to the database that is ready to use, whether or not the database is answering right now. */
export interface Connection {
  db: Db;
  /** Brings the schema up to date. Fails if the database can't be reached; safe to try again. */
  migrate(): Promise<void>;
  /** The smallest possible question ("are you there?"). Fails if the database doesn't answer. */
  ping(): Promise<void>;
  /** Hears about connections that die by themselves (Postgres restarted, Docker stopped). */
  onTrouble(listener: (error: Error) => void): void;
  close(): Promise<void>;
}

/**
 * Prepares the connection pool without talking to the database yet: connections are only opened when a query
 * needs one. So this never fails and never waits, even when the database is down. The pool also replaces dead
 * connections by itself, so nothing here needs redoing when the database comes back.
 */
export function openPool(url: string): Connection {
  // A query waits at most 5 seconds for a connection; after that it fails (and the API answers "core is down").
  const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000 });
  const db = drizzle(pool, { schema });
  const listeners: ((error: Error) => void)[] = [];
  const trouble = (error: Error) => listeners.forEach((l) => l(error));

  // When Postgres dies, its connections emit an "error" event. An event nobody listens to crashes Node, so we
  // always listen: on the pool (for connections sitting idle) and on every connection (for ones in use).
  pool.on("error", trouble);
  pool.on("connect", (client) => client.on("error", trouble));

  return {
    db,
    // Migrations run once on startup: the API refuses to serve on a schema it doesn't know.
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    ping: async () => {
      await db.execute(sql`select 1`);
    },
    onTrouble: (listener) => void listeners.push(listener),
    close: () => pool.end(),
  };
}

/** Connects and migrates, or throws. For scripts (the seed); the API uses `openPool` so it can start without a database. */
export async function connect(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const conn = openPool(url);
  try {
    await conn.migrate();
  } catch (e) {
    await conn.close().catch(() => undefined);
    throw e;
  }
  return { db: conn.db, close: conn.close };
}
