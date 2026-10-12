import { catchError, EMPTY, type OperatorFunction, throwError } from "rxjs";
import { isCoreDown } from "./core";

/**
 * For the live streams (server-sent events): if one update can't be built because the database is down, skip that
 * update and keep the stream open, instead of ending it with an error. Real bugs still end it, as before.
 */
export function skipWhileCoreDown<T>(): OperatorFunction<T, T> {
  return catchError((error) => (isCoreDown(error) ? EMPTY : throwError(() => error)));
}
