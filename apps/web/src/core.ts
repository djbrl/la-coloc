// The core: the API and its database, as the page sees them. Either it answers, or it is down. When it is down the
// page does not go away: the lobby keeps what it already loaded, one calm card (CoreStatus.vue) says so with a
// countdown to the next try, and the moment the core answers again, everything that registered with onRecovered /
// useWhenBack reloads by itself.
//
// This file is the logic and the store, with no DOM in it, so the state machine runs under fake timers in tests:
//   - classifying what a fetch did (network error, 502/503/504, `code: "core_down"`, an empty 500) as an outage;
//   - `createCore()`: up / down, the backoff of health probes (2, 4, 8, 15, then every 30 seconds), the countdown,
//     the "back online" flag for the toast, and the recovery callbacks;
//   - `installCoreFetch()`: the one same-origin fetch wrapper that feeds the store.
// A real outage looks different on each side of the proxy: connection refused in the browser, a 500 with an empty
// body from Vite's dev proxy (checked: text/plain, nothing in it), 502/503/504 from a production reverse proxy, and
// a 503 `{ code: "core_down" }` from the API itself when only its database is gone.
import { getCurrentInstance, onBeforeUnmount, reactive } from "vue";
import { defineWords } from "./i18n";

// ---- What counts as an outage ----

// The page's own words when a request fails, in English and French (i18n.ts): `write` for a write that wasn't sent
// because the core isn't answering, `read` for something that was only being read, and the two plain failures
// session.ts gives when the API answered without a message of its own.
export const downWords = defineWords(
  "down",
  {
    write: "The city isn't answering, so that wasn't sent. Nothing was lost; try again in a moment.",
    read: "The city isn't answering right now.",
    failed: "That didn't work.",
    logInFirst: "Log in first.",
  },
  {
    write: "La ville ne répond pas, donc rien n'est parti. Rien n'est perdu : réessayez dans un instant.",
    read: "La ville ne répond pas pour l'instant.",
    failed: "Ça n'a pas marché.",
    logInFirst: "Connectez-vous d'abord.",
  },
);

/** The health probes, in seconds: the first try comes this long after the fall; the last gap repeats. */
export const BACKOFF = [2, 4, 8, 15, 30];
/** How long "Back online" stays on screen. */
export const TOAST_MS = 3200;

/** Parses a body as JSON; undefined when it is empty or not JSON. */
function parse(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Did this answer come from a core that is down? Yes: 502, 503, 504 (a proxy that can't reach the API); any error
 * whose JSON says `code: "core_down"`; and a 500 with an empty or non-JSON body (the dev proxy's way of saying the
 * API isn't there). No: 401, 403, 404, 409, 422, or a 500 whose JSON carries the API's own message (a bug, not an
 * outage). Successful answers never count.
 */
export function isOutageResponse(status: number, bodyText: string): boolean {
  if (status < 400) return false;
  if (status === 502 || status === 503 || status === 504) return true;
  const json = parse(bodyText);
  if (json && typeof json === "object" && (json as { code?: unknown }).code === "core_down") return true;
  // The host's own "not found" page (Vercel's, when the tunnel to the API is gone): the API always answers in JSON.
  if (status === 404 && json === undefined && bodyText.trim() !== "") return true;
  return status === 500 && json === undefined;
}

/** Did a fetch that rejected fail because nobody answered? (An abort is the page's own doing, not an outage.) */
export function isOutageError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name !== "AbortError";
}

/** A same-origin /api URL: the only requests the wrapper judges. */
export function isApiUrl(url: string, origin = typeof location === "undefined" ? "http://localhost" : location.origin): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && (u.pathname === "/api" || u.pathname.startsWith("/api/"));
  } catch {
    return false;
  }
}

// ---- The store ----

export interface CoreState {
  state: "up" | "down";
  /** When it went down (ms since the epoch), else null. */
  since: number | null;
  /** Which gap of BACKOFF comes next: 0 right after the fall or a manual try, then up as tries fail. */
  attempt: number;
  /** When the next automatic try happens (ms), else null (a try is running, or it is up). */
  nextTryAt: number | null;
  /** Whole seconds until then, for the card's countdown. */
  retryIn: number;
  /** A health probe is in flight. */
  probing: boolean;
  /** It just came back: the card says "Back online" for a few seconds. */
  recovered: boolean;
}

