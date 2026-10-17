// Telling "the database is unreachable" apart from "our code has a bug". Only the first is worth a calm 503.

// Node's own network errors (what you get when nothing listens on the port, or the name doesn't resolve).
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "EHOSTDOWN", "ENETUNREACH"]);

// Postgres's own codes: 08xxx = connection problems, 57P01/02/03 = the server is shutting down, crashed or starting
// up, 53300 = too many connections, 28P01/28000 = it won't let us in (in development, for the few seconds between
// the database starting and `npm run up` giving it this laptop's own password).
function isPostgresConnectionCode(code: string): boolean {
  return code.startsWith("08") || ["57P01", "57P02", "57P03", "53300", "28P01", "28000"].includes(code);
}

// What the pg driver says in words when it has no code to give.
const MESSAGES = [
  /connection terminated/i,
  /client has encountered a connection error/i,
  /timeout exceeded when trying to connect/i,
  /server closed the connection unexpectedly/i,
  /the database system is (starting up|shutting down|in recovery mode)/i,
  /terminating connection due to administrator command/i,
  /cannot use a pool after calling end/i,
  /client was closed and is not queryable/i,
];

/** The error, then whatever caused it, then what caused that (Drizzle wraps pg's error as `cause`). Also looks inside AggregateErrors. */
function chain(error: unknown): unknown[] {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  const visit = (e: unknown) => {
    if (!e || typeof e !== "object" || seen.has(e) || out.length >= 20) return;
    seen.add(e);
    out.push(e);
    visit((e as { cause?: unknown }).cause);
    const inner = (e as { errors?: unknown }).errors;
    if (Array.isArray(inner)) inner.forEach(visit);
  };
  visit(error);
  return out;
}

const codeOf = (e: unknown): string => String((e as { code?: unknown }).code ?? "");
const messageOf = (e: unknown): string => String((e as { message?: unknown }).message ?? "");

/** True when the failure is "the database can't be reached" (down, restarting, dropped us), false for anything else. */
export function isConnectionError(error: unknown): boolean {
  const all = chain(error);
  const postgresSaid = all.some((e) => isPostgresConnectionCode(codeOf(e)) || MESSAGES.some((m) => m.test(messageOf(e))));
  if (postgresSaid) return true;
  // A plain network error counts too, unless it comes from an outgoing web request (GitHub being down isn't our database being down).
  const fromAWebRequest = all.some((e) => messageOf(e) === "fetch failed");
  return !fromAWebRequest && all.some((e) => NETWORK_CODES.has(codeOf(e)));
}

/** A short reason for a log line, from the deepest error in the chain: "connect ECONNREFUSED 127.0.0.1:5433". */
export function whyUnreachable(error: unknown): string {
  const all = chain(error);
  const best = [...all].reverse().find((e) => messageOf(e).trim()) ?? all[0];
  const text = best ? messageOf(best).trim() || codeOf(best) : String(error);
  return (text || "unknown reason").split("\n")[0]!.slice(0, 160);
}
