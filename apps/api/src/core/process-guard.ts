import type { Core } from "./core";
import { isCoreDown } from "./core";

/**
 * A last safety net. Every place we know of already handles a failing query, but if one promise slips through while
 * the database is down, Node would kill the whole API (and drop the lobby, the agents' lines, everything).
 * So a rejection that only means "database unreachable" is noted and forgotten. Anything else crashes exactly as
 * it would have without this.
 */
export function protectFromDatabaseOutages(core: Core, proc: Pick<NodeJS.Process, "on"> = process) {
  proc.on("unhandledRejection", (reason) => {
    if (!isCoreDown(reason)) throw reason;
    core.reportDown(reason);
  });
}
