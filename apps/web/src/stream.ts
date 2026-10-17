// A live stream (server-sent events) that finds its own way back. A browser reconnects an EventSource by itself when
// the connection drops, but only while the server keeps answering: the first answer that isn't a stream (the dev
// proxy's 500, a reverse proxy's 502/503, the API's 503 while its database is down) closes it for good. And a proxy
// may leave the connection hanging, open and silent, when the API behind it dies. So:
//   - whenever the core comes back (core.ts), the stream is reopened, whatever state it was in;
//   - when the browser closes it under us, we ask the core whether it's there: if not, the recovery above does the
//     reopening; if it is, we try again in a few seconds, and give up after a few quick deaths in a row (a stream
//     that really doesn't exist).
import { checkCore, coreDown, onRecovered, reportFailure, wentDown } from "./core";

export interface Stream {
  close(): void;
}

const RETRY_MS = 3000;
const GIVE_UP_AFTER = 4;

// A site served from another host than the API (on Vercel, the API behind a Cloudflare quick tunnel: see
// scripts/share.mjs) can't keep a stream open: the tunnel holds the events back. There, each stream becomes a
// question asked every few seconds while the tab is visible. Events that carry data (the city, a house) get the
// answer from the same address without "/stream"; events that only say "something changed" (a city's room, board
// and arena) are simply fired, and their handlers fetch what they need.
// The questions stay polite to a slow laptop: a tick is skipped while the last question hasn't come back, and while
// the core is down (the core's recovery asks once, right away); a tab coming back into view asks at once. Several
// panels listening to the same address (a house page, its room, its chat) share one poller.
const POLL_MS = 4000;
const polling = !!import.meta.env.VITE_LOBBY_WS;
const NUDGES = new Set(["chat", "board", "arena", "arenaChat"]);

type Events = Record<string, (e: MessageEvent) => void>;
interface Poller {
  listeners: Set<Events>;
  close(): void;
}
const pollers = new Map<string, Poller>();

function startPoller(url: string): Poller {
  const base = url.replace(/\/stream$/, "");
  const listeners = new Set<Events>();
  let busy = false;
  const ask = async () => {
    if (busy || document.visibilityState !== "visible" || coreDown()) return;
    busy = true;
    try {
      const needsData = [...listeners].some((events) => Object.keys(events).some((name) => !NUDGES.has(name)));
      let data: string | null = null;
      if (needsData) {
        const res = await fetch(base).catch(() => null);
        // Nobody answered: the core goes down, and its recovery asks again. Nudges would only fetch in vain.
        if (await wentDown(res)) {
          reportFailure();
          return;
        }
        if (res?.ok) data = await res.text();
      }
      // A copy: a handler may close its stream while we go round.
      for (const events of [...listeners])
        for (const [name, handler] of Object.entries(events)) {
          if (NUDGES.has(name)) handler(new MessageEvent(name, { data: name }));
          else if (data !== null) handler(new MessageEvent(name, { data }));
        }
    } finally {
      busy = false;
    }
  };
  const visible = () => {
    if (document.visibilityState === "visible") void ask();
  };
  const timer = setInterval(() => void ask(), POLL_MS);
  const offBack = onRecovered(() => void ask());
  document.addEventListener("visibilitychange", visible);
  return {
    listeners,
    close() {
      clearInterval(timer);
      offBack();
      document.removeEventListener("visibilitychange", visible);
    },
  };
}

function poll(url: string, events: Events): Stream {
  let poller = pollers.get(url);
  if (!poller) {
    poller = startPoller(url);
    pollers.set(url, poller);
  }
  const mine = poller;
  // Each subscription is its own entry, even if two panels pass the same handlers.
  const entry = { ...events };
  mine.listeners.add(entry);
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      mine.listeners.delete(entry);
      if (mine.listeners.size === 0 && pollers.get(url) === mine) {
        mine.close();
        pollers.delete(url);
      }
    },
  };
}

/** Opens `url` and listens to `events` (name -> handler). `close()` stops it, and everything it was waiting for. */
export function openStream(url: string, events: Record<string, (e: MessageEvent) => void>): Stream {
  if (polling) return poll(url, events);
  let source: EventSource | null = null;
  let closed = false;
  let deaths = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function open() {
    if (closed) return;
    clearTimeout(timer);
    source?.close();
    const es = new EventSource(url);
    source = es;
    for (const [name, handler] of Object.entries(events)) es.addEventListener(name, handler as EventListener);
    es.addEventListener("open", () => (deaths = 0));
    es.addEventListener("error", () => {
      // CONNECTING: the browser is retrying by itself. CLOSED: it gave up.
      if (es.readyState !== EventSource.CLOSED || source !== es) return;
      es.close();
      void died();
    });
  }

  async function died() {
    if (closed) return;
    deaths++;
    if (deaths > GIVE_UP_AFTER) return;
    // Down: the core's recovery reopens it. Up (it answers, the stream doesn't): a few seconds, then again.
    if (await checkCore()) timer = setTimeout(open, RETRY_MS);
  }

  const offBack = onRecovered(open);
  open();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      offBack();
      source?.close();
      source = null;
    },
  };
}