export interface CoreOptions {
  /** Asks the API whether its database answers. True when it does. */
  probe: () => Promise<boolean>;
  now?: () => number;
  backoff?: number[];
  toastMs?: number;
}

export function createCore(options: CoreOptions) {
  const probe = options.probe;
  const now = options.now ?? (() => Date.now());
  const backoff = options.backoff ?? BACKOFF;
  const toastMs = options.toastMs ?? TOAST_MS;

  const store = reactive<CoreState>({ state: "up", since: null, attempt: 0, nextTryAt: null, retryIn: 0, probing: false, recovered: false });
  const callbacks = new Set<() => void>();
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let lastProbeAt = -Infinity;
  // Each probe gets a number: if the core's state changed under it (stop, a restart), its answer is dropped.
  let epoch = 0;

  const gap = (attempt: number) => backoff[Math.min(attempt, backoff.length - 1)];

  function secondsLeft(): number {
    return store.nextTryAt === null ? 0 : Math.max(0, Math.ceil((store.nextTryAt - now()) / 1000));
  }

  function schedule(seconds: number) {
    clearTimeout(probeTimer);
    store.nextTryAt = now() + seconds * 1000;
    store.retryIn = seconds;
    probeTimer = setTimeout(() => void run("auto"), seconds * 1000);
  }

  function startTick() {
    clearInterval(tickTimer);
    tickTimer = setInterval(() => (store.retryIn = secondsLeft()), 1000);
  }

  function goDown() {
    epoch++;
    clearTimeout(toastTimer);
    store.state = "down";
    store.since = now();
    store.attempt = 0;
    store.probing = false;
    store.recovered = false;
    schedule(gap(0));
    startTick();
  }

  function recover() {
    epoch++;
    clearTimeout(probeTimer);
    clearInterval(tickTimer);
    store.state = "up";
    store.since = null;
    store.attempt = 0;
    store.nextTryAt = null;
    store.retryIn = 0;
    store.probing = false;
    store.recovered = true;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (store.recovered = false), toastMs);
    // A copy: a callback may unsubscribe itself (or another) while we go round.
    for (const fn of [...callbacks]) {
      try {
        fn();
      } catch {
        // One screen failing to reload must not stop the others.
      }
    }
  }

  /**
   * One health probe. "auto": the timer's. "manual": the Try now button, which also starts the backoff over.
   * "nudge": a hint that it may be back (a request got through); it leaves the schedule as it was if it fails.
   */
  async function run(kind: "auto" | "manual" | "nudge"): Promise<boolean> {
    if (store.state !== "down" || store.probing) return false;
    const mine = epoch;
    const planned = store.nextTryAt;
    clearTimeout(probeTimer);
    store.probing = true;
    store.nextTryAt = null;
    store.retryIn = 0;
    lastProbeAt = now();
    let ok = false;
    try {
      ok = await probe();
    } catch {
      ok = false;
    }
    if (mine !== epoch) return false;
    store.probing = false;
    if (ok) {
      recover();
      return true;
    }
    if (kind === "manual") store.attempt = 0;
    else if (kind === "auto") store.attempt++;
    // A nudge that found nothing leaves the countdown where it was.
    if (kind === "nudge" && planned !== null) schedule(Math.max(1, Math.ceil((planned - now()) / 1000)));
    else schedule(gap(store.attempt));
    return false;
  }

  /** A request to the API failed the way an outage does. */
  function reportFailure() {
    if (store.state === "up") goDown();
  }

  /**
   * Something suggests the core may be back (a request got through, the network came back, the tab woke up): one
   * probe, at most every five seconds. The answer to the page's own request is only a hint, because one route may
   * answer without the database.
   */
  function nudge(): Promise<boolean> {
    if (store.state !== "down" || store.probing || now() - lastProbeAt < 5000) return Promise.resolve(false);
    return run("nudge");
  }

  /** A request got a real answer. */
  function reportOk() {
    if (store.state === "down") void nudge();
  }

  return {
    store,

    reportFailure,

    reportOk,

    /** "Try now": asks right away, and starts the waits over from the shortest. */
    retryNow(): Promise<boolean> {
      return run("manual");
    },

    nudge,

    /**
     * One health probe on demand, for a live stream that died: false (and the core goes down) when the probe fails,
     * true when it answers. While it's already down, it just says false.
     */
    async check(): Promise<boolean> {
      if (store.state === "down") return false;
      let ok = false;
      try {
        ok = await probe();
      } catch {
        ok = false;
      }
      if (!ok) reportFailure();
      return ok;
    },

    /** Runs `fn` each time the core comes back. Returns the way to stop. */
    onRecovered(fn: () => void): () => void {
      callbacks.add(fn);
      return () => void callbacks.delete(fn);
    },

    /** Clears every timer and forgets every callback (tests, and a page being torn down). */
    stop() {
      epoch++;
      clearTimeout(probeTimer);
      clearInterval(tickTimer);
      clearTimeout(toastTimer);
      callbacks.clear();
      store.state = "up";
      store.since = null;
      store.attempt = 0;
      store.nextTryAt = null;
      store.retryIn = 0;
      store.probing = false;
      store.recovered = false;
    },
  };
}

