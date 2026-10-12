import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { type Connection, isConnectionError, whyUnreachable } from "@coloc/db";
import { CONNECTION } from "../db/db.module";
import { retryUntilItWorks } from "./retry";

// What every route says while the database is down. The website reads `code` to show its calm "waiting" screen.
export const CORE_DOWN_MESSAGE = "The city's database isn't answering. It usually comes back on its own.";
export const CORE_DOWN_BODY = { ok: false, code: "core_down", message: CORE_DOWN_MESSAGE } as const;

/** Thrown when we already know the database can't serve this request. The filter turns it into the 503 above. */
export class CoreDownError extends Error {
  constructor(message = CORE_DOWN_MESSAGE) {
    super(message);
    this.name = "CoreDownError";
  }
}

/** Is this failure "the database is unreachable"? (Looks through Drizzle's wrapper at the real cause.) */
export function isCoreDown(error: unknown): boolean {
  return error instanceof CoreDownError || isConnectionError(error);
}

const HEALTH_TIMEOUT_MS = 1500;

// What Core needs from the connection, and from the logger: small, so tests can fake both.
export type CoreConnection = Pick<Connection, "migrate" | "ping" | "onTrouble">;
export interface CoreLog {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * The core is the database. This class knows whether it is answering, and keeps the rest of the API calm about it:
 *
 *  - At startup the API opens its port straight away. Core keeps trying to reach the database and bring its
 *    schema up to date, in the background (1 s between tries, growing to 15 s, for ever). Until that works,
 *    `ready` is false and every route except /api/health answers 503 "core_down".
 *  - Once `ready` it stays ready: the connection pool replaces dead connections by itself and the schema is
 *    already up to date, so nothing needs redoing when the database comes back after an outage.
 *  - When a failure shows the database went away, `reportDown` notes it (one log line per outage, however many
 *    requests fail) and starts checking quietly until it answers again (one log line).
 */
@Injectable()
export class Core implements OnApplicationBootstrap, OnApplicationShutdown {
  private isReady = false;
  private downSince: number | null = null;
  private lastBootReason = "";
  private bootFailedSince: number | null = null;
  private stopBoot?: () => void;
  private stopWatching?: () => void;

  // Where the log lines go. A plain field so tests can listen in.
  out: CoreLog = new Logger("core");

  constructor(@Inject(CONNECTION) private readonly conn: CoreConnection) {
    // A connection that dies while idle is the first sign of an outage: check right away whether it's real.
    conn.onTrouble(() => void this.check());
  }

  /** True once the database has answered and the schema is up to date. */
  get ready(): boolean {
    return this.isReady;
  }

  onApplicationBootstrap() {
    this.start();
  }

  onApplicationShutdown() {
    this.stopBoot?.();
    this.stopWatching?.();
  }

  /** Starts connecting and migrating in the background. Returns at once; the API doesn't wait for it. */
  start() {
    if (this.stopBoot) return;
    const attempt = retryUntilItWorks(
      () => this.conn.migrate(),
      (error, _failures, waitMs) => this.bootFailed(error, waitMs),
    );
    this.stopBoot = attempt.stop;
    void attempt.done.then(() => this.bootSucceeded());
  }

  private bootFailed(error: unknown, waitMs: number) {
    this.bootFailedSince ??= Date.now();
    const reason = whyUnreachable(error);
    // Same reason as last time: stay quiet. One line per outage, not one per try.
    if (reason === this.lastBootReason) return;
    this.lastBootReason = reason;
    const seconds = Math.round(waitMs / 1000);
    if (isConnectionError(error)) {
      this.out.warn(`the database isn't answering (${reason}). Every route says "core_down" until it does; trying again, every ${seconds} s at first, then every 15 s at most`);
    } else {
      this.out.error(`bringing the database up to date failed (${reason}). Trying again in ${seconds} s`);
    }
  }

  private bootSucceeded() {
    this.isReady = true;
    if (this.bootFailedSince === null) return this.out.log("connected, schema up to date");
    this.out.log(`the database answered after ${Math.round((Date.now() - this.bootFailedSince) / 1000)} s: connected, schema up to date. The API is fully available`);
  }

  /**
   * Is the database answering a trivial question, within 1.5 s? Never throws. This is what /api/health asks.
   * A "no" also starts the outage handling; a "yes" ends it.
   */
  async check(): Promise<boolean> {
    if (!this.isReady) return false;
    let timer: NodeJS.Timeout | undefined;
    try {
      const tooSlow = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CoreDownError("The database took too long to answer.")), HEALTH_TIMEOUT_MS);
      });
      await Promise.race([this.conn.ping(), tooSlow]);
      this.reportUp();
      return true;
    } catch (error) {
      this.reportDown(error);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Something failed because the database is unreachable. Notes it once per outage, then waits for it to return. */
  reportDown(error: unknown) {
    if (!this.isReady || this.downSince !== null) return;
    this.downSince = Date.now();
    this.out.warn(`the database stopped answering (${whyUnreachable(error)}). Routes answer "core_down" until it is back`);
    const watch = retryUntilItWorks(
      () => this.conn.ping(),
      () => undefined,
    );
    this.stopWatching = watch.stop;
    void watch.done.then(() => this.reportUp());
  }

  /** The database answered. If we thought it was down, say it's back. */
  reportUp() {
    if (this.downSince === null) return;
    const seconds = Math.round((Date.now() - this.downSince) / 1000);
    this.downSince = null;
    this.stopWatching?.();
    this.out.log(`the database is back after ${seconds} s. Serving normally again`);
  }
}
