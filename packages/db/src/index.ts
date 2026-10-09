// Connecting to coloc.dev's database, and bringing its schema up to date.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Pool } from "pg";
import * as schema from "./schema";

export * from "./schema";
export { schema };

// Any Postgres driver Drizzle supports: node-postgres in the API, PGlite (Postgres in memory) in tests.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(__dirname, "..", "drizzle");

export async function connect(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  // Migrations run on startup: the API refuses to serve on a schema it doesn't know.
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, close: () => pool.end() };
}
