import { describe, expect, it } from "vitest";
import { isConnectionError, whyUnreachable } from "./errors";

// What Node and pg really throw, as plain objects.
const withCode = (code: string, message = code) => Object.assign(new Error(message), { code });
// Drizzle wraps whatever the driver threw and keeps it as `cause`.
const wrapped = (cause: unknown) => Object.assign(new Error("Failed query: select 1\nparams: "), { name: "DrizzleQueryError", cause });

describe("which failures mean 'the database is unreachable'", () => {
  it("knows Node's network errors, bare or wrapped by Drizzle", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT"]) {
      expect(isConnectionError(withCode(code))).toBe(true);
      expect(isConnectionError(wrapped(withCode(code)))).toBe(true);
    }
  });

  it("looks inside an AggregateError (what 'localhost' gives when both ::1 and 127.0.0.1 refuse)", () => {
    const both = Object.assign(new AggregateError([withCode("ECONNREFUSED"), withCode("ECONNREFUSED")], ""), { code: "ECONNREFUSED" });
    expect(isConnectionError(wrapped(both))).toBe(true);
    expect(isConnectionError(new AggregateError([withCode("ECONNREFUSED")]))).toBe(true);
  });

  it("knows Postgres shutting down or starting up", () => {
    for (const code of ["57P01", "57P02", "57P03", "08006", "08001", "53300", "28P01", "28000"]) expect(isConnectionError(wrapped(withCode(code, "boom")))).toBe(true);
  });

  it("knows the pg driver's words", () => {
    for (const message of [
      "Connection terminated unexpectedly",
      "Connection terminated due to connection timeout",
      "Client has encountered a connection error and is not queryable",
      "timeout exceeded when trying to connect",
      "the database system is starting up",
    ]) {
      expect(isConnectionError(new Error(message))).toBe(true);
      expect(isConnectionError(wrapped(new Error(message)))).toBe(true);
    }
  });

  it("does not take real bugs for an outage", () => {
    expect(isConnectionError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    // A real SQL error: a unique violation, a missing table.
    expect(isConnectionError(wrapped(withCode("23505", "duplicate key value violates unique constraint")))).toBe(false);
    expect(isConnectionError(wrapped(withCode("42P01", 'relation "nope" does not exist')))).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
    expect(isConnectionError("ECONNREFUSED")).toBe(false);
  });

  it("does not blame the database when GitHub or another website can't be reached", () => {
    const fetchFailed = Object.assign(new TypeError("fetch failed"), { cause: withCode("ECONNREFUSED") });
    expect(isConnectionError(fetchFailed)).toBe(false);
    expect(isConnectionError(Object.assign(new TypeError("fetch failed"), { cause: withCode("ENOTFOUND") }))).toBe(false);
  });

  it("survives a cause that loops back on itself", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    expect(isConnectionError(a)).toBe(false);
  });
});

describe("saying why, in one line", () => {
  it("takes the deepest cause, not Drizzle's wrapper", () => {
    expect(whyUnreachable(wrapped(withCode("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5433")))).toBe("connect ECONNREFUSED 127.0.0.1:5433");
  });
  it("falls back to the code when the message is empty", () => {
    expect(whyUnreachable(Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }))).toBe("ECONNREFUSED");
  });
});
