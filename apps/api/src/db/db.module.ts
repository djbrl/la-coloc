import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common";
import { type Connection, openPool, type Db } from "@coloc/db";

export const DB = Symbol("DB");
export const CONNECTION = Symbol("DB_CONNECTION");

// Local default matches dev/docker-compose.yml. In production COLOC_DATABASE_URL is always set.
const DEFAULT_URL = "postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc";

// One connection pool for the whole API. Preparing it never waits for the database, so the API can start (and
// say "the core is down") even when Postgres isn't there. Migrating, and noticing when the database is back,
// is the job of `Core` (see ../core/core.ts).
@Global()
@Module({
  providers: [
    { provide: CONNECTION, useFactory: () => openPool(process.env.COLOC_DATABASE_URL ?? DEFAULT_URL) },
    { provide: DB, useFactory: (conn: Connection): Db => conn.db, inject: [CONNECTION] },
  ],
  exports: [DB, CONNECTION],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(CONNECTION) private readonly conn: Connection) {}

  async onApplicationShutdown() {
    await this.conn.close();
  }
}
