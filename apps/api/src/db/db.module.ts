import { Global, Inject, Logger, Module, OnApplicationShutdown } from "@nestjs/common";
import { connect, type Db } from "@coloc/db";

export const DB = Symbol("DB");
const CLOSE = Symbol("DB_CLOSE");

// Local default matches dev/docker-compose.yml. In production COLOC_DATABASE_URL is always set.
const DEFAULT_URL = "postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc";

// One connection pool for the whole API, migrated before the first request is served.
@Global()
@Module({
  providers: [
    {
      provide: CLOSE,
      useFactory: async () => {
        const conn = await connect(process.env.COLOC_DATABASE_URL ?? DEFAULT_URL);
        new Logger("db").log("connected, schema up to date");
        return conn;
      },
    },
    { provide: DB, useFactory: (conn: { db: Db }) => conn.db, inject: [CLOSE] },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(CLOSE) private readonly conn: { close: () => Promise<void> }) {}

  async onApplicationShutdown() {
    await this.conn.close();
  }
}
