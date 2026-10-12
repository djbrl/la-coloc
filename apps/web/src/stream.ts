// A live stream (server-sent events) that finds its own way back. A browser reconnects an EventSource by itself when
// the connection drops, but only while the server keeps answering: the first answer that isn't a stream (the dev
// proxy's 500, a reverse proxy's 502/503, the API's 503 while its database is down) closes it for good. And a proxy
// may leave the connection hanging, open and silent, when the API behind it dies. So:
//   - whenever the core comes back (core.ts), the stream is reopened, whatever state it was in;
//   - when the browser closes it under us, we ask the core whether it's there: if not, the recovery above does the
//     reopening; if it is, we try again in a few seconds, and give up after a few quick deaths in a row (a stream
//     that really doesn't exist).
import { checkCore, onRecovered } from "./core";

export interface Stream {
  close(): void;
}

const RETRY_MS = 3000;
const GIVE_UP_AFTER = 4;

/** Opens `url` and listens to `events` (name -> handler). `close()` stops it, and everything it was waiting for. */
export function openStream(url: string, events: Record<string, (e: MessageEvent) => void>): Stream {
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
