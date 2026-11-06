// Who's logged in, shared by every page. The session itself is an HttpOnly cookie the page never sees.
import { ref } from "vue";
import { downWords, isOutageError, isOutageResponse } from "./core";
import { type Refusal, refusalText } from "./refusals";
import type { Me, ServerConfig } from "./types";

export const me = ref<Me | null>(null);
// Do we know who you are? True once the API has said (a user, or nobody). While the core is down it stays false:
// "can't ask" is not "logged out", so nothing redirects to /login and the top bar shows neither Log in nor Log out.
// A failed refresh later keeps the last `me`.
export const meLoaded = ref(false);
// What this server allows (the demo reset, for now). Null until the settings pane asks for it.
export const config = ref<ServerConfig | null>(null);

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch("/api/auth/config");
    const data = res.ok ? await res.json() : {};
    config.value = { demoReset: data.demoReset === true };
  } catch {
    config.value = { demoReset: false };
  }
}

export async function loadMe(): Promise<void> {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      me.value = (await res.json()).user;
      meLoaded.value = true;
      return;
    }
    // An outage says nothing about who you are: keep what we knew (or keep not knowing).
    if (isOutageResponse(res.status, await res.text().catch(() => ""))) return;
    // Any other refusal means no one is logged in.
    me.value = null;
    meLoaded.value = true;
  } catch {
    // Nobody answered: same as an outage.
  }
}

/** Logs out. False when the server couldn't be told (the core is down): you are still logged in, so nothing changes. */
export async function logout(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok && isOutageResponse(res.status, await res.text().catch(() => ""))) return false;
  } catch {
    return false;
  }
  me.value = null;
  return true;
}

// `code`: the refusal's code when the API gave one ("nobodyByLogin"), for a form that answers one refusal its own way.
export type Sent<T> = { ok: true; data: T } | { ok: false; message: string; down?: boolean; code?: string };

// One JSON request, whatever the method. It never throws: when the core isn't answering (no answer, a proxy's 502,
// 503 or 504, `core_down`, an empty 500) it says so in plain words and `down: true`, so a form can keep what was
// typed and offer another go. Nothing is retried here, so nothing can be sent twice.
async function request<T>(method: string, url: string, body?: unknown): Promise<Sent<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return isOutageError(err) ? { ok: false, message: downWords.write, down: true } : { ok: false, message: downWords.failed };
  }
  const text = await res.text().catch(() => "");
  if (!res.ok && isOutageResponse(res.status, text)) return { ok: false, message: downWords.write, down: true };
  let data: Partial<Refusal> = {};
  try {
    data = text.trim() ? JSON.parse(text) : {};
  } catch {
    // Not JSON: the status below says what it can.
  }
  if (res.ok) return { ok: true, data: data as T };
  // The API's refusal, in the reader's language when it has a code (refusals.ts).
  const message = typeof data?.message === "string" ? refusalText(data as Refusal) : res.status === 401 ? downWords.logInFirst : downWords.failed;
  return typeof data?.code === "string" ? { ok: false, message, code: data.code } : { ok: false, message };
}

// POSTs JSON. The API only accepts JSON bodies, which other sites can't send with your cookies.
export function postJSON<T = unknown>(url: string, body: unknown): Promise<Sent<T>> {
  return request<T>("POST", url, body);
}

// Any other JSON request (PATCH, PUT, DELETE), same error handling as postJSON.
export function sendJSON<T = unknown>(method: string, url: string, body?: unknown): Promise<Sent<T>> {
  return request<T>(method, url, body);
}