// ---- The page's own core ----

// The unpatched fetch, so the probe never goes through the wrapper (and never reports on itself).
let nativeFetch: typeof fetch | null = null;
// While it's up and the tab is in view, the core is asked now and then: a lobby you are only walking in makes no
// requests of its own, and its live streams may stay silently open, so without this a fall would go unnoticed until
// the next click.
export const HEARTBEAT_MS = 20_000;
let heartbeat: ReturnType<typeof setInterval> | undefined;

/** GET /api/health: 200 `{ ok: true }` when the database answers. Anything else (or no answer in 6 s) is "no". */
async function healthProbe(): Promise<boolean> {
  const send = nativeFetch ?? globalThis.fetch.bind(globalThis);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await send("/api/health", { cache: "no-store", signal: ctl.signal });
    if (res.status !== 200) return false;
    const json = parse(await res.text());
    return !!json && typeof json === "object" && (json as { ok?: unknown }).ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const page = createCore({ probe: healthProbe });

/** The reactive state the card and the panels read: `core.state === "down"`. */
export const core = page.store;
export const reportFailure = () => page.reportFailure();
export const reportOk = () => page.reportOk();
export const retryNow = () => page.retryNow();
export const checkCore = () => page.check();
/** Clears the page's core back to "up", with every timer and callback gone (tests). */
export const stopCore = () => {
  clearInterval(heartbeat);
  page.stop();
};
export const onRecovered = (fn: () => void) => page.onRecovered(fn);
/**
 * Did this fetch fail because the core is down? `null` (nobody answered, as in `fetch(...).catch(() => null)`) is
 * a yes; a failed answer is read from a copy of its body; a good answer is a no.
 */
export async function wentDown(res: Response | null): Promise<boolean> {
  if (!res) return true;
  if (res.ok) return false;
  let text = "";
  try {
    text = await res.clone().text();
  } catch {
    // The body was already read: its status alone decides.
  }
  return isOutageResponse(res.status, text);
}

/**
 * The "Try again" of a panel that is waiting: while the core is down it asks the core right now (and when the core
 * answers, every panel reloads by itself, this one included, through useWhenBack); otherwise it just reloads.
 */
export async function tryAgain(reload: () => void): Promise<void> {
  if (core.state === "down") await page.retryNow();
  else reload();
}

/** Is the core down right now? For code that isn't a template. */
export const coreDown = () => core.state === "down";

/** Runs `fn` each time the core comes back, until the component using it goes away. */
export function useWhenBack(fn: () => void): () => void {
  const off = page.onRecovered(fn);
  if (getCurrentInstance()) onBeforeUnmount(off);
  return off;
}

/**
 * Patches `fetch` once: same-origin /api/ requests report what they saw (an outage, or a real answer); everything
 * else passes through untouched. What the caller gets is the original response, or the original error, so every
 * existing `.catch(() => null)` keeps working. Also wakes the probe when the network or the tab comes back.
 */
export function installCoreFetch(target: typeof globalThis = globalThis): void {
  if (nativeFetch) return;
  const original = target.fetch.bind(target);
  nativeFetch = original;
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isApiUrl(url)) return original(input, init);
    let res: Response;
    try {
      res = await original(input, init);
    } catch (err) {
      if (isOutageError(err)) page.reportFailure();
      throw err;
    }
    if (res.ok) {
      page.reportOk();
      return res;
    }
    // Only a failure's body is read, from a copy, so the caller's own reading is not disturbed.
    const text = await res.clone().text().catch(() => "");
    if (isOutageResponse(res.status, text)) page.reportFailure();
    else page.reportOk();
    return res;
  };
  heartbeat = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState !== "hidden") void page.check();
  }, HEARTBEAT_MS);
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => void page.nudge());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void page.nudge();
    });
  }
}
